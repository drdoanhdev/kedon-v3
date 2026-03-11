import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clinicName, email, password, phone } = req.body;

  // Validation
  if (!clinicName || !email || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên phòng khám, email và mật khẩu' });
  }
  if (typeof clinicName !== 'string' || clinicName.trim().length < 2) {
    return res.status(400).json({ error: 'Tên phòng khám quá ngắn' });
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Email không hợp lệ' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải ít nhất 6 ký tự' });
  }

  try {
    // 1. Tạo user trong Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message?.includes('already been registered')) {
        return res.status(409).json({ error: 'Email này đã được đăng ký' });
      }
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user!.id;

    // 2. Tạo tenant (phòng khám) với trial
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: clinicName.trim(),
        phone: phone?.trim() || null,
        status: 'active',
        owner_id: userId,
        plan: 'trial',
        trial_start: new Date().toISOString(),
        trial_days: 90,
        trial_max_prescriptions: 1000,
      })
      .select('id')
      .single();

    if (tenantError) {
      // Rollback: xoá user nếu tạo tenant thất bại
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Không thể tạo phòng khám: ' + tenantError.message });
    }

    // 3. Tạo membership (owner)
    const { error: memError } = await supabaseAdmin
      .from('tenantmembership')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: 'owner',
        active: true,
      });

    if (memError) {
      console.error('Failed to create membership:', memError.message);
    }

    // 4. Tạo user_profile
    await supabaseAdmin.from('user_profiles').insert({
      id: userId,
      full_name: clinicName.trim(),
      phone: phone?.trim() || null,
      default_tenant_id: tenant.id,
    });

    // 5. Tạo user_role
    await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role: 'admin',
    });

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công! Bạn có thể đăng nhập ngay.',
      tenantId: tenant.id,
    });
  } catch (error: any) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại' });
  }
}
