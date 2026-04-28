import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: `Phuong thuc ${req.method} khong duoc phep` });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  return res.status(200).json({ ok: true });
}
