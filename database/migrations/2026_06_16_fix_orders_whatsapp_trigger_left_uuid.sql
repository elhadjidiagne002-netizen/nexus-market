-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — FIX CRITIQUE : checkout cassé par left(uuid, integer)
--
--  SYMPTÔME (2026-06-16) : toute création de commande échoue —
--    create_order_atomic → ERROR: function left(uuid, integer) does not exist
--  puis fallback INSERT orders → RLS 42501, et « pas d'email de confirmation ».
--
--  CAUSE : deux triggers WhatsApp sur public.orders construisent un libellé
--  « Commande #<8 premiers car.> » via left(NEW.id, 8). Or orders.id est de type
--  UUID et left() n'accepte que (text, integer) → exception. trg_new_order_wa
--  étant AFTER INSERT, l'exception fait ROLLBACK toute la commande (et empêche
--  trg_order_confirm_email, qui s'exécute après, d'envoyer l'email serveur).
--
--  FIX : caster NEW.id::text dans les deux fonctions. CREATE OR REPLACE
--  (les triggers eux-mêmes restent attachés). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Nouvelle commande → WhatsApp vendeur (AFTER INSERT) ───────────────────
CREATE OR REPLACE FUNCTION public.trg_new_order_vendor_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_phone text; v_name text; v_msg text;
BEGIN
  SELECT p.phone, p.name INTO v_phone, v_name FROM profiles p WHERE p.id = NEW.vendor_id;
  IF v_phone IS NULL THEN RETURN NEW; END IF;
  v_msg := E'🛒 *Nouvelle commande NEXUS !*\n' ||
           'Commande #' || left(NEW.id::text, 8) || E'\n' ||
           '💰 *' || round(NEW.total*655.957) || E' FCFA*\n' ||
           '👤 ' || COALESCE(NEW.buyer_name,'Client NEXUS') || E'\n\n' ||
           '⚡ Confirmez l''expédition sur nexus.sn';
  PERFORM nexus_send_whatsapp(v_phone, v_msg, 'new_order', NEW.vendor_id,
    jsonb_build_object('order_id',NEW.id));
  RETURN NEW;
END; $function$;

-- ── 2. 1ère vente livrée → WhatsApp vendeur (AFTER UPDATE OF status) ──────────
CREATE OR REPLACE FUNCTION public.trg_first_sale_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_phone        text;
  v_name         text;
  v_sales_count  integer;
  v_total_fcfa   numeric;
  v_msg          text;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN RETURN NEW; END IF;
  SELECT p.phone, p.name INTO v_phone, v_name FROM profiles p WHERE p.id = NEW.vendor_id;
  IF v_phone IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*), COALESCE(SUM(total),0)*655.957
  INTO   v_sales_count, v_total_fcfa
  FROM   orders WHERE vendor_id = NEW.vendor_id AND status = 'delivered';
  IF v_sales_count = 1 THEN
    v_msg := E'🎉 *Félicitations ' || COALESCE(v_name,'Vendeur') || E' !*\n' ||
             E'Votre *1ère vente NEXUS* vient d\'être livrée ! 🛍️\n\n' ||
             '💰 Montant : *' || round(NEW.total*655.957) || E' FCFA*\n' ||
             '📦 Commande : #' || left(NEW.id::text, 8) || E'\n\n' ||
             E'✨ Parrainez un vendeur → commission 15% → 8% !\n' ||
             '👉 nexus.sn → Tableau de bord → Parrainage';
  ELSE
    v_msg := E'🎊 *Nouvelle vente livrée — NEXUS Market*\n' ||
             'Commande #' || left(NEW.id::text, 8) || ' · *' || round(NEW.total*655.957) || E' FCFA*\n' ||
             '📊 Cumulé : ' || round(v_total_fcfa) || ' FCFA (' || v_sales_count || E' ventes)\n' ||
             '💳 Reversement le 1er du mois.';
  END IF;
  PERFORM nexus_send_whatsapp(v_phone, v_msg,
    CASE WHEN v_sales_count=1 THEN 'first_sale' ELSE 'sale_delivered' END,
    NEW.vendor_id,
    jsonb_build_object('order_id',NEW.id,'total_fcfa',round(NEW.total*655.957)));
  RETURN NEW;
END; $function$;
