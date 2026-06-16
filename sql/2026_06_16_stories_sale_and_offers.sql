-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — STORIES À LA VENTE + OFFRES (invité inclus)
--
--  DEMANDE (2026-06-16) :
--   · Une story sert à la vente avec un PRIX défini par le vendeur.
--   · Un acheteur peut « Acheter » (mise en relation) ou « Faire une offre »,
--     MÊME sans compte (invité). Email obligatoire + relance email auto.
--   · Le vendeur est notifié (in-app + push + WhatsApp + email).
--
--  Montants stockés en EUR (convention NEXUS, cf. CLAUDE.md) ; affichage ×655.957.
--  Idempotent. À exécuter dans Supabase → SQL Editor (ou scripts/db-query.mjs).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ─── 1. Champs de vente sur la story ─────────────────────────────────────────
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS price        numeric;                       -- EUR (NULL = pas de prix affiché)
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS allow_offers boolean NOT NULL DEFAULT true; -- autoriser les offres

-- ─── 2. Offres : support des stories + des invités ───────────────────────────
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS story_id    uuid REFERENCES public.stories(id) ON DELETE CASCADE;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS buyer_phone text;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS buyer_email text;
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'offer';   -- 'offer' | 'buy'
CREATE INDEX IF NOT EXISTS idx_offers_story  ON public.offers(story_id) WHERE story_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON public.offers(vendor_id);

-- ─── 3. RPC submit_story_offer(payload) — invité OU connecté ─────────────────
--     Crée l'offre/le lead + notifie le vendeur (in-app + WhatsApp). L'email
--     (vendeur + accusé invité) est géré par le trigger trg_offer_emails.
CREATE OR REPLACE FUNCTION public.submit_story_offer(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_story  public.stories%ROWTYPE;
  v_kind   text    := COALESCE(NULLIF(payload->>'kind',''), 'offer');
  v_name   text    := NULLIF(payload->>'name','');
  v_phone  text    := NULLIF(payload->>'phone','');
  v_email  text    := NULLIF(payload->>'email','');
  v_msg    text    := NULLIF(payload->>'message','');
  v_amount numeric := NULLIF(payload->>'amount','')::numeric;  -- EUR
  v_offer_id uuid;
  v_vphone text; v_vname text;
BEGIN
  SELECT * INTO v_story FROM public.stories WHERE id = NULLIF(payload->>'story_id','')::uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found'); END IF;

  IF v_name IS NULL OR v_phone IS NULL OR v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_contact');
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_email');
  END IF;

  IF v_kind = 'offer' THEN
    IF v_story.allow_offers IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'reason', 'offers_disabled'); END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'amount_required'); END IF;
  ELSE
    v_kind   := 'buy';
    v_amount := v_story.price;   -- « Acheter » = au prix affiché (mise en relation)
  END IF;

  INSERT INTO public.offers (
    story_id, product_id, product_name, buyer_id, buyer_name, buyer_phone, buyer_email,
    vendor_id, offered_price, message, status, kind
  ) VALUES (
    v_story.id, v_story.product_id, COALESCE(NULLIF(v_story.title,''), 'Story NEXUS'),
    auth.uid(), v_name, v_phone, v_email,
    v_story.vendor_id, COALESCE(v_amount, 0), v_msg, 'pending', v_kind
  ) RETURNING id INTO v_offer_id;

  -- Notification in-app vendeur (push automatique via trg_push_on_notification).
  IF v_story.vendor_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, link, read)
      VALUES (
        v_story.vendor_id, 'offer',
        CASE WHEN v_kind = 'buy' THEN '🛒 Demande d''achat sur votre story'
             ELSE '💰 Nouvelle offre sur votre story' END,
        COALESCE(v_name, 'Un client') || ' · ' || COALESCE(v_phone, '')
          || CASE WHEN v_amount IS NOT NULL THEN ' · ' || round(v_amount * 655.957) || ' FCFA' ELSE '' END,
        '/', false
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- WhatsApp vendeur (best-effort, nexus_send_whatsapp avale ses erreurs).
    SELECT NULLIF(phone, ''), name INTO v_vphone, v_vname FROM public.profiles WHERE id = v_story.vendor_id;
    IF v_vphone IS NOT NULL THEN
      PERFORM public.nexus_send_whatsapp(
        v_vphone,
        (CASE WHEN v_kind = 'buy' THEN E'🛒 *Demande d\'achat — NEXUS Story*'
              ELSE E'💰 *Nouvelle offre — NEXUS Story*' END) || E'\n'
          || '🎬 ' || COALESCE(v_story.title, 'Story') || E'\n'
          || '👤 ' || COALESCE(v_name, 'Client') || ' · ' || COALESCE(v_phone, '') || E'\n'
          || CASE WHEN v_amount IS NOT NULL THEN '💰 ' || round(v_amount * 655.957) || E' FCFA\n' ELSE '' END
          || CASE WHEN v_msg IS NOT NULL THEN '📝 ' || v_msg || E'\n' ELSE '' END
          || '👉 Repondez sur nexus.sn',
        'story_offer', v_story.vendor_id, jsonb_build_object('offer_id', v_offer_id));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer_id, 'kind', v_kind);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_story_offer(jsonb) TO anon, authenticated;

-- ─── 4. Email vendeur + accusé invité (trigger, calqué sur _order_confirm_email)
--     Ne se déclenche QUE pour les offres de STORY (story_id non nul) pour ne pas
--     interférer avec le flux d'offres produit existant.
CREATE OR REPLACE FUNCTION public._offer_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
declare
  v_secret       text;
  v_site         text := 'https://nexusmarket.sn';
  v_vendor_email text;
begin
  if new.story_id is null then return new; end if;
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null then return new; end if;
    if new.vendor_id is not null then
      select email into v_vendor_email from profiles where id = new.vendor_id;
    end if;
    perform net.http_post(
      url     := v_site || '/api/offer-email',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'kind',         new.kind,
        'offer_id',     new.id::text,
        'story_title',  coalesce(new.product_name, ''),
        'buyer_name',   coalesce(new.buyer_name, ''),
        'buyer_phone',  coalesce(new.buyer_phone, ''),
        'buyer_email',  new.buyer_email,
        'amount',       new.offered_price,
        'message',      coalesce(new.message, ''),
        'vendor_email', v_vendor_email),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- l'email ne doit jamais bloquer l'offre
  end;
  return new;
end $$;

DROP TRIGGER IF EXISTS trg_offer_emails ON public.offers;
CREATE TRIGGER trg_offer_emails AFTER INSERT ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public._offer_emails();
