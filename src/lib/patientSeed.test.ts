import { describe, expect, it } from 'vitest';
import { parsePatientSeed } from './patientSeed';

describe('parsePatientSeed', () => {
  it('parses name, year and phone from a typical seed string', () => {
    const seed = parsePatientSeed('Nguyen Van A 1990 0912345678 Hung Yen');
    expect(seed.ten).toMatch(/Nguyen/i);
    expect(seed.namsinh).toBe('1990');
    expect(seed.dienthoai).toContain('912345678');
    expect(seed.diachi).toMatch(/Hung/i);
  });

  it('does not treat short digit runs in address as phone when name+phone pattern exists', () => {
    const seed = parsePatientSeed('Tran Thi B 0987654321 So 12 Duong ABC');
    expect(seed.dienthoai).toMatch(/987654321/);
    expect(seed.ten.length).toBeGreaterThan(0);
  });

  it('returns empty fields for blank input', () => {
    expect(parsePatientSeed('   ')).toEqual({
      ten: '',
      namsinh: '',
      dienthoai: '',
      diachi: '',
    });
  });
});
