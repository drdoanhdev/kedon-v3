import { describe, expect, it } from 'vitest';
import { dot, emaCentroid, normalize } from './faceSmartLearning';

describe('faceSmartLearning math', () => {
  it('normalize tạo vector đơn vị', () => {
    const v = normalize([3, 4]);
    const norm = Math.sqrt(dot(v, v));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('emaCentroid vẫn là vector đơn vị', () => {
    const a = normalize([1, 0, 0]);
    const b = normalize([0, 1, 0]);
    const blended = emaCentroid(a, b, 0.5);
    const norm = Math.sqrt(dot(blended, blended));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('dot của vector giống nhau ≈ 1', () => {
    const v = normalize([0.2, 0.5, 0.8]);
    expect(dot(v, v)).toBeCloseTo(1, 5);
  });
});
