import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

type RoleType = 'admin' | 'doctor' | 'staff'

interface UserWithRole {
  id: string
  email: string
  role: RoleType | null
  created_at?: string
  last_login_at?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const tenant = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!tenant) return;
  const supabase = supabaseAdmin;

  // GET: Lấy danh sách users
  if (req.method === 'GET') {
    try {
      // Lấy tất cả users từ auth
      const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
      
      if (usersError) {
        return res.status(500).json({ error: 'Lỗi lấy danh sách users', message: usersError.message })
      }

      // Lấy roles từ bảng user_roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')

      if (rolesError && rolesError.code !== 'PGRST116') {
        console.warn('Warning: Could not fetch roles:', rolesError.message)
      }

      // Kết hợp users và roles
      const roleMap = new Map(roles?.map(r => [r.user_id, r.role]) || [])
      
      const usersWithRoles: UserWithRole[] = users.users.map(user => ({
        id: user.id,
        email: user.email || '',
        role: (roleMap.get(user.id) || null) as RoleType | null,
        created_at: user.created_at,
        last_login_at: user.last_sign_in_at
      }))

      return res.status(200).json({ 
        success: true, 
        data: usersWithRoles,
        count: usersWithRoles.length 
      })
    } catch (error: any) {
      console.error('Error fetching users:', error)
      return res.status(500).json({ 
        error: 'Lỗi server khi lấy danh sách users',
        message: error.message 
      })
    }
  }

  // PUT: Cập nhật role của user
  if (req.method === 'PUT') {
    const { userId, role } = req.body

    if (!userId || !role) {
      return res.status(400).json({ 
        error: 'Thiếu userId hoặc role' 
      })
    }

    if (!['admin', 'doctor', 'staff'].includes(role)) {
      return res.status(400).json({ 
        error: 'Role không hợp lệ. Phải là: admin, doctor, hoặc staff' 
      })
    }

    try {
      // Kiểm tra role có tồn tại không
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      let result
      if (existing) {
        // Cập nhật role
        result = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId)
          .select()
      } else {
        // Tạo mới
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
        error: 'Lỗi server khi cập nhật role',
        message: error.message 
      })
    }
  }

  // DELETE: Xóa user
  if (req.method === 'DELETE') {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' })
    }

    try {
      // Xóa role trước
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)

      // Xóa user từ auth
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId as string)

      if (deleteError) {
        return res.status(400).json({ 
          error: 'Lỗi xóa user',
          message: deleteError.message 
        })
      }

      return res.status(200).json({ 
        success: true,
        message: 'Xóa user thành công' 
      })
    } catch (error: any) {
      console.error('Error deleting user:', error)
      return res.status(500).json({ 
        error: 'Lỗi server khi xóa user',
        message: error.message 
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
