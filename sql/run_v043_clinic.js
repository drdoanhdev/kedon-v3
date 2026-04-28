/**
 * Script chạy V043 trên database phòng khám
 * 
 * Cách dùng:
 * 1. Mở Supabase Dashboard phòng khám → Settings → Database → Connection string (URI)
 * 2. Copy connection string
 * 3. Chạy: node sql/run_v043_clinic.js "postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres"
 * 
 * Hoặc dùng trực tiếp thông tin:
 *   node sql/run_v043_clinic.js "postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
 */

const { Client } = require('pg');

const connectionString = process.argv[2];

if (!connectionString) {
  console.error('❌ Thiếu connection string!');
  console.error('Cách dùng: node sql/run_v043_clinic.js "postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres"');
  process.exit(1);
}

async function run() {
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Kết nối database thành công!\n');

    // ========== PART 1-5: Tables, indexes, columns ==========
    console.log('📦 Phần 1: Tạo bảng branches...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        ten_chi_nhanh TEXT NOT NULL,
        dia_chi TEXT,
        dien_thoai TEXT,
        is_main BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_main_unique ON branches(tenant_id) WHERE is_main = TRUE;`);
    try {
      await client.query(`CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    } catch (e) { if (!e.message.includes('already exists')) throw e; }
    console.log('   ✅ Done\n');

    console.log('📦 Phần 2: Tạo bảng staff_assignments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT TRUE,
        from_date DATE NOT NULL DEFAULT CURRENT_DATE,
        to_date DATE,
        ghi_chu TEXT,
        created_by UUID REFERENCES auth.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_assignments_tenant ON staff_assignments(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_assignments_user ON staff_assignments(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_assignments_branch ON staff_assignments(branch_id);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignments_primary ON staff_assignments(tenant_id, user_id) WHERE is_primary = TRUE AND to_date IS NULL;`);
    try {
      await client.query(`CREATE TRIGGER trg_staff_assignments_updated_at BEFORE UPDATE ON staff_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    } catch (e) { if (!e.message.includes('already exists')) throw e; }
    console.log('   ✅ Done\n');

    console.log('📦 Phần 3: Tạo bảng branch_transfers...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS branch_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        from_branch_id UUID NOT NULL REFERENCES branches(id),
        to_branch_id UUID NOT NULL REFERENCES branches(id),
        loai TEXT NOT NULL CHECK (loai IN ('lens', 'gong', 'thuoc', 'vat_tu')),
        item_id TEXT NOT NULL,
        ten_san_pham TEXT,
        so_luong INT NOT NULL CHECK (so_luong > 0),
        don_gia BIGINT DEFAULT 0,
        ghi_chu TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
        nguoi_tao UUID NOT NULL REFERENCES auth.users(id),
        nguoi_duyet UUID REFERENCES auth.users(id),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_different_branches CHECK (from_branch_id <> to_branch_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_transfers_tenant ON branch_transfers(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON branch_transfers(tenant_id, status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_transfers_from ON branch_transfers(from_branch_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_branch_transfers_to ON branch_transfers(to_branch_id);`);
    try {
      await client.query(`CREATE TRIGGER trg_branch_transfers_updated_at BEFORE UPDATE ON branch_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    } catch (e) { if (!e.message.includes('already exists')) throw e; }
    console.log('   ✅ Done\n');

    console.log('📦 Phần 4: Tạo bảng patient_transfers...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        benhnhan_id INTEGER NOT NULL,
        from_branch_id UUID NOT NULL REFERENCES branches(id),
        to_branch_id UUID NOT NULL REFERENCES branches(id),
        ly_do TEXT,
        nguoi_chuyen UUID NOT NULL REFERENCES auth.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_patient_transfer_diff CHECK (from_branch_id <> to_branch_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_transfers_tenant ON patient_transfers(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_transfers_patient ON patient_transfers(benhnhan_id);`);
    console.log('   ✅ Done\n');

    console.log('📦 Phần 5: Thêm cột branch_id vào các bảng hiện có...');
    const tables = [
      { table: '"BenhNhan"', idx: 'idx_benhnhan_branch' },
      { table: '"DonThuoc"', idx: 'idx_donthuoc_branch' },
      { table: '"DonKinh"', idx: 'idx_donkinh_branch' },
      { table: 'lens_stock', idx: 'idx_lens_stock_branch' },
      { table: '"Thuoc"', idx: 'idx_thuoc_branch' },
      { table: '"GongKinh"', idx: 'idx_gongkinh_branch' },
      { table: '"ChoKham"', idx: 'idx_chokham_branch' },
    ];
    for (const { table, idx } of tables) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS ${idx} ON ${table}(branch_id);`);
    }
    console.log('   ✅ Done\n');

    // ========== PART 6: Function ==========
    console.log('📦 Phần 6: Tạo function create_default_branch_for_tenant...');
    await client.query(`
      CREATE OR REPLACE FUNCTION create_default_branch_for_tenant(p_tenant_id UUID)
      RETURNS UUID AS $body$
      DECLARE
        v_branch_id UUID;
        v_tenant_name TEXT;
      BEGIN
        SELECT id INTO v_branch_id FROM branches WHERE tenant_id = p_tenant_id AND is_main = TRUE;
        IF v_branch_id IS NOT NULL THEN
          RETURN v_branch_id;
        END IF;

        SELECT name INTO v_tenant_name FROM tenants WHERE id = p_tenant_id;

        INSERT INTO branches (tenant_id, ten_chi_nhanh, is_main, status)
        VALUES (p_tenant_id, COALESCE(v_tenant_name, 'Chi nhánh chính'), TRUE, 'active')
        RETURNING id INTO v_branch_id;

        UPDATE "BenhNhan" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
        UPDATE "DonThuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
        UPDATE "DonKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
        UPDATE lens_stock SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
        UPDATE "Thuoc" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;
        UPDATE "GongKinh" SET branch_id = v_branch_id WHERE tenant_id = p_tenant_id AND branch_id IS NULL;

        INSERT INTO staff_assignments (tenant_id, user_id, branch_id, is_primary)
        SELECT p_tenant_id, user_id, v_branch_id, TRUE
        FROM tenantmembership
        WHERE tenant_id = p_tenant_id AND active = TRUE
        ON CONFLICT DO NOTHING;

        RETURN v_branch_id;
      END;
      $body$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log('   ✅ Done\n');

    // ========== PART 7: RLS ==========
    console.log('📦 Phần 7: RLS Policies...');
    for (const t of ['branches', 'staff_assignments', 'branch_transfers', 'patient_transfers']) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    }

    const policies = [
      { name: 'branches_service_all', table: 'branches', cmd: 'ALL', using: 'true', check: 'true' },
      { name: 'staff_assignments_service_all', table: 'staff_assignments', cmd: 'ALL', using: 'true', check: 'true' },
      { name: 'branch_transfers_service_all', table: 'branch_transfers', cmd: 'ALL', using: 'true', check: 'true' },
      { name: 'patient_transfers_service_all', table: 'patient_transfers', cmd: 'ALL', using: 'true', check: 'true' },
      { name: 'branches_tenant_select', table: 'branches', cmd: 'SELECT', using: "tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))" },
      { name: 'staff_assignments_tenant_select', table: 'staff_assignments', cmd: 'SELECT', using: "tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))" },
      { name: 'branch_transfers_tenant_select', table: 'branch_transfers', cmd: 'SELECT', using: "tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))" },
      { name: 'patient_transfers_tenant_select', table: 'patient_transfers', cmd: 'SELECT', using: "tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))" },
    ];

    for (const p of policies) {
      try {
        let sql = `CREATE POLICY ${p.name} ON ${p.table} FOR ${p.cmd} USING (${p.using})`;
        if (p.check) sql += ` WITH CHECK (${p.check})`;
        await client.query(sql);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`   ⚠️ Policy ${p.name} đã tồn tại, bỏ qua`);
        } else throw e;
      }
    }
    console.log('   ✅ Done\n');

    console.log('🎉 V043 đã chạy hoàn tất trên database phòng khám!');

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
