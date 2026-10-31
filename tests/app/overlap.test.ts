/**
 * 간섭 쌍의 겹친 부피(src/app/overlap.ts — 광선 격자 표본)를 정확한 값과 견준다.
 * - 축 나란한 두 상자(겹친 몸이 겹친 상자 그 자체): 125 그대로(칸 가운데가 모두 그 안), 어림 오차 0
 * - Z축으로 45° 돌린 같은 정육면체와 겹친 몸(정팔각 기둥 — 넓이 s²(2√2 − 2)): 1e-3 안, 실제 오차가 어림 오차 안
 * - 같은 자리에 겹친 같은 원기둥·상자 안의 구·상자를 뚫는 원기둥: 그물 부피(삼각형으로 구한 정확한 값)와 견주고, 해석 값(πr²h 등)과는 그물 현 오차만큼
 * - 범위 상자가 떨어지면 0, 쌍 차례·시간 한도(overlapVolumes): 닫힌 쌍만, 한도를 넘기면 그 뒤 쌍은 시작하지 않는다
 */
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { findInterference } from '../../src/app/interference';
import { OverlapScratch, overlapVolume, overlapVolumes, type OverlapMesh } from '../../src/app/overlap';
import { cube, cylinder, sphere, StepText } from '../stepText';

type V3 = [number, number, number];

/** 그물의 세계 부피(삼각형 발산 정리 — 화면 그물 그대로의 정확한 값) */
function meshVolume(m: OverlapMesh): number {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const M = m.matrix;
  const at = (i: number): V3 => {
    const x = P[i * 3]! + o[0]!, y = P[i * 3 + 1]! + o[1]!, z = P[i * 3 + 2]! + o[2]!;
    return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  };
  const I = m.indices!;
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = at(I[t]!), b = at(I[t + 1]!), c = at(I[t + 2]!);
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return Math.abs(v / 6);
}

/** 조립 STEP: 부품(이름, 형상 항목을 만드는 함수)마다 자리(ax2 인자) */
function assembly(parts: [string, (w: StepText) => number, Parameters<StepText['ax2']>][]): Mesh3d[] {
  const w = new StepText();
  const ctx = w.context();
  const g = parts.map(([, , a]) => w.ax2(...a));
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  return stepToScene(w.bytes()).meshes;
}

const c45 = Math.SQRT1_2;

describe('간섭 쌍의 겹친 부피(광선 격자 표본)', () => {
  it('축 나란한 두 정육면체(한 변 10, (5, 5, 5) 비킴): 125 그대로, 어림 오차 0', () => {
    const [a, b] = assembly([
      ['a', (w) => cube(w, 10).solid, [[0, 0, 0]]],
      ['b', (w) => cube(w, 10).solid, [[5, 5, 5]]],
    ]);
    const r = overlapVolume(a!, b!);
    expect(Math.abs(r.volume - 125)).toBeLessThan(1e-9);
    expect(r.err).toBeLessThan(1e-9);
    expect(r.skipped).toBe(0);
    expect(r.rays).toBe(2 * 128 * 128);
    // 차례를 바꿔도 같다
    expect(overlapVolume(b!, a!).volume).toBeCloseTo(r.volume, 9);
  });

  it('Z축으로 45° 돌린 같은 정육면체와 겹친 정팔각 기둥: 100(2√2 − 2) × 10 = 828.43 — 1e-3 안, 실제 오차가 어림 오차 안', () => {
    const [a, b] = assembly([
      ['a', (w) => cube(w, 10, [-5, -5, -5]).solid, [[0, 0, 0]]],
      ['b', (w) => cube(w, 10, [-5, -5, -5]).solid, [[0, 0, 0], [0, 0, 1], [c45, c45, 0]]],
    ]);
    const exact = 100 * (2 * Math.SQRT2 - 2) * 10;
    const r = overlapVolume(a!, b!);
    expect(Math.abs(r.volume - exact) / exact).toBeLessThan(1e-3);
    expect(Math.abs(r.volume - exact)).toBeLessThanOrEqual(r.err + 1e-9);
    expect(r.err / exact).toBeLessThan(5e-3);
  });

  it('같은 자리에 겹친 같은 원기둥(반지름 3, 높이 10): 그물 부피와 1e-3 안(어림 오차 안), πr²h와는 그물 현 오차만큼', () => {
    const [a, b] = assembly([
      ['p', (w) => cylinder(w, 3, 10), [[1, 2, 3]]],
      ['p2', (w) => cylinder(w, 3, 10), [[1, 2, 3]]],
    ]);
    const mv = meshVolume(a!);
    const r = overlapVolume(a!, b!);
    expect(Math.abs(r.volume - mv) / mv).toBeLessThan(1e-3);
    expect(Math.abs(r.volume - mv)).toBeLessThanOrEqual(r.err + 1e-9);
    const exact = Math.PI * 9 * 10;
    // 그물(원을 나눈 다각형)은 원기둥보다 조금 작다 — 겹친 부피도 그만큼
    expect(mv).toBeLessThan(exact);
    expect((exact - r.volume) / exact).toBeLessThan(0.01);
  });

  it('상자 안의 구(안에 든 쌍)는 구 그물 부피, 상자를 뚫는 원기둥은 상자 안 몫(높이 비율)', () => {
    const [box, ball] = assembly([
      ['box', (w) => cube(w, 40).solid, [[0, 0, 0]]],
      ['ball', (w) => sphere(w, 4), [[10, 30, 30]]],
    ]);
    const pairs = findInterference([box!, ball!].map((m) => ({ ...m, closed: m.closed }))).pairs;
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.inside).toBe(true);
    const mv = meshVolume(ball!);
    const r = overlapVolume(box!, ball!);
    expect(Math.abs(r.volume - mv) / mv).toBeLessThan(2e-3);
    expect(Math.abs(r.volume - mv)).toBeLessThanOrEqual(r.err + 1e-9);
    expect(Math.abs(r.volume - (4 / 3) * Math.PI * 64) / ((4 / 3) * Math.PI * 64)).toBeLessThan(0.02);
    // 원기둥(반지름 2, 높이 30)을 z = −10에서 세워 상자(0~40) 바닥을 뚫는다: 상자 안 몫 = 그물 부피 × 20/30
    const [box2, pin] = assembly([
      ['box', (w) => cube(w, 40).solid, [[0, 0, 0]]],
      ['pin', (w) => cylinder(w, 2, 30), [[20, 20, -10]]],
    ]);
    const pv = meshVolume(pin!) * (20 / 30);
    const q = overlapVolume(box2!, pin!);
    expect(Math.abs(q.volume - pv) / pv).toBeLessThan(1e-3);
    expect(Math.abs(q.volume - pv)).toBeLessThanOrEqual(q.err + 1e-9);
  });

  it('범위 상자가 떨어지면 0, 광선 수(n)를 줄이면 오차가 커지고 어림 오차가 그것을 덮는다', () => {
    const [a, b] = assembly([
      ['a', (w) => cube(w, 10).solid, [[0, 0, 0]]],
      ['b', (w) => cube(w, 10).solid, [[20, 0, 0]]],
    ]);
    expect(overlapVolume(a!, b!)).toEqual({ volume: 0, err: 0, rays: 0, skipped: 0 });
    const [p, p2] = assembly([
      ['p', (w) => cylinder(w, 3, 10), [[0, 0, 0]]],
      ['p2', (w) => cylinder(w, 3, 10), [[0, 0, 0]]],
    ]);
    const mv = meshVolume(p!);
    const coarse = overlapVolume(p!, p2!, { n: 16 });
    const fine = overlapVolume(p!, p2!);
    expect(coarse.rays).toBeLessThan(fine.rays);
    expect(Math.abs(fine.volume - mv)).toBeLessThan(Math.abs(coarse.volume - mv) + 1e-12);
    expect(Math.abs(coarse.volume - mv)).toBeLessThanOrEqual(coarse.err + 1e-9);
  });

  it('광선 칸마다 삼각형을 담아도(32차) 칸 여럿을 한 통으로 묶은 31차(4×4)·한 통에 모두와 값이 비트까지 같다', () => {
    const scenes = [
      assembly([
        ['a', (w) => cube(w, 10, [-5, -5, -5]).solid, [[0, 0, 0]]],
        ['b', (w) => cube(w, 10, [-5, -5, -5]).solid, [[0, 0, 0], [0, 0, 1], [c45, c45, 0]]],
      ]),
      assembly([
        ['p', (w) => cylinder(w, 3, 10), [[1, 2, 3]]],
        ['p2', (w) => cylinder(w, 3, 10), [[1, 2, 3]]],
      ]),
      assembly([
        ['box', (w) => cube(w, 40).solid, [[0, 0, 0]]],
        ['ball', (w) => sphere(w, 4), [[10, 30, 30]]],
      ]),
      assembly([
        ['pin', (w) => cylinder(w, 2, 30), [[20, 20, -10], [0.3, 0.2, 1]]],
        ['ball', (w) => sphere(w, 9), [[21, 19, 12]]],
      ]),
    ];
    const fresh = scenes.map(([a, b]) => overlapVolume(a!, b!));
    for (const [i, [a, b]] of scenes.entries()) {
      const r = fresh[i]!;
      expect(r.volume).toBeGreaterThan(0);
      for (const binCells of [4, 3, 1000]) expect(overlapVolume(a!, b!, { binCells }), String(binCells)).toEqual(r);
      expect(overlapVolume(a!, b!, { n: 37, binCells: 4 })).toEqual(overlapVolume(a!, b!, { n: 37 }));
    }
    // 쌍 사이에 배열 자리를 다시 써도(큰 쌍 뒤 작은 쌍, 거꾸로) 같은 값
    const scratch = new OverlapScratch();
    for (const k of [3, 0, 2, 1, 3, 0]) expect(overlapVolume(scenes[k]![0]!, scenes[k]![1]!, { scratch }), String(k)).toEqual(fresh[k]);
  });

  it('overlapVolumes: 닫힌 입체 쌍만 쌍에 싣고, 시간 한도를 넘기면 그 뒤 쌍은 시작하지 않는다(값은 시간과 무관)', () => {
    const ms = assembly([
      ['a', (w) => cube(w, 10).solid, [[0, 0, 0]]],
      ['b', (w) => cube(w, 10).solid, [[5, 5, 5]]],
      ['c', (w) => cube(w, 10).solid, [[5, -3, 0]]],
    ]).map((m, i) => ({ ...m, id: `m${i}` }));
    const pairs = [
      { a: 'm0', b: 'm1' },
      { a: 'm0', b: 'm2' },
      { a: 'm1', b: 'm2' },
    ] as { a: string; b: string; volume?: number; volumeErr?: number }[];
    // 시계: 쌍 하나마다 3초씩 간다(한도 4초 — 둘째 쌍까지 시작)
    let t = 0;
    const progress: number[] = [];
    const r = overlapVolumes(ms, pairs, { now: () => (t += 1500), onProgress: (d) => progress.push(d) });
    expect(r.done).toBe(2);
    expect(r.left).toBe(1);
    // a(0~10)³ ∩ b(5~15)³ = 125, a ∩ c((5~15, −3~7, 0~10)) = 5 × 7 × 10
    expect(pairs[0]!.volume).toBeCloseTo(125, 9);
    expect(pairs[1]!.volume).toBeCloseTo(350, 9);
    expect(pairs[2]!.volume).toBeUndefined();
    expect(progress.at(-1)).toBe(2);
    // 시간이 넉넉하면 모두(b ∩ c = 10 × 2 × 5)
    const all = pairs.map((p) => ({ a: p.a, b: p.b })) as typeof pairs;
    expect(overlapVolumes(ms, all).left).toBe(0);
    expect(all[2]!.volume).toBeCloseTo(100, 9);
    // 열린 그물이 낀 쌍은 건너뛴다
    const open = [{ a: 'm0', b: 'm1' }] as typeof pairs;
    expect(overlapVolumes([ms[0]!, { ...ms[1]!, closed: false }], open)).toMatchObject({ done: 0, left: 0 });
    expect(open[0]!.volume).toBeUndefined();
  });
});
