-- ============================================================
-- ChinaSuuq Database Schema - Migration 07
-- Orders, Payments, Refunds
-- ============================================================

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    order_number TEXT UNIQUE NOT NULL, -- e.g., CSQ-2024-0001
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'pending',
    currency currency_type DEFAULT 'USD',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(12,2) DEFAULT 0,
    service_fee DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    insurance_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(12,2) DEFAULT 0,
    amount_refunded DECIMAL(12,2) DEFAULT 0,
    balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Shipping details
    shipping_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    shipping_method TEXT, -- 'sea', 'air', 'express', 'standard'
    estimated_delivery_days INTEGER,
    actual_delivery_date DATE,
    
    -- Source marketplace details
    target_marketplace marketplace_type,
    source_url TEXT,
    
    -- Payment details
    payment_method payment_method,
    payment_reference TEXT,
    
    -- Internal
    priority ticket_priority DEFAULT 'medium',
    is_gift BOOLEAN DEFAULT FALSE,
    gift_message TEXT,
    notes TEXT,
    internal_notes TEXT,
    special_instructions TEXT,
    
    -- Tracking
    confirmed_at TIMESTAMPTZ,
    processing_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_profile ON orders(profile_id);
CREATE INDEX idx_orders_quote ON orders(quote_id);
CREATE INDEX idx_orders_assigned ON orders(assigned_to);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_currency ON orders(currency);
CREATE INDEX idx_orders_total ON orders(total);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_shipped ON orders(shipped_at) WHERE shipped_at IS NOT NULL;
CREATE INDEX idx_orders_marketplace ON orders(target_marketplace);
CREATE INDEX idx_orders_balance ON orders(balance_due) WHERE balance_due > 0;

-- ============================================================
-- ORDER ITEMS
-- ============================================================

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    quote_item_id UUID REFERENCES quote_items(id) ON DELETE SET NULL,
    source_product_id UUID REFERENCES source_products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES source_product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2), -- What we pay supplier
    total_price DECIMAL(12,2) NOT NULL,
    currency currency_type DEFAULT 'USD',
    
    -- Supplier info
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_order_reference TEXT,
    supplier_status TEXT, -- Status from supplier
    
    -- Status
    is_sourced BOOLEAN DEFAULT FALSE,
    is_purchased BOOLEAN DEFAULT FALSE,
    is_received BOOLEAN DEFAULT FALSE,
    is_inspected BOOLEAN DEFAULT FALSE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(source_product_id);
CREATE INDEX idx_order_items_supplier ON order_items(supplier_id);
CREATE INDEX idx_order_items_status ON order_items(is_sourced, is_purchased, is_received);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    payment_number TEXT UNIQUE NOT NULL, -- e.g., PAY-2024-0001
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount DECIMAL(12,2) NOT NULL,
    currency currency_type NOT NULL DEFAULT 'USD',
    method payment_method NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    
    -- Payment provider details
    provider TEXT, -- 'stripe', 'paypal', 'mpesa', 'zain', 'telesom'
    provider_payment_id TEXT,
    provider_reference TEXT,
    
    -- For mobile money
    mobile_number TEXT,
    mobile_provider TEXT, -- 'mpesa', 'zain', 'telesom', 'zaad'
    transaction_id TEXT,
    
    -- For bank transfer
    bank_name TEXT,
    account_number TEXT,
    routing_number TEXT,
    transfer_reference TEXT,
    
    -- For card payments
    card_last_four TEXT,
    card_brand TEXT,
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    
    -- Conversion
    original_amount DECIMAL(12,2),
    original_currency currency_type,
    exchange_rate_used DECIMAL(15,8),
    
    -- Refund tracking
    amount_refunded DECIMAL(12,2) DEFAULT 0,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    billing_address JSONB,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    processed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_number ON payments(payment_number);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_quote ON payments(quote_id);
CREATE INDEX idx_payments_profile ON payments(profile_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_method ON payments(method);
CREATE INDEX idx_payments_provider ON payments(provider);
CREATE INDEX idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE INDEX idx_payments_amount ON payments(amount);

-- ============================================================
-- PAYMENT ATTEMPTS (Failed payment tracking)
-- ============================================================

CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status payment_status NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency currency_type NOT NULL,
    provider_response JSONB DEFAULT '{}',
    error_code TEXT,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_attempts_payment ON payment_attempts(payment_id);
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);
CREATE INDEX idx_payment_attempts_created ON payment_attempts(created_at);

-- ============================================================
-- PAYMENT WEBHOOKS (Webhook event log)
-- ============================================================

CREATE TABLE payment_webhooks (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    provider TEXT NOT NULL, -- 'stripe', 'paypal', etc.
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_webhooks_provider ON payment_webhooks(provider);
CREATE INDEX idx_payment_webhooks_event_type ON payment_webhooks(event_type);
CREATE INDEX idx_payment_webhooks_payment ON payment_webhooks(payment_id);
CREATE INDEX idx_payment_webhooks_processed ON payment_webhooks(processed);
CREATE INDEX idx_payment_webhooks_created ON payment_webhooks(created_at);

-- ============================================================
-- REFUNDS
-- ============================================================

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    refund_number TEXT UNIQUE NOT NULL, -- e.g., REF-2024-0001
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    processed_by UUID REFERENCES profiles(id),
    amount DECIMAL(12,2) NOT NULL,
    currency currency_type NOT NULL DEFAULT 'USD',
    status refund_status NOT NULL DEFAULT 'pending',
    reason TEXT NOT NULL,
    reason_category TEXT, -- 'quality_issue', 'not_received', 'wrong_item', 'change_mind', 'other'
    
    -- Refund method
    refund_method TEXT NOT NULL, -- 'original_payment', 'store_credit', 'bank_transfer'
    refund_to TEXT, -- Where refund was sent
    
    -- External references
    provider_refund_id TEXT,
    provider_reference TEXT,
    
    -- Approval
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Processing
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_number ON refunds(refund_number);
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_profile ON refunds(profile_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_created ON refunds(created_at);
CREATE INDEX idx_refunds_amount ON refunds(amount);
