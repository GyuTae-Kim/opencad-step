// 부품 사이 최소 거리 다듬기가 두 점이 놓인 B-rep 면을 찾는 facesNear(64차 — app/exactdist.ts): 코어 최소 거리 답의 삼각형 번호(indexA·indexB)를 주면
// 그 삼각형까지 거리보다 먼 삼각형을 거리 계산 없이 건너뛴다. 답(면 번호·차례)은 주지 않을 때(그물 전수)와 같아야 한다:
// - 합성 부품(정육면체·원기둥·민 원기둥·구·원환·구멍 난 판·B-스플라인 지붕)의 고른 삼각형에서 안쪽 점·세 모서리 가운데·세 꼭짓점·모서리 바로 옆 점(허용치 안·밖)
// - 이웃 면이 꼭짓점 자리를 함께 쓰지 않는 모서리(T자 이음)·열린 경계·꼭짓점 둘레가 닫혔는데 다른 몸체 면이 그 꼭짓점을 지날 때·먼 삼각형 번호
// - exactParts: 코어 답에 삼각형 번호가 실려도 같은 답
// 68차: 코어 0.55.0 점 둘레 삼각형 묻기(trianglesNear — 같은 셈의 순수 primsWithin, 실제 뷰어)를 주면 그물을 훑지 않고 그 답만 본다 — 번호가 있을 때·없을 때 모두 그물 전수와 같은 답.
// 앱은 EntClosest가 부품 사이 답에 그 묻기를 실어(near) 다듬기에 넘긴다
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, primsWithin, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc } from '../../src/app/doc';
import { EntClosest, pickedPoint } from '../../src/app/entpick';
import { entRefine, exactParts, facesNear, type ExactScene, type PartsClosest, type TrianglesNear } from '../../src/app/exactdist';
import { installDom } from './fakeview';
import { packFaceSurfaces, reviveFaceSurfaces } from '../../src/facesurf';
import { cube, cylinder, plateWithHole, sphere, StepText, torus, type P3 } from '../stepText';
import { extrudedCylinder, roofBlock } from './facescene';

type V3 = [number, number, number];

function assembly(parts: [string, (w: StepText) => number, P3][]) {
  const w = new StepText();
  const ctx = w.context();
  const g = parts.map(([, , o]) => w.ax2(o, [0, 0, 1], [1, 0, 0]));
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  const bytes = w.bytes();
  const { scene, surfaces } = stepToSceneDeferred(bytes);
  const d = createDoc('synth.stp', bytes.length, { scene, ms: 0 } as never);
  const look = surfaces ? reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces)!)) : null;
  const s: ExactScene = { meshes: new Map(scene.meshes.map((m) => [m.id, m])), faces: d.faces, edges: d.edges, surfaces: look };
  return { scene, d, s };
}

/** 부품 통째 삼각형 모양(코어 closestPoints와 같은 계산 — exactdist 시험과 같다) */
function partShape(m: Mesh3d): ClosestShape {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const M = m.matrix;
  const w = (i: number): V3 => {
    const x = P[i * 3]! + o[0], y = P[i * 3 + 1]! + o[1], z = P[i * 3 + 2]! + o[2];
    return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  };
  const c0 = w(0);
  const pos = new Float32Array(P.length);
  for (let i = 0; i < P.length / 3; i++) {
    const q = w(i);
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = q[k]! - c0[k]!;
  }
  return { kind: 'triangle', positions: pos, indices: m.indices, bvh: buildBvh('triangle', pos, m.indices), model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, c0[0], c0[1], c0[2], 1] };
}

const vtx = (m: Mesh3d, t: number, k: number): V3 => {
  const i = m.indices ? m.indices[t * 3 + k]! : t * 3 + k;
  return [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
};
const mix = (a: V3, b: V3, s: number): V3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];

describe('facesNear 삼각형 번호 길 = 그물 전수(64차)', () => {
  it('합성 부품 일곱(삼각형을 고르게 120개씩): 안쪽·모서리 가운데·꼭짓점·모서리 바로 옆 점에서 면 번호·차례가 같다', () => {
    const c = assembly([
      ['box', (w) => cube(w, 10).solid, [0, 0, 0]],
      ['cyl', (w) => cylinder(w, 3, 8), [20, 0, 0]],
      ['ext', (w) => extrudedCylinder(w, 2, 6), [40, 0, 0]],
      ['sph', (w) => sphere(w, 4), [60, 0, 0]],
      ['tor', (w) => torus(w, 5, 1.5), [80, 0, 0]],
      ['plate', (w) => plateWithHole(w), [100, 0, 0]],
      ['roof', (w) => roofBlock(w, 10, 8), [130, 0, 0]],
    ]);
    const fx = c.d.faces!;
    let points = 0;
    let multi = 0;
    for (const m of c.scene.meshes) {
      const table = fx.tables[fx.tableOf.get(m.id)!]!;
      const tris = m.indices ? m.indices.length / 3 : m.positions.length / 9;
      // 전수 길이 삼각형마다 그물을 다 훑어(점 × 삼각형) 고르게 120개만
      const step = Math.max(1, Math.floor(tris / 120));
      for (let t = 0; t < tris; t += step) {
        const [a, b, e] = [vtx(m, t, 0), vtx(m, t, 1), vtx(m, t, 2)];
        const mid: V3 = [(a[0] + b[0] + e[0]) / 3, (a[1] + b[1] + e[1]) / 3, (a[2] + b[2] + e[2]) / 3];
        const pts: V3[] = [mid, a, b, e, mix(a, b, 0.5), mix(b, e, 0.5), mix(e, a, 0.5), mix(a, b, 0.31), mix(mix(a, b, 0.5), mid, 1e-7), mix(mix(b, e, 0.5), mid, 1e-4)];
        for (const p of pts) {
          const all = facesNear(m, table, p);
          expect(facesNear(m, table, p, t), `${m.name} t${t} ${p}`).toEqual(all);
          points++;
          if (all.length > 1) multi++;
        }
      }
    }
    // 시험이 헛돌지 않게: 모서리·꼭짓점 위 점(면이 둘 이상)이 많다
    expect(points).toBeGreaterThan(5000);
    expect(multi).toBeGreaterThan(500);
  });

  it('이웃 면이 꼭짓점 자리를 함께 쓰지 않는 모서리(T자 이음)와 열린 경계: 같은 답', () => {
    // 면 0: 아래 정사각형을 가운데 꼭짓점(1, 0)으로 나눈 두 삼각형 띠, 면 1: 위 정사각형 — 맞닿은 모서리 y=0을 꼭짓점 (1, 0) 없이 한 변으로
    const P = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, -1, 0, 2, -1, 0, 0, 0, 0, 2, 0, 0, 1, 1, 0]);
    const I = new Uint32Array([3, 1, 0, 3, 4, 1, 4, 2, 1, 5, 6, 7]);
    const m = { id: 'tj', positions: P, indices: I, color: [1, 1, 1, 1] } as Mesh3d;
    const table = { triStart: new Uint32Array([0, 3, 4]) };
    for (const [p, t] of [
      [[0.5, 0, 0], 0],
      [[1.5, 0, 0], 2],
      [[0.5, 0, 0], 3],
      [[1, 0, 0], 3],
      [[0.5, -0.5, 0], 1],
      [[1, 0.5, 0], 3],
    ] as [V3, number][])
      expect(facesNear(m, table, p, t), `${p} t${t}`).toEqual(facesNear(m, table, p));
    expect(facesNear(m, table, [0.5, 0, 0], 0)).toEqual([0, 1]);
    // 면 0의 가운데 꼭짓점 (1, 0)은 면 1의 변 한가운데: 면 0 삼각형만 그 자리를 쓰지만 면 1도 그 점을 지난다
    for (const t of [0, 1, 2]) expect(facesNear(m, table, [1, 0, 0], t), `mid t${t}`).toEqual([0, 1]);
    // 열린 경계(면 1의 바깥 변): 이웃이 없으니 그 면 하나
    expect(facesNear(m, table, [1.5, 0.5, 0], 3)).toEqual([1]);
    // 면 표 밖 삼각형·먼 삼각형 번호·잘못된 번호도 그물 전수와 같은 답
    expect(facesNear(m, { triStart: new Uint32Array([0, 3]) }, [1, 0.5, 0], 3)).toEqual(facesNear(m, { triStart: new Uint32Array([0, 3]) }, [1, 0.5, 0]));
    expect(facesNear(m, table, [0.5, -0.5, 0], 3)).toEqual([0]);
    expect(facesNear(m, table, [0.5, -0.5, 0], 99)).toEqual([0]);
  });

  it('꼭짓점 둘레 삼각형이 닫혔는데 같은 그물의 다른 몸체 면이 그 꼭짓점을 지날 때(맞닿은 몸체): 그 면도 같은 차례로', () => {
    // 면 0: 큰 바닥 삼각형 하나(z=0). 면 1~4: 바닥 위 사면체(아래 꼭짓점 (1, 1, 0)이 바닥 삼각형 한가운데에 닿는다 — 바닥은 그 자리 꼭짓점이 없다).
    // 사면체 꼭짓점 둘레 세 삼각형은 닫혀 있어 같은 자리 꼭짓점만 따라가면 바닥 면을 놓친다(실제 표본 꼭짓점 하나에서 앞 판이 놓친 꼴)
    const P = new Float32Array([-4, -4, 0, 8, -4, 0, -4, 8, 0, 1, 1, 0, 2, 1, 1, 1, 2, 1, 0.5, 0.5, 1]);
    const I = new Uint32Array([0, 1, 2, 3, 4, 5, 3, 5, 6, 3, 6, 4, 4, 6, 5]);
    const m = { id: 'touch', positions: P, indices: I, color: [1, 1, 1, 1] } as Mesh3d;
    const table = { triStart: new Uint32Array([0, 1, 2, 3, 4, 5]) };
    const all = facesNear(m, table, [1, 1, 0]);
    expect(all).toEqual([0, 1, 2, 3]);
    for (const t of [0, 1, 2, 3, 4]) expect(facesNear(m, table, [1, 1, 0], t), `t${t}`).toEqual(all);
    // 옆면 안쪽 점은 그 면 하나
    expect(facesNear(m, table, [4 / 3, 4 / 3, 2 / 3], 1)).toEqual(facesNear(m, table, [4 / 3, 4 / 3, 2 / 3]));
    expect(facesNear(m, table, [4 / 3, 4 / 3, 2 / 3], 1)).toEqual([1]);
  });

  it('exactParts: 코어 답에 두 점의 삼각형 번호가 실려도(64차) 다듬은 답이 같다', () => {
    const c = assembly([
      ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
      ['x2', (w) => extrudedCylinder(w, 2, 10), [7, 0.3, 0]],
    ]);
    const [ma, mb] = c.scene.meshes as [Mesh3d, Mesh3d];
    // 코어 최소 거리(삼각형 번호 rawA·rawB — 그물은 indexA·indexB와 같다)
    const q = closestBetween(partShape(ma), partShape(mb), { indices: true })!;
    expect(q.rawA).toBeGreaterThanOrEqual(0);
    const r = { a: q.a, b: q.b, distance: q.distance };
    const plain = exactParts(ma.id, mb.id, r, c.s, 30, 1000);
    const withTri = exactParts(ma.id, mb.id, { ...r, indexA: q.rawA, indexB: q.rawB }, c.s, 30, 1000);
    expect(plain).not.toBeNull();
    expect(withTri).toEqual(plain);
  });
});

describe('facesNear 코어 점 둘레 묻기(68차 — 코어 0.55.0 trianglesNear)', () => {
  /** 그물 BVH 묻기: 뷰어 trianglesNear(local·hidden)와 같은 셈(순수 primsWithin — 그물 자기 좌표, 숨김 없음). 부른 수·받은 삼각형 수를 센다 */
  const asker = (meshes: readonly Mesh3d[]) => {
    const shapes = new Map(meshes.map((m) => [m.id, { kind: 'triangle' as const, positions: m.positions, indices: m.indices, bvh: buildBvh('triangle', m.positions, m.indices) }]));
    const stat = { calls: 0, got: 0 };
    const near: TrianglesNear = (id, p, r) => {
      const s = shapes.get(id);
      if (!s) return null;
      stat.calls++;
      const got = primsWithin(s, p, r);
      stat.got += got.length;
      return got;
    };
    return { near, stat };
  };

  it('합성 부품 일곱: 삼각형 번호가 있을 때·없을 때 모두 그물 전수와 같은 면 번호·차례 — 묻기는 점마다 한두 번, 받은 삼각형은 그물보다 훨씬 적다', () => {
    const c = assembly([
      ['box', (w) => cube(w, 10).solid, [0, 0, 0]],
      ['cyl', (w) => cylinder(w, 3, 8), [20, 0, 0]],
      ['ext', (w) => extrudedCylinder(w, 2, 6), [40, 0, 0]],
      ['sph', (w) => sphere(w, 4), [60, 0, 0]],
      ['tor', (w) => torus(w, 5, 1.5), [80, 0, 0]],
      ['plate', (w) => plateWithHole(w), [100, 0, 0]],
      ['roof', (w) => roofBlock(w, 10, 8), [130, 0, 0]],
    ]);
    const fx = c.d.faces!;
    const { near, stat } = asker(c.scene.meshes);
    let points = 0;
    let multi = 0;
    let tris0 = 0;
    for (const m of c.scene.meshes) {
      const table = fx.tables[fx.tableOf.get(m.id)!]!;
      const tris = m.indices ? m.indices.length / 3 : m.positions.length / 9;
      tris0 = Math.max(tris0, tris);
      const step = Math.max(1, Math.floor(tris / 120));
      for (let t = 0; t < tris; t += step) {
        const [a, b, e] = [vtx(m, t, 0), vtx(m, t, 1), vtx(m, t, 2)];
        const mid: V3 = [(a[0] + b[0] + e[0]) / 3, (a[1] + b[1] + e[1]) / 3, (a[2] + b[2] + e[2]) / 3];
        const pts: V3[] = [mid, a, b, e, mix(a, b, 0.5), mix(b, e, 0.5), mix(e, a, 0.5), mix(a, b, 0.31), mix(mix(a, b, 0.5), mid, 1e-7), mix(mix(b, e, 0.5), mid, 1e-4)];
        for (const p of pts) {
          const all = facesNear(m, table, p);
          const c0 = stat.calls;
          expect(facesNear(m, table, p, t, near), `${m.name} t${t} ${p}`).toEqual(all);
          expect(stat.calls - c0).toBe(1);
          const c1 = stat.calls;
          expect(facesNear(m, table, p, undefined, near), `${m.name} 번호 없음 ${p}`).toEqual(all);
          expect(stat.calls - c1).toBeGreaterThanOrEqual(1);
          expect(stat.calls - c1).toBeLessThanOrEqual(2);
          points++;
          if (all.length > 1) multi++;
        }
      }
    }
    expect(points).toBeGreaterThan(5000);
    expect(multi).toBeGreaterThan(500);
    // 점마다 받은 삼각형은 한 자리 수 남짓(모서리·꼭짓점 둘레) — 가장 큰 그물 삼각형 수보다 훨씬 적다
    expect(stat.got / stat.calls).toBeLessThan(20);
    expect(tris0).toBeGreaterThan(500);
  });

  it('T자 이음·맞닿은 몸체·먼 번호도 같은 답, 묻기가 null·tri 없는 답·빈 답이면 예전 길(상자 비교·그물 전수)', () => {
    const P = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, -1, 0, 2, -1, 0, 0, 0, 0, 2, 0, 0, 1, 1, 0]);
    const I = new Uint32Array([3, 1, 0, 3, 4, 1, 4, 2, 1, 5, 6, 7]);
    const tj = { id: 'tj', positions: P, indices: I, color: [1, 1, 1, 1] } as Mesh3d;
    const tjTable = { triStart: new Uint32Array([0, 3, 4]) };
    const P2 = new Float32Array([-4, -4, 0, 8, -4, 0, -4, 8, 0, 1, 1, 0, 2, 1, 1, 1, 2, 1, 0.5, 0.5, 1]);
    const I2 = new Uint32Array([0, 1, 2, 3, 4, 5, 3, 5, 6, 3, 6, 4, 4, 6, 5]);
    const touch = { id: 'touch', positions: P2, indices: I2, color: [1, 1, 1, 1] } as Mesh3d;
    const touchTable = { triStart: new Uint32Array([0, 1, 2, 3, 4, 5]) };
    const { near } = asker([tj, touch]);
    for (const [m, table, p, t] of [
      [tj, tjTable, [0.5, 0, 0], 0],
      [tj, tjTable, [1, 0, 0], 3],
      [tj, tjTable, [1, 0, 0], 1],
      [tj, tjTable, [1.5, 0.5, 0], 3],
      [tj, tjTable, [0.5, -0.5, 0], 3],
      [touch, touchTable, [1, 1, 0], 0],
      [touch, touchTable, [1, 1, 0], 2],
      [touch, touchTable, [4 / 3, 4 / 3, 2 / 3], 1],
    ] as [Mesh3d, { triStart: Uint32Array }, V3, number][]) {
      const all = facesNear(m, table, p);
      expect(facesNear(m, table, p, t, near), `${m.id} ${p} t${t}`).toEqual(all);
      expect(facesNear(m, table, p, undefined, near), `${m.id} ${p}`).toEqual(all);
    }
    expect(facesNear(tj, tjTable, [1, 0, 0], 0, near)).toEqual([0, 1]);
    expect(facesNear(touch, touchTable, [1, 1, 0], 4, near)).toEqual([0, 1, 2, 3]);
    // 묻기가 그물을 모르면(null)·빈 답: 상자 비교·그물 전수로 같은 답. 번호 길은 받은 답에 tri가 없으면(다른 그물을 물은 답) 상자 비교로
    for (const bad of [() => null, () => []] as TrianglesNear[]) {
      expect(facesNear(tj, tjTable, [1, 0, 0], 1, bad)).toEqual([0, 1]);
      expect(facesNear(tj, tjTable, [1, 0, 0], undefined, bad)).toEqual([0, 1]);
    }
    expect(facesNear(tj, tjTable, [1, 0, 0], 1, () => [3])).toEqual([0, 1]);
  });

  describe('실제 뷰어(가짜 WebGL)', () => {
    let dom: ReturnType<typeof installDom>;
    beforeAll(() => {
      dom = installDom();
    });
    afterAll(() => dom.restore());

    it('자리 변환이 있는 부품과 숨긴 구간: 뷰어 trianglesNear(그물 좌표·숨김 포함)로 면 찾기가 그물 전수와 같고, EntClosest가 부품 사이 답에 실은 묻기로 다듬은 답도 같다', async () => {
      const c = assembly([
        ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
        ['x2', (w) => extrudedCylinder(w, 2, 10), [7, 0.3, 0]],
      ]);
      const [ma, mb] = c.scene.meshes as [Mesh3d, Mesh3d];
      expect(mb.matrix ?? mb.origin).toBeTruthy();
      const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
      v.setScene(c.scene);
      const fx = c.d.faces!;
      // 둘째 부품 앞 삼각형 절반을 숨긴다(숨긴 면 위 점도 그 면을 찾아야 그물 전수와 같다)
      const tb = mb.indices!.length / 3;
      v.setHiddenRanges(mb.id, [{ start: 0, count: Math.floor(tb / 2) }]);
      const near: TrianglesNear = (id, q, r) => v.trianglesNear(id, q, r, { local: true, hidden: true });
      for (const m of [ma, mb]) {
        const table = fx.tables[fx.tableOf.get(m.id)!]!;
        const tris = m.indices!.length / 3;
        for (let t = 0; t < tris; t += 3) {
          const [a, b, e] = [vtx(m, t, 0), vtx(m, t, 1), vtx(m, t, 2)];
          for (const p of [a, mix(a, b, 0.5), [(a[0] + b[0] + e[0]) / 3, (a[1] + b[1] + e[1]) / 3, (a[2] + b[2] + e[2]) / 3] as V3]) {
            const all = facesNear(m, table, p);
            expect(facesNear(m, table, p, t, near), `${m.id} t${t}`).toEqual(all);
            expect(facesNear(m, table, p, undefined, near), `${m.id} t${t} 번호 없음`).toEqual(all);
          }
        }
      }
      // 앱 길: EntClosest(부품 사이 — 번호와 묻기를 실은 답) → entRefine refineParts = 묻기 없는 exactParts
      const spy = vi.spyOn(v, 'trianglesNear');
      const E = new EntClosest();
      const A = pickedPoint(ma.id, [0, 0, 0]);
      const B = { ...pickedPoint(mb.id, [7, 0.3, 0]), entity: null };
      const key = {};
      const later = vi.fn();
      expect(E.get(key, A, B, v, (id) => c.scene.meshes.find((m) => m.id === id), later)).toBeNull();
      await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
      const r = E.get(key, A, B, v, (id) => c.scene.meshes.find((m) => m.id === id), later)!.parts!(ma.id, mb.id) as PartsClosest;
      const { near: carried, ...q } = r;
      expect(q).toEqual(v.closestPoints(ma.id, mb.id, { indices: true }));
      spy.mockClear();
      const p0 = vtx(ma, 0, 0);
      const got = carried!(ma.id, p0, 0.5);
      expect(spy.mock.calls).toEqual([[ma.id, p0, 0.5, { local: true, hidden: true }]]);
      expect(got).toEqual(v.trianglesNear(ma.id, p0, 0.5, { local: true, hidden: true }));
      expect(got!.length).toBeGreaterThan(0);
      spy.mockClear();
      const plain = exactParts(ma.id, mb.id, q, c.s, 30, 1000);
      expect(plain).not.toBeNull();
      const app = { ent: {}, scene: c.scene, faces: c.d.faces, edges: c.d.edges };
      expect(entRefine(app, 30, c.s.surfaces, () => undefined).refineParts(ma.id, mb.id, r)).toEqual(plain);
      // 두 점마다 한 번(번호 길)
      expect(spy).toHaveBeenCalledTimes(2);
      // 묻기를 주지 않는 뷰어(예전 시험 흉내)면 답에 싣지 않는다
      const E2 = new EntClosest();
      const later2 = vi.fn();
      const bare = { closestPointsAsync: v.closestPointsAsync.bind(v) };
      E2.get(key, A, B, bare, (id) => c.scene.meshes.find((m) => m.id === id), later2);
      await vi.waitFor(() => expect(later2).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
      expect(E2.get(key, A, B, bare, (id) => c.scene.meshes.find((m) => m.id === id), later2)!.parts!(ma.id, mb.id)).toEqual(q);
      v.dispose();
    });
  });
});
