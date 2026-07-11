import { describe, expect, it } from 'vitest';
import {
  FACE_EMBEDDING_DIM,
  MIN_CHECKIN_CONFIDENCE,
  validateFaceEmbedding,
} from './faceRecognition';

function makeEmbedding(dim = FACE_EMBEDDING_DIM): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(i * 0.1));
}

describe('validateFaceEmbedding', () => {
  it('chấp nhận vector 512 chiều hợp lệ', () => {
    expect(validateFaceEmbedding(makeEmbedding())).toBeNull();
  });

  it('từ chối sai chiều', () => {
    const err = validateFaceEmbedding(makeEmbedding(128));
    expect(err).toMatch(/512/);
  });

  it('từ chối NaN', () => {
    const emb = makeEmbedding();
    emb[10] = NaN;
    expect(validateFaceEmbedding(emb)).toMatch(/không hợp lệ/);
  });

  it('từ chối không phải mảng', () => {
    expect(validateFaceEmbedding('bad')).toMatch(/mảng/);
  });
});

describe('MIN_CHECKIN_CONFIDENCE', () => {
  it('đồng bộ với match_threshold agent (0.5)', () => {
    expect(MIN_CHECKIN_CONFIDENCE).toBe(0.5);
  });
});
