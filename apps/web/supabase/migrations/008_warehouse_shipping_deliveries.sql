-- ============================================================
-- ChinaSuuq Database Schema - Migration 08
-- Warehouse, Inspections, Consolidations, Shipments, Deliveries
-- ============================================================

-- ============================================================
-- SUPPLIER PURCHASES (Track purchases from suppliers)
-- ============================================================

CREATE TABLE supplier_purchases (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_number TEXT UNIQUE NOT NULL,
    status supplier_payment_status NOT NULL DEFAULT 'pending',
    total_amount_cny DECIMAL(12,2) NOT NULL,
    total_amount_usd DECIMAL(12,2),
    currency currency_type DEFAULT 'CNY',
    payment_terms TEXT,
    payment_method TEXT,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    tracking_number TEXT,
    shipping_provider TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_purchases_order ON supplier_purchases(order_id);
CREATE INDEX idx_supplier_purchases_supplier ON supplier_purchases(supplier_id);
CREATE INDEX idx_supplier_purchases_status ON supplier_purchases(status);
CREATE INDEX idx_supplier_purchases_date ON supplier_purchases(purchase_date);

-- ============================================================
-- SUPPLIER PAYMENTS
-- ============================================================

CREATE TABLE supplier_payments (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    supplier_purchase_id UUID NOT NULL REFERENCES supplier_purchases(id) ON DELETE RESTRICT,
    amount DECIMAL(12,2) NOT NULL,
    currency currency_type NOT NULL DEFAULT 'CNY',
    payment_method TEXT NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number TEXT,
    bank_details JSONB,
    exchange_rate_used DECIMAL(15,8),
    amount_usd DECIMAL(12,2),
    status supplier_payment_status NOT NULL DEFAULT 'completed',
    approved_by UUID REFERENCES profiles(id),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_payments_purchase ON supplier_payments(supplier_purchase_id);
CREATE INDEX idx_supplier_payments_date ON supplier_payments(payment_date);
CREATE INDEX idx_supplier_payments_status ON supplier_payments(status);

-- ============================================================
-- WAREHOUSE PACKAGES (Items received at our warehouse in China)
-- ============================================================

CREATE TABLE warehouse_packages (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    supplier_purchase_id UUID REFERENCES supplier_purchases(id) ON DELETE SET NULL,
    tracking_number TEXT,
    shipping_provider TEXT,
    warehouse_location TEXT DEFAULT 'shenzhen', -- shenzhen, yiwu, guangzhou
    status shipping_status NOT NULL DEFAULT 'pending',
    weight_grams INTEGER,
    length_cm INTEGER,
    width_cm INTEGER,
    height_cm INTEGER,
    volumetric_weight_grams INTEGER,
    condition_notes TEXT,
    received_at TIMESTAMPTZ,
    inspected_at TIMESTAMPTZ,
    consolidated_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warehouse_packages_order ON warehouse_packages(order_id);
CREATE INDEX idx_warehouse_packages_item ON warehouse_packages(order_item_id);
CREATE INDEX idx_warehouse_packages_tracking ON warehouse_packages(tracking_number);
CREATE INDEX idx_warehouse_packages_status ON warehouse_packages(status);
CREATE INDEX idx_warehouse_packages_location ON warehouse_packages(warehouse_location);
CREATE INDEX idx_warehouse_packages_received ON warehouse_packages(received_at);

-- ============================================================
-- INSPECTIONS
-- ============================================================

CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    warehouse_package_id UUID REFERENCES warehouse_packages(id) ON DELETE SET NULL,
    inspector_id UUID REFERENCES staff_profiles(id),
    status inspection_status NOT NULL DEFAULT 'pending',
    inspection_type TEXT DEFAULT 'standard', -- 'standard', 'detailed', 'photo_only'
    
    -- Overall results
    overall_quality_score DECIMAL(3,1), -- 1-10
    passed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    conditional_items INTEGER DEFAULT 0,
    
    -- Photo documentation
    photos TEXT[] DEFAULT '{}',
    videos TEXT[] DEFAULT '{}',
    
    -- Notes
    inspector_notes TEXT,
    issues_found TEXT[],
    recommendations TEXT[],
    
    -- Timestamps
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspections_order ON inspections(order_id);
CREATE INDEX idx_inspections_package ON inspections(warehouse_package_id);
CREATE INDEX idx_inspections_inspector ON inspections(inspector_id);
CREATE INDEX idx_inspections_status ON inspections(status);
CREATE INDEX idx_inspections_scheduled ON inspections(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- ============================================================
-- INSPECTION ITEMS
-- ============================================================

CREATE TABLE inspection_items (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    inspection_id UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    quantity_expected INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL DEFAULT 0,
    quantity_passed INTEGER NOT NULL DEFAULT 0,
    quantity_failed INTEGER NOT NULL DEFAULT 0,
    status inspection_status NOT NULL DEFAULT 'pending',
    quality_score DECIMAL(3,1), -- 1-10
    defects TEXT[], -- List of defects found
    photos TEXT[] DEFAULT '{}',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_items_inspection ON inspection_items(inspection_id);
CREATE INDEX idx_inspection_items_order_item ON inspection_items(order_item_id);
CREATE INDEX idx_inspection_items_status ON inspection_items(status);

-- ============================================================
-- CONSOLIDATIONS (Combine packages for shipping)
-- ============================================================

CREATE TABLE consolidations (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    consolidation_number TEXT UNIQUE NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES staff_profiles(id),
    status consolidation_status NOT NULL DEFAULT 'pending',
    shipping_method TEXT NOT NULL, -- 'sea', 'air', 'express'
    
    -- Weight and dimensions
    total_weight_grams INTEGER,
    total_length_cm INTEGER,
    total_width_cm INTEGER,
    total_height_cm INTEGER,
    volumetric_weight_grams INTEGER,
    package_count INTEGER DEFAULT 0,
    
    -- Shipping details
    estimated_shipping_cost DECIMAL(12,2),
    actual_shipping_cost DECIMAL(12,2),
    shipping_provider TEXT,
    origin_warehouse TEXT DEFAULT 'shenzhen',
    destination_country TEXT,
    destination_port TEXT,
    
    -- Timeline
    consolidated_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    estimated_arrival DATE,
    actual_arrival DATE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consolidations_order ON consolidations(order_id);
CREATE INDEX idx_consolidations_status ON consolidations(status);
CREATE INDEX idx_consolidations_assigned ON consolidations(assigned_to);
CREATE INDEX idx_consolidations_method ON consolidations(shipping_method);
CREATE INDEX idx_consolidations_estimated_arrival ON consolidations(estimated_arrival);

-- ============================================================
-- SHIPMENTS
-- ============================================================

CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    shipment_number TEXT UNIQUE NOT NULL,
    consolidation_id UUID REFERENCES consolidations(id) ON DELETE SET NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES staff_profiles(id),
    status shipping_status NOT NULL DEFAULT 'pending',
    
    -- Carrier details
    carrier TEXT NOT NULL, -- 'DHL', 'FedEx', 'UPS', 'Maersk', 'COSCO', etc.
    service_type TEXT, -- 'express', 'standard', 'economy'
    tracking_number TEXT,
    tracking_url TEXT,
    
    -- Origin and destination
    origin_warehouse TEXT DEFAULT 'shenzhen',
    origin_country TEXT DEFAULT 'CN',
    origin_address TEXT,
    destination_country TEXT NOT NULL,
    destination_city TEXT,
    destination_address TEXT,
    destination_postal_code TEXT,
    
    -- Package details
    weight_grams INTEGER,
    volumetric_weight_grams INTEGER,
    dimensions JSONB, -- { length_cm, width_cm, height_cm }
    package_count INTEGER DEFAULT 1,
    
    -- Costs
    shipping_cost DECIMAL(12,2),
    currency currency_type DEFAULT 'USD',
    insurance_cost DECIMAL(12,2),
    customs_duty_estimate DECIMAL(12,2),
    
    -- Customs
    customs_declaration_number TEXT,
    customs_status TEXT, -- 'pending', 'submitted', 'cleared', 'held'
    customs_notes TEXT,
    
    -- Timeline
    shipped_at TIMESTAMPTZ,
    departed_origin_at TIMESTAMPTZ,
    arrived_destination_at TIMESTAMPTZ,
    customs_cleared_at TIMESTAMPTZ,
    out_for_delivery_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    estimated_delivery_date DATE,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipments_number ON shipments(shipment_number);
CREATE INDEX idx_shipments_consolidation ON shipments(consolidation_id);
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_carrier ON shipments(carrier);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX idx_shipments_destination ON shipments(destination_country);
CREATE INDEX idx_shipments_estimated_delivery ON shipments(estimated_delivery_date);
CREATE INDEX idx_shipments_shipped ON shipments(shipped_at) WHERE shipped_at IS NOT NULL;

-- ============================================================
-- SHIPMENT PACKAGES (Individual packages in a shipment)
-- ============================================================

CREATE TABLE shipment_packages (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    warehouse_package_id UUID REFERENCES warehouse_packages(id) ON DELETE SET NULL,
    package_number INTEGER NOT NULL,
    weight_grams INTEGER,
    length_cm INTEGER,
    width_cm INTEGER,
    height_cm INTEGER,
    description TEXT,
    contents_summary TEXT,
    declared_value DECIMAL(12,2),
    currency currency_type DEFAULT 'USD',
    tracking_number TEXT,
    barcode TEXT,
    status shipping_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shipment_id, package_number)
);

CREATE INDEX idx_shipment_packages_shipment ON shipment_packages(shipment_id);
CREATE INDEX idx_shipment_packages_warehouse ON shipment_packages(warehouse_package_id);
CREATE INDEX idx_shipment_packages_tracking ON shipment_packages(tracking_number);
CREATE INDEX idx_shipment_packages_status ON shipment_packages(status);

-- ============================================================
-- TRACKING EVENTS
-- ============================================================

CREATE TABLE tracking_events (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    shipment_package_id UUID REFERENCES shipment_packages(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'picked_up', 'in_transit', 'customs', 'delivered', etc.
    status TEXT NOT NULL,
    location TEXT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    carrier_status TEXT,
    carrier_event_code TEXT,
    description TEXT,
    raw_data JSONB DEFAULT '{}', -- Original carrier response
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_events_shipment ON tracking_events(shipment_id);
CREATE INDEX idx_tracking_events_package ON tracking_events(shipment_package_id);
CREATE INDEX idx_tracking_events_type ON tracking_events(event_type);
CREATE INDEX idx_tracking_events_recorded ON tracking_events(recorded_at DESC);
CREATE INDEX idx_tracking_events_status ON tracking_events(status);

-- ============================================================
-- DELIVERIES
-- ============================================================

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    delivery_number TEXT UNIQUE NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    
    -- Delivery details
    status shipping_status NOT NULL DEFAULT 'pending',
    carrier TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    vehicle_number TEXT,
    
    -- Address
    delivery_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    delivery_address TEXT,
    delivery_city TEXT,
    delivery_country TEXT,
    
    -- Signature and proof
    recipient_name TEXT,
    recipient_signature_url TEXT,
    recipient_photo_url TEXT,
    delivery_photo_url TEXT,
    
    -- Timeline
    scheduled_date DATE,
    scheduled_time_start TIME,
    scheduled_time_end TIME,
    attempted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    
    -- Notes
    delivery_notes TEXT,
    special_instructions TEXT,
    customer_notes TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_number ON deliveries(delivery_number);
CREATE INDEX idx_deliveries_order ON deliveries(order_id);
CREATE INDEX idx_deliveries_shipment ON deliveries(shipment_id);
CREATE INDEX idx_deliveries_profile ON deliveries(profile_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_scheduled ON deliveries(scheduled_date);
CREATE INDEX idx_deliveries_delivered ON deliveries(delivered_at) WHERE delivered_at IS NOT NULL;
