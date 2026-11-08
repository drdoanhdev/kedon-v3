export interface PatientResult {
  id: number;
  ten: string;
  dienthoai?: string;
  diachi?: string;
  namsinh?: string;
  mabenhnhan?: string;
  ngay_kham_gan_nhat?: string;
}

function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeSearchToken(text: string): string {
  return stripDiacritics(text.trim().toLowerCase());
}

function scoreItem(
  p: PatientResult,
  t: string,
  isPhoneLike: boolean,
  nameTokens: string[],
  birthToken: string
): number {
  const phone = normalizeSearchToken(p.dienthoai || '');
  const name = normalizeSearchToken(p.ten || '');
  const birth = normalizeSearchToken(p.namsinh || '');
  let s = 0;
  if (isPhoneLike) {
    if (phone === t) s += 100;
    else if (phone.startsWith(t)) s += 60;
    else if (phone.includes(t)) s += 30;
  }
  if (name.startsWith(t)) s += 20;
  else if (name.includes(t)) s += 10;

  if (nameTokens.length > 0) {
    const matchedTokens = nameTokens.reduce(
      (count, token) => count + (name.includes(token) ? 1 : 0),
      0
    );
    s += matchedTokens * 8;
    if (matchedTokens === nameTokens.length) s += 20;
  }

  if (birthToken) {
    if (birth.includes(birthToken)) s += 18;
    if (
      nameTokens.length > 0 &&
      nameTokens.every((token) => name.includes(token)) &&
      birth.includes(birthToken)
    ) {
      s += 30;
    }
  }
  return s;
}

/** Sắp xếp kết quả: ưu tiên SĐT khớp chính xác → tiền tố SĐT → khớp tên */
export function rankResults(items: PatientResult[], term: string): PatientResult[] {
  const raw = term.trim();
  if (!raw) return items;
  const t = normalizeSearchToken(raw);
  const isPhoneLike = /^\d{2,}$/.test(t);
  const birthYearMatch = raw.match(/\b(19\d{2}|20\d{2})\b/);
  const birthToken = birthYearMatch?.[1] ? normalizeSearchToken(birthYearMatch[1]) : '';
  const nameOnly = normalizeSearchToken(raw.replace(/\b(19\d{2}|20\d{2})\b/g, ' '));
  const nameTokens = nameOnly.split(' ').filter(Boolean);
  return [...items].sort(
    (a, b) =>
      scoreItem(b, t, isPhoneLike, nameTokens, birthToken) -
      scoreItem(a, t, isPhoneLike, nameTokens, birthToken)
  );
}
