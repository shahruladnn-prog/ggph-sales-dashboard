-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE source_type AS ENUM ('LOYVERSE', 'EZEE', 'MANUAL');
CREATE TYPE status_type AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'REVERSAL');

-- 1. Metadata Tables (For scale and flexibility)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: We store API Auth Keys directly in the branches table for dynamic routing and infinite scalability
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    name VARCHAR(255) NOT NULL,
    loyverse_store_id VARCHAR(255), 
    loyverse_auth_key VARCHAR(255), -- Stores the API token for this specific branch
    ezee_hotel_code VARCHAR(255),   
    ezee_auth_key VARCHAR(255),     -- Stores the PMS API token for this specific branch
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE, -- Heartbeat tracker for the parallel sync engine lookbacks
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enhanced Revenue Table
CREATE TABLE unified_revenue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    branch_id UUID REFERENCES branches(id) NOT NULL,
    
    -- Source Tracking
    source source_type NOT NULL,
    source_transaction_id VARCHAR(255) UNIQUE, 
    
    -- Financials
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    base_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00, -- Currency-safe normalized conversion (e.g. Always MYR)
    currency VARCHAR(3) DEFAULT 'MYR',
    
    -- Categorization & Reconciliation
    category VARCHAR(100), -- 'F&B', 'Rooms', 'Manual Adjustments'
    payment_method VARCHAR(50), -- e.g. 'Cash', 'Credit Card' 
    
    -- Manual Entry Audit
    reason_code VARCHAR(255), 
    reference_note TEXT,
    
    -- System Fields
    raw_payload JSONB, 
    status status_type DEFAULT 'SYNCED',
    created_by UUID, 
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft deletes
);

-- Indexing for high-speed CSO Overview Dashboards
CREATE INDEX idx_rev_composite ON unified_revenue(company_id, transaction_date);
CREATE INDEX idx_rev_branch ON unified_revenue(branch_id);
CREATE INDEX idx_rev_source ON unified_revenue(source);
