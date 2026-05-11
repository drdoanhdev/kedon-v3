import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';

type NoteType = 'important' | 'normal';

function parseId(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseNoteType(raw: unknown, fallback: NoteType = 'normal'): NoteType {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'important') return 'important';
  if (v === 'normal') return 'normal';
  return fallback;
}

function toApiNote(row: any) {
  return {
    id: row.id,
    benhnhan_id: row.benhnhan_id,
    branch_id: row.branch_id,
    content: String(row.content || ''),
    note_type: row.note_type === 'important_alert' ? 'important' : 'normal',
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function attachPatientInfo(row: any, patientMap: Map<number, any>) {
  const base = toApiNote(row);
  const patient = patientMap.get(Number(row.benhnhan_id));
  return {
    ...base,
    patient: patient
      ? {
          id: patient.id,
          ten: patient.ten || null,
          dienthoai: patient.dienthoai || null,
          diachi: patient.diachi || null,
          namsinh: patient.namsinh || null,
        }
      : null,
  };
}

function toDbNoteType(noteType: NoteType): 'important_alert' | 'normal_note' {
  return noteType === 'important' ? 'important_alert' : 'normal_note';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;

  const { tenantId, userId } = ctx;
  const { branchId } = branchAccess;

  const ensurePatientAccessible = async (benhnhanId: number) => {
    let q = supabase
      .from('BenhNhan')
      .select('id, branch_id')
      .eq('id', benhnhanId)
      .eq('tenant_id', tenantId);

    if (branchId) q = q.eq('branch_id', branchId);

    const { data } = await q.maybeSingle();
    return data;
  };

  const findNote = async (id: number, options?: { includeDeleted?: boolean }) => {
    let q = supabase
      .from('patient_notes_simple')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (branchId) q = q.eq('branch_id', branchId);
    if (!options?.includeDeleted) q = q.is('deleted_at', null);

    return q.maybeSingle();
  };

  try {
    if (req.method === 'GET') {
      const benhnhanId = parseId(req.query.benhnhanid);
      const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
      const importantOnly = req.query.importantOnly === '1' || req.query.importantOnly === 'true';

      let query = supabase
        .from('patient_notes_simple')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (branchId) query = query.eq('branch_id', branchId);
      if (benhnhanId) query = query.eq('benhnhan_id', benhnhanId);
      if (!includeDeleted) query = query.is('deleted_at', null);
      if (importantOnly) query = query.eq('note_type', 'important_alert');

      const { data, error } = await query;
      if (error) {
        return res.status(400).json({ message: 'Lỗi tải ghi chú', details: error.message });
      }

      const rows = data || [];
      const patientIds = Array.from(new Set(rows.map((r: any) => Number(r.benhnhan_id)).filter((id: number) => Number.isFinite(id) && id > 0)));

      let patientMap = new Map<number, any>();
      if (patientIds.length > 0) {
        let pQuery = supabase
          .from('BenhNhan')
          .select('id, ten, dienthoai, diachi, namsinh')
          .eq('tenant_id', tenantId)
          .in('id', patientIds);

        if (branchId) pQuery = pQuery.eq('branch_id', branchId);

        const { data: patients } = await pQuery;
        patientMap = new Map((patients || []).map((p: any) => [Number(p.id), p]));
      }

      return res.status(200).json({ data: rows.map((row: any) => attachPatientInfo(row, patientMap)) });
    }

    if (req.method === 'POST') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const benhnhanId = parseId(req.body?.benhnhanid);
      const content = String(req.body?.content || '').trim();
      const noteType = parseNoteType(req.body?.note_type, 'normal');

      if (!benhnhanId || !content) {
        return res.status(400).json({ message: 'Thiếu benhnhanid hoặc nội dung ghi chú' });
      }

      const patient = await ensurePatientAccessible(benhnhanId);
      if (!patient) {
        return res.status(404).json({ message: 'Không tìm thấy bệnh nhân hoặc không có quyền truy cập' });
      }

      const { data, error } = await supabase
        .from('patient_notes_simple')
        .insert({
          tenant_id: tenantId,
          branch_id: patient.branch_id || null,
          benhnhan_id: benhnhanId,
          title: null,
          content,
          note_type: toDbNoteType(noteType),
          created_by: userId,
          updated_by: userId,
          deleted_at: null,
          deleted_by: null,
        })
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi tạo ghi chú', details: error.message });
      }

      return res.status(200).json({ data: toApiNote(data) });
    }

    if (req.method === 'PUT') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const id = parseId(req.body?.id);
      if (!id) return res.status(400).json({ message: 'Thiếu id ghi chú' });

      const existingRes = await findNote(id);
      const existing = existingRes.data;
      if (!existing) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú để cập nhật' });
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: userId,
      };

      if (req.body?.content !== undefined) {
        const content = String(req.body.content || '').trim();
        if (!content) return res.status(400).json({ message: 'Nội dung ghi chú không được để trống' });
        updateData.content = content;
      }
      if (req.body?.note_type !== undefined) {
        updateData.note_type = toDbNoteType(parseNoteType(req.body.note_type, existing.note_type === 'important_alert' ? 'important' : 'normal'));
      }

      const hasChange = updateData.content !== undefined || updateData.note_type !== undefined;
      if (!hasChange) {
        return res.status(400).json({ message: 'Không có thay đổi để lưu' });
      }

      const { data, error } = await supabase
        .from('patient_notes_simple')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi cập nhật ghi chú', details: error.message });
      }

      return res.status(200).json({ data: toApiNote(data) });
    }

    if (req.method === 'PATCH') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const id = parseId(req.body?.id);
      if (!id) return res.status(400).json({ message: 'Thiếu id ghi chú' });

      const existingRes = await findNote(id, { includeDeleted: true });
      const existing = existingRes.data;
      if (!existing) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú để khôi phục' });
      }
      if (!existing.deleted_at) {
        return res.status(400).json({ message: 'Ghi chú đang hoạt động, không cần khôi phục' });
      }

      const { data, error } = await supabase
        .from('patient_notes_simple')
        .update({
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi khôi phục ghi chú', details: error.message });
      }

      return res.status(200).json({ data: toApiNote(data) });
    }

    if (req.method === 'DELETE') {
      if (!(await requirePermission(ctx, res, 'manage_patients'))) return;

      const id = parseId(req.query.id ?? req.body?.id);
      if (!id) return res.status(400).json({ message: 'Thiếu id ghi chú cần xóa' });
      const hardDelete = req.query.hard === '1' || req.query.hard === 'true' || req.body?.hard === true;

      const existingRes = await findNote(id, { includeDeleted: hardDelete });
      const existing = existingRes.data;
      if (!existing) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú cần xóa' });
      }

      if (hardDelete) {
        if (!existing.deleted_at) {
          return res.status(400).json({ message: 'Chỉ được xóa vĩnh viễn ghi chú đã nằm trong thùng rác' });
        }

        const { error } = await supabase
          .from('patient_notes_simple')
          .delete()
          .eq('id', id)
          .eq('tenant_id', tenantId);

        if (error) {
          return res.status(400).json({ message: 'Lỗi xóa vĩnh viễn ghi chú', details: error.message });
        }

        return res.status(200).json({ message: 'Đã xóa vĩnh viễn ghi chú' });
      }

      const { data, error } = await supabase
        .from('patient_notes_simple')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ message: 'Lỗi xóa ghi chú', details: error.message });
      }

      return res.status(200).json({ message: 'Đã chuyển ghi chú vào thùng rác', data: toApiNote(data) });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi server', details: error?.message || String(error) });
  }
}
