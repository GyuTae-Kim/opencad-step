/**
 * 실제 파일 훑기(7차)에서 찾은 삼각화 빈틈과 느림의 시험(합성 자료).
 * - 가는 띠 평면: 곡선 모서리 둘이 현 높이 안에서 나란히 가 경계가 스스로 엇갈리면 earcut이 엇갈린 자리의 고리 점을 빼
 *   이웃 면과 틈이 생기던 것 → 고리 점을 하나도 빼지 않는 귀 자르기(clipAll)로 다시
 * - 아주 세밀한 품질에서 다듬기 되풀이가 모든 모서리·삼각형의 곡면 점을 다시 구하던 것 → 모서리 해시(EdgeHash)와 판정 기억
 */
import { describe, expect, it } from 'vitest';
import { stepToScene, type StepMeta } from '../src/index';
import { clipAll, EdgeHash, triangulateRobust } from '../src/tessellate';
import { StepText, type P3 } from './stepText';

/** 고리(차례대로 이은 점 번호)의 선분 가운데 삼각형이 정확히 한 번 쓰지 않은 것 + 고리에 없는데 한 번만 쓰인 모서리 */
function boundaryMismatch(tris: number[], rings: number[][]): { missing: number; stray: number } {
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const cnt = new Map<string, number>();
  for (let t = 0; t < tris.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const k = key(tris[t + e]!, tris[t + ((e + 1) % 3)]!);
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
  const ring = new Set<string>();
  for (const rg of rings) for (let i = 0; i < rg.length; i++) ring.add(key(rg[i]!, rg[(i + 1) % rg.length]!));
  let missing = 0;
  for (const k of ring) if (cnt.get(k) !== 1) missing++;
  let stray = 0;
  for (const [k, c] of cnt) if (c === 1 && !ring.has(k)) stray++;
  return { missing, stray };
}

/** 가는 띠: 반지름 10 원호를 현 세 토막(성긴 쪽 — 현 높이 0.05)으로, 돌아오는 길은 반지름 9.99 원호를 촘촘히 — 성긴 현이 촘촘한 선을 넘는다 */
function sliver(): { xy: number[]; n: number } {
  const xy: number[] = [];
  const th = 0.3;
  for (let i = 0; i <= 3; i++) {
    const a = -th + (2 * th * i) / 3;
    xy.push(10 * Math.cos(a), 10 * Math.sin(a));
  }
  for (let i = 39; i >= 1; i--) {
    const a = -th + (2 * th * i) / 40;
    xy.push(9.99 * Math.cos(a), 9.99 * Math.sin(a));
  }
  return { xy, n: xy.length / 2 };
}

describe('경계가 스스로 엇갈리는 가는 띠 면', () => {
  it('clipAll은 고리 점을 하나도 빼지 않고 모든 경계 선분을 꼭 한 번 쓴다(삼각형 n − 2개)', () => {
    const { xy, n } = sliver();
    const t = clipAll(xy, [], n);
    expect(t.length / 3).toBe(n - 2);
    expect(new Set(t).size).toBe(n);
    expect(boundaryMismatch(t, [Array.from({ length: n }, (_, i) => i)])).toEqual({ missing: 0, stray: 0 });
  });

  it('triangulateRobust: earcut이 엇갈린 자리의 점을 빼면 귀 자르기로 다시 해 경계가 그대로 남는다', () => {
    const { xy, n } = sliver();
    const t = triangulateRobust(xy, [], n);
    expect(boundaryMismatch(t, [Array.from({ length: n }, (_, i) => i)])).toEqual({ missing: 0, stray: 0 });
  });

  it('clipAll: 구멍은 가장 가까운 바깥 점과 다리로 이어 단순한 다각형이면 넓이도 맞는다', () => {
    // 바깥 정사각형(반시계)과 구멍(시계)
    const xy = [0, 0, 10, 0, 10, 10, 0, 10, 3, 3, 3, 7, 7, 7, 7, 3];
    const t = clipAll(xy, [4], 8);
    expect(t.length / 3).toBe(8);
    let area = 0;
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, c] = [t[i]!, t[i + 1]!, t[i + 2]!];
      area += ((xy[b * 2]! - xy[a * 2]!) * (xy[c * 2 + 1]! - xy[a * 2 + 1]!) - (xy[c * 2]! - xy[a * 2]!) * (xy[b * 2 + 1]! - xy[a * 2 + 1]!)) / 2;
    }
    expect(area).toBeCloseTo(100 - 16, 9);
    expect(boundaryMismatch(t, [[0, 1, 2, 3], [4, 5, 6, 7]])).toEqual({ missing: 0, stray: 0 });
  });

  it('STEP: 원호와 그 안쪽을 촘촘히 따라가는 다각선 사이 가는 평면 면도 경계 점을 모두 써서 모서리 선과 삼각형 경계가 같다', () => {
    const w = new StepText();
    const ctx = w.context();
    const th = 0.3;
    const at = (rad: number, a: number): P3 => [rad * Math.cos(a), rad * Math.sin(a), 0];
    const A = w.vertex(at(10, -th));
    const B = w.vertex(at(10, th));
    const arc = w.edge(A, B, w.circle([0, 0, 0], 10));
    const pts = [at(10, th)];
    for (let i = 39; i >= 1; i--) pts.push(at(9.99, -th + (2 * th * i) / 40));
    pts.push(at(10, -th));
    const poly = w.add('POLYLINE', `'',(${pts.map((p) => `#${w.pt(p)}`).join(',')})`);
    const back = w.edge(B, A, poly);
    const face = w.face([w.bound(w.loop([w.oe(arc, true), w.oe(back, true)]))], w.plane([0, 0, 0]));
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('sliver', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes(), { chordTolerance: 0.05 });
    expect((s.meta as unknown as StepMeta).stats.failedFaces).toBe(0);
    const m = s.meshes[0]!;
    // 모서리 선(B-rep 모서리 다각선)의 선분과 삼각형이 한 번만 쓰는 모서리(그물의 경계)가 같아야 이웃 면과 틈이 없다
    const P = m.positions;
    const I = m.indices!;
    const k3 = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const seg = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const cnt = new Map<string, number>();
    for (let t = 0; t < I.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const i = I[t + e]! * 3;
        const j = I[t + ((e + 1) % 3)]! * 3;
        const k = seg(k3(P[i]!, P[i + 1]!, P[i + 2]!), k3(P[j]!, P[j + 1]!, P[j + 2]!));
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
    const boundary = new Set([...cnt].filter(([, c]) => c === 1).map(([k]) => k));
    const E = m.edges!;
    const edges = new Set<string>();
    for (let i = 0; i < E.length; i += 6) edges.add(seg(k3(E[i]!, E[i + 1]!, E[i + 2]!), k3(E[i + 3]!, E[i + 4]!, E[i + 5]!)));
    expect(edges.size).toBeGreaterThan(40);
    expect(boundary).toEqual(edges);
  });
});

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
