-- ============================================================
-- ChinaSuuq Database Schema - Migration 09
-- Support, Notifications, Admin, Documents, Audit, WhatsApp
-- ============================================================

-- ============================================================
-- WHATSAPP CHECKOUTS
-- ============================================================

CREATE TABLE whatsapp_checkouts (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    status whatsapp_checkout_status NOT NULL DEFAULT 'initiated',
    whatsapp_number TEXT NOT NULL,
    whatsapp_name TEXT,
    
    -- Cart items passed through WhatsApp
    items JSONB NOT NULL DEFAULT '[]',
    
    -- Address
    delivery_address TEXT,
    delivery_city TEXT,
    delivery_country TEXT,
    delivery_notes TEXT,
    
    -- Payment
    payment_method payment_method,
    payment_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Conversation
    conversation_id TEXT, -- WhatsApp conversation ID
    last_message_at TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,
    
    -- Conversion
    converted_at TIMESTAMPTZ,
    abandoned_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_checkouts_profile ON whatsapp_checkouts(profile_id);
CREATE INDEX idx_whatsapp_checkouts_status ON whatsapp_checkouts(status);
CREATE INDEX idx_whatsapp_checkouts_number ON whatsapp_checkouts(whatsapp_number);
CREATE INDEX idx_whatsapp_checkouts_created ON whatsapp_checkouts(created_at);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    ticket_number TEXT UNIQUE NOT NULL, -- e.g., TKT-2024-0001
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'order_issue', 'payment', 'shipping', 'product', 'account', 'other'
    subcategory TEXT,
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status ticket_status NOT NULL DEFAULT 'open',
    
    -- Related items
    related_order_ids UUID[] DEFAULT '{}',
    related_product_ids UUID[] DEFAULT '{}',
    
    -- Communication
    last_reply_at TIMESTAMPTZ,
    last_reply_by UUID REFERENCES profiles(id),
    reply_count INTEGER DEFAULT 0,
    
    -- Satisfaction
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
    feedback TEXT,
    
    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id),
    resolution_notes TEXT,
    closed_at TIMESTAMPTZ,
    
    -- Escalation
    escalated_at TIMESTAMPTZ,
    escalated_to UUID REFERENCES profiles(id),
    escalation_reason TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_tickets_number ON support_tickets(ticket_number);
CREATE INDEX idx_support_tickets_profile ON support_tickets(profile_id);
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_order ON support_tickets(order_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX idx_support_tickets_category ON support_tickets(category);
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at);
CREATE INDEX idx_support_tickets_last_reply ON support_tickets(last_reply_at);

-- ============================================================
-- SUPPORT MESSAGES
-- ============================================================

CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text', -- 'text', 'image', 'file', 'system'
    attachments TEXT[] DEFAULT '{}',
    is_internal BOOLEAN DEFAULT FALSE, -- Internal staff notes
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id);
CREATE INDEX idx_support_messages_sender ON support_messages(sender_id);
CREATE INDEX idx_support_messages_created ON support_messages(created_at);
CREATE INDEX idx_support_messages_read ON support_messages(is_read) WHERE is_read = FALSE;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Related items
    related_type TEXT, -- 'order', 'payment', 'shipment', 'quote', etc.
    related_id UUID,
    action_url TEXT, -- Deep link to relevant page
    
    -- Delivery
    channel TEXT DEFAULT 'in_app', -- 'in_app', 'email', 'sms', 'push', 'whatsapp'
    sent_via TEXT[] DEFAULT '{}', -- Which channels were used
    email_sent BOOLEAN DEFAULT FALSE,
    sms_sent BOOLEAN DEFAULT FALSE,
    push_sent BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_profile ON notifications(profile_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_related ON notifications(related_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX idx_notifications_channel ON notifications(channel);

-- ============================================================
-- ADMIN TASKS
-- ============================================================

CREATE TABLE admin_tasks (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    task_number TEXT UNIQUE NOT NULL, -- e.g., TASK-2024-0001
    assigned_to UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    
    title TEXT NOT NULL,
    description TEXT,
    task_type task_type NOT NULL DEFAULT 'other',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status task_status NOT NULL DEFAULT 'pending',
    
    -- Related items
    related_type TEXT, -- 'order', 'sourcing_request', 'supplier', etc.
    related_id UUID,
    
    -- Scheduling
    due_date DATE,
    due_time TIME,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Dependencies
    depends_on UUID REFERENCES admin_tasks(id),
    blocks UUID[] DEFAULT '{}', -- Task IDs this task blocks
    
    -- Result
    result TEXT,
    notes TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_tasks_number ON admin_tasks(task_number);
CREATE INDEX idx_admin_tasks_assigned ON admin_tasks(assigned_to);
CREATE INDEX idx_admin_tasks_created_by ON admin_tasks(created_by);
CREATE INDEX idx_admin_tasks_status ON admin_tasks(status);
CREATE INDEX idx_admin_tasks_priority ON admin_tasks(priority);
CREATE INDEX idx_admin_tasks_type ON admin_tasks(task_type);
CREATE INDEX idx_admin_tasks_due ON admin_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_admin_tasks_related ON admin_tasks(related_type, related_id) WHERE related_id IS NOT NULL;

-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    
    document_type document_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    
    -- File details
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER, -- Size in bytes
    mime_type TEXT,
    
    -- Related items
    related_type TEXT, -- 'order', 'shipment', 'inspection', etc.
    related_id UUID,
    
    -- Access control
    is_public BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES documents(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_profile ON documents(profile_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_related ON documents(related_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX idx_documents_created ON documents(created_at);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    action audit_action NOT NULL,
    entity_type TEXT NOT NULL, -- 'order', 'payment', 'user', 'settings', etc.
    entity_id UUID,
    
    -- Details
    old_values JSONB, -- Previous state
    new_values JSONB, -- New state
    changes JSONB, -- Diff between old and new
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    request_id TEXT,
    
    -- Source
    source TEXT DEFAULT 'web', -- 'web', 'api', 'webhook', 'system', 'cron'
    actor_name TEXT, -- Name of person or system that performed action
    
    -- Result
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_profile ON audit_logs(profile_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_source ON audit_logs(source);
CREATE INDEX idx_audit_logs_ip ON audit_logs(ip_address);

-- ============================================================
-- INTEGRATION EVENTS
-- ============================================================

CREATE TABLE integration_events (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    source TEXT NOT NULL, -- '1688', 'taobao', 'stripe', 'whatsapp', etc.
    event_type TEXT NOT NULL,
    status integration_status NOT NULL DEFAULT 'pending',
    
    -- Payload
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    
    -- Processing
    processor TEXT, -- Which service processed this
    processed_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    
    -- Related items
    related_type TEXT,
    related_id UUID,
    
    -- Errors
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    
    -- Deduplication
    idempotency_key TEXT UNIQUE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_events_source ON integration_events(source);
CREATE INDEX idx_integration_events_type ON integration_events(event_type);
CREATE INDEX idx_integration_events_status ON integration_events(status);
CREATE INDEX idx_integration_events_created ON integration_events(created_at DESC);
CREATE INDEX idx_integration_events_related ON integration_events(related_type, related_id) WHERE related_id IS NOT NULL;
CREATE INDEX idx_integration_events_retry ON integration_events(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_integration_events_idempotency ON integration_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
