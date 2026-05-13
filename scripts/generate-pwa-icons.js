/**
 * Generate PWA icons (PNG) from public/eye-blue.svg.
 *
 * Run: `node scripts/generate-pwa-icons.js`
 *
 * Outputs into public/icons/:
 *   - icon-192.png
 *   - icon-256.png
 *   - icon-384.png
 *   - icon-512.png
 *   - icon-maskable-512.png  (with safe padding for maskable)
 *   - apple-touch-icon.png   (180x180)
 *   - favicon-32.png
 *   - favicon-16.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC_SVG = path.join(ROOT, 'public', 'eye-blue.svg');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

const THEME_BG = '#0ea5e9'; // accent background for full-bleed icons
const WHITE_BG = '#ffffff';

const STANDARD_SIZES = [
  { name: 'icon-192.png', size: 192, bg: WHITE_BG, padding: 0.10 },
  { name: 'icon-256.png', size: 256, bg: WHITE_BG, padding: 0.10 },
  { name: 'icon-384.png', size: 384, bg: WHITE_BG, padding: 0.10 },
  { name: 'icon-512.png', size: 512, bg: WHITE_BG, padding: 0.10 },
];

const MASKABLE = { name: 'icon-maskable-512.png', size: 512, bg: WHITE_BG, padding: 0.20 };
const APPLE = { name: 'apple-touch-icon.png', size: 180, bg: WHITE_BG, padding: 0.08 };
const FAV32 = { name: 'favicon-32.png', size: 32, bg: WHITE_BG, padding: 0.04 };
const FAV16 = { name: 'favicon-16.png', size: 16, bg: WHITE_BG, padding: 0.04 };

async function renderOne(svgBuffer, outFile, size, bg, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);

  const innerPng = await sharp(svgBuffer, { density: 384 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: innerPng, top: offset, left: offset }])
    .png()
    .toFile(outFile);

  console.log('  ✓', path.relative(ROOT, outFile));
}

async function main() {
  if (!fs.existsSync(SRC_SVG)) {
    console.error('Source SVG not found:', SRC_SVG);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const svg = fs.readFileSync(SRC_SVG);
  console.log('Generating PWA icons →', path.relative(ROOT, OUT_DIR));

  for (const item of STANDARD_SIZES) {
    await renderOne(svg, path.join(OUT_DIR, item.name), item.size, item.bg, item.padding);
  }
  for (const item of [MASKABLE, APPLE, FAV32, FAV16]) {
    await renderOne(svg, path.join(OUT_DIR, item.name), item.size, item.bg, item.padding);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
