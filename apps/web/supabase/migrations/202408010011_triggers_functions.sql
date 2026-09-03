-- ============================================================
-- ChinaSuuq Database Schema - Migration 11
-- Triggers, Functions, Additional Indexes
-- ============================================================

-- ============================================================
-- TRIGGER: Auto-create customer profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, avatar_url, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer'),
        'active'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Auto-create customer profile row
-- ============================================================

CREATE OR REPLACE FUNCTION handle_profile_created()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'customer' THEN
        INSERT INTO customer_profiles (profile_id, referral_code)
        VALUES (NEW.id, UPPER(SUBSTRING(NEW.id::TEXT FROM 1 FOR 8)));
    ELSIF NEW.role IN ('staff', 'admin', 'super_admin') THEN
        INSERT INTO staff_profiles (profile_id)
        VALUES (NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_profile_created();

-- ============================================================
-- TRIGGER: Update updated_at on all relevant tables
-- ============================================================

-- Profiles
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Customer Profiles
CREATE TRIGGER update_customer_profiles_updated_at
    BEFORE UPDATE ON customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Staff Profiles
CREATE TRIGGER update_staff_profiles_updated_at
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Addresses
CREATE TRIGGER update_addresses_updated_at
    BEFORE UPDATE ON addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Source Products
CREATE TRIGGER update_source_products_updated_at
    BEFORE UPDATE ON source_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Source Product Variants
CREATE TRIGGER update_source_product_variants_updated_at
    BEFORE UPDATE ON source_product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Product Translations
CREATE TRIGGER update_product_translations_updated_at
    BEFORE UPDATE ON product_translations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Categories
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Carts
CREATE TRIGGER update_carts_updated_at
    BEFORE UPDATE ON carts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cart Items
CREATE TRIGGER update_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sourcing Requests
CREATE TRIGGER update_sourcing_requests_updated_at
    BEFORE UPDATE ON sourcing_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Suppliers
CREATE TRIGGER update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Supplier Options
CREATE TRIGGER update_supplier_options_updated_at
    BEFORE UPDATE ON supplier_options
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Quotes
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Quote Items
CREATE TRIGGER update_quote_items_updated_at
    BEFORE UPDATE ON quote_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Orders
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Order Items
CREATE TRIGGER update_order_items_updated_at
    BEFORE UPDATE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Payments
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Refunds
CREATE TRIGGER update_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Supplier Purchases
CREATE TRIGGER update_supplier_purchases_updated_at
    BEFORE UPDATE ON supplier_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Warehouse Packages
CREATE TRIGGER update_warehouse_packages_updated_at
    BEFORE UPDATE ON warehouse_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Inspections
CREATE TRIGGER update_inspections_updated_at
    BEFORE UPDATE ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Consolidations
CREATE TRIGGER update_consolidations_updated_at
    BEFORE UPDATE ON consolidations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Shipments
CREATE TRIGGER update_shipments_updated_at
    BEFORE UPDATE ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Deliveries
CREATE TRIGGER update_deliveries_updated_at
    BEFORE UPDATE ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- WhatsApp Checkouts
CREATE TRIGGER update_whatsapp_checkouts_updated_at
    BEFORE UPDATE ON whatsapp_checkouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Support Tickets
CREATE TRIGGER update_support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Admin Tasks
CREATE TRIGGER update_admin_tasks_updated_at
    BEFORE UPDATE ON admin_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Documents
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Integration Events
CREATE TRIGGER update_integration_events_updated_at
    BEFORE UPDATE ON integration_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Roles
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Permissions
CREATE TRIGGER update_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Staff Roles
CREATE TRIGGER update_staff_roles_updated_at
    BEFORE UPDATE ON staff_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Translation Glossary
CREATE TRIGGER update_translation_glossary_updated_at
    BEFORE UPDATE ON translation_glossary
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Exchange Rates
CREATE TRIGGER update_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Pricing Rules
CREATE TRIGGER update_pricing_rules_updated_at
    BEFORE UPDATE ON pricing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Marketplace Connectors
CREATE TRIGGER update_marketplace_connectors_updated_at
    BEFORE UPDATE ON marketplace_connectors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Marketplaces
CREATE TRIGGER update_marketplaces_updated_at
    BEFORE UPDATE ON marketplaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Quote Versions (doesn't have updated_at trigger but has created_at)

-- ============================================================
-- TRIGGER: Update cart totals when items change
-- ============================================================

CREATE OR REPLACE FUNCTION update_cart_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_cart_id UUID;
    v_subtotal DECIMAL(12,2);
    v_item_count INTEGER;
BEGIN
    -- Get cart_id from the affected row
    IF TG_OP = 'DELETE' THEN
        v_cart_id := OLD.cart_id;
    ELSE
        v_cart_id := NEW.cart_id;
    END IF;

    -- Calculate totals
    SELECT COALESCE(SUM(total_price), 0), COUNT(*)
    INTO v_subtotal, v_item_count
    FROM cart_items
    WHERE cart_id = v_cart_id;

    -- Update cart
    UPDATE carts
    SET subtotal = v_subtotal,
        total = v_subtotal - discount_amount + tax_amount,
        item_count = v_item_count,
        updated_at = NOW()
    WHERE id = v_cart_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_cart_item_change
    AFTER INSERT OR UPDATE OR DELETE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_totals();

-- ============================================================
-- TRIGGER: Update order totals when items change
-- ============================================================

CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id UUID;
    v_subtotal DECIMAL(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;

    SELECT COALESCE(SUM(total_price), 0)
    INTO v_subtotal
    FROM order_items
    WHERE order_id = v_order_id;

    UPDATE orders
    SET subtotal = v_subtotal,
        total = v_subtotal + shipping_cost + service_fee + tax_amount + insurance_amount - discount_amount,
        balance_due = (v_subtotal + shipping_cost + service_fee + tax_amount + insurance_amount - discount_amount) - amount_paid,
        updated_at = NOW()
    WHERE id = v_order_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_item_change
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_order_totals();

-- ============================================================
-- TRIGGER: Update quote totals when items change
-- ============================================================

CREATE OR REPLACE FUNCTION update_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_quote_id UUID;
    v_subtotal DECIMAL(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_quote_id := OLD.quote_id;
    ELSE
        v_quote_id := NEW.quote_id;
    END IF;

    SELECT COALESCE(SUM(total_price), 0)
    INTO v_subtotal
    FROM quote_items
    WHERE quote_id = v_quote_id;

    UPDATE quotes
    SET subtotal = v_subtotal,
        total = v_subtotal + shipping_cost + service_fee + tax_amount - discount_amount,
        updated_at = NOW()
    WHERE id = v_quote_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_quote_item_change
    AFTER INSERT OR UPDATE OR DELETE ON quote_items
    FOR EACH ROW
    EXECUTE FUNCTION update_quote_totals();

-- ============================================================
-- TRIGGER: Auto-generate order number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'CSQ-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                           LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TRIGGER on_order_insert
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_number();

-- ============================================================
-- TRIGGER: Auto-generate quote number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
        NEW.quote_number := 'QT-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                           LPAD(NEXTVAL('quote_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

CREATE TRIGGER on_quote_insert
    BEFORE INSERT ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION generate_quote_number();

-- ============================================================
-- TRIGGER: Auto-generate payment number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_number IS NULL OR NEW.payment_number = '' THEN
        NEW.payment_number := 'PAY-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                             LPAD(NEXTVAL('payment_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;

CREATE TRIGGER on_payment_insert
    BEFORE INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION generate_payment_number();

-- ============================================================
-- TRIGGER: Auto-generate ticket number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := 'TKT-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                            LPAD(NEXTVAL('ticket_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

CREATE TRIGGER on_ticket_insert
    BEFORE INSERT ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION generate_ticket_number();

-- ============================================================
-- TRIGGER: Auto-generate task number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_task_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.task_number IS NULL OR NEW.task_number = '' THEN
        NEW.task_number := 'TASK-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                          LPAD(NEXTVAL('task_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS task_number_seq START 1;

CREATE TRIGGER on_task_insert
    BEFORE INSERT ON admin_tasks
    FOR EACH ROW
    EXECUTE FUNCTION generate_task_number();

-- ============================================================
-- TRIGGER: Auto-generate refund number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_refund_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.refund_number IS NULL OR NEW.refund_number = '' THEN
        NEW.refund_number := 'REF-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                            LPAD(NEXTVAL('refund_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS refund_number_seq START 1;

CREATE TRIGGER on_refund_insert
    BEFORE INSERT ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION generate_refund_number();

-- ============================================================
-- TRIGGER: Auto-generate purchase number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_purchase_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.purchase_number IS NULL OR NEW.purchase_number = '' THEN
        NEW.purchase_number := 'PUR-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                              LPAD(NEXTVAL('purchase_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS purchase_number_seq START 1;

CREATE TRIGGER on_purchase_insert
    BEFORE INSERT ON supplier_purchases
    FOR EACH ROW
    EXECUTE FUNCTION generate_purchase_number();

-- ============================================================
-- TRIGGER: Auto-generate consolidation number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_consolidation_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.consolidation_number IS NULL OR NEW.consolidation_number = '' THEN
        NEW.consolidation_number := 'CON-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                                   LPAD(NEXTVAL('consolidation_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS consolidation_number_seq START 1;

CREATE TRIGGER on_consolidation_insert
    BEFORE INSERT ON consolidations
    FOR EACH ROW
    EXECUTE FUNCTION generate_consolidation_number();

-- ============================================================
-- TRIGGER: Auto-generate shipment number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.shipment_number IS NULL OR NEW.shipment_number = '' THEN
        NEW.shipment_number := 'SHP-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                              LPAD(NEXTVAL('shipment_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS shipment_number_seq START 1;

CREATE TRIGGER on_shipment_insert
    BEFORE INSERT ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION generate_shipment_number();

-- ============================================================
-- TRIGGER: Auto-generate delivery number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_delivery_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.delivery_number IS NULL OR NEW.delivery_number = '' THEN
        NEW.delivery_number := 'DEL-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                              LPAD(NEXTVAL('delivery_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE SEQUENCE IF NOT EXISTS delivery_number_seq START 1;

CREATE TRIGGER on_delivery_insert
    BEFORE INSERT ON deliveries
    FOR EACH ROW
    EXECUTE FUNCTION generate_delivery_number();

-- ============================================================
-- VIEW: Latest exchange rates
-- ============================================================

CREATE OR REPLACE VIEW latest_exchange_rates AS
SELECT DISTINCT ON (source_currency, target_currency)
    id,
    source_currency,
    target_currency,
    rate,
    source,
    valid_from,
    valid_until,
    created_at
FROM exchange_rates
WHERE is_active = TRUE
ORDER BY source_currency, target_currency, valid_from DESC;

-- ============================================================
-- VIEW: Active pricing rules
-- ============================================================

CREATE OR REPLACE VIEW active_pricing_rules AS
SELECT *
FROM pricing_rules
WHERE is_active = TRUE
AND valid_from <= NOW()
AND (valid_until IS NULL OR valid_until > NOW())
ORDER BY priority DESC;

-- ============================================================
-- VIEW: Product summary (with translations)
-- ============================================================

CREATE OR REPLACE VIEW product_summary AS
SELECT 
    sp.*,
    pt_en.title AS title_en,
    pt_en.description AS description_en,
    pt_zh.title AS title_zh,
    pt_zh.description AS description_zh,
    c.name AS category_name,
    c.slug AS category_slug,
    m.display_name AS marketplace_name,
    m.marketplace_type AS marketplace_type
FROM source_products sp
LEFT JOIN product_translations pt_en ON sp.id = pt_en.source_product_id AND pt_en.language = 'en'
LEFT JOIN product_translations pt_zh ON sp.id = pt_zh.source_product_id AND pt_zh.language = 'zh'
LEFT JOIN categories c ON sp.category_id = c.id
LEFT JOIN marketplaces m ON sp.marketplace_id = m.id
WHERE sp.status = 'active';

-- ============================================================
-- VIEW: Order summary
-- ============================================================

CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.*,
    p.full_name AS customer_name,
    p.email AS customer_email,
    p.phone AS customer_phone,
    sp.full_name AS staff_name,
    q.quote_number,
    COUNT(oi.id) AS item_count
FROM orders o
LEFT JOIN profiles p ON o.profile_id = p.id
LEFT JOIN staff_profiles osp ON o.assigned_to = osp.id
LEFT JOIN profiles sp ON osp.profile_id = sp.id
LEFT JOIN quotes q ON o.quote_id = q.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, p.full_name, p.email, p.phone, sp.full_name, q.quote_number;
