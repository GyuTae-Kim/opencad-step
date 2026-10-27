/**
 * 아주 세밀한 품질에서 다듬기 되풀이가 모든 모서리·삼각형의 곡면 점을 다시 구하던 것 → 모서리 해시(EdgeHash)와 판정 기억
 */
import { describe, expect, it } from 'vitest';
import { EdgeHash } from '../src/tessellate';

describe('다듬기 모서리 해시(EdgeHash)', () => {
  it('무향 모서리마다 처음 넣은 차례대로 번호를 주고, 처음 자리보다 많이 넣어도 그대로 찾는다', () => {
    const h = new EdgeHash(4);
    const pairs: [number, number][] = [];
    for (let i = 0; i < 500; i++) pairs.push([(i * 7919) % 1013, (i * 104729) % 997 + 2000]);
    pairs.forEach(([a, b], i) => expect(h.add(a, b)).toBe(i));
    expect(h.size).toBe(500);
    pairs.forEach(([a, b], i) => {
      expect(h.find(b, a)).toBe(i);
      expect(h.add(b, a)).toBe(i);
      expect([h.lo[i], h.hi[i]]).toEqual([Math.min(a, b), Math.max(a, b)]);
    });
    expect(h.find(1, 1)).toBe(-1);
    expect(h.size).toBe(500);
  });
});
