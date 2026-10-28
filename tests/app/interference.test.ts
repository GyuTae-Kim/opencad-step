import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/index';
import { findInterference, trianglesCross, triRanges, type InterferenceMesh } from '../../src/app/interference';
import { sampleStepBytes } from '../../src/app/sample';
import { cube, cylinder, sphere, StepText } from '../stepText';

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

/** 축 나란한 상자 그물(바깥 법선 감기, inward면 거꾸로 — 빈 곳 껍질), 닫힌 입체 */
function box(lo: V3, hi: V3, inward = false): { positions: number[]; indices: number[] } {
  const P: number[] = [];
  for (let i = 0; i < 8; i++) P.push(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  // 면마다 두 삼각형(바깥에서 보아 반시계)
  const q = [
    [0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5],
  ];
  const I: number[] = [];
  for (const [a, b, c, d] of q) I.push(...(inward ? [a!, c!, b!, a!, d!, c!] : [a!, b!, c!, a!, c!, d!]));
  return { positions: P, indices: I };
}
const mesh = (id: string, parts: { positions: number[]; indices: number[] }[], closed = true): InterferenceMesh => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const base = positions.length / 3;
    positions.push(...p.positions);
    indices.push(...p.indices.map((i) => i + base));
  }
  return { id, positions: new Float32Array(positions), indices: new Uint32Array(indices), ...(closed ? { closed: true } : {}) };
};
const summary = (ms: InterferenceMesh[]) => findInterference(ms).pairs.map((p) => `${p.a}${p.inside ? ' in ' : ' x '}${p.b}`);

describe('간섭 검사: 한 부품이 다른 부품 안에 통째로 든 경우', () => {
  const big = mesh('big', [box([0, 0, 0], [100, 60, 40])]);

  it('상자 안의 작은 상자는 "안에 듦"(앞이 안쪽), 안쪽 벽에 맞닿아 들어도 안에 듦, 겉면을 뚫으면 예전처럼 교차', () => {
    expect(summary([big, mesh('small', [box([10, 10, 10], [20, 20, 20])])])).toEqual(['small in big']);
    // 차례를 바꿔도 앞이 안쪽
    expect(summary([mesh('small', [box([10, 10, 10], [20, 20, 20])]), big])).toEqual(['small in big']);
    // 바닥 벽에 맞닿아(z = 0) 안에 든 상자 — 맞닿은 면 위 점은 쓰지 않는다
    expect(summary([big, mesh('flush', [box([30, 0, 0], [40, 60, 40])])])).toEqual(['flush in big']);
    const cross = findInterference([big, mesh('cross', [box([90, 10, 10], [110, 20, 20])])]).pairs;
    expect(cross).toHaveLength(1);
    expect(cross[0]!.inside).toBeUndefined();
    expect(cross[0]!.count).toBeGreaterThan(0);
  });

  it('밖에서 맞닿기만 한 상자, 떨어진 상자, 상자가 들어도 입체 밖(오목한 곳)인 부품은 간섭이 아니다', () => {
    expect(summary([big, mesh('touch', [box([100, 0, 0], [120, 60, 40])])])).toEqual([]);
    expect(summary([big, mesh('far', [box([200, 0, 0], [220, 10, 10])])])).toEqual([]);
    // ㄷ자(바닥과 두 벽) 안쪽 빈 곳에 든 상자: 범위 상자는 들지만 입체 밖
    const u = mesh('u', [box([0, 0, 0], [100, 60, 10]), box([0, 0, 10], [10, 60, 40]), box([90, 0, 10], [100, 60, 40])]);
    expect(summary([u, mesh('in-u', [box([40, 20, 20], [60, 40, 30])])])).toEqual([]);
  });

  it('빈 곳(BREP_WITH_VOIDS — 안쪽 껍질은 거꾸로 감김) 안에 든 부품은 안에 들지 않음, 입체 살 속이면 안에 듦', () => {
    const hollow = mesh('hollow', [box([0, 0, 0], [100, 100, 100]), box([20, 20, 20], [80, 80, 80], true)]);
    expect(summary([hollow, mesh('in-void', [box([40, 40, 40], [60, 60, 60])])])).toEqual([]);
    expect(summary([hollow, mesh('in-wall', [box([2, 2, 2], [10, 10, 10])])])).toEqual(['in-wall in hollow']);
  });

  it('같은 자리에 겹쳐 놓인 같은 부품은 안에 듦 한 쌍, 열린 면(닫히지 않은 그물)은 건너뛴다, 감기가 거꾸로인 안쪽 입체도', () => {
    expect(summary([mesh('one', [box([0, 0, 0], [10, 10, 10])]), mesh('two', [box([0, 0, 0], [10, 10, 10])])])).toHaveLength(1);
    expect(summary([big, mesh('open', [box([10, 10, 10], [20, 20, 20])], false)])).toEqual([]);
    expect(summary([mesh('open-big', [box([0, 0, 0], [100, 60, 40])], false), mesh('small', [box([10, 10, 10], [20, 20, 20])])])).toEqual([]);
    expect(summary([big, mesh('rev', [box([10, 10, 10], [20, 20, 20], true)])])).toEqual(['rev in big']);
  });

  it('STEP 조립: 상자 안의 원기둥·구(곡면 삼각형, 자리 변환)는 안에 듦, 상자 밖 구는 아님', () => {
    const w = new StepText();
    const ctx = w.context();
    const box40 = w.product('box', [cube(w, 40).solid], ctx);
    const pin = w.product('pin', [cylinder(w, 3, 10)], ctx);
    const ball = w.product('ball', [sphere(w, 4)], ctx);
    const g = [w.ax2([0, 0, 0]), w.ax2([20, 20, 5]), w.ax2([10, 30, 30]), w.ax2([80, 0, 0])];
    const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
    w.place(root, box40, g[0]!, 'box-1');
    w.place(root, pin, g[1]!, 'pin-1');
    w.place(root, ball, g[2]!, 'ball-1');
    w.place(root, ball, g[3]!, 'ball-2');
    const s = stepToScene(w.bytes());
    expect(s.meshes.every((m) => m.closed)).toBe(true);
    const name = new Map(s.meshes.map((m) => [m.id, m.group]));
    const r = findInterference(s.meshes);
    expect(r.pairs.map((p) => `${name.get(p.a)}${p.inside ? ' in ' : ' x '}${name.get(p.b)}`).sort()).toEqual(['ball in box', 'pin in box']);
  });
});
