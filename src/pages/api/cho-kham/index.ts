import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

// Lấy đầu ngày hôm nay theo giờ Việt Nam (UTC+7)
function getTodayStartVN(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnDateStr = vnNow.toISOString().split('T')[0];
  return new Date(`${vnDateStr}T00:00:00+07:00`).toISOString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method === 'POST') {
    return handlePost(req, res, tenantId);
  } else if (req.method === 'GET') {
    return handleGet(req, res, tenantId);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res, tenantId);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, tenantId);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, tenantId: string) {
  try {
    const todayStart = getTodayStartVN();

    const { data, error } = await supabase
      .from('ChoKham')
      .select(`
        id,
        benhnhanid,
        thoigian,
        trangthai,
        avatar_url,
        BenhNhan:benhnhanid (
          id,
          ten,
          dienthoai,
          namsinh,
          diachi
        )
      `)
      .eq('tenant_id', tenantId)
      .gte('thoigian', todayStart)
      .order('thoigian', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching waiting list:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, tenantId: string) {
  try {
    const { patient_id, camera_location, avatar } = req.body;

    if (!patient_id) {
      return res.status(400).json({ success: false, error: 'patient_id is required' });
    }

    // Kiểm tra bệnh nhân tồn tại
    const { data: patient, error: patientError } = await supabase
      .from('BenhNhan')
      .select('id, ten')
      .eq('id', patient_id)
      .eq('tenant_id', tenantId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Kiểm tra đã có trong danh sách chờ hôm nay chưa (theo giờ VN)
    const todayStart = getTodayStartVN();

    const { data: existing } = await supabase
      .from('ChoKham')
      .select('id, thoigian')
      .eq('benhnhanid', patient_id)
      .eq('tenant_id', tenantId)
      .gte('thoigian', todayStart)
      .in('trangthai', ['chờ', 'đang_khám'])
      .single();

    if (existing) {
      // Nếu đã có, cập nhật avatar nếu có avatar mới
      if (avatar) {
        await supabase
          .from('ChoKham')
          .update({ avatar_url: avatar })
          .eq('id', existing.id);
      }
      
      return res.status(200).json({
        success: false,
        message: `Bệnh nhân ${patient.ten} đã có trong danh sách chờ`,
        existing: true
      });
    }

    // Thêm mới vào danh sách chờ với avatar (lưu giờ VN UTC+7)
    const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const thoigianVN = vnNow.toISOString().replace('Z', '+07:00');
    const { data: newRecord, error: insertError } = await supabase
      .from('ChoKham')
      .insert({
        benhnhanid: patient_id,
        thoigian: thoigianVN,
        trangthai: 'chờ',
        avatar_url: avatar || null,
        tenant_id: tenantId
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(200).json({
      success: true,
      message: `Đã thêm ${patient.ten} vào danh sách chờ`,
      data: newRecord
    });

  } catch (error: any) {
    console.error('Error adding to waiting list:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse, tenantId: string) {
  try {
    const { id, benhnhanid, trangthai } = req.body;

    if ((!id && !benhnhanid) || !trangthai) {
      return res.status(400).json({ success: false, error: 'id or benhnhanid, and trangthai are required' });
    }

    const validStatuses = ['chờ', 'đang_khám', 'đã_xong'];
    if (!validStatuses.includes(trangthai)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be: chờ, đang_khám, đã_xong' });
    }

    if (id) {
      // Update by record ID
      const { data, error } = await supabase
        .from('ChoKham')
        .update({ trangthai })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } else {
      // Update by benhnhanid — tìm record hôm nay đang chờ/đang khám (theo giờ VN)
      const todayStart = getTodayStartVN();

      const { data, error } = await supabase
        .from('ChoKham')
        .update({ trangthai })
        .eq('benhnhanid', benhnhanid)
        .eq('tenant_id', tenantId)
        .gte('thoigian', todayStart)
        .in('trangthai', ['chờ', 'đang_khám'])
        .select();

      if (error) throw error;

      return res.status(200).json({
        success: !!(data && data.length > 0),
        data: data?.[0] || null,
      });
    }
  } catch (error: any) {
    console.error('Error updating waiting list status:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, tenantId: string) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required' });
    }

    const { error } = await supabase
      .from('ChoKham')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Đã xóa khỏi danh sách chờ' });
  } catch (error: any) {
    console.error('Error deleting from waiting list:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Cấu hình để cho phép body size lớn hơn (cho base64 image)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};
