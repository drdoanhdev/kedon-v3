import { NextApiRequest, NextApiResponse } from 'next';
import {
  requireFeature,
  requireTenant,
  resolveBranchAccess,
  setNoCacheHeaders,
  supabaseAdmin as supabase,
} from '../../../lib/tenantApi';
import { createDefaultTemKinhTemplate, normalizeTemLabelTemplate } from '../../../lib/temKinh';

type ScopeMode = 'shared' | 'branch' | 'all';

function parseScope(raw: unknown): ScopeMode {
  if (raw === 'shared' || raw === 'branch') return raw;
  return 'all';
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isMissingTableError(error: any): boolean {
  return error?.code === '42P01';
}

function mapTemplateRow(row: any) {
  const template = normalizeTemLabelTemplate({
    name: row?.name,
    widthMm: row?.width_mm,
    heightMm: row?.height_mm,
    dpi: row?.dpi,
    gapMm: row?.gap_mm,
    speed: row?.speed,
    density: row?.density,
    bitmapInvert: row?.bitmap_invert,
    bitmapRotate180: row?.bitmap_rotate_180,
    bitmapOffsetXmm: row?.bitmap_offset_x_mm,
    bitmapOffsetYmm: row?.bitmap_offset_y_mm,
    background: row?.background,
    copies: row?.copies,
    elements: row?.elements,
  });

  return {
    id: Number(row.id),
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    created_by: row.created_by,
    is_default: row.is_default === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...template,
  };
}

async function clearDefaultInScope(params: {
  tenantId: string;
  userId: string;
  branchId: string | null;
  exceptId?: number;
}) {
  let query = supabase
    .from('tem_kinh_templates')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', params.tenantId)
    .eq('created_by', params.userId)
    .is('deleted_at', null);

  if (params.branchId) {
    query = query.eq('branch_id', params.branchId);
  } else {
    query = query.is('branch_id', null);
  }

  if (params.exceptId) {
    query = query.neq('id', params.exceptId);
  }

  const { error } = await query;
  if (error && !isMissingTableError(error)) {
    throw error;
  }
}

function getTemplatePayload(rawBody: any) {
  const fromBody = rawBody?.template ?? rawBody;
  const normalized = normalizeTemLabelTemplate(fromBody);

  if (typeof rawBody?.name === 'string' && rawBody.name.trim()) {
    normalized.name = rawBody.name.trim();
  }

  return normalized;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'print_config'))) return;

  const branchAccess = await resolveBranchAccess(ctx, res, {
    requireForStaff: true,
    allowAllForOwner: true,
  });
  if (!branchAccess) return;

  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method === 'GET') {
    const scope = parseScope(req.query.scope);

    const createBaseQuery = () =>
      supabase
        .from('tem_kinh_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('created_by', ctx.userId)
        .is('deleted_at', null);

    const sortTemplates = (items: any[]) =>
      [...items].sort((a, b) => {
        const byDefault = Number(Boolean(b?.is_default)) - Number(Boolean(a?.is_default));
        if (byDefault !== 0) return byDefault;

        const timeA = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA;
      });

    try {
      let data: any[] | null = [];
      let error: any = null;

      if (scope === 'branch') {
        if (!branchId) {
          return res.status(400).json({ error: 'scope=branch requires a valid x-branch-id' });
        }
        const result = await createBaseQuery().eq('branch_id', branchId);
        data = result.data;
        error = result.error;
      } else if (scope === 'shared') {
        const result = await createBaseQuery().is('branch_id', null);
        data = result.data;
        error = result.error;
      } else if (scope === 'all') {
        if (branchId) {
          const [branchRows, sharedRows] = await Promise.all([
            createBaseQuery().eq('branch_id', branchId),
            createBaseQuery().is('branch_id', null),
          ]);

          if (branchRows.error) {
            error = branchRows.error;
          } else if (sharedRows.error) {
            error = sharedRows.error;
          } else {
            data = sortTemplates([...(branchRows.data || []), ...(sharedRows.data || [])]);
          }
        } else {
          const result = await createBaseQuery().is('branch_id', null);
          data = result.data;
          error = result.error;
        }
      }

      if (error) {
        if (isMissingTableError(error)) {
          const fallback = createDefaultTemKinhTemplate();
          return res.status(200).json({
            items: [
              {
                id: null,
                tenant_id: tenantId,
                branch_id: null,
                created_by: ctx.userId,
                is_default: true,
                source: 'builtin',
                created_at: null,
                updated_at: null,
                ...fallback,
              },
            ],
            storage_ready: false,
          });
        }
        throw error;
      }

      return res.status(200).json({
        items: sortTemplates(data || []).map((item) => ({ ...mapTemplateRow(item), source: 'database' })),
        storage_ready: true,
      });
    } catch (err: any) {
      console.error('tem-kinh/templates GET error:', err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const scope = parseScope(req.body?.scope);
    const targetBranchId = scope === 'branch' ? branchId : null;

    if (scope === 'branch' && !targetBranchId) {
      return res.status(400).json({ error: 'scope=branch requires a valid x-branch-id' });
    }

    try {
      const template = getTemplatePayload(req.body);
      const setDefault = req.body?.is_default === true;

      if (setDefault) {
        await clearDefaultInScope({ tenantId, userId: ctx.userId, branchId: targetBranchId });
      }

      const payload = {
        tenant_id: tenantId,
        branch_id: targetBranchId,
        name: template.name,
        width_mm: template.widthMm,
        height_mm: template.heightMm,
        dpi: template.dpi,
        gap_mm: template.gapMm,
        speed: template.speed,
        density: template.density,
        bitmap_invert: template.bitmapInvert,
        bitmap_rotate_180: template.bitmapRotate180,
        bitmap_offset_x_mm: template.bitmapOffsetXmm,
        bitmap_offset_y_mm: template.bitmapOffsetYmm,
        background: template.background,
        copies: template.copies,
        elements: template.elements,
        is_default: setDefault,
        created_by: ctx.userId,
      };

      const { data, error } = await supabase
        .from('tem_kinh_templates')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            error:
              'Database table tem_kinh_templates is missing. Run migrations V078_create_tem_kinh_templates.sql and V079_tem_kinh_templates_user_scope_and_print_settings.sql first.',
            code: 'MIGRATION_REQUIRED',
          });
        }
        throw error;
      }

      return res.status(201).json({ item: mapTemplateRow(data) });
    } catch (err: any) {
      console.error('tem-kinh/templates POST error:', err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  if (req.method === 'PUT') {
    const templateId = parsePositiveInt(req.body?.id);
    if (!templateId) {
      return res.status(400).json({ error: 'id is required and must be a positive integer' });
    }

    try {
      const { data: existing, error: existingErr } = await supabase
        .from('tem_kinh_templates')
        .select('id, branch_id')
        .eq('tenant_id', tenantId)
        .eq('created_by', ctx.userId)
        .eq('id', templateId)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingErr) {
        if (isMissingTableError(existingErr)) {
          return res.status(503).json({
            error:
              'Database table tem_kinh_templates is missing. Run migrations V078_create_tem_kinh_templates.sql and V079_tem_kinh_templates_user_scope_and_print_settings.sql first.',
            code: 'MIGRATION_REQUIRED',
          });
        }
        throw existingErr;
      }

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const existingBranchId = (existing as any).branch_id as string | null;
      if (existingBranchId && branchId && existingBranchId !== branchId) {
        return res.status(403).json({ error: 'No access to template of another branch' });
      }

      const template = getTemplatePayload(req.body);
      const setDefault = req.body?.is_default === true;

      if (setDefault) {
        await clearDefaultInScope({
          tenantId,
          userId: ctx.userId,
          branchId: existingBranchId,
          exceptId: templateId,
        });
      }

      const { data, error } = await supabase
        .from('tem_kinh_templates')
        .update({
          name: template.name,
          width_mm: template.widthMm,
          height_mm: template.heightMm,
          dpi: template.dpi,
          gap_mm: template.gapMm,
          speed: template.speed,
          density: template.density,
          bitmap_invert: template.bitmapInvert,
          bitmap_rotate_180: template.bitmapRotate180,
          bitmap_offset_x_mm: template.bitmapOffsetXmm,
          bitmap_offset_y_mm: template.bitmapOffsetYmm,
          background: template.background,
          copies: template.copies,
          elements: template.elements,
          is_default: setDefault,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('created_by', ctx.userId)
        .eq('id', templateId)
        .is('deleted_at', null)
        .select('*')
        .single();

      if (error) throw error;

      return res.status(200).json({ item: mapTemplateRow(data) });
    } catch (err: any) {
      console.error('tem-kinh/templates PUT error:', err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    const templateId = parsePositiveInt(req.query.id ?? req.body?.id);
    if (!templateId) {
      return res.status(400).json({ error: 'id is required and must be a positive integer' });
    }

    try {
      const { data: existing, error: existingErr } = await supabase
        .from('tem_kinh_templates')
        .select('id, branch_id')
        .eq('tenant_id', tenantId)
        .eq('created_by', ctx.userId)
        .eq('id', templateId)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingErr) {
        if (isMissingTableError(existingErr)) {
          return res.status(503).json({
            error:
              'Database table tem_kinh_templates is missing. Run migrations V078_create_tem_kinh_templates.sql and V079_tem_kinh_templates_user_scope_and_print_settings.sql first.',
            code: 'MIGRATION_REQUIRED',
          });
        }
        throw existingErr;
      }

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const existingBranchId = (existing as any).branch_id as string | null;
      if (existingBranchId && branchId && existingBranchId !== branchId) {
        return res.status(403).json({ error: 'No access to template of another branch' });
      }

      const { error } = await supabase
        .from('tem_kinh_templates')
        .update({
          deleted_at: new Date().toISOString(),
          is_default: false,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('created_by', ctx.userId)
        .eq('id', templateId)
        .is('deleted_at', null);

      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('tem-kinh/templates DELETE error:', err);
      return res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
