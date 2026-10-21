import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/index';
import { findInterference, trianglesCross, triRanges } from '../../src/app/interference';
import { sampleStepBytes } from '../../src/app/sample';
import { cube, StepText } from '../stepText';

type V3 = [number, number, number];

describe('간섭 검사', () => {
  it('삼각형 교차: 뚫고 지나가면 참, 맞닿거나(같은 평면·모서리) 떨어지면 거짓', () => {
    const a: [V3, V3, V3] = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
    ];
    expect(trianglesCross(a, [[0.5, 0.5, -1], [0.5, 0.5, 1], [1, 0.2, 0]], 1e-9)).toBe(true);
    expect(trianglesCross(a, [[0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 0]], 1e-9)).toBe(false);
    expect(trianglesCross(a, [[0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 1]], 1e-9)).toBe(false);
    expect(trianglesCross(a, [[5, 5, -1], [5, 5, 1], [6, 5, 0]], 1e-9)).toBe(false);
  });

  it('겹친 두 정육면체는 간섭, 예제(맞닿은 블록·구멍을 지나는 핀)는 간섭 없음', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('a', [cube(w, 10, [0, 0, 0], 'a').solid], ctx);
    const w2 = new StepText();
    const ctx2 = w2.context();
    const a = w2.product('a', [cube(w2, 10).solid], ctx2);
    const b = w2.product('b', [cube(w2, 10).solid], ctx2);
    const g1 = w2.ax2([0, 0, 0]);
    const g2 = w2.ax2([5, 5, 5]);
    const g3 = w2.ax2([10, 0, 0]);
    const root = w2.product('asm', [g1, g2, g3], ctx2, 'SHAPE_REPRESENTATION');
    w2.place(root, a, g1, 'a1');
    w2.place(root, b, g2, 'b1');
    w2.place(root, a, g3, 'a2');
    const s = stepToScene(w2.bytes());
    const r = findInterference(s.meshes);
    // a1 ↔ b1, b1 ↔ a2 는 뚫고, a1 ↔ a2는 맞닿기만(x = 10 면)
    const key = (x: string, y: string) => [x, y].sort().join('|');
    const [m0, m1, m2] = s.meshes.map((m) => m.id);
    expect(r.pairs.map((p) => key(p.a, p.b)).sort()).toEqual([key(m0!, m1!), key(m1!, m2!)].sort());
    expect(r.pairs.every((p) => p.trisA.length > 0 && p.trisB.length > 0)).toBe(true);
    const sample = stepToScene(sampleStepBytes());
    expect(findInterference(sample.meshes).pairs).toEqual([]);
    expect(stepToScene(w.bytes()).meshes).toHaveLength(1);
  });

  it('삼각형 번호 → 이어진 구간', () => {
    expect(triRanges([1, 2, 3, 7, 9, 10])).toEqual([
      { start: 1, count: 3 },
      { start: 7, count: 1 },
      { start: 9, count: 2 },
    ]);
  });
});
