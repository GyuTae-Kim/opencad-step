// 부품 사이 최소 거리 다듬기가 두 점이 놓인 B-rep 면을 찾는 facesNear(64차 — app/exactdist.ts): 코어 최소 거리 답의 삼각형 번호(indexA·indexB)를 주면
// 그 삼각형까지 거리보다 먼 삼각형을 거리 계산 없이 건너뛴다. 답(면 번호·차례)은 주지 않을 때(그물 전수)와 같아야 한다:
// - 합성 부품(정육면체·원기둥·민 원기둥·구·원환·구멍 난 판·B-스플라인 지붕)의 고른 삼각형에서 안쪽 점·세 모서리 가운데·세 꼭짓점·모서리 바로 옆 점(허용치 안·밖)
// - 이웃 면이 꼭짓점 자리를 함께 쓰지 않는 모서리(T자 이음)·열린 경계·꼭짓점 둘레가 닫혔는데 다른 몸체 면이 그 꼭짓점을 지날 때·먼 삼각형 번호
// - exactParts: 코어 답에 삼각형 번호가 실려도 같은 답
import { describe, expect, it } from 'vitest';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc } from '../../src/app/doc';
import { exactParts, facesNear, type ExactScene } from '../../src/app/exactdist';
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
