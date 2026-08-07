-- ============================================================
-- ChinaSuuq Database Schema - Migration 01
-- Enums, Extensions, and Base Types
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- For GIN index support

-- ============================================================
-- ENUM TYPES
-- ============================================================

-- User roles enum
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'admin',
    'staff',
    'customer',
    'supplier'
);

-- User status enum
CREATE TYPE user_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'pending_verification',
    'banned'
);

-- Gender enum
CREATE TYPE gender_type AS ENUM (
    'male',
    'female',
    'other',
    'prefer_not_to_say'
);

-- Currency enum
CREATE TYPE currency_type AS ENUM (
    'CNY',
    'USD',
    'EUR',
    'GBP',
    'SOS',
    'KES',
    'ETB',
    'NGN'
);

-- Product status enum
CREATE TYPE product_status AS ENUM (
    'draft',
    'active',
    'inactive',
    'out_of_stock',
    'discontinued',
    'archived'
);

-- Marketplace enum
CREATE TYPE marketplace_type AS ENUM (
    '1688',
    'taobao',
    'yiwugo',
    'pinduoduo',
    'alibaba',
    'made_in_china'
);

-- Order status enum
CREATE TYPE order_status AS ENUM (
    'pending',
    'confirmed',
    'processing',
    'sourcing',
    'sourced',
    'quoted',
    'quote_approved',
    'paid',
    'purchasing',
    'purchased',
    'in_warehouse',
    'inspection_passed',
    'inspection_failed',
    'consolidated',
    'shipped',
    'in_transit',
    'customs_hold',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
    'disputed'
);

-- Payment status enum
CREATE TYPE payment_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded',
    'expired'
);

-- Payment method enum
CREATE TYPE payment_method AS ENUM (
    'mobile_money',
    'bank_transfer',
    'credit_card',
    'debit_card',
    'paypal',
    'alipay',
    'wechat_pay',
    'cash',
    'crypto'
);

-- Sourcing request status
CREATE TYPE sourcing_status AS ENUM (
    'pending',
    'reviewing',
    'searching',
    'found_options',
    'awaiting_approval',
    'approved',
    'rejected',
    'cancelled'
);

-- Shipping status enum
CREATE TYPE shipping_status AS ENUM (
    'pending',
    'packed',
    'consolidated',
    'shipped',
    'in_transit',
    'at_customs',
    'customs_cleared',
    'out_for_delivery',
    'delivered',
    'returned',
    'lost'
);

-- Inspection status enum
CREATE TYPE inspection_status AS ENUM (
    'pending',
    'in_progress',
    'passed',
    'failed',
    'conditional_pass',
    'not_required'
);

-- Refund status enum
CREATE TYPE refund_status AS ENUM (
    'pending',
    'processing',
    'approved',
    'completed',
    'rejected',
    'cancelled'
);

-- Ticket priority enum
CREATE TYPE ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent',
    'critical'
);

-- Ticket status enum
CREATE TYPE ticket_status AS ENUM (
    'open',
    'in_progress',
    'waiting_customer',
    'waiting_internal',
    'resolved',
    'closed',
    'escalated'
);

-- Notification type enum
CREATE TYPE notification_type AS ENUM (
    'order_update',
    'payment_update',
    'shipping_update',
    'quote_ready',
    'system_announcement',
    'promotion',
    'reminder',
    'alert',
    'support_reply'
);

-- Document type enum
CREATE TYPE document_type AS ENUM (
    'invoice',
    'packing_list',
    'commercial_invoice',
    'certificate_of_origin',
    'customs_declaration',
    'inspection_report',
    'bill_of_lading',
    'insurance_certificate',
    'other'
);

-- Task status enum
CREATE TYPE task_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed',
    'cancelled',
    'deferred'
);

-- Task type enum
CREATE TYPE task_type AS ENUM (
    'sourcing',
    'order_processing',
    'payment_verification',
    'inspection',
    'shipping',
    'customer_support',
    'inventory_management',
    'translation',
    'quality_check',
    'other'
);

-- Connector status enum
CREATE TYPE connector_status AS ENUM (
    'active',
    'inactive',
    'error',
    'pending_setup',
    'rate_limited',
    'deprecated'
);

-- Quote status enum
CREATE TYPE quote_status AS ENUM (
    'draft',
    'sent',
    'viewed',
    'accepted',
    'rejected',
    'expired',
    'cancelled'
);

-- Cart status enum
CREATE TYPE cart_status AS ENUM (
    'active',
    'abandoned',
    'converted',
    'expired'
);

-- Supplier payment status enum
CREATE TYPE supplier_payment_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
);

-- Consolidation status enum
CREATE TYPE consolidation_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);

-- Audit action enum
CREATE TYPE audit_action AS ENUM (
    'create',
    'update',
    'delete',
    'view',
    'export',
    'import',
    'login',
    'logout',
    'failed_login',
    'password_change',
    'permission_change',
    'system_config_change'
);

-- Integration event status enum
CREATE TYPE integration_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'retrying',
    'cancelled'
);

-- WhatsApp checkout status enum
CREATE TYPE whatsapp_checkout_status AS ENUM (
    'initiated',
    'items_confirmed',
    'address_confirmed',
    'payment_pending',
    'payment_completed',
    'order_placed',
    'cancelled'
);

-- Language enum for translations
CREATE TYPE language_code AS ENUM (
    'en',    -- English
    'zh',    -- Chinese (Simplified)
    'so',    -- Somali
    'ar',    -- Arabic
    'fr',    -- French
    'sw',    -- Swahili
    'am',    -- Amharic
    'ha',    -- Hausa
    'yo',    -- Yoruba
    'ig',    -- Igbo
    'ti',    -- Tigrinya
    'ff',    -- Fula
    'yo-NG', -- Yoruba (Nigeria)
    'sw-KE', -- Swahili (Kenya)
    'ar-SO'  -- Arabic (Somalia)
);

-- ============================================================
-- TRIGGER FUNCTION: Update updated_at timestamp
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER FUNCTION: Generate random slug
-- ============================================================

CREATE OR REPLACE FUNCTION generate_random_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug = LOWER(REPLACE(NEW.name, ' ', '-')) || '-' || SUBSTRING(UUID_GENERATE_V4()::TEXT FROM 1 FOR 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER FUNCTION: Set created_at on insert
-- ============================================================

CREATE OR REPLACE FUNCTION set_created_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at = NOW();
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
