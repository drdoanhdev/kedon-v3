import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const tenant = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!tenant) return;
  const supabase = supabaseAdmin;

  const { email, password, role } = req.body

  // Validation
  if (!email || !password || !role) {
    return res.status(400).json({ 
      error: 'Thiếu email, password hoặc role' 
    })
  }

  if (password.length < 6) {
    return res.status(400).json({ 
      error: 'Mật khẩu phải ít nhất 6 ký tự' 
    })
  }

  if (!['admin', 'doctor', 'staff'].includes(role)) {
    return res.status(400).json({ 
      error: 'Role không hợp lệ. Phải là: admin, doctor, hoặc staff' 
    })
  }

  try {
    // Tạo user trong auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      return res.status(400).json({ 
        error: 'Lỗi tạo user',
        message: authError.message 
      })
    }

    if (!authUser.user?.id) {
      return res.status(500).json({ 
        error: 'Không thể tạo user' 
      })
    }

    // Gán role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.user.id,
        role
      })

    if (roleError) {
      console.warn('Warning: Created user but failed to assign role:', roleError.message)
      // Vẫn trả về success vì user đã được tạo, chỉ là role chưa gán
    }

    return res.status(201).json({ 
      success: true,
      message: 'Tạo user thành công',
      data: {
        id: authUser.user.id,
        email: authUser.user.email,
        role
      }
    })
  } catch (error: any) {
    console.error('Error creating user:', error)
    return res.status(500).json({ 
      error: 'Lỗi server khi tạo user',
      message: error.message 
    })
  }
}
