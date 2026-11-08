function normalizeNameLike(text: string): string {
  return text
    .replace(/[\s,;._-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const first = word.charAt(0);
      const rest = word.slice(1);
      return `${first.toLocaleUpperCase('vi-VN')}${rest.toLocaleLowerCase('vi-VN')}`;
    })
    .join(' ');
}

export function parsePatientSeed(raw: string): {
  ten: string;
  namsinh: string;
  dienthoai: string;
  diachi: string;
} {
  const input = raw.trim();
  if (!input) return { ten: '', namsinh: '', dienthoai: '', diachi: '' };

  const normalizedInput = input.replace(/[\s,;]+/g, ' ').trim();
  const splitDob = (text: string) => {
    const fullDateMatch = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/);
    if (fullDateMatch && fullDateMatch.index !== undefined) {
      const idx = fullDateMatch.index;
      const token = fullDateMatch[0];
      return {
        dob: fullDateMatch[1].replace(/-/g, '/'),
        before: text.slice(0, idx).trim(),
        after: text.slice(idx + token.length).trim(),
      };
    }

    const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch && yearMatch.index !== undefined) {
      const idx = yearMatch.index;
      const token = yearMatch[0];
      return {
        dob: yearMatch[1],
        before: text.slice(0, idx).trim(),
        after: text.slice(idx + token.length).trim(),
      };
    }

    return { dob: '', before: text.trim(), after: '' };
  };

  let namsinh = '';
  let diachi = '';
  let ten = '';
  let dienthoai = '';
  let phoneStart = -1;
  let phoneEnd = -1;

  const phoneCompactMatch = normalizedInput.match(/(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)/);
  if (phoneCompactMatch) {
    dienthoai = phoneCompactMatch[0].replace(/\D/g, '');
    phoneStart = phoneCompactMatch.index ?? -1;
    if (phoneStart >= 0) {
      phoneEnd = phoneStart + phoneCompactMatch[0].length;
    }
  } else {
    const fallbackMatch = [...normalizedInput.matchAll(/\d{6,}/g)]
      .sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0];
    if (fallbackMatch?.[0]) {
      dienthoai = fallbackMatch[0];
      phoneStart = fallbackMatch.index ?? -1;
      if (phoneStart >= 0) {
        phoneEnd = phoneStart + fallbackMatch[0].length;
      }
    }
  }

  if (phoneStart >= 0) {
    const beforePhone = normalizedInput.slice(0, phoneStart).trim();
    const afterPhone = normalizedInput.slice(phoneEnd).trim();
    const hasLettersBeforePhone = /[A-Za-zÀ-ỹ]/.test(beforePhone);

    if (hasLettersBeforePhone) {
      const leftParsed = splitDob(beforePhone);
      namsinh = leftParsed.dob;
      ten = normalizeNameLike(leftParsed.before);
      diachi = normalizeNameLike(`${leftParsed.after} ${afterPhone}`.trim());
    } else {
      const rightParsed = splitDob(afterPhone);
      namsinh = rightParsed.dob;
      ten = normalizeNameLike(rightParsed.before);
      diachi = normalizeNameLike(rightParsed.after);
    }
  } else {
    const parsed = splitDob(normalizedInput);
    namsinh = parsed.dob;
    ten = normalizeNameLike(parsed.before);
    diachi = normalizeNameLike(parsed.after);
  }

  return { ten, namsinh, dienthoai, diachi };
}
