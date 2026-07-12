//src/pages/api/benh-nhan/index.ts giới, năm sinh
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, resolveBranchAccess, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';
import { deleteFaceBiometrics } from '../../../lib/faceRecognition';

// Định nghĩa interface cho dữ liệu bệnh nhân
interface BenhNhan {
  id: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string; // dd/mm/yyyy hoặc yyyy - keep as string for compatibility
  dienthoai: string;
  diachi: string;
  ghichu?: string | null;
  tuoi?: number; // chỉ trả về khi xem danh sách
  created_at?: string; // ngày lập hồ sơ
  ngay_kham_gan_nhat?: string; // ngày khám gần nhất
}

// Định nghĩa interface cho lỗi Supabase
interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

function isMissingGhichuColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
  const text = `${maybe.message || ''} ${maybe.details || ''} ${maybe.hint || ''}`.toLowerCase();
  return text.includes('ghichu') && (text.includes('column') || maybe.code === '42703');
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { message?: string; code?: string };
  const text = (maybe.message || '').toLowerCase();
  return maybe.code === '42P01'
    || maybe.code === 'PGRST205'
    || text.includes('does not exist')
    || text.includes('could not find the table')
    || text.includes('schema cache');
}

async function deleteOptionalByPatient(
  table: string,
  column: string,
  patientId: number,
  tenantId?: string,
): Promise<SupabaseError | null> {
  let query = supabase.from(table).delete().eq(column, patientId);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { error } = await query;
  if (error && isMissingRelationError(error)) return null;
  return error as SupabaseError | null;
}

async function reverseDonKinhInventoryForDelete(tenantId: string, donKinhId: number): Promise<void> {
  try {
    const { data: lensExports } = await supabase
      .from('lens_export_sale')
      .select('lens_stock_id, so_luong')
      .eq('tenant_id', tenantId)
      .eq('don_kinh_id', donKinhId);

    for (const exp of lensExports || []) {
      await supabase.rpc('adjust_lens_stock', {
        p_lens_stock_id: exp.lens_stock_id,
        p_delta: exp.so_luong,
        p_ref_type: 'don_kinh_reversal',
        p_ref_id: donKinhId,
      });
    }
    await supabase.from('lens_export_sale').delete().eq('tenant_id', tenantId).eq('don_kinh_id', donKinhId);

    const { data: frameExports } = await supabase
      .from('frame_export')
      .select('gong_kinh_id, so_luong')
      .eq('tenant_id', tenantId)
      .eq('don_kinh_id', donKinhId);

    for (const exp of frameExports || []) {
      await supabase.rpc('adjust_frame_stock', {
        p_gong_kinh_id: exp.gong_kinh_id,
        p_delta: exp.so_luong,
        p_ref_type: 'don_kinh_reversal',
        p_ref_id: donKinhId,
      });
    }
    await supabase.from('frame_export').delete().eq('tenant_id', tenantId).eq('don_kinh_id', donKinhId);

    await supabase
      .from('lens_order')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('don_kinh_id', donKinhId)
      .in('trang_thai', ['cho_dat']);
  } catch (err) {
    console.warn(`Could not reverse inventory for DonKinh #${donKinhId}:`, err);
  }
}

async function deletePatientCascade(patientId: number, tenantId: string): Promise<SupabaseError | null> {
  // Dọn dữ liệu sinh trắc (embedding + snapshot storage + audit) trước khi xóa hồ sơ.
  // FK ON DELETE CASCADE xử lý embedding, nhưng ảnh snapshot trên storage cần xóa thủ công.
  try {
    await deleteFaceBiometrics(tenantId, patientId, { reason: 'patient_deleted' });
  } catch (err) {
    console.warn(`[delete-patient] dọn dữ liệu sinh trắc thất bại cho BN #${patientId}:`, err);
  }

  // NoBenhNhan chỉ có ở một số DB (vd. Sáng Mắt) — xóa trước để không chặn FK
  {
    const { error } = await supabase.from('NoBenhNhan').delete().eq('benhnhanid', patientId);
    if (error && !isMissingRelationError(error)) return error as SupabaseError;
  }

  const { data: donKinhs, error: donKinhListError } = await supabase
    .from('DonKinh')
    .select('id')
    .eq('benhnhanid', patientId)
    .eq('tenant_id', tenantId);

  if (donKinhListError) return donKinhListError as SupabaseError;

  for (const dk of donKinhs || []) {
    {
      const { error } = await supabase.from('NoBenhNhan').delete().eq('donkinhid', dk.id);
      if (error && !isMissingRelationError(error)) return error as SupabaseError;
    }

    await reverseDonKinhInventoryForDelete(tenantId, dk.id);

    const { error: deleteDonKinhError } = await supabase
      .from('DonKinh')
      .delete()
      .eq('id', dk.id)
      .eq('tenant_id', tenantId);

    if (deleteDonKinhError) return deleteDonKinhError as SupabaseError;
  }

  const { data: donThuocs, error: donThuocListError } = await supabase
    .from('DonThuoc')
    .select('id')
    .eq('benhnhanid', patientId)
    .eq('tenant_id', tenantId);

  if (donThuocListError) return donThuocListError as SupabaseError;

  if (donThuocs && donThuocs.length > 0) {
    const donThuocIds = donThuocs.map((dt) => dt.id);

    {
      const { error } = await supabase.from('NoBenhNhan').delete().in('donthuocid', donThuocIds);
      if (error && !isMissingRelationError(error)) return error as SupabaseError;
    }

    {
      const { error } = await supabase.from('don_thuoc_media').delete().eq('tenant_id', tenantId).in('don_thuoc_id', donThuocIds);
      if (error && !isMissingRelationError(error)) return error as SupabaseError;
    }

    const { error: deleteChiTietError } = await supabase
      .from('ChiTietDonThuoc')
      .delete()
      .in('donthuocid', donThuocIds);

    if (deleteChiTietError) return deleteChiTietError as SupabaseError;

    const { error: deleteDonThuocError } = await supabase
      .from('DonThuoc')
      .delete()
      .eq('benhnhanid', patientId)
      .eq('tenant_id', tenantId);

    if (deleteDonThuocError) return deleteDonThuocError as SupabaseError;
  }

  const optionalTables: Array<[string, string, boolean]> = [
    ['ChoKham', 'benhnhanid', true],
    ['DienTien', 'benhnhanid', true],
    ['hen_kham_lai', 'benhnhanid', true],
    ['family_members', 'benhnhan_id', true],
    ['patient_notes_simple', 'benhnhan_id', true],
    ['patient_alerts', 'benhnhan_id', true],
    ['patient_contact_tasks', 'benhnhan_id', true],
    ['crm_care_status', 'benhnhan_id', true],
    ['recent_activity_events', 'patient_id', true],
    ['patient_transfers', 'benhnhan_id', true],
    ['don_thuoc_media', 'benhnhan_id', true],
    ['don_kinh_media', 'benhnhan_id', true],
  ];

  for (const [table, column, withTenant] of optionalTables) {
    const err = await deleteOptionalByPatient(table, column, patientId, withTenant ? tenantId : undefined);
    if (err) return err;
  }

  const { error: deleteBenhNhanError } = await supabase
    .from('BenhNhan')
    .delete()
    .eq('id', patientId)
    .eq('tenant_id', tenantId);

  return deleteBenhNhanError as SupabaseError | null;
}

function escapePostgrestLikeValue(value: string): string {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSearchOrFilter(rawSearch: string): string {
  const normalized = rawSearch.trim().replace(/\s+/g, ' ');
  const escapedSearch = escapePostgrestLikeValue(normalized);
  if (!escapedSearch) return '';

  const compactNoSpace = normalized.replace(/\s+/g, '');
  const bnCodeMatch = compactNoSpace.match(/^BN0*(\d+)$/i);
  if (bnCodeMatch) {
    const digits = bnCodeMatch[1];
    const padded = digits.padStart(5, '0');
    const candidates = Array.from(new Set([
      compactNoSpace.toUpperCase(),
      `BN${padded}`,
      `BN${digits}`,
    ]));
    return candidates
      .map((code) => `mabenhnhan.ilike.%${escapePostgrestLikeValue(code)}%`)
      .join(',');
  }

  const numericCandidate = normalized.replace(/[\s.-]/g, '');
  const isNumeric = /^\d+$/.test(numericCandidate);
  if (isNumeric) {
    const digits = numericCandidate.replace(/\D/g, '');
    const padded = digits.padStart(5, '0');
    return [
      `dienthoai.ilike.%${digits}%`,
      `ten.ilike.%${escapedSearch}%`,
      `id.eq.${digits}`,
      `namsinh.ilike.%${digits}%`,
      `mabenhnhan.ilike.%${digits}%`,
      `mabenhnhan.ilike.%BN${padded}%`,
      `mabenhnhan.ilike.%BN${digits}%`,
    ].join(',');
  }

  const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
  const yearToken = yearMatch?.[1] || '';
  const namePart = escapePostgrestLikeValue(
    normalized
      .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
      .replace(/\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const clauses = new Set<string>();
  clauses.add(`ten.ilike.%${escapedSearch}%`);
  clauses.add(`dienthoai.ilike.%${escapedSearch}%`);
  clauses.add(`namsinh.ilike.%${escapedSearch}%`);
  clauses.add(`mabenhnhan.ilike.%${escapedSearch}%`);

  if (yearToken) {
    clauses.add(`namsinh.ilike.%${yearToken}%`);
  }

  if (namePart && yearToken) {
    clauses.add(`and(ten.ilike.%${namePart}%,namsinh.ilike.%${yearToken}%)`);

    const nameTokens = namePart.split(' ').filter(Boolean);
    if (nameTokens.length > 1) {
      const tokenParts = nameTokens.map((token) => `ten.ilike.%${escapePostgrestLikeValue(token)}%`);
      clauses.add(`and(${[...tokenParts, `namsinh.ilike.%${yearToken}%`].join(',')})`);
    }
  }

  if (namePart && namePart !== escapedSearch) {
    clauses.add(`ten.ilike.%${namePart}%`);
  }

  return Array.from(clauses).join(',');
}

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : '';
  }
  return typeof value === 'string' ? value : '';
}

function parsePositiveIntQuery(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = firstQueryValue(value).trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoolQuery(value: string | string[] | undefined, fallback: boolean): boolean {
  const raw = firstQueryValue(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return fallback;
}

/** Fallback khi DB chưa có RPC: mỗi BN chỉ lấy 1 dòng mới nhất (dùng index). */
async function fetchLatestVisitDatesFallback(
  tenantId: string,
  patientIds: number[],
): Promise<Record<number, string | null>> {
  const map: Record<number, string | null> = {};
  const CHUNK = 25;

  for (let i = 0; i < patientIds.length; i += CHUNK) {
    const chunk = patientIds.slice(i, i + CHUNK);
    await Promise.all(chunk.map(async (pid) => {
      const [thuocRes, kinhRes] = await Promise.all([
        supabase
          .from('DonThuoc')
          .select('ngay_kham')
          .eq('benhnhanid', pid)
          .eq('tenant_id', tenantId)
          .not('ngay_kham', 'is', null)
          .order('ngay_kham', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('DonKinh')
          .select('ngaykham')
          .eq('benhnhanid', pid)
          .eq('tenant_id', tenantId)
          .not('ngaykham', 'is', null)
          .order('ngaykham', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const thuocDate = thuocRes.data?.ngay_kham ?? null;
      const kinhDate = kinhRes.data?.ngaykham ?? null;
      if (thuocDate && kinhDate) {
        map[pid] = thuocDate > kinhDate ? thuocDate : kinhDate;
      } else {
        map[pid] = thuocDate || kinhDate || null;
      }
    }));
  }

  return map;
}

/** Lấy ngày khám gần nhất — ưu tiên RPC aggregate, fallback indexed limit(1). */
async function fetchLatestVisitDates(
  tenantId: string,
  patientIds: number[],
): Promise<Record<number, string | null>> {
  if (patientIds.length === 0) return {};

  const { data, error } = await supabase.rpc('benhnhan_latest_visits', {
    p_tenant_id: tenantId,
    p_patient_ids: patientIds,
  });

  if (!error && Array.isArray(data)) {
    const map: Record<number, string | null> = {};
    for (const row of data as { benhnhanid: number; ngay_kham_gan_nhat: string | null }[]) {
      map[row.benhnhanid] = row.ngay_kham_gan_nhat ?? null;
    }
    return map;
  }

  return fetchLatestVisitDatesFallback(tenantId, patientIds);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { data: BenhNhan }
    | { data: BenhNhan[]; total: number }
    | { message: string; error?: string }
  >
) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return; // response đã được gửi bởi requireTenant
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  // Handle GET requests
  if (req.method === "GET") {
    try {
      const benhnhanid = firstQueryValue(req.query.benhnhanid).trim();
      const page = parsePositiveIntQuery(req.query.page, 1, 1, 100000);
      const pageSize = parsePositiveIntQuery(req.query.pageSize, 100, 1, 500);
      const search = firstQueryValue(req.query.search).trim();
      const searchOrFilter = buildSearchOrFilter(search);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      if (benhnhanid) {
        // Fetch a specific patient
        let detailQuery = supabase
          .from("BenhNhan")
          .select("id, mabenhnhan, ten, namsinh, dienthoai, diachi, ghichu")
          .eq("id", benhnhanid)
          .eq("tenant_id", tenantId);

        if (branchId) {
          detailQuery = detailQuery.eq("branch_id", branchId);
        }

        let { data, error } = await detailQuery.single();

        // Backward compatibility: some DBs may not have ghichu column yet.
        if (error && isMissingGhichuColumn(error)) {
          let fallbackQuery = supabase
            .from("BenhNhan")
            .select("id, mabenhnhan, ten, namsinh, dienthoai, diachi")
            .eq("id", benhnhanid)
            .eq("tenant_id", tenantId);

          if (branchId) {
            fallbackQuery = fallbackQuery.eq("branch_id", branchId);
          }

          const fallback = await fallbackQuery.single();
          data = fallback.data as any;
          error = fallback.error as any;
        }

        if (error) {
          return res.status(400).json({ message: "Error fetching patient", error: error.message });
        }
        if (!data) {
          return res.status(404).json({ message: "Patient not found" });
        }
        // Không trả về tuổi khi xem chi tiết
        return res.status(200).json({ data });
      } else {
        // Fetch patient list with pagination and search
        let query = supabase
          .from("BenhNhan")
          .select("id, mabenhnhan, ten, namsinh, dienthoai, diachi, ghichu, created_at, branch:branches(id, ten_chi_nhanh)", { count: "exact" })
          .eq("tenant_id", tenantId)
          .order("id", { ascending: false });

        // Branch filter (enterprise multi-branch)
        if (branchId) {
          query = query.eq("branch_id", branchId);
        }

        if (searchOrFilter) {
          query = query.or(searchOrFilter);
        }

        let { data, error, count } = await query.range(from, to);

        // Backward compatibility: some DBs may not have ghichu column yet.
        if (error && isMissingGhichuColumn(error)) {
          let fallbackQuery = supabase
            .from("BenhNhan")
            .select("id, mabenhnhan, ten, namsinh, dienthoai, diachi, created_at, branch:branches(id, ten_chi_nhanh)", { count: "exact" })
            .eq("tenant_id", tenantId)
            .order("id", { ascending: false });

          if (branchId) {
            fallbackQuery = fallbackQuery.eq("branch_id", branchId);
          }

          if (searchOrFilter) {
            fallbackQuery = fallbackQuery.or(searchOrFilter);
          }

          const fallback = await fallbackQuery.range(from, to);
          data = fallback.data as any;
          error = fallback.error as any;
          count = fallback.count as any;
        }

        if (error) {
          return res.status(400).json({ message: "Error fetching patient list", error: error.message });
        }

        // Lấy ngày khám gần nhất (tối ưu: RPC hoặc limit 1/BN — không kéo toàn bộ lịch sử đơn)
        const patientIds = (data ?? []).map((bn) => bn.id);
        const includeLastVisit = parseBoolQuery(req.query.includeLastVisit, true);
        let ngayKhamMap: Record<number, string | null> = {};

        if (includeLastVisit && patientIds.length > 0) {
          ngayKhamMap = await fetchLatestVisitDates(tenantId, patientIds);
        }

        // Thêm trường tuổi và ngày khám gần nhất khi trả về danh sách
        const dataWithAge = (data ?? []).map((bn) => ({
          ...bn,
          tuoi: calcAge(bn.namsinh),
          ngay_kham_gan_nhat: ngayKhamMap[bn.id] || null,
        }));

        return res.status(200).json({ data: dataWithAge, total: count ?? 0 });
      }
    } catch (error: unknown) {
      console.error('benh-nhan GET unexpected error:', error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle POST requests
  if (req.method === "POST") {
    if (!(await requirePermission(ctx, res, 'manage_patients'))) return;
    try {
      const { ten, namsinh, dienthoai, diachi, ghichu } = req.body as BenhNhan;

      if (!ten || !namsinh || !diachi) {
        return res.status(400).json({ message: "Name, birth date/year, and address are required" });
      }

      if (!isValidDateOrYear(namsinh)) {
        return res.status(400).json({ message: "Birth date must be in dd/mm/yyyy or yyyy format" });
      }

      // Xử lý namsinh: giữ nguyên string format vì DB thực tế lưu string
      const namsinhStr = namsinh.trim();

      const insertBase = {
        ten,
        namsinh: namsinhStr,
        dienthoai,
        diachi,
        tenant_id: tenantId,
        ...(branchId ? { branch_id: branchId } : {}),
      };

      const insertPatientRow = async (row: Record<string, unknown>) => {
        let result = await supabase.from("BenhNhan").insert([row]).select().single();
        if (result.error && isMissingGhichuColumn(result.error)) {
          const { ghichu: _omit, ...withoutGhichu } = row;
          result = await supabase.from("BenhNhan").insert([withoutGhichu]).select().single();
        }
        return result;
      };

      // Fast path: để DB tự sinh id (IDENTITY). Nếu sequence lệch (do legacy gán id thủ công) → fallback MAX(id)+1.
      let { data, error } = await insertPatientRow({ ...insertBase, ghichu: ghichu || null });

      if (error?.message?.includes('duplicate key value violates unique constraint')) {
        let attempts = 0;
        const maxAttempts = 10;
        let lastError: SupabaseError | null = error as SupabaseError;

        while (attempts < maxAttempts) {
          const { data: maxData } = await supabase
            .from("BenhNhan")
            .select("id")
            .order("id", { ascending: false })
            .limit(1);

          const maxId = maxData?.[0]?.id ?? 0;
          const nextId = maxId + 1 + attempts;

          const retry = await insertPatientRow({
            id: nextId,
            ...insertBase,
            ghichu: ghichu || null,
          });

          if (!retry.error) {
            data = retry.data;
            error = null;
            break;
          }

          lastError = retry.error as SupabaseError;
          if (retry.error.message.includes('duplicate key value violates unique constraint')) {
            attempts++;
            continue;
          }

          error = retry.error;
          break;
        }

        if (error && attempts >= maxAttempts) {
          return res.status(400).json({
            message: `Error adding patient after ${attempts} attempts`,
            error: lastError?.message || error.message,
          });
        }
      }

      if (error) {
        return res.status(400).json({ message: "Error adding patient", error: error.message });
      }

      return res.status(200).json({ message: "Patient added successfully", data });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle PUT requests
  if (req.method === "PUT") {
    if (!(await requirePermission(ctx, res, 'manage_patients'))) return;
    try {
      const { id, ten, namsinh, dienthoai, diachi, ghichu } = req.body as BenhNhan;

      if (!id || !ten || !namsinh || !diachi) {
        return res.status(400).json({ message: "ID, name, birth date/year, and address are required" });
      }

      if (!isValidDateOrYear(namsinh)) {
        return res.status(400).json({ message: "Birth date must be in dd/mm/yyyy or yyyy format" });
      }

      // Xử lý namsinh: giữ nguyên string format vì DB thực tế lưu string  
      const namsinhStr = namsinh.trim();

      // Không cho client ghi đè mabenhnhan — mã do trigger/allocator quản lý
      let { data, error } = await supabase
        .from("BenhNhan")
        .update({ 
          ten, 
          namsinh: namsinhStr, // Lưu string thay vì int
          dienthoai, 
          diachi,
          ghichu: ghichu || null,
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error && isMissingGhichuColumn(error)) {
        const fallback = await supabase
          .from("BenhNhan")
          .update({ 
            ten,
            namsinh: namsinhStr,
            dienthoai,
            diachi,
          })
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .select()
          .single();
        data = fallback.data as any;
        error = fallback.error as any;
      }

      if (error) {
        return res.status(400).json({ message: "Error updating patient", error: error.message });
      }

      return res.status(200).json({ message: "Patient updated successfully", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle DELETE requests
  if (req.method === "DELETE") {
    if (!(await requirePermission(ctx, res, 'manage_patients'))) return;
    try {
      const id = req.query.id as string;

      if (!id) {
        return res.status(400).json({ message: "Patient ID is required" });
      }

      // Đảm bảo ID là số hợp lệ
      const patientId = parseInt(id, 10);
      if (isNaN(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID format" });
      }

      const deleteError = await deletePatientCascade(patientId, tenantId);

      if (deleteError) {
        return res.status(400).json({
          message: "Error deleting patient",
          error: deleteError.message,
        });
      }

      return res.status(200).json({ 
        message: "Patient and related records deleted successfully" 
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  return res.status(405).json({ message: `Method ${req.method} not allowed` });
}

// Hàm kiểm tra định dạng dd/mm/yyyy hoặc yyyy
function isValidDateOrYear(value: string): boolean {
  if (/^\d{4}$/.test(value)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }
  return false;
}

// Hàm tính tuổi từ namsinh (năm hoặc dd/mm/yyyy)
function calcAge(namsinh: string | number): number {
  if (!namsinh) return 0;
  const now = new Date();
  
  // If namsinh is already a number (year), use it directly
  if (typeof namsinh === 'number') {
    return now.getFullYear() - namsinh;
  }
  
  // If namsinh is string, parse it
  const namsinhStr = String(namsinh);
  if (/^\d{4}$/.test(namsinhStr)) {
    return now.getFullYear() - parseInt(namsinhStr, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
    const [d, m, y] = namsinhStr.split("/").map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return 0;
}

