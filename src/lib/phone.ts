export function digitsOnly(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

export function toDialNumber(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('84')) return `+${digits}`;
  return digits;
}

export function toZaloNumber(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  if (digits.startsWith('84')) return digits;
  return digits;
}

export function openZaloDeepLink(zaloNumber: string) {
  window.open(`https://zalo.me/${zaloNumber}`, '_blank', 'noopener,noreferrer');
}
