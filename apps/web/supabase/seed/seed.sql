-- ============================================================
-- ChinaSuuq Database Schema - Seed Data
-- Initial data for categories, marketplaces, exchange rates,
-- pricing rules, roles, permissions, and super admin user
-- ============================================================

-- ============================================================
-- SUPER ADMIN USER (Must be created via Supabase Auth first)
-- This seed assumes the admin user has already signed up
-- ============================================================

-- NOTE: The super admin profile should be created after the
-- user signs up via Supabase Auth. The profile will be auto-
-- created by the trigger. This seed updates it to super_admin.

-- To create the super admin:
-- 1. Sign up via Supabase Auth with email: admin@chinasuuq.com
-- 2. Run this seed to update the role

-- ============================================================
-- ROLES
-- ============================================================

INSERT INTO roles (id, name, description, is_system, is_default) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567801', 'super_admin', 'Full system access with all permissions', TRUE, FALSE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'admin', 'Administrative access with most permissions', TRUE, FALSE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'staff', 'Staff access for daily operations', TRUE, FALSE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567804', 'customer', 'Customer access for browsing and ordering', TRUE, TRUE),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567805', 'supplier', 'Supplier access for managing products', TRUE, FALSE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- PERMISSIONS
-- ============================================================

-- User Management
INSERT INTO permissions (resource, action, description) VALUES
    ('users', 'read', 'View user profiles'),
    ('users', 'write', 'Edit user profiles'),
    ('users', 'delete', 'Delete user profiles'),
    ('users', 'manage_roles', 'Assign and remove user roles')
ON CONFLICT (resource, action) DO NOTHING;

-- Order Management
INSERT INTO permissions (resource, action, description) VALUES
    ('orders', 'read', 'View orders'),
    ('orders', 'write', 'Create and edit orders'),
    ('orders', 'delete', 'Cancel orders'),
    ('orders', 'approve', 'Approve orders'),
    ('orders', 'assign', 'Assign orders to staff')
ON CONFLICT (resource, action) DO NOTHING;

-- Payment Management
INSERT INTO permissions (resource, action, description) VALUES
    ('payments', 'read', 'View payment records'),
    ('payments', 'process', 'Process payments'),
    ('payments', 'refund', 'Issue refunds'),
    ('payments', 'verify', 'Verify payments')
ON CONFLICT (resource, action) DO NOTHING;

-- Sourcing Management
INSERT INTO permissions (resource, action, description) VALUES
    ('sourcing', 'read', 'View sourcing requests'),
    ('sourcing', 'write', 'Create and edit sourcing requests'),
    ('sourcing', 'assign', 'Assign sourcing requests to staff'),
    ('sourcing', 'quote', 'Create and send quotes')
ON CONFLICT (resource, action) DO NOTHING;

-- Supplier Management
INSERT INTO permissions (resource, action, description) VALUES
    ('suppliers', 'read', 'View supplier information'),
    ('suppliers', 'write', 'Edit supplier information'),
    ('suppliers', 'delete', 'Remove suppliers'),
    ('suppliers', 'verify', 'Verify suppliers')
ON CONFLICT (resource, action) DO NOTHING;

-- Product Management
INSERT INTO permissions (resource, action, description) VALUES
    ('products', 'read', 'View products'),
    ('products', 'write', 'Create and edit products'),
    ('products', 'delete', 'Remove products'),
    ('products', 'translate', 'Translate product content')
ON CONFLICT (resource, action) DO NOTHING;

-- Shipping Management
INSERT INTO permissions (resource, action, description) VALUES
    ('shipping', 'read', 'View shipment information'),
    ('shipping', 'write', 'Create and update shipments'),
    ('shipping', 'track', 'Track shipments'),
    ('shipping', 'consolidate', 'Consolidate packages')
ON CONFLICT (resource, action) DO NOTHING;

-- Inspection Management
INSERT INTO permissions (resource, action, description) VALUES
    ('inspections', 'read', 'View inspection reports'),
    ('inspections', 'write', 'Create inspection reports'),
    ('inspections', 'approve', 'Approve inspections')
ON CONFLICT (resource, action) DO NOTHING;

-- Support Management
INSERT INTO permissions (resource, action, description) VALUES
    ('support', 'read', 'View support tickets'),
    ('support', 'write', 'Reply to support tickets'),
    ('support', 'assign', 'Assign tickets to staff'),
    ('support', 'close', 'Close support tickets')
ON CONFLICT (resource, action) DO NOTHING;

-- Notification Management
INSERT INTO permissions (resource, action, description) VALUES
    ('notifications', 'read', 'View notifications'),
    ('notifications', 'send', 'Send notifications'),
    ('notifications', 'manage', 'Manage notification settings')
ON CONFLICT (resource, action) DO NOTHING;

-- Category Management
INSERT INTO permissions (resource, action, description) VALUES
    ('categories', 'read', 'View categories'),
    ('categories', 'write', 'Create and edit categories'),
    ('categories', 'delete', 'Delete categories')
ON CONFLICT (resource, action) DO NOTHING;

-- Settings Management
INSERT INTO permissions (resource, action, description) VALUES
    ('settings', 'read', 'View system settings'),
    ('settings', 'write', 'Edit system settings')
ON CONFLICT (resource, action) DO NOTHING;

-- Audit Log
INSERT INTO permissions (resource, action, description) VALUES
    ('audit_logs', 'read', 'View audit logs'),
    ('audit_logs', 'export', 'Export audit logs')
ON CONFLICT (resource, action) DO NOTHING;

-- ============================================================
-- ROLE PERMISSIONS (Assign permissions to roles)
-- ============================================================

-- Super Admin: ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    'a1b2c3d4-e5f6-7890-abcd-ef1234567801'::UUID,
    id
FROM permissions
ON CONFLICT DO NOTHING;

-- Admin: Most permissions except system-level
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    'a1b2c3d4-e5f6-7890-abcd-ef1234567802'::UUID,
    id
FROM permissions
WHERE resource NOT IN ('settings') OR action != 'write'
ON CONFLICT DO NOTHING;

-- Staff: Operational permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    'a1b2c3d4-e5f6-7890-abcd-ef1234567803'::UUID,
    id
FROM permissions
WHERE action IN ('read', 'write') 
AND resource IN ('orders', 'sourcing', 'suppliers', 'products', 'shipping', 'inspections', 'support', 'notifications', 'categories')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CATEGORIES (12 main categories)
-- ============================================================

-- Level 0 (Root categories)
INSERT INTO categories (id, parent_id, name, slug, description, icon, sort_order, level, path, is_active) VALUES
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', NULL, 'Electronics & Gadgets', 'electronics', 'Phones, tablets, laptops, accessories, and electronic gadgets', 'cpu', 1, 0, '/electronics', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', NULL, 'Fashion & Clothing', 'fashion', 'Men''s, women''s, and children''s clothing and accessories', 'shirt', 2, 0, '/fashion', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', NULL, 'Home & Living', 'home-living', 'Furniture, home decor, kitchenware, and household items', 'home', 3, 0, '/home-living', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567004', NULL, 'Beauty & Personal Care', 'beauty', 'Skincare, cosmetics, haircare, and personal care products', 'sparkles', 4, 0, '/beauty', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567005', NULL, 'Sports & Outdoors', 'sports', 'Sports equipment, outdoor gear, and fitness accessories', 'trophy', 5, 0, '/sports', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567006', NULL, 'Toys & Games', 'toys', 'Children''s toys, games, puzzles, and educational items', 'gamepad-2', 6, 0, '/toys', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567007', NULL, 'Automotive', 'automotive', 'Car accessories, tools, and automotive parts', 'car', 7, 0, '/automotive', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567008', NULL, 'Health & Wellness', 'health', 'Health supplements, medical devices, and wellness products', 'heart-pulse', 8, 0, '/health', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567009', NULL, 'Food & Beverages', 'food', 'Packaged foods, snacks, beverages, and food ingredients', 'utensils', 9, 0, '/food', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567010', NULL, 'Office & Stationery', 'office', 'Office supplies, stationery, and business equipment', 'briefcase', 10, 0, '/office', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567011', NULL, 'Pet Supplies', 'pets', 'Pet food, accessories, and care products for animals', 'paw-print', 11, 0, '/pets', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567012', NULL, 'Industrial & Tools', 'industrial', 'Industrial equipment, tools, and hardware', 'wrench', 12, 0, '/industrial', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Level 1 (Sub-categories)
INSERT INTO categories (parent_id, name, slug, description, sort_order, level, path, is_active) VALUES
    -- Electronics sub-categories
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Smartphones', 'smartphones', 'Android and iOS smartphones', 1, 1, '/electronics/smartphones', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Tablets', 'tablets', 'iPads, Android tablets, and e-readers', 2, 1, '/electronics/tablets', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Laptops & Computers', 'laptops', 'Laptops, desktops, and computer components', 3, 1, '/electronics/laptops', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Audio & Headphones', 'audio', 'Speakers, headphones, earbuds, and audio accessories', 4, 1, '/electronics/audio', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Wearable Tech', 'wearables', 'Smartwatches, fitness trackers, and wearables', 5, 1, '/electronics/wearables', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567001', 'Phone Accessories', 'phone-accessories', 'Cases, chargers, screen protectors, and cables', 6, 1, '/electronics/phone-accessories', TRUE),
    
    -- Fashion sub-categories
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Men''s Clothing', 'mens-clothing', 'Shirts, pants, jackets, and suits for men', 1, 1, '/fashion/mens-clothing', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Women''s Clothing', 'womens-clothing', 'Dresses, tops, skirts, and outfits for women', 2, 1, '/fashion/womens-clothing', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Children''s Clothing', 'kids-clothing', 'Clothing for babies, toddlers, and children', 3, 1, '/fashion/kids-clothing', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Shoes', 'shoes', 'Sneakers, sandals, boots, and formal shoes', 4, 1, '/fashion/shoes', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Bags & Luggage', 'bags', 'Handbags, backpacks, suitcases, and travel bags', 5, 1, '/fashion/bags', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567002', 'Jewelry & Watches', 'jewelry', 'Necklaces, bracelets, rings, and watches', 6, 1, '/fashion/jewelry', TRUE),
    
    -- Home sub-categories
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', 'Furniture', 'furniture', 'Sofas, tables, chairs, and bedroom furniture', 1, 1, '/home-living/furniture', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', 'Kitchenware', 'kitchenware', 'Cooking utensils, pots, pans, and kitchen tools', 2, 1, '/home-living/kitchenware', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', 'Home Decor', 'home-decor', 'Wall art, vases, candles, and decorative items', 3, 1, '/home-living/home-decor', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', 'Bedding', 'bedding', 'Sheets, pillows, comforters, and mattress protectors', 4, 1, '/home-living/bedding', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567003', 'Bathroom', 'bathroom', 'Towels, shower accessories, and bathroom storage', 5, 1, '/home-living/bathroom', TRUE),
    
    -- Beauty sub-categories
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567004', 'Skincare', 'skincare', 'Cleansers, moisturizers, serums, and sunscreens', 1, 1, '/beauty/skincare', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567004', 'Makeup', 'makeup', 'Foundation, lipstick, eye makeup, and brushes', 2, 1, '/beauty/makeup', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567004', 'Haircare', 'haircare', 'Shampoo, conditioner, styling products, and tools', 3, 1, '/beauty/haircare', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567004', 'Fragrances', 'fragrances', 'Perfumes, colognes, and body mists', 4, 1, '/beauty/fragrances', TRUE),
    
    -- Sports sub-categories
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567005', 'Fitness Equipment', 'fitness', 'Gym equipment, weights, and exercise machines', 1, 1, '/sports/fitness', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567005', 'Outdoor Gear', 'outdoor', 'Camping, hiking, and outdoor adventure gear', 2, 1, '/sports/outdoor', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567005', 'Sports Apparel', 'sports-apparel', 'Athletic wear, jerseys, and sports uniforms', 3, 1, '/sports/sports-apparel', TRUE),
    ('b1b2c3d4-e5f6-7890-abcd-ef1234567005', 'Balls & Sports Equipment', 'balls', 'Football, basketball, tennis rackets, and sports gear', 4, 1, '/sports/balls', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Update product counts
UPDATE categories c
SET product_count = (
    SELECT COUNT(*)
    FROM source_products sp
    WHERE sp.category_id = c.id
    AND sp.status = 'active'
);

-- ============================================================
-- MARKETPLACES
-- ============================================================

INSERT INTO marketplaces (id, name, display_name, marketplace_type, base_url, country, currency, is_active, features) VALUES
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567001',
        '1688',
        '1688.com (阿里巴巴)',
        '1688',
        'https://www.1688.com',
        'CN',
        'CNY',
        TRUE,
        '{
            "api_available": true,
            "bulk_pricing": true,
            "moq_required": true,
            "wholesale_only": true,
            "product_categories": ["manufacturing", "machinery", "electronics", "textiles", "auto_parts"],
            "payment_methods": ["alipay", "bank_transfer"],
            "shipping_supported": true,
            "buyer_protection": true,
            "verified_suppliers": true
        }'
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567002',
        'taobao',
        'Taobao (淘宝)',
        'taobao',
        'https://www.taobao.com',
        'CN',
        'CNY',
        TRUE,
        '{
            "api_available": true,
            "retail_pricing": true,
            "moq_required": false,
            "wholesale_available": true,
            "product_categories": ["fashion", "electronics", "home", "beauty", "toys"],
            "payment_methods": ["alipay", "wechat_pay"],
            "shipping_supported": true,
            "buyer_protection": true,
            "verified_sellers": true,
            "used_items": true
        }'
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567003',
        'yiwugo',
        'Yiwugo (义乌购)',
        'yiwugo',
        'https://www.yiwugo.com',
        'CN',
        'CNY',
        TRUE,
        '{
            "api_available": false,
            "wholesale_only": true,
            "moq_required": true,
            "product_categories": ["accessories", "jewelry", "toys", "home", "textiles", "crafts"],
            "payment_methods": ["alipay", "bank_transfer"],
            "shipping_supported": true,
            "buyer_protection": true,
            "local_market_integration": true,
            "sample_available": true
        }'
    )
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- EXCHANGE RATES (Approximate rates)
-- ============================================================

INSERT INTO exchange_rates (source_currency, target_currency, rate, source, is_active, valid_from) VALUES
    -- CNY to USD
    ('CNY', 'USD', 0.1370, 'manual', TRUE, NOW()),
    ('USD', 'CNY', 7.2993, 'manual', TRUE, NOW()),
    
    -- CNY to SOS (Somali Shilling)
    ('CNY', 'SOS', 78.50, 'manual', TRUE, NOW()),
    ('SOS', 'CNY', 0.0127, 'manual', TRUE, NOW()),
    
    -- USD to SOS
    ('USD', 'SOS', 572.00, 'manual', TRUE, NOW()),
    ('SOS', 'USD', 0.001748, 'manual', TRUE, NOW()),
    
    -- EUR rates
    ('EUR', 'USD', 1.0850, 'manual', TRUE, NOW()),
    ('USD', 'EUR', 0.9217, 'manual', TRUE, NOW()),
    ('CNY', 'EUR', 0.1262, 'manual', TRUE, NOW()),
    ('EUR', 'CNY', 7.9238, 'manual', TRUE, NOW()),
    
    -- KES (Kenyan Shilling) rates
    ('USD', 'KES', 153.50, 'manual', TRUE, NOW()),
    ('KES', 'USD', 0.006515, 'manual', TRUE, NOW()),
    ('CNY', 'KES', 21.03, 'manual', TRUE, NOW()),
    ('KES', 'CNY', 0.04755, 'manual', TRUE, NOW()),
    
    -- NGN (Nigerian Naira) rates
    ('USD', 'NGN', 1550.00, 'manual', TRUE, NOW()),
    ('NGN', 'USD', 0.000645, 'manual', TRUE, NOW()),
    ('CNY', 'NGN', 212.27, 'manual', TRUE, NOW()),
    ('NGN', 'CNY', 0.004711, 'manual', TRUE, NOW()),
    
    -- ETB (Ethiopian Birr) rates
    ('USD', 'ETB', 56.50, 'manual', TRUE, NOW()),
    ('ETB', 'USD', 0.01770, 'manual', TRUE, NOW()),
    ('CNY', 'ETB', 7.74, 'manual', TRUE, NOW()),
    ('ETB', 'CNY', 0.1292, 'manual', TRUE, NOW()),
    
    -- GBP rates
    ('GBP', 'USD', 1.2700, 'manual', TRUE, NOW()),
    ('USD', 'GBP', 0.7874, 'manual', TRUE, NOW()),
    ('CNY', 'GBP', 0.1078, 'manual', TRUE, NOW()),
    ('GBP', 'CNY', 9.2763, 'manual', TRUE, NOW())
ON CONFLICT (source_currency, target_currency, valid_from) DO NOTHING;

-- ============================================================
-- PRICING RULES
-- ============================================================

INSERT INTO pricing_rules (name, description, rule_type, applies_to, calculation_method, value, priority, is_cumulative, is_active, valid_from, conditions) VALUES
    -- Base markup on all products
    ('Base Markup', 'Default 30% markup on source prices', 'markup', 'all', 'percentage', 30.0, 0, FALSE, TRUE, NOW(), '{}'),
    
    -- Electronics markup (lower margin)
    ('Electronics Markup', '25% markup on electronics (lower margin, higher volume)', 'markup', 'category', 'percentage', 25.0, 10, FALSE, TRUE, NOW(), 
        '{"category_ids": ["b1b2c3d4-e5f6-7890-abcd-ef1234567001"]}'),
    
    -- Fashion markup (higher margin)
    ('Fashion Markup', '40% markup on fashion items', 'markup', 'category', 'percentage', 40.0, 10, FALSE, TRUE, NOW(), 
        '{"category_ids": ["b1b2c3d4-e5f6-7890-abcd-ef1234567002"]}'),
    
    -- Volume discount tiers
    ('Volume Discount 1', '5% discount for orders $100-$499', 'discount', 'all', 'percentage', 5.0, 20, TRUE, TRUE, NOW(),
        '{"min_order_value": 100, "max_order_value": 499}'),
    ('Volume Discount 2', '10% discount for orders $500-$999', 'discount', 'all', 'percentage', 10.0, 20, TRUE, TRUE, NOW(),
        '{"min_order_value": 500, "max_order_value": 999}'),
    ('Volume Discount 3', '15% discount for orders $1000-$4999', 'discount', 'all', 'percentage', 15.0, 20, TRUE, TRUE, NOW(),
        '{"min_order_value": 1000, "max_order_value": 4999}'),
    ('Volume Discount 4', '20% discount for orders $5000+', 'discount', 'all', 'percentage', 20.0, 20, TRUE, TRUE, NOW(),
        '{"min_order_value": 5000}'),
    
    -- Minimum margin rule
    ('Minimum Margin', 'Ensure minimum 10% margin on all items', 'minimum_margin', 'all', 'percentage', 10.0, 30, FALSE, TRUE, NOW(), '{}'),
    
    -- Service fee
    ('Service Fee', '5% service fee on all orders', 'markup', 'all', 'percentage', 5.0, 10, FALSE, TRUE, NOW(), '{}'),
    
    -- Somali customer discount (for market penetration)
    ('Somali Customer Discount', 'Special 15% discount for Somali customers', 'discount', 'customer', 'percentage', 15.0, 15, TRUE, TRUE, NOW(),
        '{"region": "Somalia", "currency": "SOS"}')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SUPER ADMIN USER
-- ============================================================

-- This creates the profile record. The user must first sign up
-- via Supabase Auth. After signup, run this to set the role.

-- NOTE: Replace the UUID below with the actual user ID from
-- auth.users after the admin signs up via the app.

-- Example: Update the first user to super_admin
-- UPDATE profiles 
-- SET role = 'super_admin', 
--     status = 'active',
--     full_name = 'System Administrator',
--     email = 'admin@chinasuuq.com'
-- WHERE email = 'admin@chinasuuq.com';

-- For now, we'll insert a placeholder that can be updated later
-- This is safe because the trigger will create a profile on signup

-- ============================================================
-- MARKETPLACE CONNECTORS (Default connectors)
-- ============================================================

INSERT INTO marketplace_connectors (marketplace_id, name, connector_type, status, config, is_active) VALUES
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567001', -- 1688
        '1688 API Connector',
        'api',
        'pending_setup',
        '{
            "api_version": "v1",
            "base_endpoint": "https://gw.open.1688.com/openapi",
            "features": ["product_search", "order_management", "logistics_tracking"],
            "rate_limits": {
                "per_minute": 60,
                "per_hour": 3600,
                "per_day": 86400
            }
        }',
        TRUE
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567002', -- Taobao
        'Taobao API Connector',
        'api',
        'pending_setup',
        '{
            "api_version": "v2",
            "base_endpoint": "https://eco.taobao.com/router/rest",
            "features": ["product_search", "item_details", "seller_info"],
            "rate_limits": {
                "per_minute": 40,
                "per_hour": 2400,
                "per_day": 60000
            }
        }',
        TRUE
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567003', -- Yiwugo
        'Yiwugo Scraper',
        'scraper',
        'pending_setup',
        '{
            "base_url": "https://www.yiwugo.com",
            "features": ["product_search", "supplier_info"],
            "scrape_interval_hours": 24,
            "respect_robots": true,
            "user_agent": "ChinaSuuqBot/1.0"
        }',
        TRUE
    )
ON CONFLICT DO NOTHING;

-- ============================================================
-- INITIAL ADMIN USER (Run after admin signs up)
-- ============================================================

-- Uncomment and run after the admin user signs up via the app:
-- 
-- DO $$
-- DECLARE
--     admin_user_id UUID;
-- BEGIN
--     -- Get the admin user ID
--     SELECT id INTO admin_user_id
--     FROM profiles
--     WHERE email = 'admin@chinasuuq.com';
--     
--     IF admin_user_id IS NOT NULL THEN
--         -- Update role to super_admin
--         UPDATE profiles
--         SET role = 'super_admin',
--             status = 'active',
--             full_name = 'System Administrator'
--         WHERE id = admin_user_id;
--         
--         -- Create staff profile if not exists
--         INSERT INTO staff_profiles (profile_id, employee_id, department, job_title, can_approve_orders, can_manage_suppliers, can_process_payments, can_manage_inventory, max_order_approval_amount)
--         VALUES (admin_user_id, 'EMP-001', 'Administration', 'Super Administrator', TRUE, TRUE, TRUE, TRUE, 999999.99)
--         ON CONFLICT (profile_id) DO NOTHING;
--         
--         -- Assign super_admin role
--         INSERT INTO staff_roles (staff_id, role_id, assigned_by, is_active)
--         SELECT sp.id, 'a1b2c3d4-e5f6-7890-abcd-ef1234567801'::UUID, admin_user_id, TRUE
--         FROM staff_profiles sp
--         WHERE sp.profile_id = admin_user_id
--         ON CONFLICT (staff_id, role_id) DO NOTHING;
--     END IF;
-- END $$;

-- ============================================================
-- SEED DATA COMPLETE
-- ============================================================
