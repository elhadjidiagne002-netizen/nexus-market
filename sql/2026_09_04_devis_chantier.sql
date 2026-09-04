-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — « Devis chantier multi-artisans » 📋🔨 (V1)
--
--  Le client décrit un besoin (métier + description + budget indicatif +
--  localisation), le système notifie EN PARALLÈLE les meilleurs `pros` du
--  métier via `nearby_pros` (déjà existant, aucune modif), chacun peut
--  répondre avec un prix. Différence volontaire avec la cascade
--  dépannage/coursier (sql/2026_08_04_nexus_depannage_auto.sql) : on veut
--  PLUSIEURS réponses concurrentes, pas un accept-first à la chaîne — donc
--  pas de rescue_offers-like (queued/pending/expired/seq), juste une ligne
--  par pro notifié qui peut rester 'pending' (pas encore répondu), devenir
--  une vraie offre chiffrée, ou 'declined' (a refusé explicitement).
--
--  V1 volontairement sans paiement in-app (comme les fiches pros actuelles)
--  et sans notif WhatsApp/email (juste `notifications` in-app, déjà branché
--  au frontend) — cf. proposition détaillée, phase V2 pour la suite.
--
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ─── 1. Demande de devis ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profession            text NOT NULL,        -- même taxonomie que pros.profession
  description           text NOT NULL,
  photo_url             text,
  budget_fcfa           numeric,               -- optionnel, indicatif
  city                  text,
  location_lat          double precision,
  location_lng          double precision,
  status                text NOT NULL DEFAULT 'open',
    -- open | closed (un devis sélectionné) | cancelled | expired
  selected_response_id  uuid,                  -- FK ajoutée après création de quote_responses (ordre)
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  closed_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_buyer  ON public.quote_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON public.quote_requests(status);

-- ─── 2. Réponses des pros notifiés (1 ligne / pro notifié) ────────────────
CREATE TABLE IF NOT EXISTS public.quote_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  pro_id        uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  price_fcfa    numeric,               -- NULL tant que le pro n'a pas répondu / a décliné
  delay_text    text,                  -- ex. "sous 3 jours"
  message       text,
  distance_km   numeric,               -- capturé au moment de la notification (traçabilité)
  status        text NOT NULL DEFAULT 'pending',
    -- pending (notifié, pas encore répondu) | quoted (a répondu avec un prix)
    -- | declined (a refusé explicitement) | selected | rejected (un autre a été choisi)
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CONSTRAINT quote_responses_price_when_quoted
    CHECK (status <> 'quoted' OR price_fcfa IS NOT NULL),
  UNIQUE (request_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_responses_request ON public.quote_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_quote_responses_pro     ON public.quote_responses(pro_id, status);

ALTER TABLE public.quote_requests
  ADD CONSTRAINT quote_requests_selected_response_fk
  FOREIGN KEY (selected_response_id) REFERENCES public.quote_responses(id) ON DELETE SET NULL;

-- ─── 3. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.quote_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_responses ENABLE ROW LEVEL SECURITY;

-- quote_requests : le buyer voit/gère les siennes ; un pro notifié voit la
-- demande (nécessaire pour afficher description/photo dans son inbox) ;
-- admin = tout.
DROP POLICY IF EXISTS quote_requests_buyer_own ON public.quote_requests;
CREATE POLICY quote_requests_buyer_own ON public.quote_requests
  FOR ALL USING (buyer_id = auth.uid()) WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS quote_requests_pro_notified ON public.quote_requests;
CREATE POLICY quote_requests_pro_notified ON public.quote_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quote_responses r
      JOIN public.pros pr ON pr.id = r.pro_id
      WHERE r.request_id = quote_requests.id AND pr.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS quote_requests_admin_all ON public.quote_requests;
CREATE POLICY quote_requests_admin_all ON public.quote_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- quote_responses : le pro gère SA réponse ; le buyer de la demande voit
-- toutes les réponses de SA demande (pour comparer) ; admin = tout. Les
-- insertions initiales (une ligne 'pending' par pro notifié) passent par la
-- RPC SECURITY DEFINER create_quote_request, pas par l'écriture directe.
DROP POLICY IF EXISTS quote_responses_pro_own ON public.quote_responses;
CREATE POLICY quote_responses_pro_own ON public.quote_responses
  FOR ALL USING (pro_id IN (SELECT id FROM public.pros WHERE user_id = auth.uid()))
  WITH CHECK (pro_id IN (SELECT id FROM public.pros WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS quote_responses_buyer_read ON public.quote_responses;
CREATE POLICY quote_responses_buyer_read ON public.quote_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_responses.request_id AND q.buyer_id = auth.uid())
  );
DROP POLICY IF EXISTS quote_responses_admin_all ON public.quote_responses;
CREATE POLICY quote_responses_admin_all ON public.quote_responses
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ════════════════════════════════════════════════════════════════════════════
--  4. RPC create_quote_request(payload) : crée la demande + notifie EN
--     PARALLÈLE les pros les plus pertinents (nearby_pros, rayon 50 km par
--     défaut — plus large que le dépannage, un chantier tolère le délai).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_quote_request(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_lat double precision := NULLIF(payload->>'location_lat','')::double precision;
  v_lng double precision := NULLIF(payload->>'location_lng','')::double precision;
  v_profession text := payload->>'profession';
  v_notified integer := 0;
  v_row quote_requests%ROWTYPE;
BEGIN
  IF v_profession IS NULL OR btrim(v_profession) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profession_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE lower(profession) = lower(v_profession) AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pro_for_profession');
  END IF;

  INSERT INTO public.quote_requests (
    buyer_id, profession, description, photo_url, budget_fcfa, city, location_lat, location_lng
  ) VALUES (
    auth.uid(), v_profession, payload->>'description', payload->>'photo_url',
    NULLIF(payload->>'budget_fcfa','')::numeric, payload->>'city', v_lat, v_lng
  ) RETURNING id INTO v_id;

  INSERT INTO public.quote_responses (request_id, pro_id, distance_km, status)
  SELECT v_id, n.pro_id, n.distance_km, 'pending'
    FROM public.nearby_pros(v_lat, v_lng, 50000, 4, v_profession) n;
  GET DIAGNOSTICS v_notified = ROW_COUNT;

  -- Notif in-app aux pros notifiés (type 'offer', déjà valide — voir
  -- notifications_type_check, réutilisé tel quel comme pour les coursiers).
  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT pr.user_id, 'offer', 'Nouvelle demande de devis',
         'Un client cherche un(e) ' || v_profession || ' près de chez vous.',
         '/pro/devis/' || v_id::text
    FROM public.quote_responses r
    JOIN public.pros pr ON pr.id = r.pro_id
   WHERE r.request_id = v_id;

  SELECT * INTO v_row FROM public.quote_requests WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object('ok', true, 'pros_notified', v_notified);
END;
$$;

-- ─── 5. RPC respond_to_quote(request_id, price, delay, message) : un pro
--     notifié soumet un devis chiffré (ou décline explicitement si price NULL).
CREATE OR REPLACE FUNCTION public.respond_to_quote(
  p_request_id uuid,
  p_price_fcfa numeric DEFAULT NULL,
  p_delay_text text DEFAULT NULL,
  p_message    text DEFAULT NULL,
  p_decline    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_pro_id uuid;
  v_req quote_requests%ROWTYPE;
  v_new_status text;
BEGIN
  SELECT id INTO v_pro_id FROM public.pros WHERE user_id = auth.uid() LIMIT 1;
  IF v_pro_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_pro');
  END IF;

  SELECT * INTO v_req FROM public.quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL OR v_req.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'request_closed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.quote_responses WHERE request_id = p_request_id AND pro_id = v_pro_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_notified');
  END IF;

  v_new_status := CASE WHEN p_decline THEN 'declined' ELSE 'quoted' END;
  IF NOT p_decline AND p_price_fcfa IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'price_required');
  END IF;

  UPDATE public.quote_responses
     SET price_fcfa = CASE WHEN p_decline THEN NULL ELSE p_price_fcfa END,
         delay_text = p_delay_text, message = p_message,
         status = v_new_status, responded_at = now()
   WHERE request_id = p_request_id AND pro_id = v_pro_id;

  IF NOT p_decline THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (v_req.buyer_id, 'offer', 'Nouveau devis reçu',
            'Un artisan a répondu à votre demande de devis.', '/mes-devis/' || p_request_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 6. RPC select_quote_response(request_id, response_id) : le buyer
--     choisit une réponse — ferme la demande, rejette poliment les autres.
CREATE OR REPLACE FUNCTION public.select_quote_response(p_request_id uuid, p_response_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_pro_user_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_requests
     WHERE id = p_request_id AND buyer_id = auth.uid() AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_request_or_closed');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_responses WHERE id = p_response_id AND request_id = p_request_id AND status = 'quoted'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'response_not_found');
  END IF;

  UPDATE public.quote_requests SET status = 'closed', selected_response_id = p_response_id, closed_at = now()
   WHERE id = p_request_id;
  UPDATE public.quote_responses SET status = 'selected' WHERE id = p_response_id;
  UPDATE public.quote_responses SET status = 'rejected'
   WHERE request_id = p_request_id AND id <> p_response_id AND status = 'quoted';

  SELECT pr.user_id INTO v_pro_user_id FROM public.quote_responses r
    JOIN public.pros pr ON pr.id = r.pro_id WHERE r.id = p_response_id;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (v_pro_user_id, 'offer', 'Devis accepté !',
          'Le client a choisi votre devis. Contactez-le pour finaliser.', '/pro/devis/' || p_request_id::text);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 7. RPC cancel_quote_request(request_id) : le buyer annule.
CREATE OR REPLACE FUNCTION public.cancel_quote_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.quote_requests SET status = 'cancelled'
   WHERE id = p_request_id AND buyer_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_not_yours');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 8. Expiration automatique (pg_cron, filet de sécurité — pas de cascade
--     à faire avancer contrairement au dépannage, juste clôturer le stale).
CREATE OR REPLACE FUNCTION public.quote_requests_expire_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.quote_requests SET status = 'expired'
   WHERE status = 'open' AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('expired', v_n);
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('nexus-quote-requests-expire', '*/15 * * * *', 'select public.quote_requests_expire_tick();');

-- ─── 9. Notification type ──────────────────────────────────────────────────
-- 'offer' est déjà une valeur valide de notifications_type_check (réutilisée
-- pour les coursiers/dépanneurs) → aucune modification de contrainte ici.

-- ─── 10. Droits d'exécution + GRANTs table (piège CLAUDE.md #11 : la RLS ne
--     suffit pas, il faut aussi le GRANT explicite à `authenticated`).
GRANT SELECT, INSERT, UPDATE ON public.quote_requests  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_responses TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_quote_request(jsonb)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_quote(uuid, numeric, text, text, boolean)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_quote_response(uuid, uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_quote_request(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_requests_expire_tick()                              TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — Devis chantier multi-artisans V1. Le front consomme :
--  create_quote_request, respond_to_quote, select_quote_response,
--  cancel_quote_request, + lecture directe quote_requests/quote_responses
--  (RLS déjà scoping buyer/pro/admin).
--  Différé (V2/V3, cf. proposition) : notif WhatsApp/email (sendEventNotification
--  + nouveaux templates dans notify.js), upload photo dédié, stats admin.
-- ════════════════════════════════════════════════════════════════════════════
