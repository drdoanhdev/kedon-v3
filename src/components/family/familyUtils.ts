import type { FamilyGroup, FamilyRole } from './types';

export const ROLE_LABELS: Record<NonNullable<FamilyRole>, string> = {
  father: 'Bố',
  mother: 'Mẹ',
  child: 'Con',
  spouse: 'Vợ/Chồng',
  other: 'Khác',
};

export const ROLE_OPTIONS: { value: FamilyRole; label: string }[] = [
  { value: null, label: '— Bỏ trống —' },
  { value: 'father', label: 'Bố' },
  { value: 'mother', label: 'Mẹ' },
  { value: 'child', label: 'Con' },
  { value: 'spouse', label: 'Vợ/Chồng' },
  { value: 'other', label: 'Khác' },
];

export function calcAge(namsinh?: string | null): string {
  if (!namsinh) return '';
  const m = String(namsinh).match(/(\d{4})/);
  if (!m) return '';
  const year = parseInt(m[1], 10);
  const now = new Date().getFullYear();
  if (year > 1900 && year <= now) return `${now - year} tuổi`;
  return '';
}

export function formatRole(role: FamilyRole): string {
  if (!role) return '';
  return ROLE_LABELS[role] || '';
}

export function buildFamilySummaryText(
  family: FamilyGroup | null,
  currentPatientId: number | null,
): string {
  if (!family?.members?.length) return '';

  const others = family.members
    .filter((m) => m.benhnhan_id !== currentPatientId)
    .map((m) => {
      const name = m.patient?.ten;
      if (!name) return null;
      const role = formatRole(m.role);
      return role ? `${name} (${role})` : name;
    })
    .filter(Boolean) as string[];

  if (others.length > 0) return others.join(', ');
  return family.name ? `Nhóm: ${family.name}` : '';
}

export function buildFamilyChipLabel(
  family: FamilyGroup | null,
  currentPatientId: number | null,
): { primary: string; secondary?: string } {
  if (!family?.members?.length) {
    return { primary: 'Chưa có nhóm gia đình · Thêm' };
  }

  const count = family.members.length;
  const summary = buildFamilySummaryText(family, currentPatientId);
  const primary = count > 1 ? `${count} người` : family.name;

  if (summary.startsWith('Nhóm:')) {
    return { primary: summary.replace('Nhóm: ', ''), secondary: `${count} người` };
  }

  return {
    primary: primary,
    secondary: summary || undefined,
  };
}

export function sortFamilyMembers<T extends { is_primary: boolean; created_at: string }>(
  members: T[],
): T[] {
  return [...members].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
}
