import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';

/** Deprecated: tin nhắn nội bộ đã gỡ. Dùng /thong-bao (+ tab hỗ trợ nền tảng cho owner). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  return res.status(410).json({
    message: 'Tin nhắn nội bộ đã ngừng hỗ trợ. Vui lòng dùng Thông báo / Hỗ trợ nền tảng.',
    redirect: '/thong-bao',
  });
}
