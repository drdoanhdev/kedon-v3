import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method === 'POST') {
    return handlePost(req, res);
  } else if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
      .gte('thoigian', today.toISOString())
      .order('thoigian', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error('Error fetching waiting list:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
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
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Kiểm tra đã có trong danh sách chờ hôm nay chưa
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: existing } = await supabase
      .from('ChoKham')
      .select('id, thoigian')
      .eq('benhnhanid', patient_id)
      .gte('thoigian', today.toISOString())
      .eq('trangthai', 'chờ')
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

    // Thêm mới vào danh sách chờ với avatar
    const { data: newRecord, error: insertError } = await supabase
      .from('ChoKham')
      .insert({
        benhnhanid: patient_id,
        thoigian: new Date().toISOString(),
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

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required' });
    }

    const { error } = await supabase
      .from('ChoKham')
      .delete()
      .eq('id', id);

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
