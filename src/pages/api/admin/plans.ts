// API: Quản lý gói dịch vụ (superadmin only)
// GET: Lấy danh sách plans
// PUT: Cập nhật plan (giá, tính năng, trạng thái)
// POST: Tạo plan mới
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireSuperAdmin(req, res);
  if (!ctx) return;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      const { plan_key, name, price, period_label, features, is_popular, is_active, sort_order, trial_days, trial_max_prescriptions, max_users } = req.body;

      if (!plan_key || !name) {
        return res.status(400).json({ message: 'plan_key và name là bắt buộc' });
      }

      const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .insert({
          plan_key,
          name,
          price: parseInt(price) || 0,
          period_label: period_label || '/tháng',
          features: features || [],
          is_popular: is_popular || false,
          is_active: is_active !== false,
          sort_order: parseInt(sort_order) || 0,
          trial_days: trial_days ? parseInt(trial_days) : null,
          trial_max_prescriptions: trial_max_prescriptions ? parseInt(trial_max_prescriptions) : null,
          max_users: max_users ? parseInt(max_users) : null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ message: `Gói "${plan_key}" đã tồn tại` });
        }
        throw error;
      }
      return res.status(201).json({ message: 'Đã tạo gói mới', data });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Thiếu id' });
      }

      // Chuyển đổi kiểu dữ liệu
      const cleanUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) cleanUpdates.name = updates.name;
      if (updates.price !== undefined) cleanUpdates.price = parseInt(updates.price) || 0;
      if (updates.period_label !== undefined) cleanUpdates.period_label = updates.period_label;
      if (updates.features !== undefined) cleanUpdates.features = updates.features;
      if (updates.is_popular !== undefined) cleanUpdates.is_popular = updates.is_popular;
      if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;
      if (updates.sort_order !== undefined) cleanUpdates.sort_order = parseInt(updates.sort_order) || 0;
      if (updates.trial_days !== undefined) cleanUpdates.trial_days = updates.trial_days ? parseInt(updates.trial_days) : null;
      if (updates.trial_max_prescriptions !== undefined) cleanUpdates.trial_max_prescriptions = updates.trial_max_prescriptions ? parseInt(updates.trial_max_prescriptions) : null;
      if (updates.max_users !== undefined) cleanUpdates.max_users = updates.max_users ? parseInt(updates.max_users) : null;

      const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ message: 'Đã cập nhật gói', data });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (err: any) {
    console.error('admin/plans error:', err);
    return res.status(500).json({ message: err.message });
  }
}
