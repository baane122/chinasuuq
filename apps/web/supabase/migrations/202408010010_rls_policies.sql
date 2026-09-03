-- ============================================================
-- ChinaSuuq Database Schema - Migration 10
-- RLS Policies, Triggers, Utility Functions
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get current user's profile ID
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID AS $$
    SELECT auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user has a specific role
CREATE OR REPLACE FUNCTION auth.has_role(required_role user_role)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = required_role
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is staff or admin
CREATE OR REPLACE FUNCTION auth.is_staff_or_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('staff', 'admin', 'super_admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is super admin
CREATE OR REPLACE FUNCTION auth.is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- ROW LEVEL SECURITY - Enable on all tables
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_glossary ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourcing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourcing_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE consolidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: PROFILES
-- ============================================================

-- Users can read their own profile
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY profiles_select_admin ON profiles
    FOR SELECT USING (auth.is_staff_or_admin());

-- Users can update their own profile (limited fields)
CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Admins can update any profile
CREATE POLICY profiles_update_admin ON profiles
    FOR UPDATE USING (auth.is_staff_or_admin());

-- Super admins can insert/delete profiles
CREATE POLICY profiles_insert_super_admin ON profiles
    FOR INSERT WITH CHECK (auth.is_super_admin());

CREATE POLICY profiles_delete_super_admin ON profiles
    FOR DELETE USING (auth.is_super_admin());

-- ============================================================
-- RLS POLICIES: CUSTOMER PROFILES
-- ============================================================

CREATE POLICY customer_profiles_select_own ON customer_profiles
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY customer_profiles_select_admin ON customer_profiles
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY customer_profiles_insert_own ON customer_profiles
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY customer_profiles_update_own ON customer_profiles
    FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY customer_profiles_update_admin ON customer_profiles
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: STAFF PROFILES
-- ============================================================

CREATE POLICY staff_profiles_select_own ON staff_profiles
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY staff_profiles_select_admin ON staff_profiles
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY staff_profiles_insert_admin ON staff_profiles
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

CREATE POLICY staff_profiles_update_admin ON staff_profiles
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: ROLES & PERMISSIONS
-- ============================================================

CREATE POLICY roles_select_authenticated ON roles
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY roles_insert_super_admin ON roles
    FOR INSERT WITH CHECK (auth.is_super_admin());

CREATE POLICY roles_update_super_admin ON roles
    FOR UPDATE USING (auth.is_super_admin());

CREATE POLICY roles_delete_super_admin ON roles
    FOR DELETE USING (auth.is_super_admin() AND is_system = FALSE);

CREATE POLICY permissions_select_authenticated ON permissions
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY permissions_insert_super_admin ON permissions
    FOR INSERT WITH CHECK (auth.is_super_admin());

CREATE POLICY role_permissions_select_admin ON role_permissions
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY role_permissions_manage_super_admin ON role_permissions
    FOR ALL USING (auth.is_super_admin());

CREATE POLICY staff_roles_select_own ON staff_roles
    FOR SELECT USING (
        staff_id IN (
            SELECT id FROM staff_profiles WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY staff_roles_select_admin ON staff_roles
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY staff_roles_manage_admin ON staff_roles
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: ADDRESSES
-- ============================================================

CREATE POLICY addresses_select_own ON addresses
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY addresses_select_admin ON addresses
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY addresses_insert_own ON addresses
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY addresses_update_own ON addresses
    FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY addresses_delete_own ON addresses
    FOR DELETE USING (profile_id = auth.uid());

-- ============================================================
-- RLS POLICIES: MARKETPLACES & CONNECTORS
-- ============================================================

CREATE POLICY marketplaces_select_public ON marketplaces
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY marketplaces_select_admin ON marketplaces
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY marketplaces_manage_admin ON marketplaces
    FOR ALL USING (auth.is_staff_or_admin());

CREATE POLICY connectors_select_admin ON marketplace_connectors
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY connectors_manage_admin ON marketplace_connectors
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SOURCE PRODUCTS
-- ============================================================

-- Anyone can read active products
CREATE POLICY source_products_select_public ON source_products
    FOR SELECT USING (status = 'active');

-- Staff can read all products
CREATE POLICY source_products_select_admin ON source_products
    FOR SELECT USING (auth.is_staff_or_admin());

-- Staff can manage products
CREATE POLICY source_products_manage_admin ON source_products
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PRODUCT VARIANTS
-- ============================================================

CREATE POLICY variants_select_public ON source_product_variants
    FOR SELECT USING (
        source_product_id IN (
            SELECT id FROM source_products WHERE status = 'active'
        )
    );

CREATE POLICY variants_select_admin ON source_product_variants
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY variants_manage_admin ON source_product_variants
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: TRANSLATIONS
-- ============================================================

CREATE POLICY translations_select_public ON product_translations
    FOR SELECT USING (
        source_product_id IN (
            SELECT id FROM source_products WHERE status = 'active'
        )
    );

CREATE POLICY translations_select_admin ON product_translations
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY translations_manage_admin ON product_translations
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: GLOSSARY
-- ============================================================

CREATE POLICY glossary_select_staff ON translation_glossary
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY glossary_manage_admin ON translation_glossary
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PRICE SNAPSHOTS
-- ============================================================

CREATE POLICY price_snapshots_select_public ON product_price_snapshots
    FOR SELECT USING (
        source_product_id IN (
            SELECT id FROM source_products WHERE status = 'active'
        )
    );

CREATE POLICY price_snapshots_select_admin ON product_price_snapshots
    FOR SELECT USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: EXCHANGE RATES
-- ============================================================

CREATE POLICY exchange_rates_select_public ON exchange_rates
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY exchange_rates_manage_admin ON exchange_rates
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PRICING RULES
-- ============================================================

CREATE POLICY pricing_rules_select_public ON pricing_rules
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY pricing_rules_manage_admin ON pricing_rules
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: CATEGORIES
-- ============================================================

CREATE POLICY categories_select_public ON categories
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY categories_select_admin ON categories
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY categories_manage_admin ON categories
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: FAVORITES
-- ============================================================

CREATE POLICY favorites_select_own ON favorites
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY favorites_insert_own ON favorites
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY favorites_delete_own ON favorites
    FOR DELETE USING (profile_id = auth.uid());

-- ============================================================
-- RLS POLICIES: RECENTLY VIEWED
-- ============================================================

CREATE POLICY recently_viewed_select_own ON recently_viewed
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY recently_viewed_insert_own ON recently_viewed
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY recently_viewed_delete_own ON recently_viewed
    FOR DELETE USING (profile_id = auth.uid());

-- ============================================================
-- RLS POLICIES: CARTS
-- ============================================================

-- Users can read their own carts or anonymous carts by session
CREATE POLICY carts_select_own ON carts
    FOR SELECT USING (
        profile_id = auth.uid() OR
        (session_id IS NOT NULL AND profile_id IS NULL)
    );

CREATE POLICY carts_insert_own ON carts
    FOR INSERT WITH CHECK (
        profile_id = auth.uid() OR profile_id IS NULL
    );

CREATE POLICY carts_update_own ON carts
    FOR UPDATE USING (
        profile_id = auth.uid() OR
        (session_id IS NOT NULL AND profile_id IS NULL)
    );

CREATE POLICY carts_delete_own ON carts
    FOR DELETE USING (
        profile_id = auth.uid() OR
        (session_id IS NOT NULL AND profile_id IS NULL)
    );

-- ============================================================
-- RLS POLICIES: CART ITEMS
-- ============================================================

CREATE POLICY cart_items_select_own ON cart_items
    FOR SELECT USING (
        cart_id IN (
            SELECT id FROM carts WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY cart_items_insert_own ON cart_items
    FOR INSERT WITH CHECK (
        cart_id IN (
            SELECT id FROM carts WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY cart_items_update_own ON cart_items
    FOR UPDATE USING (
        cart_id IN (
            SELECT id FROM carts WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY cart_items_delete_own ON cart_items
    FOR DELETE USING (
        cart_id IN (
            SELECT id FROM carts WHERE profile_id = auth.uid()
        )
    );

-- ============================================================
-- RLS POLICIES: SOURCING REQUESTS
-- ============================================================

CREATE POLICY sourcing_requests_select_own ON sourcing_requests
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY sourcing_requests_select_staff ON sourcing_requests
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY sourcing_requests_insert_own ON sourcing_requests
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY sourcing_requests_update_own ON sourcing_requests
    FOR UPDATE USING (
        profile_id = auth.uid() AND status = 'pending'
    );

CREATE POLICY sourcing_requests_update_staff ON sourcing_requests
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SOURCING ATTACHMENTS
-- ============================================================

CREATE POLICY sourcing_attachments_select_own ON sourcing_attachments
    FOR SELECT USING (
        sourcing_request_id IN (
            SELECT id FROM sourcing_requests WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY sourcing_attachments_select_staff ON sourcing_attachments
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY sourcing_attachments_insert_own ON sourcing_attachments
    FOR INSERT WITH CHECK (
        sourcing_request_id IN (
            SELECT id FROM sourcing_requests WHERE profile_id = auth.uid()
        )
    );

-- ============================================================
-- RLS POLICIES: SUPPLIERS
-- ============================================================

CREATE POLICY suppliers_select_public ON suppliers
    FOR SELECT USING (is_active = TRUE AND is_verified = TRUE);

CREATE POLICY suppliers_select_admin ON suppliers
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY suppliers_manage_admin ON suppliers
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SUPPLIER OPTIONS
-- ============================================================

CREATE POLICY supplier_options_select_own ON supplier_options
    FOR SELECT USING (
        sourcing_request_id IN (
            SELECT id FROM sourcing_requests WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY supplier_options_select_staff ON supplier_options
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY supplier_options_manage_staff ON supplier_options
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: QUOTES
-- ============================================================

CREATE POLICY quotes_select_own ON quotes
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY quotes_select_staff ON quotes
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY quotes_insert_staff ON quotes
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

CREATE POLICY quotes_update_own ON quotes
    FOR UPDATE USING (
        profile_id = auth.uid() AND status IN ('sent', 'viewed')
    );

CREATE POLICY quotes_update_staff ON quotes
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: QUOTE VERSIONS
-- ============================================================

CREATE POLICY quote_versions_select_own ON quote_versions
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM quotes WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY quote_versions_select_staff ON quote_versions
    FOR SELECT USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: QUOTE ITEMS
-- ============================================================

CREATE POLICY quote_items_select_own ON quote_items
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM quotes WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY quote_items_select_staff ON quote_items
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY quote_items_manage_staff ON quote_items
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: ORDERS
-- ============================================================

CREATE POLICY orders_select_own ON orders
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY orders_select_staff ON orders
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY orders_insert_own ON orders
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY orders_update_own ON orders
    FOR UPDATE USING (
        profile_id = auth.uid() AND status IN ('pending', 'confirmed')
    );

CREATE POLICY orders_update_staff ON orders
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: ORDER ITEMS
-- ============================================================

CREATE POLICY order_items_select_own ON order_items
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY order_items_select_staff ON order_items
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY order_items_manage_staff ON order_items
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PAYMENTS
-- ============================================================

CREATE POLICY payments_select_own ON payments
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY payments_select_staff ON payments
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY payments_insert_own ON payments
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY payments_update_staff ON payments
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PAYMENT ATTEMPTS
-- ============================================================

CREATE POLICY payment_attempts_select_own ON payment_attempts
    FOR SELECT USING (
        payment_id IN (
            SELECT id FROM payments WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY payment_attempts_select_staff ON payment_attempts
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY payment_attempts_insert_system ON payment_attempts
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: PAYMENT WEBHOOKS
-- ============================================================

CREATE POLICY payment_webhooks_manage_admin ON payment_webhooks
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: REFUNDS
-- ============================================================

CREATE POLICY refunds_select_own ON refunds
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY refunds_select_staff ON refunds
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY refunds_insert_own ON refunds
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY refunds_update_staff ON refunds
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SUPPLIER PURCHASES & PAYMENTS
-- ============================================================

CREATE POLICY supplier_purchases_manage_admin ON supplier_purchases
    FOR ALL USING (auth.is_staff_or_admin());

CREATE POLICY supplier_payments_manage_admin ON supplier_payments
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: WAREHOUSE PACKAGES
-- ============================================================

CREATE POLICY warehouse_packages_select_own ON warehouse_packages
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY warehouse_packages_select_staff ON warehouse_packages
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY warehouse_packages_manage_staff ON warehouse_packages
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: INSPECTIONS
-- ============================================================

CREATE POLICY inspections_select_own ON inspections
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY inspections_select_staff ON inspections
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY inspections_manage_staff ON inspections
    FOR ALL USING (auth.is_staff_or_admin());

CREATE POLICY inspection_items_select_staff ON inspection_items
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY inspection_items_manage_staff ON inspection_items
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: CONSOLIDATIONS
-- ============================================================

CREATE POLICY consolidations_select_own ON consolidations
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY consolidations_select_staff ON consolidations
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY consolidations_manage_staff ON consolidations
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SHIPMENTS
-- ============================================================

CREATE POLICY shipments_select_own ON shipments
    FOR SELECT USING (
        order_id IN (
            SELECT id FROM orders WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY shipments_select_staff ON shipments
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY shipments_manage_staff ON shipments
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SHIPMENT PACKAGES
-- ============================================================

CREATE POLICY shipment_packages_select_own ON shipment_packages
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments WHERE order_id IN (
                SELECT id FROM orders WHERE profile_id = auth.uid()
            )
        )
    );

CREATE POLICY shipment_packages_select_staff ON shipment_packages
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY shipment_packages_manage_staff ON shipment_packages
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: TRACKING EVENTS
-- ============================================================

CREATE POLICY tracking_events_select_own ON tracking_events
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments WHERE order_id IN (
                SELECT id FROM orders WHERE profile_id = auth.uid()
            )
        )
    );

CREATE POLICY tracking_events_select_staff ON tracking_events
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY tracking_events_insert_staff ON tracking_events
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: DELIVERIES
-- ============================================================

CREATE POLICY deliveries_select_own ON deliveries
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY deliveries_select_staff ON deliveries
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY deliveries_manage_staff ON deliveries
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: WHATSAPP CHECKOUTS
-- ============================================================

CREATE POLICY whatsapp_checkouts_select_own ON whatsapp_checkouts
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY whatsapp_checkouts_insert_own ON whatsapp_checkouts
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY whatsapp_checkouts_update_own ON whatsapp_checkouts
    FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY whatsapp_checkouts_select_staff ON whatsapp_checkouts
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY whatsapp_checkouts_manage_staff ON whatsapp_checkouts
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SUPPORT TICKETS
-- ============================================================

CREATE POLICY support_tickets_select_own ON support_tickets
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY support_tickets_select_staff ON support_tickets
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY support_tickets_insert_own ON support_tickets
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY support_tickets_update_own ON support_tickets
    FOR UPDATE USING (
        profile_id = auth.uid() AND status IN ('open', 'waiting_customer')
    );

CREATE POLICY support_tickets_update_staff ON support_tickets
    FOR UPDATE USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: SUPPORT MESSAGES
-- ============================================================

CREATE POLICY support_messages_select_own ON support_messages
    FOR SELECT USING (
        ticket_id IN (
            SELECT id FROM support_tickets WHERE profile_id = auth.uid()
        ) AND is_internal = FALSE
    );

CREATE POLICY support_messages_select_staff ON support_messages
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY support_messages_insert_own ON support_messages
    FOR INSERT WITH CHECK (
        ticket_id IN (
            SELECT id FROM support_tickets WHERE profile_id = auth.uid()
        ) AND sender_id = auth.uid()
    );

CREATE POLICY support_messages_insert_staff ON support_messages
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: NOTIFICATIONS
-- ============================================================

CREATE POLICY notifications_select_own ON notifications
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY notifications_insert_admin ON notifications
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (profile_id = auth.uid());

-- ============================================================
-- RLS POLICIES: ADMIN TASKS
-- ============================================================

CREATE POLICY admin_tasks_select_own ON admin_tasks
    FOR SELECT USING (
        assigned_to IN (
            SELECT id FROM staff_profiles WHERE profile_id = auth.uid()
        )
    );

CREATE POLICY admin_tasks_select_admin ON admin_tasks
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY admin_tasks_manage_admin ON admin_tasks
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: DOCUMENTS
-- ============================================================

CREATE POLICY documents_select_own ON documents
    FOR SELECT USING (
        profile_id = auth.uid() OR
        is_public = TRUE
    );

CREATE POLICY documents_select_staff ON documents
    FOR SELECT USING (auth.is_staff_or_admin());

CREATE POLICY documents_insert_own ON documents
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY documents_manage_staff ON documents
    FOR ALL USING (auth.is_staff_or_admin());

-- ============================================================
-- RLS POLICIES: AUDIT LOGS
-- ============================================================

-- Only admins can read audit logs
CREATE POLICY audit_logs_select_admin ON audit_logs
    FOR SELECT USING (auth.is_staff_or_admin());

-- System can insert audit logs
CREATE POLICY audit_logs_insert_admin ON audit_logs
    FOR INSERT WITH CHECK (auth.is_staff_or_admin());

-- Audit logs cannot be modified or deleted
-- (No UPDATE or DELETE policies)

-- ============================================================
-- RLS POLICIES: INTEGRATION EVENTS
-- ============================================================

-- Only admins can manage integration events
CREATE POLICY integration_events_manage_admin ON integration_events
    FOR ALL USING (auth.is_staff_or_admin());
