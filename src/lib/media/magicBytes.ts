/**
 * Sniff image magic bytes — không tin Content-Type client khai báo.
 */
export type DetectedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'
  | null;

export function detectImageMimeFromBuffer(buf: Buffer): DetectedImageMime {
  if (!buf || buf.length < 12) return null;

  // JPEG FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: RIFF....WEBP
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // HEIC/HEIF: ....ftypheic / heif / mif1 / msf1
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1') {
      return brand.startsWith('heic') ? 'image/heic' : 'image/heif';
    }
  }

  return null;
}

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function assertAllowedImageBuffer(buf: Buffer): DetectedImageMime {
  const detected = detectImageMimeFromBuffer(buf);
  if (!detected || !ALLOWED.has(detected)) {
    throw new Error('File khong phai anh hop le (jpeg/png/webp/heic)');
  }
  return detected;
}
