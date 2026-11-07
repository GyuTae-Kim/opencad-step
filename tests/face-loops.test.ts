/**
 * 표본 전체 질 조사(60차)에서 찾은 평면 면 삼각화 빈틈의 시험(합성 자료).
 * - 폭 0 다리 고리: 고리가 한 변을 갔다 반대로 돌아와 두 영역을 잇는 면(이웃 모서리 끝점을 T자 메우기로 넣은 뒤 같은 두 점을 반대로 지나는
 *   고리 변 짝이 생긴다) — earcut이 겹친 삼각형을 내 넓이가 두 배쯤 되던 것 → 다리를 떼어 따로 삼각화
 * - 엇갈린 고리: 구멍 고리가 바깥 원에 아주 가까워 원을 나눈 현이 구멍 꼭짓점 안쪽을 지나면 구멍이 메워지던 것 → 엇갈린 곡선 모서리를 더 잘게
 */
import { describe, expect, it } from 'vitest';
import { stepToScene, type StepMeta } from '../src/index';
import { splitBridges, triangulateRobust } from '../src/tessellate';
import { StepText, type P3 } from './stepText';

/** 평면 xy 점 목록 → 삼각형 넓이 합(|넓이|) */
function triArea(xy: number[], t: number[]): number {
  let a = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [p, q, r] = [t[i]!, t[i + 1]!, t[i + 2]!];
    a += Math.abs((xy[q * 2]! - xy[p * 2]!) * (xy[r * 2 + 1]! - xy[p * 2 + 1]!) - (xy[r * 2]! - xy[p * 2]!) * (xy[q * 2 + 1]! - xy[p * 2 + 1]!)) / 2;
  }
  return a;
}

/** 그물 삼각형 넓이 합(3D) */
function meshArea(P: ArrayLike<number>, I: ArrayLike<number>): number {
  let a = 0;
  for (let t = 0; t < I.length; t += 3) {
    const i = I[t]! * 3, j = I[t + 1]! * 3, k = I[t + 2]! * 3;
    const ux = P[j]! - P[i]!, uy = P[j + 1]! - P[i + 1]!, uz = P[j + 2]! - P[i + 2]!;
    const wx = P[k]! - P[i]!, wy = P[k + 1]! - P[i + 1]!, wz = P[k + 2]! - P[i + 2]!;
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a;
}

describe('폭 0 다리 고리(60차)', () => {
  // 위(z 2.1~6)·아래(z −6~−2.1) 두 직사각형을 오른쪽 변(x=1)의 다리로 이은 고리. 긴 변 (1,6)→(1,−6) 위에 (1,2.1)·(1,−2.1)이 들어가 있다
  const slit: [number, number][] = [[1, 2.1], [0, 2.1], [0, 6], [1, 6], [1, 2.1], [1, -2.1], [1, -6], [0, -6], [0, -2.1], [1, -2.1]];

  it('splitBridges: 같은 두 점을 반대로 지나는 변 짝에서 고리를 둘로 나누고, 다리가 없으면 null', () => {
    const xy = slit.flat();
    const rs = splitBridges(xy, [[0, slit.length]]);
    expect(rs).not.toBeNull();
    expect(rs!.map((r) => r.length).sort()).toEqual([4, 4]);
    // 나뉜 두 고리는 위·아래 직사각형(같은 자리의 두 점 가운데 하나만)
    const ys = rs!.map((r) => r.map((i) => xy[i * 2 + 1]!).sort((a, b) => a - b));
    expect(ys).toContainEqual([2.1, 2.1, 6, 6]);
    expect(ys).toContainEqual([-6, -6, -2.1, -2.1]);
    expect(splitBridges([0, 0, 1, 0, 1, 1, 0, 1], [[0, 4]])).toBeNull();
  });

  it('splitBridges: 갔다 바로 돌아오는 가시는 가시 끝만 빠지고, 구멍이 바깥 고리에 변으로 닿으면 두 고리를 하나로 잇는다', () => {
    // 정사각형 윗변 가운데에서 위로 솟은 가시 (2,4)→(2,5)→(2,4)
    const spike = [0, 0, 4, 0, 4, 4, 2, 4, 2, 5, 2, 4, 0, 4];
    const a = splitBridges(spike, [[0, 7]])!;
    expect(a).toHaveLength(1);
    expect(a[0]!.map((i) => `${spike[i * 2]},${spike[i * 2 + 1]}`)).not.toContain('2,5');
    // 바깥 정사각형(반시계)의 아랫변 (1,0)→(3,0)과 구멍(시계)의 아랫변 (3,0)→(1,0)이 겹친다
    const xy = [0, 0, 1, 0, 3, 0, 4, 0, 4, 4, 0, 4, 1, 0, 1, 2, 3, 2, 3, 0];
    const m = splitBridges(xy, [[0, 6], [6, 10]])!;
    expect(m).toHaveLength(1);
    expect(m[0]).toHaveLength(8);
  });

  it('triangulateRobust: 다리 고리의 넓이가 두 영역 넓이 합(7.8)이고 삼각형이 겹치지 않는다', () => {
    const xy = slit.flat();
    const t = triangulateRobust(xy, [], slit.length);
    expect(triArea(xy, t)).toBeCloseTo(7.8, 9);
    // 열쇠 구멍 꼴(바깥 → 다리 → 안쪽 구멍)은 earcut이 이미 맞게 하므로 그대로
    const key = [0, 0, 10, 0, 10, 10, 0, 10, 0, 5, 3, 5, 3, 7, 7, 7, 7, 3, 3, 3, 3, 5, 0, 5];
    expect(triArea(key, triangulateRobust(key, [], 12))).toBeCloseTo(84, 9);
  });

  it('STEP 평면 면: 긴 모서리 위에 같은 고리의 꼭짓점이 놓인 다리 고리도 두 직사각형만 그린다', () => {
    const w = new StepText();
    const ctx = w.context();
    const P = (x: number, y: number): P3 => [x, y, 0];
    const pts = { B2: P(1, 2.1), A2: P(0, 2.1), A6: P(0, 6), B6: P(1, 6), Bm6: P(1, -6), Am6: P(0, -6), Am2: P(0, -2.1), Bm2: P(1, -2.1) };
    const v = Object.fromEntries(Object.entries(pts).map(([k, p]) => [k, w.vertex(p)])) as Record<keyof typeof pts, number>;
    const order: (keyof typeof pts)[] = ['B2', 'A2', 'A6', 'B6', 'Bm6', 'Am6', 'Am2', 'Bm2'];
    const oes = order.map((k, i) => {
      const n = order[(i + 1) % order.length]!;
      return w.oe(w.edge(v[k], v[n], w.line(pts[k], pts[n])), true);
    });
    const face = w.face([w.bound(w.loop(oes))], w.plane([0, 0, 0]));
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('slit', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes(), { chordTolerance: 0.01 });
    const meta = s.meta as unknown as StepMeta;
    expect(meta.stats.failedFaces).toBe(0);
    expect(meshArea(s.meshes[0]!.positions, s.meshes[0]!.indices!)).toBeCloseTo(7.8, 6);
    expect(meta.faceTables![0]!.area![0]).toBeCloseTo(7.8, 6);
  });
});

describe('엇갈린 고리(60차)', () => {
  /** 반지름 10 원판에서 꼭짓점이 반지름 r인 정사각형 구멍을 뺀 평면 면 */
  function disk(r: number) {
    const w = new StepText();
    const ctx = w.context();
    const vc = w.vertex([10, 0, 0]);
    const outer = w.bound(w.loop([w.oe(w.edge(vc, vc, w.circle([0, 0, 0], 10)), true)]));
    // 구멍은 시계 방향(45° → 315° → 225° → 135°)
    const c = [45, 315, 225, 135].map((d): P3 => [r * Math.cos((d * Math.PI) / 180), r * Math.sin((d * Math.PI) / 180), 0]);
    const vs = c.map((p) => w.vertex(p));
    const hole = w.bound(w.loop(c.map((p, i) => w.oe(w.edge(vs[i]!, vs[(i + 1) % 4]!, w.line(p, c[(i + 1) % 4]!)), true))), false);
    const face = w.face([outer, hole], w.plane([0, 0, 0]));
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('disk', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    return stepToScene(w.bytes(), { chordTolerance: 0.5 });
  }

  it('구멍 꼭짓점이 원을 나눈 현 밖(반지름 9.99 — 20° 현의 처짐 0.15)이어도 원을 더 잘게 나눠 구멍을 뺀다', () => {
    const s = disk(9.99);
    const meta = s.meta as unknown as StepMeta;
    const m = s.meshes[0]!;
    const hole = 2 * 9.99 * 9.99;
    // B-rep 넓이(정확)와 삼각형 넓이가 현 높이 차 안에서 맞는다(구멍을 메우면 π·100 쪽)
    expect(meta.faceTables![0]!.area![0]).toBeCloseTo(Math.PI * 100 - hole, 6);
    expect(meshArea(m.positions, m.indices!)).toBeGreaterThan(Math.PI * 100 - hole - 0.5);
    expect(meshArea(m.positions, m.indices!)).toBeLessThan(Math.PI * 100 - hole);
    // 구멍 꼭짓점을 모두 쓴다
    const P = m.positions;
    const used = new Set<string>();
    for (const i of m.indices!) used.add(`${Math.round(P[i * 3]! * 1e3)},${Math.round(P[i * 3 + 1]! * 1e3)}`);
    const key = (d: number) => `${Math.round(9.99 * Math.cos((d * Math.PI) / 180) * 1e3)},${Math.round(9.99 * Math.sin((d * Math.PI) / 180) * 1e3)}`;
    expect([45, 135, 225, 315].filter((d) => !used.has(key(d)))).toEqual([]);
  });

  it('구멍 꼭짓점이 원 위에 닿으면(나눠도 풀리지 않는 엇갈림) 원을 더 나누지 않는다(예전 나눔 그대로)', () => {
    const m = disk(10).meshes[0]!;
    expect(m.positions.length / 3).toBeLessThanOrEqual(22);
  });

  it('구멍이 원에서 넉넉히 떨어지면(반지름 8) 예전처럼 한 번에 그린다(원 나눔 그대로)', () => {
    const m = disk(8).meshes[0]!;
    // 원 18토막(20°) + 구멍 4점 — 다시 나누지 않았다. 넓이는 정18각형 − 구멍
    expect(m.positions.length / 3).toBe(22);
    expect(meshArea(m.positions, m.indices!)).toBeCloseTo(9 * 100 * Math.sin(Math.PI / 9) - 2 * 64, 4);
  });
});
