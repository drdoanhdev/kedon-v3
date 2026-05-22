export type TemElementKind = 'text' | 'box' | 'qr' | 'barcode';
export type TemTextAlign = 'left' | 'center' | 'right';

export type PrintableTemElement = {
  id: string;
  kind: TemElementKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  z: number;
  text?: string;
  value?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: TemTextAlign;
  color?: string;
  bgColor?: string;
  radius?: number;
};

export type PrintableTemTemplate = {
  widthMm: number;
  heightMm: number;
  background: string;
  elements: PrintableTemElement[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function encodeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildQrSrc(value: string, sizePx: number): string {
  const size = Math.max(64, Math.round(sizePx));
  return `https://api.qrserver.com/v1/create-qr-code/?margin=0&size=${size}x${size}&data=${encodeURIComponent(value || ' ')}`;
}

function buildBarcodeSrc(value: string, heightPx: number): string {
  const height = Math.max(12, Math.round(heightPx / 3));
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value || '0')}&includetext=false&scale=3&height=${height}`;
}

export function printResolvedTemTemplate(params: {
  template: PrintableTemTemplate;
  copies: number;
  popup?: Window | null;
}): Window | null {
  const printCopies = clamp(Math.round(params.copies || 1), 1, 500);
  const popup = params.popup || window.open('', '_blank', 'width=1200,height=900');
  if (!popup) return null;

  const sortedElements = [...(params.template.elements || [])].sort((a, b) => a.z - b.z);

  const htmlElements = sortedElements
    .map((item) => {
      const base = [
        `left:${item.x}mm`,
        `top:${item.y}mm`,
        `width:${item.w}mm`,
        `height:${item.h}mm`,
        `transform:rotate(${item.rotate}deg)`,
        'transform-origin:center center',
        `z-index:${item.z}`,
      ].join(';');

      if (item.kind === 'box') {
        return `<div class="el" style="${base};background:${item.bgColor ?? '#ffffff'};border-radius:${item.radius ?? 0}mm;"></div>`;
      }

      if (item.kind === 'text') {
        const justify = item.align === 'left' ? 'flex-start' : item.align === 'right' ? 'flex-end' : 'center';
        return `<div class="el txt" style="${base};justify-content:${justify};font-size:${item.fontSize ?? 2.5}mm;font-weight:${item.fontWeight ?? 600};color:${item.color ?? '#111111'};">${encodeHtml(item.text ?? '')}</div>`;
      }

      if (item.kind === 'qr') {
        const src = buildQrSrc(item.value || '', Math.round(item.w * 12));
        return `<div class="el" style="${base};"><img class="img" src="${src}" alt="QR"/></div>`;
      }

      const barcodeSrc = buildBarcodeSrc(item.value || '', Math.round(item.h * 12));
      return `<div class="el" style="${base};"><img class="img" src="${barcodeSrc}" alt="Barcode"/></div>`;
    })
    .join('\n');

  const sheets = Array.from({ length: printCopies }, () => `<section class="sheet">${htmlElements}</section>`).join('\n');

  const doc = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>In tem kinh</title>
      <style>
        @page { size: ${params.template.widthMm}mm ${params.template.heightMm}mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { background: #fff; }
        .sheet {
          position: relative;
          width: ${params.template.widthMm}mm;
          height: ${params.template.heightMm}mm;
          overflow: hidden;
          background: ${params.template.background};
          page-break-after: always;
        }
        .sheet:last-child { page-break-after: auto; }
        .el { position: absolute; }
        .txt {
          display: flex;
          align-items: center;
          white-space: nowrap;
          overflow: visible;
          line-height: 1;
        }
        .img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: fill;
        }
      </style>
    </head>
    <body>
      ${sheets}
      <script>
        (function () {
          var done = false;
          function finalize() {
            if (done) return;
            done = true;
            setTimeout(function () {
              window.focus();
              window.print();
            }, 120);
          }

          var images = Array.prototype.slice.call(document.images || []);
          if (images.length === 0) {
            finalize();
            return;
          }

          var pending = images.length;
          function markDone() {
            pending -= 1;
            if (pending <= 0) finalize();
          }

          images.forEach(function (img) {
            if (img.complete) {
              markDone();
            } else {
              img.addEventListener('load', markDone, { once: true });
              img.addEventListener('error', markDone, { once: true });
            }
          });

          setTimeout(finalize, 4000);
        })();
      </script>
    </body>
    </html>
  `;

  popup.document.open();
  popup.document.write(doc);
  popup.document.close();

  return popup;
}
