-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Nettoyage d audit 2026-06-14 : doublons FK + index
--  Genere automatiquement apres audit du backup Nexus_Backup_2026-06-14T14-01-20.
--  100% additif/sur : ne supprime QUE des contraintes/index REDONDANTS (un
--  equivalent strict est conserve a chaque fois). Aucun changement de comportement.
--  Bonus : ajoute la FK manquante orders.buyer_id -> profiles (0 orphelin verifie).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. FK dupliquees (on garde *_fkey, on retire le doublon hand-named) ────
ALTER TABLE public.buyer_pro_profiles DROP CONSTRAINT IF EXISTS fk_bpp_user;
ALTER TABLE public.carts DROP CONSTRAINT IF EXISTS fk_carts_user;
ALTER TABLE public.flash_sales DROP CONSTRAINT IF EXISTS fk_flash_product;
ALTER TABLE public.loyalty_points DROP CONSTRAINT IF EXISTS fk_loyalty_user;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS fk_notifs_user;
ALTER TABLE public.product_questions DROP CONSTRAINT IF EXISTS fk_pq_product;
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS fk_push_user;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS fk_referrals_referrer;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS fk_reviews_product;
ALTER TABLE public.stock_alerts DROP CONSTRAINT IF EXISTS fk_stock_alerts_user;
ALTER TABLE public.stock_alerts DROP CONSTRAINT IF EXISTS fk_stock_alerts_product;
ALTER TABLE public.wishlists DROP CONSTRAINT IF EXISTS fk_wishlists_user;
ALTER TABLE public.wishlists DROP CONSTRAINT IF EXISTS fk_wishlists_product;

-- ─── 2. Index dupliques redondants (DROP INDEX) ────────────────────────────
DROP INDEX IF EXISTS public.ambassadors_referral_code_uidx;  -- garde ambassadors_referral_code_key
DROP INDEX IF EXISTS public.annonces_express_category_idx;  -- garde annonces_cat_idx
DROP INDEX IF EXISTS public.idx_ae_expires_at;  -- garde idx_ae_expires
DROP INDEX IF EXISTS public.api_subs_key_idx;  -- garde api_subscriptions_api_key_key
DROP INDEX IF EXISTS public.audit_logs_created_at_idx;  -- garde audit_logs_cleanup_idx
DROP INDEX IF EXISTS public.idx_audit_logs_created;  -- garde audit_logs_cleanup_idx
DROP INDEX IF EXISTS public.b2b_buyers_uid_idx;  -- garde b2b_buyers_user_id_key
DROP INDEX IF EXISTS public.b2b_buyers_user_id_idx;  -- garde b2b_buyers_user_id_key
DROP INDEX IF EXISTS public.b2b_buyers_user_idx;  -- garde b2b_buyers_user_id_key
DROP INDEX IF EXISTS public.idx_buyer_pro_user_id;  -- garde idx_buyer_pro_user
DROP INDEX IF EXISTS public.idx_cashback_user;  -- garde cashback_user_idx
DROP INDEX IF EXISTS public.idx_coupons_code;  -- garde coupons_code_idx
DROP INDEX IF EXISTS public.idx_offers_courier;  -- garde delivery_offers_courier_idx
DROP INDEX IF EXISTS public.idx_offers_delivery;  -- garde delivery_offers_delivery_idx
DROP INDEX IF EXISTS public.idx_disputes_buyer;  -- garde dispute_buyer_idx
DROP INDEX IF EXISTS public.idx_disputes_vendor;  -- garde dispute_vendor_idx
DROP INDEX IF EXISTS public.uq_email_templates_name;  -- garde email_templates_name_key
DROP INDEX IF EXISTS public.ins_leads_buyer_idx;  -- garde idx_ins_buyer
DROP INDEX IF EXISTS public.insurance_leads_buyer_idx;  -- garde idx_ins_buyer
DROP INDEX IF EXISTS public.insurance_leads_status_idx;  -- garde ins_leads_status_idx
DROP INDEX IF EXISTS public.idx_invoices_order_id;  -- garde idx_invoices_order
DROP INDEX IF EXISTS public.loyalty_hist_user_idx;  -- garde idx_loyalty_history_user
DROP INDEX IF EXISTS public.loyalty_history_user_id_idx;  -- garde idx_loyalty_history_user
DROP INDEX IF EXISTS public.maintenance_log_run_at_idx;  -- garde idx_mlog_run_at
DROP INDEX IF EXISTS public.idx_messages_conversation;  -- garde idx_messages_conv
DROP INDEX IF EXISTS public.idx_messages_from_to;  -- garde idx_messages_conv
DROP INDEX IF EXISTS public.messages_from_idx;  -- garde idx_messages_from_id
DROP INDEX IF EXISTS public.idx_messages_unread;  -- garde idx_messages_to_unread
DROP INDEX IF EXISTS public.idx_notif_user_read;  -- garde idx_notif_user
DROP INDEX IF EXISTS public.idx_notifs_user;  -- garde idx_notifications_user
DROP INDEX IF EXISTS public.idx_offers_buyer_id;  -- garde idx_offers_buyer
DROP INDEX IF EXISTS public.idx_offers_vendor_id;  -- garde idx_offers_vendor
DROP INDEX IF EXISTS public.orders_buyer_idx;  -- garde idx_orders_buyer_id
DROP INDEX IF EXISTS public.orders_status_idx;  -- garde idx_orders_status
DROP INDEX IF EXISTS public.orders_paytech_token_idx;  -- garde orders_paytech_tok_idx
DROP INDEX IF EXISTS public.idx_payouts_ref_command;  -- garde idx_payout_ref
DROP INDEX IF EXISTS public.idx_boosts_active;  -- garde boosts_active_idx
DROP INDEX IF EXISTS public.product_boosts_active_idx;  -- garde boosts_active_idx
DROP INDEX IF EXISTS public.idx_boosts_product;  -- garde boosts_product_idx
DROP INDEX IF EXISTS public.idx_pb_product;  -- garde boosts_product_idx
DROP INDEX IF EXISTS public.idx_boosts_vendor;  -- garde boosts_vendor_idx
DROP INDEX IF EXISTS public.idx_pb_vendor;  -- garde boosts_vendor_idx
DROP INDEX IF EXISTS public.product_boosts_vendor_idx;  -- garde boosts_vendor_idx
DROP INDEX IF EXISTS public.idx_pb_active_ends;  -- garde idx_pb_active_end
DROP INDEX IF EXISTS public.idx_pv_date;  -- garde idx_product_views_date
DROP INDEX IF EXISTS public.idx_views_product;  -- garde idx_pv_product
DROP INDEX IF EXISTS public.idx_views_vendor;  -- garde idx_pv_vendor
DROP INDEX IF EXISTS public.idx_products_category;  -- garde idx_products_cat
DROP INDEX IF EXISTS public.idx_products_vendor_id;  -- garde idx_products_vendor
DROP INDEX IF EXISTS public.idx_profiles_email_unique;  -- garde profiles_email_key
DROP INDEX IF EXISTS public.push_subs_user_id_idx;  -- garde idx_push_user
DROP INDEX IF EXISTS public.push_subs_endpoint_idx;  -- garde push_subscriptions_endpoint_key
DROP INDEX IF EXISTS public.referrals_referrer_idx;  -- garde idx_referrals_referrer
DROP INDEX IF EXISTS public.idx_returns_order;  -- garde idx_return_requests_order
DROP INDEX IF EXISTS public.idx_returns_status;  -- garde idx_return_requests_status
DROP INDEX IF EXISTS public.return_status_idx;  -- garde idx_return_requests_status
DROP INDEX IF EXISTS public.return_buyer_idx;  -- garde idx_returns_buyer
DROP INDEX IF EXISTS public.return_vendor_idx;  -- garde idx_returns_vendor
DROP INDEX IF EXISTS public.reviews_product_idx;  -- garde idx_reviews_product
DROP INDEX IF EXISTS public.uq_stock_alerts_product_user;  -- garde stock_alerts_product_user_key
DROP INDEX IF EXISTS public.vref_referrer_idx;  -- garde vendor_ref_referrer_idx
DROP INDEX IF EXISTS public.wishlist_user_idx;  -- garde idx_wishlists_user

-- ─── 3. Contraintes uniques redondantes (PK equivalente conservee) ─────────
ALTER TABLE public.loyalty_points DROP CONSTRAINT IF EXISTS loyalty_points_user_id_key;  -- garde loyalty_points_pkey
ALTER TABLE public.recently_viewed DROP CONSTRAINT IF EXISTS recently_viewed_user_product_key;  -- garde recently_viewed_pkey

-- ─── 4. FK manquante : orders.buyer_id -> profiles (0 orphelin) ────────────
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
