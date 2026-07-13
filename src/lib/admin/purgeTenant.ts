/**
 * Hard-purge a clinic (tenant): R2 objects → non-CASCADE DB rows → DELETE tenants → auth users.
 */
import { supabaseAdmin } from '../tenantApi';
import { getMediaStorageProviderForRow } from '../media/storage';
import { deletePendingFaceSnapshot } from '../faceSnapshotUpload';

export type PurgeTenantResult = {
  tenantId: string;
  tenantName: string;
  mediaDeleted: number;
  mediaFailed: number;
  tablesCleared: string[];
  authUsersDeleted: number;
  authUsersSkipped: string[];
  warnings: string[];
};

type MediaRow = {
  object_path: string | null;
  storage_driver?: string | null;
  bucket?: string | null;
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { message?: string; code?: string };
  const text = (maybe.message || '').toLowerCase();
  return (
    maybe.code === '42P01' ||
    maybe.code === 'PGRST205' ||
    text.includes('does not exist') ||
    text.includes('could not find the table') ||
    text.includes('schema cache')
  );
}

function normalizeConfirm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchAllByTenant<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  tenantId: string
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      if (isMissingRelationError(error)) return rows;
      throw new Error(`Lỗi đọc ${table}: ${error.message}`);
    }

    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function deleteByTenant(
  table: string,
  tenantId: string,
  warnings: string[]
): Promise<boolean> {
  const { error } = await supabaseAdmin.from(table).delete().eq('tenant_id', tenantId);
  if (!error) return true;
  if (isMissingRelationError(error)) return false;
  warnings.push(`${table}: ${error.message}`);
  return false;
}

async function deleteByIds(
  table: string,
  column: string,
  ids: Array<string | number>,
  warnings: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from(table).delete().in(column, chunk);
    if (error && !isMissingRelationError(error)) {
      warnings.push(`${table}.${column}: ${error.message}`);
    }
  }
}

async function deleteMediaObjects(
  tenantId: string,
  warnings: string[]
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  const mediaTables: Array<{ table: string; scopeHint?: string }> = [
    { table: 'don_kinh_media' },
    { table: 'don_thuoc_media' },
    { table: 'gong_kinh_media' },
  ];

  for (const { table } of mediaTables) {
    const rows = await fetchAllByTenant<MediaRow>(
      table,
      'object_path, storage_driver, bucket',
      tenantId
    );

    for (const row of rows) {
      if (!row.object_path) continue;
      try {
        const provider = getMediaStorageProviderForRow(row.storage_driver, row.bucket);
        await provider.deleteObject(row.object_path);
        deleted += 1;
      } catch (err: any) {
        failed += 1;
        warnings.push(`R2 ${table}/${row.object_path}: ${err?.message || String(err)}`);
      }
    }
  }

  const pending = await fetchAllByTenant<{ snapshot_url: string | null }>(
    'PendingFaces',
    'snapshot_url',
    tenantId
  );
  for (const row of pending) {
    try {
      await deletePendingFaceSnapshot(row.snapshot_url);
      if (row.snapshot_url) deleted += 1;
    } catch (err: any) {
      failed += 1;
      warnings.push(`face snapshot: ${err?.message || String(err)}`);
    }
  }

  return { deleted, failed };
}

async function clearClinicalData(tenantId: string, warnings: string[]): Promise<string[]> {
  const cleared: string[] = [];

  const donThuocIds = (
    await fetchAllByTenant<{ id: number }>('DonThuoc', 'id', tenantId)
  ).map((r) => r.id);
  const donKinhIds = (
    await fetchAllByTenant<{ id: number }>('DonKinh', 'id', tenantId)
  ).map((r) => r.id);
  const donThuocMauIds = (
    await fetchAllByTenant<{ id: number }>('DonThuocMau', 'id', tenantId)
  ).map((r) => r.id);
  const phieuNhapIds = (
    await fetchAllByTenant<{ id: number }>('PhieuNhapKho', 'id', tenantId)
  ).map((r) => r.id);
  const importReceiptIds = (
    await fetchAllByTenant<{ id: number }>('import_receipt', 'id', tenantId)
  ).map((r) => r.id);
  const patientIds = (
    await fetchAllByTenant<{ id: number }>('BenhNhan', 'id', tenantId)
  ).map((r) => r.id);

  // Children without tenant_id
  await deleteByIds('ChiTietDonThuoc', 'donthuocid', donThuocIds, warnings);
  await deleteByIds('ChiTietDonThuocMau', 'donthuocmauid', donThuocMauIds, warnings);
  await deleteByIds('ChiTietNhapKho', 'phieunhapkhoid', phieuNhapIds, warnings);
  await deleteByIds('import_receipt_detail', 'import_receipt_id', importReceiptIds, warnings);
  await deleteByIds('NoBenhNhan', 'benhnhanid', patientIds, warnings);
  await deleteByIds('NoBenhNhan', 'donkinhid', donKinhIds, warnings);
  await deleteByIds('NoBenhNhan', 'donthuocid', donThuocIds, warnings);

  // Ordered tenant-scoped deletes (non-CASCADE blockers + dependents)
  const tenantTablesInOrder = [
    // Media metadata (objects already removed from storage)
    'don_kinh_media',
    'don_thuoc_media',
    'gong_kinh_media',

    // Face / biometrics
    'face_audit_log',
    'face_biometric_consent',
    'face_embeddings',
    'PendingFaces',
    'face_devices',

    // Prescription / visit dependents
    'thuoc_xuat_don',
    'lens_export_sale',
    'lens_export_damaged',
    'frame_export',
    'supply_export',
    'lens_order',
    'lens_import',
    'frame_import',
    'supply_import',
    'import_receipt',
    'thuoc_nhap_kho',
    'thuoc_huy',
    'stock_movement',
    'nhom_gia_gong_nhap',

    'ChoKham',
    'DienTien',
    'hen_kham_lai',
    'patient_notes_simple',
    'patient_alerts',
    'patient_contact_tasks',
    'crm_care_status',
    'recent_activity_events',
    'patient_transfers',
    'family_members',
    'family_groups',
    'waiting_cleanup_logs',
    'waiting_cleanup_logs_archive',

    'DonKinh',
    'DonThuoc',

    'BenhNhan',

    // Catalog / inventory masters
    'lens_stock',
    'medical_supply',
    'GongKinh',
    'HangTrong',
    'Thuoc',
    'NhomThuoc',
    'DonThuocMau',
    'PhieuNhapKho',
    'NhaCungCap',
    'nhom_gia_gong',

    // Messaging / billing / config (also CASCADE; safe to clear early)
    'tin_nhan',
    'thong_bao',
    'tin_nhan_platform',
    'payment_orders',
    'cau_hinh_mau_in',
    'GhiChuHeThong',
    'tem_kinh_templates',
    'patient_code_counters',
  ];

  for (const table of tenantTablesInOrder) {
    const ok = await deleteByTenant(table, tenantId, warnings);
    if (ok) cleared.push(table);
  }

  // Clear profile default tenant pointer
  {
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ default_tenant_id: null })
      .eq('default_tenant_id', tenantId);
    if (error && !isMissingRelationError(error)) {
      warnings.push(`user_profiles.default_tenant_id: ${error.message}`);
    } else if (!error) {
      cleared.push('user_profiles.default_tenant_id');
    }
  }

  // RBAC: trigger tenant_roles_guard chặn xóa is_system=true (owner/admin/...).
  // Phải hạ cờ + xóa permissions/roles trước khi DELETE tenants (CASCADE).
  await clearTenantRolesForPurge(tenantId, warnings, cleared);

  return cleared;
}

/**
 * Gỡ role RBAC của tenant trước khi xóa tenants.
 * Trigger V054: không cho DELETE role is_system; không cho bỏ permission cốt lõi của is_protected.
 */
async function clearTenantRolesForPurge(
  tenantId: string,
  warnings: string[],
  cleared: string[]
): Promise<void> {
  const roles = await fetchAllByTenant<{ id: string }>(
    'tenant_roles',
    'id',
    tenantId
  );
  const roleIds = roles.map((r) => r.id);

  // Gỡ liên kết membership → role (tránh SET NULL lẻ tẻ khi xóa role)
  {
    const { error } = await supabaseAdmin
      .from('tenantmembership')
      .update({ role_id: null })
      .eq('tenant_id', tenantId);
    if (error && !isMissingRelationError(error)) {
      warnings.push(`tenantmembership.role_id: ${error.message}`);
    }
  }

  // Hạ cờ bảo vệ để bypass trg_guard_system_roles / trg_guard_protected_permissions
  {
    const { error } = await supabaseAdmin
      .from('tenant_roles')
      .update({ is_system: false, is_protected: false })
      .eq('tenant_id', tenantId);
    if (error && !isMissingRelationError(error)) {
      warnings.push(`tenant_roles unlock: ${error.message}`);
      throw new Error(
        `Không gỡ được khóa role hệ thống trước khi xóa: ${error.message}`
      );
    }
  }

  if (roleIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < roleIds.length; i += chunkSize) {
      const chunk = roleIds.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from('tenant_role_permissions')
        .delete()
        .in('role_id', chunk);
      if (error && !isMissingRelationError(error)) {
        warnings.push(`tenant_role_permissions: ${error.message}`);
        throw new Error(`Không xóa được quyền vai trò: ${error.message}`);
      }
    }
    if (!warnings.some((w) => w.startsWith('tenant_role_permissions:'))) {
      cleared.push('tenant_role_permissions');
    }
  }

  {
    const { error } = await supabaseAdmin
      .from('tenant_roles')
      .delete()
      .eq('tenant_id', tenantId);
    if (error && !isMissingRelationError(error)) {
      warnings.push(`tenant_roles: ${error.message}`);
      throw new Error(`Không xóa được vai trò phòng khám: ${error.message}`);
    }
    if (!error) cleared.push('tenant_roles');
  }
}

async function collectTenantUserIds(tenantId: string, ownerId: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (ownerId) ids.add(ownerId);

  const memberships = await fetchAllByTenant<{ user_id: string }>(
    'tenantmembership',
    'user_id',
    tenantId
  );
  for (const m of memberships) {
    if (m.user_id) ids.add(m.user_id);
  }

  return [...ids];
}

async function deleteAuthUsers(
  userIds: string[],
  actingAdminId: string,
  warnings: string[]
): Promise<{ deleted: number; skipped: string[] }> {
  const skipped: string[] = [];
  let deleted = 0;

  for (const userId of userIds) {
    if (userId === actingAdminId) {
      skipped.push(`${userId}: đang là superadmin thực hiện thao tác`);
      continue;
    }

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (roleRow?.role === 'superadmin') {
      skipped.push(`${userId}: superadmin — không xóa`);
      continue;
    }

    // Remove platform role row if any (non-superadmin)
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_profiles').delete().eq('id', userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      warnings.push(`auth.deleteUser(${userId}): ${error.message}`);
      skipped.push(`${userId}: ${error.message}`);
      continue;
    }
    deleted += 1;
  }

  return { deleted, skipped };
}

export async function purgeTenant(params: {
  tenantId: string;
  confirmName: string;
  actingAdminId: string;
}): Promise<PurgeTenantResult> {
  const { tenantId, confirmName, actingAdminId } = params;
  const warnings: string[] = [];

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, code, owner_id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantErr) {
    throw new Error(`Lỗi kiểm tra phòng khám: ${tenantErr.message}`);
  }
  if (!tenant) {
    throw new Error('Không tìm thấy phòng khám');
  }

  const confirmNorm = normalizeConfirm(confirmName);
  const nameOk = tenant.name && normalizeConfirm(tenant.name) === confirmNorm;
  const codeOk = tenant.code && normalizeConfirm(tenant.code) === confirmNorm;
  if (!nameOk && !codeOk) {
    throw new Error('Xác nhận không khớp tên hoặc mã phòng khám');
  }

  const userIds = await collectTenantUserIds(tenantId, tenant.owner_id || null);

  const media = await deleteMediaObjects(tenantId, warnings);
  const tablesCleared = await clearClinicalData(tenantId, warnings);

  // Final tenant delete — cascades remaining membership/branch/etc.
  const { error: deleteTenantErr } = await supabaseAdmin
    .from('tenants')
    .delete()
    .eq('id', tenantId);

  if (deleteTenantErr) {
    throw new Error(
      `Không xóa được bản ghi tenants (còn dữ liệu phụ thuộc?): ${deleteTenantErr.message}`
    );
  }
  tablesCleared.push('tenants');

  const auth = await deleteAuthUsers(userIds, actingAdminId, warnings);

  return {
    tenantId,
    tenantName: tenant.name,
    mediaDeleted: media.deleted,
    mediaFailed: media.failed,
    tablesCleared,
    authUsersDeleted: auth.deleted,
    authUsersSkipped: auth.skipped,
    warnings,
  };
}
