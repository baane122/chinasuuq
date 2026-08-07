-- ============================================================
-- ChinaSuuq Database Schema - Migration 04
-- Products, Translations, Pricing
-- ============================================================

-- ============================================================
-- CATEGORIES (Hierarchical)
-- ============================================================

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0, -- 0 = root, 1 = sub, 2 = sub-sub
    path TEXT, -- Materialized path for quick queries, e.g., '/electronics/phones/smartphones'
    product_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_sort ON categories(sort_order);
CREATE INDEX idx_categories_active ON categories(is_active);
CREATE INDEX idx_categories_level ON categories(level);
CREATE INDEX idx_categories_path ON categories USING GIN (path gin_trgm_ops);

-- ============================================================
-- SOURCE PRODUCTS (From Chinese marketplaces)
-- ============================================================

CREATE TABLE source_products (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    marketplace_id UUID NOT NULL REFERENCES marketplaces(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    source_id TEXT NOT NULL, -- Original product ID on marketplace
    source_title TEXT NOT NULL,
    source_description TEXT,
    source_images TEXT[] DEFAULT '{}', -- Array of original image URLs
    source_price DECIMAL(12,2),
    source_currency currency_type DEFAULT 'CNY',
    source_min_quantity INTEGER DEFAULT 1,
    source_max_quantity INTEGER,
    source_unit TEXT DEFAULT 'piece',
    seller_name TEXT,
    seller_id TEXT,
    seller_rating DECIMAL(3,2),
    seller_location TEXT,
    moq INTEGER DEFAULT 1, -- Minimum Order Quantity
    lead_time_days INTEGER,
    in_stock BOOLEAN DEFAULT TRUE,
    stock_quantity INTEGER,
    status product_status NOT NULL DEFAULT 'draft',
    quality_score DECIMAL(3,1), -- 1-10 quality rating
    last_synced_at TIMESTAMPTZ,
    sync_hash TEXT, -- Hash to detect changes
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES profiles(id),
    verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(marketplace_id, source_id)
);

CREATE INDEX idx_source_products_marketplace ON source_products(marketplace_id);
CREATE INDEX idx_source_products_category ON source_products(category_id);
CREATE INDEX idx_source_products_status ON source_products(status);
CREATE INDEX idx_source_products_price ON source_products(source_price);
CREATE INDEX idx_source_products_source_id ON source_products(source_id);
CREATE INDEX idx_source_products_source_url ON source_products(source_url);
CREATE INDEX idx_source_products_seller ON source_products(seller_id);
CREATE INDEX idx_source_products_in_stock ON source_products(in_stock);
CREATE INDEX idx_source_products_last_synced ON source_products(last_synced_at);
CREATE INDEX idx_source_products_title_search ON source_products USING GIN (to_tsvector('english', source_title));

-- ============================================================
-- SOURCE PRODUCT VARIANTS
-- ============================================================

CREATE TABLE source_product_variants (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL, -- e.g., "Red / XL", "Size: Large"
    sku TEXT,
    source_price DECIMAL(12,2) NOT NULL,
    original_price DECIMAL(12,2), -- Before discount
    stock_quantity INTEGER DEFAULT 0,
    in_stock BOOLEAN DEFAULT TRUE,
    weight_grams INTEGER,
    dimensions JSONB, -- { length_cm, width_cm, height_cm }
    image_url TEXT,
    attributes JSONB DEFAULT '{}', -- { color: "red", size: "xl", material: "cotton" }
    is_default BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_product_variants_product ON source_product_variants(source_product_id);
CREATE INDEX idx_source_product_variants_sku ON source_product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_source_product_variants_stock ON source_product_variants(in_stock);
CREATE INDEX idx_source_product_variants_price ON source_product_variants(source_price);

-- ============================================================
-- PRODUCT TRANSLATIONS
-- ============================================================

CREATE TABLE product_translations (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    language language_code NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    key_features TEXT[], -- Array of key features
    specifications JSONB DEFAULT '{}', -- Translated specifications
    search_keywords TEXT[] DEFAULT '{}',
    is_machine_translated BOOLEAN DEFAULT TRUE,
    translated_by UUID REFERENCES profiles(id),
    reviewed_by UUID REFERENCES profiles(id),
    quality_score DECIMAL(3,1),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_product_id, language)
);

CREATE INDEX idx_product_translations_product ON product_translations(source_product_id);
CREATE INDEX idx_product_translations_language ON product_translations(language);
CREATE INDEX idx_product_translations_title_search ON product_translations USING GIN (to_tsvector('english', title));

-- ============================================================
-- TRANSLATION GLOSSARY
-- ============================================================

CREATE TABLE translation_glossary (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source_language language_code NOT NULL,
    target_language language_code NOT NULL,
    source_term TEXT NOT NULL,
    target_term TEXT NOT NULL,
    context TEXT, -- e.g., 'product', 'legal', 'shipping'
    category TEXT, -- e.g., 'clothing', 'electronics', 'general'
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES profiles(id),
    usage_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_language, target_language, source_term)
);

CREATE INDEX idx_translation_glossary_languages ON translation_glossary(source_language, target_language);
CREATE INDEX idx_translation_glossary_context ON translation_glossary(context);
CREATE INDEX idx_translation_glossary_category ON translation_glossary(category);
CREATE INDEX idx_translation_glossary_approved ON translation_glossary(is_approved);

-- ============================================================
-- PRODUCT PRICE SNAPSHOTS (Historical prices)
-- ============================================================

CREATE TABLE product_price_snapshots (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source_product_id UUID NOT NULL REFERENCES source_products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES source_product_variants(id) ON DELETE CASCADE,
    price DECIMAL(12,2) NOT NULL,
    currency currency_type NOT NULL DEFAULT 'CNY',
    exchange_rate_id UUID REFERENCES exchange_rates(id),
    price_usd DECIMAL(12,2), -- Converted price in USD
    price_sos DECIMAL(12,2), -- Converted price in SOS (Somali Shilling)
    discount_percentage DECIMAL(5,2),
    is_promotion BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_snapshots_product ON product_price_snapshots(source_product_id);
CREATE INDEX idx_price_snapshots_variant ON product_price_snapshots(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX idx_price_snapshots_date ON product_price_snapshots(created_at);
CREATE INDEX idx_price_snapshots_price ON product_price_snapshots(price);
