export function calcPatientAge(namsinh: string): number {
  if (!namsinh) return 0;
  const now = new Date();
  if (/^\d{4}$/.test(namsinh)) return now.getFullYear() - parseInt(namsinh, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinh)) {
    const [d, m, y] = namsinh.split('/').map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return 0;
}
