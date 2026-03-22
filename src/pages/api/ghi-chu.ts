import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId, userId, isOwner, role } = ctx;

  try {
    // GET — tất cả thành viên đều xem được
    if (req.method === 'GET') {
      const slug = (req.query.slug as string) || 'huong-dan';

      const { data, error } = await supabase
        .from('GhiChuHeThong')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;

      // Nếu chưa có, trả nội dung mặc định
      if (!data) {
        return res.status(200).json({
          slug,
          title: 'Hướng dẫn sử dụng',
          content: '',
          updated_at: null,
        });
      }

      return res.status(200).json(data);
    }

    // PUT — chỉ owner/admin được sửa
    if (req.method === 'PUT') {
      if (!isOwner && role !== 'admin') {
        return res.status(403).json({ message: 'Chỉ chủ phòng khám hoặc quản trị viên mới được sửa ghi chú' });
      }

      const { slug = 'huong-dan', title, content } = req.body;

      if (typeof content !== 'string') {
        return res.status(400).json({ message: 'Nội dung ghi chú không hợp lệ' });
      }

      const { data, error } = await supabase
        .from('GhiChuHeThong')
        .upsert(
          {
            tenant_id: tenantId,
            slug,
            title: title || 'Hướng dẫn sử dụng',
            content,
            updated_at: new Date().toISOString(),
            updated_by: userId,
          },
          { onConflict: 'tenant_id,slug' }
        )
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json(data);
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error: any) {
    console.error('API ghi-chu error:', error);
    return res.status(500).json({ message: error.message });
  }
}
