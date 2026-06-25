/** Phân tích khung mặt so với oval hướng dẫn — dùng cho đăng ký khuôn mặt trên web. */

export type FaceGuideStatus =
  | 'no_face'
  | 'too_far'
  | 'too_close'
  | 'off_center'
  | 'too_dark'
  | 'tilted'
  | 'ready';

export interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceGuideCheck {
  id: string;
  label: string;
  ok: boolean;
}

export interface FaceGuideResult {
  status: FaceGuideStatus;
  message: string;
  hints: string[];
  checks: FaceGuideCheck[];
  score: number;
}

const OVAL_CENTER_X = 0.5;
const OVAL_CENTER_Y = 0.46;
const MIN_FACE_HEIGHT_RATIO = 0.28;
const MAX_FACE_HEIGHT_RATIO = 0.52;
const MAX_CENTER_OFFSET_X = 0.12;
const MAX_CENTER_OFFSET_Y = 0.14;
const MIN_BRIGHTNESS = 38;
const MIN_ASPECT = 0.68;
const MAX_ASPECT = 1.38;

export function analyzeFaceGuide(
  face: FaceBounds | null,
  frameWidth: number,
  frameHeight: number,
  brightness?: number | null
): FaceGuideResult {
  const hints: string[] = [];

  if (!face || frameWidth <= 0 || frameHeight <= 0) {
    return {
      status: 'no_face',
      message: 'Không thấy khuôn mặt',
      hints: [
        'Nhìn thẳng vào camera',
        'Đảm bảo mặt nằm trong khung oval',
        'Tăng ánh sáng phòng nếu cần',
      ],
      checks: [
        { id: 'face', label: 'Phát hiện khuôn mặt', ok: false },
        { id: 'size', label: 'Khoảng cách phù hợp', ok: false },
        { id: 'center', label: 'Căn giữa khung', ok: false },
        { id: 'light', label: 'Đủ sáng', ok: false },
      ],
      score: 0,
    };
  }

  const faceCx = (face.x + face.width / 2) / frameWidth;
  const faceCy = (face.y + face.height / 2) / frameHeight;
  const faceHeightRatio = face.height / frameHeight;
  const aspect = face.width / Math.max(face.height, 1);

  const offsetX = Math.abs(faceCx - OVAL_CENTER_X);
  const offsetY = Math.abs(faceCy - OVAL_CENTER_Y);

  const sizeOk =
    faceHeightRatio >= MIN_FACE_HEIGHT_RATIO && faceHeightRatio <= MAX_FACE_HEIGHT_RATIO;
  const centerOk = offsetX <= MAX_CENTER_OFFSET_X && offsetY <= MAX_CENTER_OFFSET_Y;
  const aspectOk = aspect >= MIN_ASPECT && aspect <= MAX_ASPECT;
  const lightOk = brightness == null || brightness >= MIN_BRIGHTNESS;

  let status: FaceGuideStatus = 'ready';
  let message = 'Giữ nguyên tư thế — sẵn sàng chụp';

  if (faceHeightRatio < MIN_FACE_HEIGHT_RATIO) {
    status = 'too_far';
    message = 'Tiến gần camera hơn';
    hints.push('Đưa mặt vào gần hơn cho đến khi vừa khung oval');
  } else if (faceHeightRatio > MAX_FACE_HEIGHT_RATIO) {
    status = 'too_close';
    message = 'Lùi xa camera một chút';
    hints.push('Lùi lại để toàn bộ mặt nằm trong oval');
  } else if (!centerOk) {
    status = 'off_center';
    message = 'Căn mặt vào giữa khung oval';
    if (faceCx < OVAL_CENTER_X - 0.04) hints.push('Di chuyển sang phải một chút');
    if (faceCx > OVAL_CENTER_X + 0.04) hints.push('Di chuyển sang trái một chút');
    if (faceCy < OVAL_CENTER_Y - 0.04) hints.push('Hạ cằm xuống một chút');
    if (faceCy > OVAL_CENTER_Y + 0.04) hints.push('Ngẩng lên một chút');
  } else if (!aspectOk) {
    status = 'tilted';
    message = 'Nhìn thẳng vào camera';
    hints.push('Giữ đầu thẳng, không nghiêng quá');
  } else if (!lightOk) {
    status = 'too_dark';
    message = 'Cần thêm ánh sáng';
    hints.push('Bật đèn hoặc quay mặt về phía nguồn sáng');
  }

  const checks: FaceGuideCheck[] = [
    { id: 'face', label: 'Phát hiện khuôn mặt', ok: true },
    { id: 'size', label: 'Khoảng cách phù hợp', ok: sizeOk },
    { id: 'center', label: 'Căn giữa khung', ok: centerOk },
    { id: 'light', label: 'Đủ sáng', ok: lightOk },
    { id: 'front', label: 'Nhìn thẳng', ok: aspectOk },
  ];

  let score = 0;
  if (true) score += 25;
  if (sizeOk) score += 25;
  if (centerOk) score += 25;
  if (lightOk) score += 12;
  if (aspectOk) score += 13;

  const ready = status === 'ready' && score >= 88;

  return {
    status: ready ? 'ready' : status,
    message: ready ? 'Giữ nguyên tư thế — sẵn sàng chụp' : message,
    hints: hints.length > 0 ? hints : ready ? ['Giữ yên 1–2 giây để hệ thống chụp'] : [],
    checks,
    score: ready ? 100 : score,
  };
}

/** Lấy độ sáng trung bình (0–255) từ vùng khuôn mặt trên canvas. */
export function sampleFaceBrightness(
  ctx: CanvasRenderingContext2D,
  face: FaceBounds,
  frameWidth: number,
  frameHeight: number
): number {
  const x = Math.max(0, Math.floor(face.x));
  const y = Math.max(0, Math.floor(face.y));
  const w = Math.min(Math.ceil(face.width), frameWidth - x);
  const h = Math.min(Math.ceil(face.height), frameHeight - y);
  if (w <= 0 || h <= 0) return 0;

  const data = ctx.getImageData(x, y, w, h).data;
  let sum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / pixels;
}
