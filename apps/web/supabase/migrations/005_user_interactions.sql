-- ============================================================
-- ChinaSuuq Database Schema - Migration 05
-- User Interactions: Favorites, Recently Viewed, Carts
-- ============================================================

-- ============================================================
-- FAVORITES
-- ============================================================

CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, source_product_id)
);

CREATE INDEX idx_favorites_profile ON favorites(profile_id);
CREATE INDEX idx_favorites_product ON favorites(source_product_id);
CREATE INDEX idx_favorites_created ON favorites(created_at);

-- ============================================================
-- RECENTLY VIEWED
-- ============================================================

CREATE TABLE recently_viewed (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    view_duration_seconds INTEGER, -- How long they viewed
    referrer TEXT, -- Where they came from
    device_type TEXT, -- mobile, desktop, tablet
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep only last 100 recently viewed items per user
CREATE INDEX idx_recently_viewed_profile ON recently_viewed(profile_id);
CREATE INDEX idx_recently_viewed_product ON recently_viewed(source_product_id);
CREATE INDEX idx_recently_viewed_date ON recently_viewed(created_at DESC);

-- ============================================================
-- CARTS
-- ============================================================

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL for anonymous carts
    session_id TEXT, -- For anonymous users
    status cart_status NOT NULL DEFAULT 'active',
    currency currency_type DEFAULT 'USD',
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    item_count INTEGER DEFAULT 0,
    notes TEXT,
    coupon_code TEXT,
    coupon_discount DECIMAL(12,2) DEFAULT 0,
    shipping_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carts_profile ON carts(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_carts_session ON carts(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_carts_status ON carts(status);
CREATE INDEX idx_carts_expires ON carts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_carts_active ON carts(status) WHERE status = 'active';

-- ============================================================
-- CART ITEMS
-- ============================================================

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES source_product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    original_price DECIMAL(12,2), -- Price before any discounts
    discount_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    attributes JSONB DEFAULT '{}', -- Selected attributes like color, size
    is_gift BOOLEAN DEFAULT FALSE,
    gift_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(cart_id, source_product_id, variant_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(source_product_id);
CREATE INDEX idx_cart_items_variant ON cart_items(variant_id) WHERE variant_id IS NOT NULL;
