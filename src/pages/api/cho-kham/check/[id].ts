import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin } from '../../../../lib/tenantApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const { tenantId } = tenant;
  const supabase = supabaseAdmin;

  try {
    const { id } = req.query;
    const patientId = parseInt(id as string);

    if (isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    // Kiểm tra trong bảng ChoKham
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('ChoKham')
      .select('id, trangthai')
      .eq('benhnhan_id', patientId)
      .eq('tenant_id', tenantId)
      .gte('created_at', today)
      .in('trangthai', ['cho', 'dangkham'])
      .limit(1);

    if (error) {
      console.error('Error checking waiting list:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      exists: data && data.length > 0,
      record: data?.[0] || null
    });

  } catch (error) {
    console.error('Check waiting list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}