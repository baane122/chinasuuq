-- ============================================================
-- ChinaSuuq Database Schema - Migration 12
-- Add new marketplaces: ChinaGoods + JD (Jingdong)
-- ============================================================

-- Add new values to marketplace_type enum (Postgres 12+: ADD VALUE can't run in transaction)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'chinagoods' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'marketplace_type')) THEN
        ALTER TYPE marketplace_type ADD VALUE IF NOT EXISTS 'chinagoods';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'jd' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'marketplace_type')) THEN
        ALTER TYPE marketplace_type ADD VALUE IF NOT EXISTS 'jd';
    END IF;
END$$;

-- Ensure the new marketplaces exist in the marketplaces table
INSERT INTO marketplaces (id, name, display_name, marketplace_type, base_url, country, currency, is_active, features) VALUES
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567005',
        'chinagoods',
        'ChinaGoods (义乌中国小商品城)',
        'chinagoods',
        'https://www.chinagoods.com',
        'CN',
        'CNY',
        TRUE,
        '{
            "api_available": true,
            "wholesale_only": true,
            "moq_required": true,
            "product_categories": ["accessories", "home", "textiles", "toys", "crafts", "electronics"],
            "payment_methods": ["alipay", "bank_transfer"],
            "shipping_supported": true,
            "buyer_protection": true,
            "yiwu_market_integration": true,
            "sample_available": true
        }'::jsonb
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567006',
        'jd',
        'JD.com (京东)',
        'jd',
        'https://www.jd.com',
        'CN',
        'CNY',
        TRUE,
        '{
            "api_available": true,
            "retail_pricing": true,
            "moq_required": false,
            "product_categories": ["electronics", "home", "fashion", "appliances", "beauty", "fresh"],
            "payment_methods": ["jd_pay", "alipay", "wechat_pay"],
            "shipping_supported": true,
            "buyer_protection": true,
            "genuine_products": true,
            "fast_delivery": true,
            "brand_auth": true
        }'::jsonb
    )
ON CONFLICT (name) DO NOTHING;

-- Ensure alibaba connector row exists for the new marketplaces
INSERT INTO marketplace_connectors (marketplace_id, name, connector_type, status, config, is_active) VALUES
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567005',
        'ChinaGoods API Connector',
        'api',
        'pending_setup',
        '{
            "api_version": "v1",
            "base_endpoint": "https://api.chinagoods.com",
            "features": ["product_search", "market_intelligence", "supplier_info"],
            "rate_limits": {"per_minute": 60, "per_hour": 3600, "per_day": 86400}
        }'::jsonb,
        TRUE
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567006',
        'JD.com API Connector',
        'api',
        'pending_setup',
        '{
            "api_version": "v2",
            "base_endpoint": "https://api.jd.com/routerjson",
            "features": ["product_search", "genuine_verification", "logistics_tracking"],
            "rate_limits": {"per_minute": 80, "per_hour": 4800, "per_day": 115200}
        }'::jsonb,
        TRUE
    ),
    (
        'c1b2c3d4-e5f6-7890-abcd-ef1234567004',
        'Alibaba API Connector',
        'api',
        'pending_setup',
        '{
            "api_version": "v1",
            "base_endpoint": "https://api.alibaba.com/openapi",
            "features": ["product_search", "trade_assurance", "supplier_verification"],
            "rate_limits": {"per_minute": 120, "per_hour": 7200, "per_day": 172800}
        }'::jsonb,
        TRUE
    )
ON CONFLICT DO NOTHING;
