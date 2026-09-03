-- ============================================================
-- ChinaSuuq Database Schema - Migration 03
-- Addresses, Marketplaces, Marketplace Connectors
-- ============================================================

-- ============================================================
-- ADDRESSES
-- ============================================================

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'Home', -- Home, Work, Warehouse, etc.
    full_name TEXT,
    phone TEXT,
    country TEXT NOT NULL,
    state TEXT,
    city TEXT,
    district TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    postal_code TEXT,
    landmark TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    address_type TEXT DEFAULT 'residential', -- residential, commercial, warehouse
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign keys for customer_profiles after addresses is created
ALTER TABLE customer_profiles 
    ADD CONSTRAINT fk_customer_profiles_shipping_address 
    FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON DELETE SET NULL;

ALTER TABLE customer_profiles 
    ADD CONSTRAINT fk_customer_profiles_billing_address 
    FOREIGN KEY (billing_address_id) REFERENCES addresses(id) ON DELETE SET NULL;

CREATE INDEX idx_addresses_profile ON addresses(profile_id);
CREATE INDEX idx_addresses_country ON addresses(country);
CREATE INDEX idx_addresses_city ON addresses(city);
CREATE INDEX idx_addresses_postal_code ON addresses(postal_code);
CREATE INDEX idx_addresses_is_default ON addresses(is_default) WHERE is_default = TRUE;
CREATE INDEX idx_addresses_location ON addresses(latitude, longitude) WHERE latitude IS NOT NULL;

-- ============================================================
-- MARKETPLACES
-- ============================================================

CREATE TABLE marketplaces (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    marketplace_type marketplace_type UNIQUE NOT NULL,
    base_url TEXT NOT NULL,
    logo_url TEXT,
    country TEXT DEFAULT 'CN',
    currency currency_type DEFAULT 'CNY',
    is_active BOOLEAN DEFAULT TRUE,
    features JSONB DEFAULT '{}', -- Supported features, API capabilities
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplaces_name ON marketplaces(name);
CREATE INDEX idx_marketplaces_type ON marketplaces(marketplace_type);
CREATE INDEX idx_marketplaces_active ON marketplaces(is_active);

-- ============================================================
-- MARKETPLACE CONNECTORS (API integrations)
-- ============================================================

CREATE TABLE marketplace_connectors (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    marketplace_id UUID NOT NULL REFERENCES marketplaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    connector_type TEXT NOT NULL, -- 'api', 'scraper', 'manual'
    status connector_status NOT NULL DEFAULT 'pending_setup',
    config JSONB DEFAULT '{}', -- Encrypted credentials, API keys
    credentials_encrypted TEXT, -- Encrypted API credentials
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 3600,
    rate_limit_per_day INTEGER DEFAULT 86400,
    current_rate_usage INTEGER DEFAULT 0,
    rate_reset_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    webhook_url TEXT,
    webhook_secret TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_connectors_marketplace ON marketplace_connectors(marketplace_id);
CREATE INDEX idx_marketplace_connectors_status ON marketplace_connectors(status);
CREATE INDEX idx_marketplace_connectors_active ON marketplace_connectors(is_active);
CREATE INDEX idx_marketplace_connectors_last_sync ON marketplace_connectors(last_sync_at);

-- ============================================================
-- EXCHANGE RATES
-- ============================================================

CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source_currency currency_type NOT NULL,
    target_currency currency_type NOT NULL,
    rate DECIMAL(15,8) NOT NULL,
    source TEXT DEFAULT 'manual', -- 'api', 'manual', 'calculated'
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_currency, target_currency, valid_from)
);

CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(source_currency, target_currency);
CREATE INDEX idx_exchange_rates_active ON exchange_rates(is_active);
CREATE INDEX idx_exchange_rates_valid ON exchange_rates(valid_from, valid_until);
CREATE INDEX idx_exchange_rates_latest ON exchange_rates(source_currency, target_currency, valid_from DESC);

-- ============================================================
-- PRICING RULES
-- ============================================================

CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL, -- 'markup', 'discount', 'tiered', 'volume', 'minimum_margin'
    applies_to TEXT NOT NULL, -- 'all', 'category', 'product', 'customer', 'region'
    target_id UUID, -- Reference to specific category, product, customer, or region
    calculation_method TEXT NOT NULL, -- 'percentage', 'fixed', 'tiered'
    value DECIMAL(10,4) NOT NULL, -- Markup/discount percentage or fixed amount
    min_quantity INTEGER,
    max_quantity INTEGER,
    min_order_value DECIMAL(12,2),
    max_order_value DECIMAL(12,2),
    currency currency_type DEFAULT 'USD',
    priority INTEGER DEFAULT 0, -- Higher priority rules are applied first
    is_cumulative BOOLEAN DEFAULT FALSE, -- Can this rule stack with others?
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    conditions JSONB DEFAULT '{}', -- Additional conditions
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_type ON pricing_rules(rule_type);
CREATE INDEX idx_pricing_rules_applies_to ON pricing_rules(applies_to);
CREATE INDEX idx_pricing_rules_target ON pricing_rules(target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_pricing_rules_active ON pricing_rules(is_active);
CREATE INDEX idx_pricing_rules_priority ON pricing_rules(priority DESC);
CREATE INDEX idx_pricing_rules_valid ON pricing_rules(valid_from, valid_until);
