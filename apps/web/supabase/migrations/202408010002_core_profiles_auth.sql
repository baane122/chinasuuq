-- ============================================================
-- ChinaSuuq Database Schema - Migration 02
-- Core Tables: Profiles, Roles, Permissions
-- ============================================================

-- ============================================================
-- PROFILES (Supabase auth integration)
-- ============================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'customer',
    status user_status NOT NULL DEFAULT 'active',
    preferred_language language_code DEFAULT 'en',
    preferred_currency currency_type DEFAULT 'USD',
    timezone TEXT DEFAULT 'UTC',
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profile indexes
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_full_name ON profiles USING GIN (full_name gin_trgm_ops);
CREATE INDEX idx_profiles_created_at ON profiles(created_at);

-- ============================================================
-- CUSTOMER PROFILES (Extended customer info)
-- ============================================================

CREATE TABLE customer_profiles (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gender gender_type,
    date_of_birth DATE,
    company_name TEXT,
    business_type TEXT,
    tax_id TEXT,
    shipping_address_id UUID, -- FK added after addresses table
    billing_address_id UUID, -- FK added after addresses table
    whatsapp_number TEXT,
    preferred_payment_method payment_method,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    outstanding_balance DECIMAL(12,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(14,2) DEFAULT 0,
    loyalty_points INTEGER DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES profiles(id),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_profiles_profile_id ON customer_profiles(profile_id);
CREATE INDEX idx_customer_profiles_referral_code ON customer_profiles(referral_code);
CREATE INDEX idx_customer_profiles_whatsapp ON customer_profiles(whatsapp_number) WHERE whatsapp_number IS NOT NULL;
CREATE INDEX idx_customer_profiles_total_orders ON customer_profiles(total_orders DESC);

-- ============================================================
-- STAFF PROFILES (Extended staff info)
-- ============================================================

CREATE TABLE staff_profiles (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    employee_id TEXT UNIQUE,
    department TEXT,
    job_title TEXT,
    manager_id UUID REFERENCES staff_profiles(id),
    hire_date DATE,
    salary DECIMAL(12,2),
    commission_rate DECIMAL(5,4) DEFAULT 0,
    can_approve_orders BOOLEAN DEFAULT FALSE,
    can_manage_suppliers BOOLEAN DEFAULT FALSE,
    can_process_payments BOOLEAN DEFAULT FALSE,
    can_manage_inventory BOOLEAN DEFAULT FALSE,
    max_order_approval_amount DECIMAL(12,2) DEFAULT 0,
    languages Spoken TEXT[] DEFAULT '{}',
    timezone TEXT DEFAULT 'UTC',
    is_available BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_profiles_profile_id ON staff_profiles(profile_id);
CREATE INDEX idx_staff_profiles_employee_id ON staff_profiles(employee_id);
CREATE INDEX idx_staff_profiles_department ON staff_profiles(department);
CREATE INDEX idx_staff_profiles_manager ON staff_profiles(manager_id);

-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    is_default BOOLEAN DEFAULT FALSE, -- Assigned to new users automatically
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_is_system ON roles(is_system);

-- ============================================================
-- PERMISSIONS
-- ============================================================

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    resource TEXT NOT NULL, -- e.g., 'orders', 'products', 'users'
    action TEXT NOT NULL,   -- e.g., 'read', 'write', 'delete', 'approve'
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resource, action)
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);

-- ============================================================
-- ROLE PERMISSIONS (Many-to-Many)
-- ============================================================

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    conditions JSONB DEFAULT '{}', -- Optional conditions for the permission
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ============================================================
-- STAFF ROLES (Assignment)
-- ============================================================

CREATE TABLE staff_roles (
    id UUID PRIMARY KEY DEFAULT UUID_GENERATE_V4(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(staff_id, role_id)
);

CREATE INDEX idx_staff_roles_staff ON staff_roles(staff_id);
CREATE INDEX idx_staff_roles_role ON staff_roles(role_id);
CREATE INDEX idx_staff_roles_active ON staff_roles(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_staff_roles_expires ON staff_roles(expires_at) WHERE expires_at IS NOT NULL;
