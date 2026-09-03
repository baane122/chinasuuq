-- ============================================================
-- ChinaSuuq Database Schema - Migration 06
-- Sourcing Requests, Suppliers, Quotes
-- ============================================================

-- ============================================================
-- SOURCING REQUESTS
-- ============================================================

CREATE TABLE sourcing_requests (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    target_marketplace marketplace_type,
    reference_images TEXT[] DEFAULT '{}',
    reference_urls TEXT[] DEFAULT '{}',
    target_price_cny DECIMAL(12,2),
    target_price_usd DECIMAL(12,2),
    max_price_cny DECIMAL(12,2),
    quantity_needed INTEGER,
    quantity_unit TEXT DEFAULT 'piece',
    specifications JSONB DEFAULT '{}',
    status sourcing_status NOT NULL DEFAULT 'pending',
    priority ticket_priority DEFAULT 'medium',
    notes TEXT,
    admin_notes TEXT, -- Internal notes not visible to customer
    deadline TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sourcing_requests_profile ON sourcing_requests(profile_id);
CREATE INDEX idx_sourcing_requests_assigned ON sourcing_requests(assigned_to);
CREATE INDEX idx_sourcing_requests_status ON sourcing_requests(status);
CREATE INDEX idx_sourcing_requests_priority ON sourcing_requests(priority);
CREATE INDEX idx_sourcing_requests_category ON sourcing_requests(category_id);
CREATE INDEX idx_sourcing_requests_created ON sourcing_requests(created_at);
CREATE INDEX idx_sourcing_requests_deadline ON sourcing_requests(deadline) WHERE deadline IS NOT NULL;

-- ============================================================
-- SOURCING ATTACHMENTS
-- ============================================================

CREATE TABLE sourcing_attachments (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    sourcing_request_id UUID NOT NULL REFERENCES sourcing_requests(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'image', 'document', 'video'
    file_size INTEGER, -- Size in bytes
    mime_type TEXT,
    description TEXT,
    uploaded_by UUID REFERENCES profiles(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sourcing_attachments_request ON sourcing_attachments(sourcing_request_id);
CREATE INDEX idx_sourcing_attachments_type ON sourcing_attachments(file_type);

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    name TEXT NOT NULL,
    name_zh TEXT, -- Chinese name
    company_name TEXT,
    company_name_zh TEXT,
    contact_person TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    wechat TEXT,
    website TEXT,
    marketplace_id UUID REFERENCES marketplaces(id),
    marketplace_store_url TEXT,
    marketplace_store_id TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    province TEXT,
    country TEXT DEFAULT 'CN',
    postal_code TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    business_type TEXT, -- manufacturer, wholesaler, trading_company, agent
    product_categories TEXT[] DEFAULT '{}',
    minimum_order_value DECIMAL(12,2),
    minimum_order_quantity INTEGER,
    lead_time_days INTEGER,
    payment_terms TEXT,
    certifications TEXT[] DEFAULT '{}',
    rating DECIMAL(3,2), -- 1-5 rating
    reliability_score DECIMAL(3,1), -- 1-10
    quality_score DECIMAL(3,1), -- 1-10
    communication_score DECIMAL(3,1), -- 1-10
    total_orders INTEGER DEFAULT 0,
    total_value DECIMAL(14,2) DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES profiles(id),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_marketplace ON suppliers(marketplace_id);
CREATE INDEX idx_suppliers_country ON suppliers(country);
CREATE INDEX idx_suppliers_business_type ON suppliers(business_type);
CREATE INDEX idx_suppliers_rating ON suppliers(rating DESC);
CREATE INDEX idx_suppliers_verified ON suppliers(is_verified);
CREATE INDEX idx_suppliers_active ON suppliers(is_active);
CREATE INDEX idx_suppliers_categories ON suppliers USING GIN (product_categories);

-- ============================================================
-- SUPPLIER OPTIONS (For sourcing requests)
-- ============================================================

CREATE TABLE supplier_options (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    sourcing_request_id UUID NOT NULL REFERENCES sourcing_requests(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    source_product_id UUID REFERENCES source_products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    images TEXT[] DEFAULT '{}',
    unit_price_cny DECIMAL(12,2) NOT NULL,
    unit_price_usd DECIMAL(12,2),
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    lead_time_days INTEGER,
    moq INTEGER DEFAULT 1,
    sample_available BOOLEAN DEFAULT FALSE,
    sample_price DECIMAL(12,2),
    shipping_cost_estimate DECIMAL(12,2),
    total_estimate DECIMAL(12,2),
    quality_notes TEXT,
    certifications TEXT[] DEFAULT '{}',
    warranty_info TEXT,
    is_recommended BOOLEAN DEFAULT FALSE,
    staff_notes TEXT,
    status TEXT DEFAULT 'pending', -- pending, recommended, selected, rejected
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_options_request ON supplier_options(sourcing_request_id);
CREATE INDEX idx_supplier_options_supplier ON supplier_options(supplier_id);
CREATE INDEX idx_supplier_options_product ON supplier_options(source_product_id);
CREATE INDEX idx_supplier_options_status ON supplier_options(status);
CREATE INDEX idx_supplier_options_recommended ON supplier_options(is_recommended) WHERE is_recommended = TRUE;

-- ============================================================
-- QUOTES
-- ============================================================

CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    quote_number TEXT UNIQUE NOT NULL, -- e.g., CHN-2024-0001
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    sourcing_request_id UUID REFERENCES sourcing_requests(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    status quote_status NOT NULL DEFAULT 'draft',
    currency currency_type DEFAULT 'USD',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(12,2) DEFAULT 0,
    service_fee DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    estimated_delivery_days INTEGER,
    valid_until TIMESTAMPTZ,
    notes TEXT,
    internal_notes TEXT,
    terms_conditions TEXT,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_number ON quotes(quote_number);
CREATE INDEX idx_quotes_profile ON quotes(profile_id);
CREATE INDEX idx_quotes_sourcing ON quotes(sourcing_request_id);
CREATE INDEX idx_quotes_assigned ON quotes(assigned_to);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created ON quotes(created_at);
CREATE INDEX idx_quotes_valid_until ON quotes(valid_until) WHERE valid_until IS NOT NULL;

-- ============================================================
-- QUOTE VERSIONS (Version history)
-- ============================================================

CREATE TABLE quote_versions (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    changes JSONB NOT NULL DEFAULT '{}', -- What changed
    subtotal DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(quote_id, version_number)
);

CREATE INDEX idx_quote_versions_quote ON quote_versions(quote_id);
CREATE INDEX idx_quote_versions_number ON quote_versions(version_number);

-- ============================================================
-- QUOTE ITEMS
-- ============================================================

CREATE TABLE quote_items (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    supplier_option_id UUID REFERENCES supplier_options(id) ON DELETE SET NULL,
    source_product_id UUID REFERENCES source_products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES source_product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    original_price DECIMAL(12,2), -- Before markup
    cost_price DECIMAL(12,2), -- What we pay supplier
    markup_percentage DECIMAL(5,2),
    currency currency_type DEFAULT 'USD',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_quote_items_product ON quote_items(source_product_id);
CREATE INDEX idx_quote_items_supplier_option ON quote_items(supplier_option_id);
