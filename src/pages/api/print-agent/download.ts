/**
 * Tải gói Optigo Print Agent — cần đăng nhập + feature print_config.
 * Ưu tiên bundle nhúng trong code (luôn có trên Vercel), rồi zip pack local nếu có.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { requireTenant, requireFeature, setNoCacheHeaders } from '../../../lib/tenantApi';
import { createStoredZip } from '../../../lib/createStoredZip';
import { PRINT_AGENT_PACKAGE_FILES } from '../../../lib/printAgentPackage.generated';

export const config = {
  api: {
    responseLimit: false,
  },
};

function resolvePackedZipPath(): string | null {
  const fromEnv = process.env.PRINT_AGENT_ZIP_PATH?.trim();
  const candidates = [
    fromEnv,
    path.join(process.cwd(), 'private', 'downloads', 'OptigoPrintAgent.zip'),
    path.join(process.cwd(), 'services', 'print-agent', 'dist', 'OptigoPrintAgent.zip'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function buildZipFromEmbedded(): Buffer {
  return createStoredZip(
    PRINT_AGENT_PACKAGE_FILES.map((item) => ({
      name: item.name,
      data: Buffer.from(item.contentBase64, 'base64'),
    }))
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'print_config'))) return;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="OptigoPrintAgent.zip"');
  res.setHeader('Cache-Control', 'no-store');

  // Bundle nhúng luôn có trên production (không phụ thuộc /private gitignore).
  try {
    const built = buildZipFromEmbedded();
    res.setHeader('Content-Length', built.length);
    return res.status(200).send(built);
  } catch (error) {
    console.error('print-agent embed zip error:', error);
  }

  const packedPath = resolvePackedZipPath();
  if (packedPath) {
    const stream = fs.createReadStream(packedPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Không đọc được file agent' });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
    return;
  }

  return res.status(404).json({
    success: false,
    error: 'Không tạo được gói Print Agent. Chạy npm run pack:print-agent rồi deploy lại.',
  });
}
