// 두 점 측정의 곡선–면 교차점 붙잡기(46차 — app/edgecross.ts): 고른 B-rep 모서리 곡선이 다른 부품의 면(평면·원기둥)을 뚫는 점을
// 앱 점(pointsFor — kind 'intersection')으로 준다.
// 장면: 20×10×2 판(구멍), 판을 뚫고 선 핀(반지름 1.5, (5, 5), z −1~3), 핀 위쪽을 가로지르는 가로 막대(반지름 0.5, x축, y 5.8·z 2.6),
// 판 윗면에 30° 기울어 꽂힌 원판(반지름 3, 두께 0.5 — 아랫면 원의 중심이 판 윗면 위), 판 아랫면을 뚫은 말뚝(1 × 1 × 1, z −0.5~0.5),
// 막대 아래쪽을 파고든 기둥(0.6 × 0.6 × 0.6, z 2.05~2.65).
// - 핀 윗면 원(z 3)은 막대 옆면(원기둥)을 네 번 뚫는다 — 곡선과 곡면(식으로 잰 값과 1e-9 안)
// - 원판 두 원은 판 윗면(평면)을 두 번씩 뚫는다 — 곡선과 평면
// - 말뚝 세로 모서리는 판 아랫면(평면)을, 기둥 세로 모서리는 막대 옆면(원기둥)을 한 번씩 뚫는다 — 곧은 모서리
// - 모서리를 품은 이웃 면, 모서리 끝 꼭짓점에서 만나는 면, 닿지 않는 면은 없다. 기존 붙잡기 점(끝점·가운데·중심) 뒤에 붙고 그 차례는 그대로
// (원기둥 이음선은 윤곽선이 아니라 모서리로 고를 수 없다)
import { describe, expect, it } from 'vitest';
import type { Mesh3d, Pick3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc } from '../../src/app/doc';
import { crossingsOf, CROSS_TRIS, type CrossStats } from '../../src/app/edgecross';
import { curveSnap } from '../../src/app/curvesnap';
import { edgeDetails } from '../../src/app/edges';
import { edgeSnapPoints, measureSnapOptions } from '../../src/app/snap';
import { cube, cylinder, plateWithHole, StepText, type P3 } from '../stepText';
import { crossStep, LINE_A, LINE_B } from './crossscene';

type V3 = [number, number, number];
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const T = (30 * Math.PI) / 180;

function scene() {
  const w = new StepText();
  const ctx = w.context();
  const parts: [string, (w: StepText) => number, P3, P3][] = [
    ['plate', (w) => plateWithHole(w), [0, 0, 0], [0, 0, 1]],
    ['pin', (w) => cylinder(w, 1.5, 4, 'pin'), [5, 5, -1], [0, 0, 1]],
    ['rod', (w) => cylinder(w, 0.5, 12, 'rod'), [0, 5.8, 2.6], [1, 0, 0]],
    ['disk', (w) => cylinder(w, 3, 0.5, 'disk'), [15, 5, 2], [Math.sin(T), 0, Math.cos(T)]],
    ['peg', (w) => cube(w, 1, [0, 0, 0], 'peg').solid, [2, 1, -0.5], [0, 0, 1]],
    ['post', (w) => cube(w, 0.6, [0, 0, 0], 'post').solid, [8, 5.5, 2.05], [0, 0, 1]],
  ];
  const g = parts.map(([, , o, z]) => {
    const x: P3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
    return w.ax2(o, z, [x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
  });
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  const bytes = w.bytes();
  const { scene } = stepToSceneDeferred(bytes);
  const d = createDoc('cross.stp', bytes.length, { scene, ms: 0 } as never);
  const meshOf = (name: string): Mesh3d => {
    let id: string | undefined;
    const walk = (n: (typeof d.products)[number]) => {
      if (n.name === name && n.meshIds.length) id ??= n.meshIds[0];
      n.children.forEach(walk);
    };
    d.products.forEach(walk);
    return scene.meshes.find((m) => m.id === id)!;
  };
  return { scene, ex: d.edges!, fx: d.faces!, meshOf };
}

const S = scene();

/** 그물의 모서리(종류와 조건) → 번호 */
function edgeOf(mesh: Mesh3d, kind: string, test: (d: NonNullable<ReturnType<typeof edgeDetails>>) => boolean): number {
  const t = S.ex.tables[S.ex.tableOf.get(mesh.id)!]!;
  for (let e = 0; e < t.kinds.length; e++) {
    const d = edgeDetails(mesh, t, e, S.ex.kinds);
    if (d && d.kind === kind && test(d)) return e;
  }
  throw new Error(`no ${kind} edge`);
}

function crossings(mesh: Mesh3d, e: number) {
  const st: CrossStats = { tris: 0, tests: 0, hits: 0, points: 0, truncated: false, pending: false, faces: [] };
  const t = S.ex.tables[S.ex.tableOf.get(mesh.id)!]!;
  const pts = crossingsOf(mesh, t, e, S.scene.meshes, S.ex, S.fx, null, undefined, st);
  return { pts, st };
}

/** 찾은 점들이 기대한 점들과 하나씩 tol 안인지(차례 상관없이) */
function expectSame(got: readonly { point: readonly number[] }[], want: V3[], tol: number) {
  expect(got.length, JSON.stringify(got.map((g) => g.point))).toBe(want.length);
  for (const q of want) expect(Math.min(...got.map((g) => dist(g.point, q))), JSON.stringify(q)).toBeLessThan(tol);
}

describe('곡선–면 교차점 붙잡기(46차)', () => {
  const pin = S.meshOf('pin');
  const rod = S.meshOf('rod');
  const disk = S.meshOf('disk');
  const plate = S.meshOf('plate');

  it('핀 윗면 원(z 3)이 막대 옆면(원기둥)을 뚫는 네 점 — 곡선과 곡면, 식으로 잰 값과 1e-9 안', () => {
    const e = edgeOf(pin, 'circle', (d) => Math.abs(d.center![2] - 3) < 1e-6);
    const { pts, st } = crossings(pin, e);
    // 막대 면: (y − 5.8)² + (z − 2.6)² = 0.25, z = 3 → y = 5.5·6.1, 원 (x − 5)² + (y − 5)² = 2.25
    const want: V3[] = [];
    for (const y of [5.5, 6.1]) for (const s of [-1, 1]) want.push([5 + s * Math.sqrt(2.25 - (y - 5) ** 2), y, 3]);
    expectSame(pts, want, 1e-9);
    expect(pts.every((p) => p.kind === 'intersection' && p.id === rod.id)).toBe(true);
    expect(st.truncated).toBe(false);
  });

  it('기운 원판의 두 원이 판 윗면(평면)을 뚫는 점 — 곡선과 평면', () => {
    const ax: V3 = [Math.sin(T), 0, Math.cos(T)];
    const u: V3 = [Math.cos(T), 0, -Math.sin(T)];
    for (const h of [0, 0.5]) {
      const c: V3 = [15 + ax[0] * h, 5, 2 + ax[2] * h];
      const e = edgeOf(disk, 'circle', (d) => dist(d.center!, c) < 1e-6);
      // 원 c + 3(cos θ u + sin θ ŷ)이 z = 2: cos θ = (c_z − 2) / (3 sin 30°)
      const cs = (c[2] - 2) / (3 * Math.sin(T));
      const sn = Math.sqrt(1 - cs * cs);
      const want: V3[] = [-1, 1].map((s) => [c[0] + 3 * cs * u[0], 5 + s * 3 * sn, 2]);
      const { pts } = crossings(disk, e);
      expectSame(pts, want, 1e-9);
      expect(pts.every((p) => p.id === plate.id)).toBe(true);
    }
  });

  it('곧은 모서리: 말뚝 세로 모서리는 판 아랫면(평면), 기둥 세로 모서리는 막대 옆면(원기둥)을 뚫는다 — 가로 모서리는 뚫지 않는다', () => {
    const peg = S.meshOf('peg');
    const post = S.meshOf('post');
    const vertical = (d: NonNullable<ReturnType<typeof edgeDetails>>) => Math.abs(d.ends[0][2] - d.ends[1][2]) > 0.1;
    const pt = S.ex.tables[S.ex.tableOf.get(peg.id)!]!;
    const qt = S.ex.tables[S.ex.tableOf.get(post.id)!]!;
    const got = { peg: [] as number[][], post: [] as number[][] };
    for (const [m, t, key] of [
      [peg, pt, 'peg'],
      [post, qt, 'post'],
    ] as const)
      for (let e = 0; e < t.kinds.length; e++) {
        const d = edgeDetails(m, t, e, S.ex.kinds)!;
        const { pts } = crossings(m, e);
        if (!vertical(d)) expect(pts, `${key} ${e}`).toEqual([]);
        else {
          expect(pts, `${key} ${e}`).toHaveLength(1);
          got[key].push([...pts[0]!.point]);
          // 그 모서리 위(x·y는 모서리 그대로)
          expect(Math.hypot(pts[0]!.point[0]! - d.ends[0][0], pts[0]!.point[1]! - d.ends[0][1])).toBeLessThan(1e-6);
        }
      }
    // 말뚝: z = 0(판 아랫면), 기둥: 막대 (y − 5.8)² + (z − 2.6)² = 0.25에서 y = 5.5·6.1 → z = 2.2
    expect(got.peg).toHaveLength(4);
    for (const p of got.peg) expect(Math.abs(p[2]!)).toBeLessThan(1e-9);
    expect(got.post).toHaveLength(4);
    for (const p of got.post) expect(Math.abs(p[2]! - 2.2)).toBeLessThan(1e-6);
  });

  it('뚫지 않는 모서리는 없다: 핀 아랫면 원(판 밑), 막대 끝 원, 판 구멍 원·바깥 모서리(이웃 면·끝 꼭짓점에서 만나는 면은 빼고)', () => {
    expect(crossings(pin, edgeOf(pin, 'circle', (d) => Math.abs(d.center![2] + 1) < 1e-6)).pts).toEqual([]);
    for (const x of [0, 12]) expect(crossings(rod, edgeOf(rod, 'circle', (d) => Math.abs(d.center![0] - x) < 1e-6)).pts).toEqual([]);
    const t = S.ex.tables[S.ex.tableOf.get(plate.id)!]!;
    for (let e = 0; e < t.kinds.length; e++) expect(crossings(plate, e).pts, `plate edge ${e}`).toEqual([]);
  });

  it('pointsFor: 기존 점(끝점·가운데 점·중심) 차례 그대로 뒤에 교차점이 붙고, 곡선 붙잡기가 없으면 예전 그대로', () => {
    const t = S.ex.tables[S.ex.tableOf.get(pin.id)!]!;
    const e = edgeOf(pin, 'circle', (d) => Math.abs(d.center![2] - 3) < 1e-6);
    const pick: Pick3d = { kind: 'edge', id: pin.id, index: t.segStart[e]!, raw: t.segStart[e]!, point: [0, 0, 0] };
    const curve = curveSnap(S.scene.meshes, S.ex, S.fx, null);
    const before = edgeSnapPoints(pick, S.scene.meshes, S.ex, null)!;
    const after = edgeSnapPoints(pick, S.scene.meshes, S.ex, curve)!;
    // 한 바퀴 원: 중심 하나 + 교차점 넷
    expect(before.map((p) => p.kind)).toEqual(['center']);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map((p) => p.kind)).toEqual(['intersection', 'intersection', 'intersection', 'intersection']);
    // measureSnapOptions의 pointsFor도 같은 점(같은 모서리는 기억)
    const opts = measureSnapOptions(S.scene.meshes, S.ex, [], curve);
    expect(opts.pointsFor!(pick)).toEqual(after);
  });

  it('면의 경계 위에서 뚫는 점은 두 모서리의 교차점이라 빼고(코어 교차점이 맡는다), 경계 밖 면 안쪽만 — 43차 교차 장면', () => {
    const bytes = crossStep();
    const { scene } = stepToSceneDeferred(bytes);
    const d = createDoc('c.stp', bytes.length, { scene, ms: 0 } as never);
    const ex = d.edges!;
    const fx = d.faces!;
    const of = (m: Mesh3d) => ex.tables[ex.tableOf.get(m.id)!]!;
    const all = (m: Mesh3d) => {
      const t = of(m);
      return Array.from({ length: t.kinds.length }, (_, e) => ({ d: edgeDetails(m, t, e, ex.kinds)!, pts: crossingsOf(m, t, e, scene.meshes, ex, fx, null) }));
    };
    const byName = (name: string) => {
      let id: string | undefined;
      const walk = (n: (typeof d.products)[number]) => {
        if (n.name === name && n.meshIds.length) id ??= n.meshIds[0];
        n.children.forEach(walk);
      };
      d.products.forEach(walk);
      return scene.meshes.find((m) => m.id === id)!;
    };
    // 삼각 판: 빗변은 원기둥 윗면을 테두리 원 위 (6, −8, 20)에서 지난다(빼고), 아랫변 C → A(z = 10)는 옆면을 (6, −8, 10)에서 뚫는다
    const tri = all(byName('cross-line'));
    const has = (x: (typeof tri)[number], p: readonly number[]) => dist(x.d.ends[0], p) < 1e-6 || dist(x.d.ends[1], p) < 1e-6;
    const hyp = tri.find((x) => has(x, LINE_A) && has(x, LINE_B))!;
    expect(hyp.pts).toEqual([]);
    const ca = tri.find((x) => Math.abs(x.d.ends[0][2] - 10) < 1e-6 && Math.abs(x.d.ends[1][2] - 10) < 1e-6)!;
    expectSame(ca.pts, [[6, -8, 10]], 1e-9);
    // 세로 원판(테두리 원 위에서 닿기만)과 B-스플라인(테두리 원 위에서 지남)은 없고, B-스플라인 판 아랫변(z = 13)은 옆면을 (0, −10, 13)에서 뚫는다
    for (const x of all(byName('cross-ring'))) expect(x.pts).toEqual([]);
    const spl = all(byName('cross-spline'));
    expect(spl.find((x) => x.d.kind === 'bspline')!.pts).toEqual([]);
    const q = spl.find((x) => Math.abs(x.d.ends[0][2] - 13) < 1e-6 && Math.abs(x.d.ends[1][2] - 13) < 1e-6)!;
    expectSame(q.pts, [[0, -10, 13]], 1e-9);
  });

  it('일 예산: 삼각형 한도를 넘으면 그 뒤는 보지 않는다(같은 모서리면 늘 같은 답)', () => {
    expect(CROSS_TRIS).toBeGreaterThan(1000);
    const e = edgeOf(pin, 'circle', (d) => Math.abs(d.center![2] - 3) < 1e-6);
    const a = crossings(pin, e);
    const b = crossings(pin, e);
    expect(b.pts).toEqual(a.pts);
    expect(a.st.tris).toBeLessThanOrEqual(CROSS_TRIS);
  });
});
