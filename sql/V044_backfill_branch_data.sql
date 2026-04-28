-- V044: Backfill branch_id + add to more tables
-- KiotViet model: Per-branch = BenhNhan, DonThuoc, DonKinh, ChoKham, hen_kham_lai
-- Shared = Thuoc, GongKinh, HangTrong, NhaCungCap, DanhMuc (NO branch_id)

-- 1. Add branch_id to hen_kham_lai if not exists
DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hen_kham_lai' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE hen_kham_lai ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_hen_kham_lai_branch ON hen_kham_lai(branch_id);
  END IF;
END;
$body$;

-- 2. REMOVE branch_id from SHARED tables (Thuoc, GongKinh, lens_stock)
-- These are product catalogs shared across branches
-- tonkho stays on product row = system-wide total
-- NOTE: Only drop if column exists and no data depends on it
-- We'll keep the columns but NOT filter by them in APIs

-- 3. Backfill ALL existing per-branch data to default (main) branch
-- For each tenant, find the main branch and assign it to all records that don't have a branch
DO $body$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id AS branch_id, tenant_id 
    FROM branches 
    WHERE is_main = true
  LOOP
    -- BenhNhan
    UPDATE "BenhNhan" SET branch_id = r.branch_id 
    WHERE tenant_id = r.tenant_id AND branch_id IS NULL;
    
    -- DonThuoc
    UPDATE "DonThuoc" SET branch_id = r.branch_id 
    WHERE tenant_id = r.tenant_id AND branch_id IS NULL;
    
    -- DonKinh
    UPDATE "DonKinh" SET branch_id = r.branch_id 
    WHERE tenant_id = r.tenant_id AND branch_id IS NULL;
    
    -- ChoKham
    UPDATE "ChoKham" SET branch_id = r.branch_id 
    WHERE tenant_id = r.tenant_id AND branch_id IS NULL;
    
    -- hen_kham_lai
    UPDATE hen_kham_lai SET branch_id = r.branch_id 
    WHERE tenant_id = r.tenant_id AND branch_id IS NULL;
  END LOOP;
END;
$body$;

-- 4. Auto-assign owner to main branch (staff_assignments)
-- Ensure the tenant owner is assigned to the main branch
DO $body$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS branch_id, b.tenant_id, tm.user_id
    FROM branches b
    JOIN tenantmembership tm ON tm.tenant_id = b.tenant_id AND tm.role = 'owner' AND tm.active = true
    WHERE b.is_main = true
  LOOP
    -- Insert if not exists
    INSERT INTO staff_assignments (tenant_id, user_id, branch_id, is_primary, from_date)
    VALUES (r.tenant_id, r.user_id, r.branch_id, true, CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$body$;
