import { NextApiRequest, NextApiResponse } from 'next';
import {
  requireFeature,
  requireTenant,
  resolveBranchAccess,
  setNoCacheHeaders,
  supabaseAdmin as supabase,
} from '../../../lib/tenantApi';
import {
  applyTemplateTokens,
  buildTemTokens,
  createDefaultTemKinhTemplate,
  normalizeTemLabelTemplate,
  type TemLabelTemplate,
} from '../../../lib/temKinh';

type TemplateLoadResult = {
  id: number | null;
  source: 'default_builtin' | 'default_saved' | 'template_saved' | 'inline_draft';
  template: TemLabelTemplate;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function mapTemplateRow(row: any): TemLabelTemplate {
  return normalizeTemLabelTemplate({
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
}

async function loadTemplateForTenant(params: {
  tenantId: string;
  userId: string;
  branchId: string | null;
  templateId: number | null;
}): Promise<TemplateLoadResult> {
  const fallbackTemplate = createDefaultTemKinhTemplate();

  if (params.templateId) {
    const { data, error } = await supabase
      .from('tem_kinh_templates')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('created_by', params.userId)
      .eq('id', params.templateId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return { id: null, source: 'default_builtin', template: fallbackTemplate };
      }
      throw error;
    }

    if (data) {
      const templateBranch = data.branch_id as string | null;
      const canUseTemplate = !templateBranch || !params.branchId || templateBranch === params.branchId;
      if (canUseTemplate) {
        return {
          id: Number(data.id),
          source: 'template_saved',
          template: mapTemplateRow(data),
        };
      }
    }
  }

  if (params.branchId) {
    const { data: branchDefault, error: branchDefaultErr } = await supabase
      .from('tem_kinh_templates')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('created_by', params.userId)
      .eq('branch_id', params.branchId)
      .eq('is_default', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (branchDefaultErr) {
      if (branchDefaultErr.code !== '42P01') throw branchDefaultErr;
    } else if (branchDefault) {
      return {
        id: Number(branchDefault.id),
        source: 'default_saved',
        template: mapTemplateRow(branchDefault),
      };
    }
  }

  const { data: sharedDefault, error: sharedDefaultErr } = await supabase
    .from('tem_kinh_templates')
    .select('*')
    .eq('tenant_id', params.tenantId)
    .eq('created_by', params.userId)
    .is('branch_id', null)
    .eq('is_default', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sharedDefaultErr) {
    if (sharedDefaultErr.code === '42P01') {
      return { id: null, source: 'default_builtin', template: fallbackTemplate };
    }
    throw sharedDefaultErr;
  }

  if (!sharedDefault) {
    return { id: null, source: 'default_builtin', template: fallbackTemplate };
  }

  return {
    id: Number(sharedDefault.id),
    source: 'default_saved',
    template: mapTemplateRow(sharedDefault),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
  const source = req.method === 'POST' ? req.body : req.query;

  const frameId = parsePositiveInt(source?.gong_kinh_id);
  if (!frameId) {
    return res.status(400).json({ error: 'gong_kinh_id is required and must be a positive integer' });
  }

  const templateId = parsePositiveInt(source?.template_id);
  const qrValueOverride = typeof source?.qr_value === 'string' ? source.qr_value.trim() : undefined;
  const barcodeValueOverride = typeof source?.barcode_value === 'string' ? source.barcode_value.trim() : undefined;
  const inlineTemplate = req.method === 'POST' && source?.template ? normalizeTemLabelTemplate(source.template) : null;

  try {
    const { data: frame, error: frameErr } = await supabase
      .from('GongKinh')
      .select(
        'id, ten_gong, ma_gong, chat_lieu, hang_san_xuat, mau_sac, kich_co, gia_nhap, gia_ban, ton_kho, NhaCungCap:nha_cung_cap_id(ten)'
      )
      .eq('tenant_id', tenantId)
      .eq('id', frameId)
      .eq('trang_thai', true)
      .maybeSingle();

    if (frameErr) throw frameErr;
    if (!frame) {
      return res.status(404).json({ error: 'Frame not found or inactive' });
    }

    let effectiveSellPrice = Math.max(0, Math.round(Number((frame as any).gia_ban) || 0));
    const buyPrice = Math.max(0, Math.round(Number((frame as any).gia_nhap) || 0));
    let priceSource: 'catalog_default' | 'branch_override' = 'catalog_default';
    let overrideId: number | null = null;

    if (branchId) {
      const { data: override, error: overrideErr } = await supabase
        .from('branch_price_overrides')
        .select('id, gia_ban_override')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('item_type', 'gong_kinh')
        .eq('item_id', frameId)
        .is('deleted_at', null)
        .is('effective_to', null)
        .maybeSingle();

      if (overrideErr && overrideErr.code !== '42P01') {
        throw overrideErr;
      }

      if (override) {
        const overriddenPrice = Number((override as any).gia_ban_override);
        if (Number.isFinite(overriddenPrice)) {
          effectiveSellPrice = Math.max(0, Math.round(overriddenPrice));
          priceSource = 'branch_override';
          overrideId = Number((override as any).id);
        }
      }
    }

    const [{ data: printConfig, error: cfgErr }, { data: branchInfo, error: branchErr }] = await Promise.all([
      supabase
        .from('cau_hinh_mau_in')
        .select('ten_cua_hang, dia_chi, dien_thoai')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      branchId
        ? supabase
            .from('branches')
            .select('ten_chi_nhanh, dia_chi, dien_thoai')
            .eq('tenant_id', tenantId)
            .eq('id', branchId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (cfgErr && cfgErr.code !== '42P01') throw cfgErr;
    if (branchErr) throw branchErr;

    const store = {
      ten_cua_hang: (printConfig?.ten_cua_hang || '').trim() || (branchInfo?.ten_chi_nhanh || 'Cua hang kinh'),
      dia_chi: (printConfig?.dia_chi || '').trim() || (branchInfo?.dia_chi || ''),
      dien_thoai: (printConfig?.dien_thoai || '').trim() || (branchInfo?.dien_thoai || ''),
      ten_chi_nhanh: branchInfo?.ten_chi_nhanh || '',
    };

    const templateResult = inlineTemplate
      ? { id: null, source: 'inline_draft' as const, template: inlineTemplate }
      : await loadTemplateForTenant({ tenantId, userId: ctx.userId, branchId, templateId });

    const tokens = buildTemTokens({
      frame: {
        id: Number((frame as any).id),
        ten_gong: (frame as any).ten_gong,
        ma_gong: (frame as any).ma_gong,
        chat_lieu: (frame as any).chat_lieu,
        hang_san_xuat: (frame as any).hang_san_xuat,
        mau_sac: (frame as any).mau_sac,
        kich_co: (frame as any).kich_co,
        gia_nhap: buyPrice,
        gia_ban: Math.max(0, Math.round(Number((frame as any).gia_ban) || 0)),
        NhaCungCap: (frame as any).NhaCungCap || null,
      },
      store,
      effectiveSellPrice,
      qrValue: qrValueOverride,
      barcodeValue: barcodeValueOverride,
    });

    const resolvedTemplate = applyTemplateTokens(templateResult.template, tokens);

    return res.status(200).json({
      frame: {
        id: Number((frame as any).id),
        ten_gong: (frame as any).ten_gong,
        ma_gong: (frame as any).ma_gong,
        chat_lieu: (frame as any).chat_lieu,
        hang_san_xuat: (frame as any).hang_san_xuat,
        mau_sac: (frame as any).mau_sac,
        kich_co: (frame as any).kich_co,
        ton_kho: Math.max(0, Math.round(Number((frame as any).ton_kho) || 0)),
        nha_cung_cap: (frame as any).NhaCungCap?.ten || null,
      },
      store,
      pricing: {
        buy_price: buyPrice,
        catalog_sell_price: Math.max(0, Math.round(Number((frame as any).gia_ban) || 0)),
        effective_sell_price: effectiveSellPrice,
        source: priceSource,
        override_id: overrideId,
      },
      template: {
        id: templateResult.id,
        source: templateResult.source,
        ...templateResult.template,
      },
      tokens,
      resolved_template: resolvedTemplate,
    });
  } catch (err: any) {
    console.error('tem-kinh/data error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
