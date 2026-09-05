-- ════════════════════════════════════════════════════════════════════════════
-- NEXUS Market — Campagnes WhatsApp en goutte-à-goutte (drip)
-- ════════════════════════════════════════════════════════════════════════════
-- POURQUOI : 3618 prospects avec téléphone, mais seulement 53 messages envoyés
-- depuis le début du projet — l'envoi manuel depuis le dashboard admin ne passe
-- pas à l'échelle. Ces tables alimentent le cron `/cron/wa-campaign`, qui envoie
-- un petit lot à chaque passage horaire, tout seul.
--
-- ⚠ CONTRAINTE DIMENSIONNANTE : WhatsApp bannit un numéro qui envoie en masse à
-- des gens qui ne l'ont jamais contacté. Ce n'est pas le quota Green API, c'est
-- WhatsApp. Tout est donc conçu pour un rythme lent et humain (~10/h sur les
-- heures ouvrables ≈ 80/jour), avec arrêt automatique si ça tourne mal.
--
-- Sécurité : tables réservées au service_role (le cron). Aucune lecture
-- publique — la file contient des numéros de téléphone.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wa_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- Gabarit du message. `{{nom}}`, `{{ville}}`, `{{metier}}` sont remplacés au
  -- moment de l'envoi (personnalisation = moins d'aspect « robot »).
  template      text NOT NULL,
  -- 'paused' à la création : RIEN ne part tant qu'un humain n'a pas basculé en
  -- 'running'. Choix explicite — un envoi à de vraies personnes ne doit jamais
  -- démarrer par le simple fait d'avoir déployé du code.
  status        text NOT NULL DEFAULT 'paused'
                CHECK (status IN ('paused','running','done','stopped')),
  -- Garde-fous, modifiables sans redéploiement.
  hourly_limit  int  NOT NULL DEFAULT 10,   -- messages par passage de cron
  daily_limit   int  NOT NULL DEFAULT 80,   -- plafond glissant sur 24 h
  send_hour_min int  NOT NULL DEFAULT 8,    -- heure locale de début (Dakar = UTC)
  send_hour_max int  NOT NULL DEFAULT 19,   -- heure locale de fin
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_campaign_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES wa_campaigns(id) ON DELETE CASCADE,
  prospect_id  uuid REFERENCES prospects(id) ON DELETE SET NULL,
  phone        text NOT NULL,
  name         text,
  city         text,
  profession   text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sent','failed','skipped','opted_out')),
  attempts     int  NOT NULL DEFAULT 0,
  error_msg    text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Un même numéro n'est ciblé qu'une fois par campagne (la liste prospects
  -- contient des doublons de téléphone entre secteurs).
  UNIQUE (campaign_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_wa_targets_pending
  ON wa_campaign_targets (campaign_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_targets_sent_at
  ON wa_campaign_targets (sent_at) WHERE sent_at IS NOT NULL;

-- Liste noire globale : un « STOP » reçu vaut pour TOUTES les campagnes,
-- présentes et futures. Alimentée par le webhook entrant.
CREATE TABLE IF NOT EXISTS wa_opt_outs (
  phone      text PRIMARY KEY,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wa_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_opt_outs         ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul le service_role (cron/backend) y accède, il bypasse la
-- RLS. `anon`/`authenticated` n'ont donc aucun accès — voulu : ces tables
-- contiennent des numéros de téléphone de tiers.
REVOKE ALL ON wa_campaigns,        wa_campaign_targets, wa_opt_outs FROM anon, authenticated;
