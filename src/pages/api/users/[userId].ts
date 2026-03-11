import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;

  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId' })
  }

  // GET: Lấy role của user
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        return res.status(400).json({ 
          error: 'Lỗi lấy role',
          message: error.message 
        })
      }

      return res.status(200).json({ 
        success: true,
        data: { role: data?.role || null } 
      })
    } catch (error: any) {
      console.error('Error fetching user role:', error)
      return res.status(500).json({ 
        error: 'Lỗi server',
        message: error.message 
      })
    }
  }

  // PUT: Cập nhật role của user (chi tiết)
  if (req.method === 'PUT') {
    const { role } = req.body

    if (!role) {
      return res.status(400).json({ error: 'Thiếu role' })
    }

    if (!['admin', 'doctor', 'staff'].includes(role)) {
      return res.status(400).json({ 
        error: 'Role không hợp lệ. Phải là: admin, doctor, hoặc staff' 
      })
    }

    try {
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      let result
      if (existing) {
        result = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId)
          .select()
      } else {
        result = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role })
          .select()
      }

      if (result.error) {
        return res.status(400).json({ 
          error: 'Lỗi cập nhật role',
          message: result.error.message 
        })
      }

      return res.status(200).json({ 
        success: true,
        message: `Cập nhật role thành công: ${role}`,
        data: result.data 
      })
    } catch (error: any) {
      console.error('Error updating user role:', error)
      return res.status(500).json({ 
        error: 'Lỗi server',
        message: error.message 
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
