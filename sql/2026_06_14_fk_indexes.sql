-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Comblement audit 2026-06-14 : index manquants sur colonnes FK
--  Postgres n indexe PAS automatiquement les FK. Sans index, les jointures et
--  surtout les ON DELETE CASCADE/SET NULL scannent toute la table enfant.
--  100% additif (CREATE INDEX IF NOT EXISTS). Genere apres audit.
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user_id ON public.affiliate_clicks (user_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_referrals_order_id ON public.ambassador_referrals (order_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner_id ON public.api_keys (owner_id);
CREATE INDEX IF NOT EXISTS idx_api_subscriptions_user_id ON public.api_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_app_config_updated_by ON public.app_config (updated_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_cashback_transactions_order_id ON public.cashback_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_coupons_created_by ON public.coupons (created_by);
CREATE INDEX IF NOT EXISTS idx_coupons_owner_id ON public.coupons (owner_id);
CREATE INDEX IF NOT EXISTS idx_courier_earnings_courier_id ON public.courier_earnings (courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_earnings_delivery_id ON public.courier_earnings (delivery_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries (order_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_by ON public.email_templates (updated_by);
CREATE INDEX IF NOT EXISTS idx_flash_sales_created_by ON public.flash_sales (created_by);
CREATE INDEX IF NOT EXISTS idx_flash_sales_vendor_id ON public.flash_sales (vendor_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_recipient_id ON public.live_messages (recipient_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_sender_id ON public.live_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_user_id ON public.live_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_order_id ON public.loyalty_history (order_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_updated_by ON public.notification_events (updated_by);
CREATE INDEX IF NOT EXISTS idx_offers_product_id ON public.offers (product_id);
CREATE INDEX IF NOT EXISTS idx_pro_reviews_user_id ON public.pro_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_product_qa_user_id ON public.product_qa (user_id);
CREATE INDEX IF NOT EXISTS idx_product_qa_vendor_id ON public.product_qa (vendor_id);
CREATE INDEX IF NOT EXISTS idx_product_questions_user_id ON public.product_questions (user_id);
CREATE INDEX IF NOT EXISTS idx_product_views_viewer_id ON public.product_views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_approved_by ON public.profiles (approved_by);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_product_id ON public.recently_viewed (product_id);
CREATE INDEX IF NOT EXISTS idx_request_messages_offer_id ON public.request_messages (offer_id);
CREATE INDEX IF NOT EXISTS idx_request_messages_sender_id ON public.request_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user_id ON public.review_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_id ON public.reviews (vendor_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_user_id ON public.search_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_site_popups_created_by ON public.site_popups (created_by);
CREATE INDEX IF NOT EXISTS idx_stock_history_actor_id ON public.stock_history (actor_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_order_id ON public.stock_history (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_sse_metrics_product_id ON public.stock_sse_metrics (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_sse_metrics_user_id ON public.stock_sse_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_stories_product_id ON public.stories (product_id);
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_order_id ON public.stripe_sessions (order_id);
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_user_id ON public.stripe_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_troc_proposals_proposer_id ON public.troc_proposals (proposer_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_user_id ON public.typing_indicators (user_id);
CREATE INDEX IF NOT EXISTS idx_typing_status_user_id ON public.typing_status (user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_referrals_new_vendor_id ON public.vendor_referrals (new_vendor_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists (product_id);
