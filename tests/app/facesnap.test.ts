/**
 * 축이 면을 뚫는 점을 B-rep 곡면 위로(app/facesnap.ts — 순수 계산)와 곡면 정의 보내기·되살리기(facesurf.ts).
 * - 원기둥·원뿔·구·원환: 면 표 식으로 답을 아는 직선과의 교점(1e-12), 코어 점에 가까운 근
 * - B-스플라인(쌍선형 z = u·v, 3차 지붕 z(x, y))·밀기·회전 곡면: (u, v, s) 뉴턴법, 배율·원점(그물 좌표 = (항목 − origin)·k)
 * - 잘린 면의 경계: 면 삼각형을 교점의 접평면에 펼쳐 그 안인지(경계 밖이면 null)
 * - 워커 → 화면: 구조화 복제 뒤 원형을 다시 붙인 곡면이 같은 점을 낸다
 */
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { analyticHit, insideFace, paramHit, refineFaceHit, type SnapFaceIndex } from '../../src/app/facesnap';
import { packFaceSurfaces, reviveFaceSurfaces } from '../../src/facesurf';
import { BSplineCurve, CircleCurve, LineCurve } from '../../src/curves';
import { NurbsCurve, NurbsSurface } from '../../src/nurbs';
import { BSplineSurface, ExtrusionSurface, RevolutionSurface } from '../../src/surfaces';
import { FACE_KINDS, type StepFaceTable, stepToSceneDeferred } from '../../src/scene';
import { stepFaceIndex } from '../../src/app/doc';
import { parseStepFile } from '../../src/app/job';
import type { SnapRefineFaceInput } from 'opencad-viewer3d';
import { cylinder, StepText } from '../stepText';
import { roofBlock, roofZ } from './facescene';

type V3 = [number, number, number];
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-12): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const unit = (v: readonly number[]): V3 => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const params = (r1: number, r2: number, a: V3, o: V3) => [r1, r2, ...a, ...o];

describe('해석 곡면과 직선의 교점(analyticHit — 면 표 식)', () => {
  it('원기둥 반지름 5(z축): x축 방향 직선의 두 교점 가운데 코어 점에 가까운 것, 법선은 지름 방향', () => {
    const p = params(5, 0, [0, 0, 1], [0, 0, 0]);
    const O: V3 = [-20, 3, 7];
    const D: V3 = [1, 0, 0];
    const h = analyticHit('cylinder', p, O, D, [-3.95, 3, 7])!;
    close(h.X, [-4, 3, 7]);
    close(h.n, [-0.8, 0.6, 0]);
    close(analyticHit('cylinder', p, O, D, [3.97, 3, 7])!.X, [4, 3, 7]);
    // 축과 나란한 직선·비켜 가는 직선은 없다
    expect(analyticHit('cylinder', p, [1, 1, 0], [0, 0, 1], [1, 1, 3])).toBeNull();
    expect(analyticHit('cylinder', p, [-20, 6, 0], D, [0, 6, 0])).toBeNull();
  });

  it('원뿔(기준 반지름 2, 반각 30°)·구(반지름 10, 중심 (1, 2, 3))·원환(10, 2)', () => {
    const t = Math.tan(Math.PI / 6);
    const cone = params(2, Math.PI / 6, [0, 0, 1], [0, 0, 0]);
    close(analyticHit('cone', cone, [-30, 0, 3], [1, 0, 0], [2 + 3 * t - 0.01, 0, 3])!.X, [2 + 3 * t, 0, 3]);
    // 비스듬한 직선: 원뿔 식을 만족하는 점
    const Dc = unit([1, 0.3, 0.2]);
    const hc = analyticHit('cone', cone, [-10, -1, 0], Dc, [-4, 0.8, 1.2])!;
    expect(Math.abs(Math.hypot(hc.X[0], hc.X[1]) - (2 + hc.X[2] * t))).toBeLessThan(1e-12);
    const sph = params(10, 0, [0, 0, 1], [1, 2, 3]);
    close(analyticHit('sphere', sph, [7, -30, 3], [0, 1, 0], [7, 9.9, 3])!.X, [7, 10, 3]);
    close(analyticHit('sphere', sph, [7, -30, 3], [0, 1, 0], [7, -5.9, 3])!.X, [7, -6, 3]);
    const tor = params(10, 2, [0, 0, 1], [0, 0, 0]);
    const s3 = Math.sqrt(3);
    // y = 0, z = 1인 x축 직선: (ρ − 10)² + 1 = 4 → ρ = 10 ± √3, 네 교점
    for (const x of [10 + s3, 10 - s3, -10 + s3, -10 - s3]) close(analyticHit('torus', tor, [-30, 0, 1], [1, 0, 0], [x + 0.01 * Math.sign(x), 0, 1])!.X, [x, 0, 1], 1e-11);
    // 비스듬한 직선: 원환 식을 만족한다
    const Dt = unit([1, 0.2, -0.1]);
    const ht = analyticHit('torus', tor, [-30, -2, 2], Dt, [-11.2, 1.75, 0.13])!;
    expect(Math.abs(Math.hypot(Math.hypot(ht.X[0], ht.X[1]) - 10, ht.X[2]) - 2)).toBeLessThan(1e-12);
    // 평면·모르는 종류는 다루지 않는다
    expect(analyticHit('plane', params(0, 0, [0, 0, 1], [0, 0, 0]), [0, 0, 5], [0, 0, -1], [0, 0, 0])).toBeNull();
  });
});

/** 쌍선형 B-스플라인 곡면 S(u, v) = (u, v, u·v), [0, 1]² */
function saddle(): BSplineSurface {
  const K = new Float64Array([0, 0, 1, 1]);
  const ns = new NurbsSurface(1, 1, K, K, [
    [
      [0, 0, 0],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 1],
    ],
  ], null);
  return new BSplineSurface(ns, 1e-9);
}

describe('곡면 정의와 직선의 교점(paramHit — B-스플라인·밀기·회전)', () => {
  it('쌍선형 B-스플라인 z = u·v: 세로 직선은 z = x·y, 비스듬한 직선도 곡면 식을 만족(1e-12), 배율·원점을 거쳐도 같은 점', () => {
    const fs = { surf: saddle(), k: 1, origin: [0, 0, 0] as const };
    close(paramHit(fs, [0.3, 0.6, -5], [0, 0, 1], [0.3, 0.6, 0.17])!.X, [0.3, 0.6, 0.18]);
    // z = −0.25 + x(y = 0.5)와 z = 0.5 x → x = 0.5
    const D = unit([1, 0, 1]);
    close(paramHit(fs, [0, 0.5, -0.25], D, [0.49, 0.5, 0.24])!.X, [0.5, 0.5, 0.25]);
    // 그물 좌표 = (항목 − origin)·k: 항목 (0.3, 0.6, 0.18)은 그물 ((0.3 − 10)·2, 1.2, 0.36)
    const g = { surf: saddle(), k: 2, origin: [10, 0, 0] as const };
    close(paramHit(g, [-19.4, 1.2, -3], [0, 0, 1], [-19.4, 1.2, 0.3])!.X, [-19.4, 1.2, 0.36], 1e-11);
  });

  it('밀기(원을 z로 민 곡면 — 반지름 4 원기둥)·회전(B-스플라인 윤곽을 z축으로 돌린 곡면) 곡면', () => {
    const circle = new CircleCurve({ o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, 4);
    const ext = { surf: new ExtrusionSurface(circle, [0, 0, 1]), k: 1, origin: [0, 0, 0] as const };
    const X = paramHit(ext, [-20, 1, 5], [1, 0, 0], [-3.8, 1, 5])!;
    close(X.X, [-Math.sqrt(15), 1, 5]);
    // 윤곽: x = 3 + 2t − t², z = 6t(2차 베지어 (3, 0, 0) → (4, 0, 3) → (4, 0, 6))를 z축으로 돌림 — 높이 z의 반지름 ρ(z)
    const prof = new BSplineCurve(new NurbsCurve(2, new Float64Array([0, 0, 0, 1, 1, 1]), [[3, 0, 0], [4, 0, 3], [4, 0, 6]], null));
    const rev = { surf: new RevolutionSurface(prof, [0, 0, 0], [0, 0, 1], 1e-9), k: 1, origin: [0, 0, 0] as const };
    const z = 2.4;
    const t = z / 6;
    const rho = 3 + 2 * t - t * t;
    const h = paramHit(rev, [0, -30, z], [0, 1, 0], [0, -rho + 0.02, z])!;
    close(h.X, [0, -rho, z], 1e-11);
    // 직선 위 곡선 모서리(밀기 곡선이 곧은 선)도 된다
    const line = new LineCurve([0, 0, 0], [1, 0, 0]);
    close(paramHit({ surf: new ExtrusionSurface(line, [0, 1, 1]), k: 1, origin: [0, 0, 0] }, [0.4, 0.3, -2], [0, 0, 1], [0.4, 0.3, 0.31])!.X, [0.4, 0.3, 0.3]);
  });

  it('워커 → 화면: 구조화 복제로 원형을 잃은 곡면에 원형을 다시 붙이면 같은 점(모르는 클래스가 든 곡면은 보내지 않는다)', () => {
    const shared = saddle();
    const prof = new BSplineCurve(new NurbsCurve(2, new Float64Array([0, 0, 0, 1, 1, 1]), [[3, 0, 0], [4, 0, 3], [4, 0, 6]], null));
    const rev = new RevolutionSurface(prof, [0, 0, 0], [0, 0, 1], 1e-9);
    const odd = Object.assign(saddle(), { extra: new Map([[1, 2]]) });
    const set = { tables: [{ surfs: [null, shared, rev, odd, shared], k: 2, origin: [1, 2, 3] as const }, null] };
    const p = packFaceSurfaces(set)!;
    expect(p.tables[0]!.faces).toEqual(Int32Array.from([1, 2, 4]));
    expect(p.tables[1]).toBeNull();
    const look = reviveFaceSurfaces(structuredClone(p))!;
    expect(look).toBeTruthy();
    const s1 = look(0, 1)!;
    expect(s1.surf).toBeInstanceOf(BSplineSurface);
    expect(s1.k).toBe(2);
    expect(s1.origin).toEqual([1, 2, 3]);
    // 함께 쓰던 곡면은 받은 쪽에서도 하나
    expect(look(0, 4)!.surf).toBe(s1.surf);
    expect(look(0, 2)!.surf).toBeInstanceOf(RevolutionSurface);
    expect(look(0, 3)).toBeNull();
    expect(look(0, 0)).toBeNull();
    expect(look(1, 0)).toBeNull();
    for (const [u, v] of [
      [0.2, 0.7],
      [0.9, 0.1],
    ]) {
      expect(s1.surf.derivs(u!, v!)).toEqual(shared.derivs(u!, v!));
      expect(look(0, 2)!.surf.derivs(u! * 6, v!)).toEqual(rev.derivs(u! * 6, v!));
    }
    // 차례가 어긋난 꼴은 버린다
    expect(reviveFaceSurfaces({ ...structuredClone(p), tags: p.tags.subarray(1) })).toBeNull();
    expect(packFaceSurfaces(null)).toBeNull();
    expect(packFaceSurfaces({ tables: [{ surfs: [null, odd], k: 1, origin: [0, 0, 0] }] })).toBeNull();
  });
});

describe('해석기가 남기는 곡면 정의(stepToSceneDeferred.surfaces·parseStepFile onSurfaces)', () => {
  /** mm 조립에 인치 지붕 블록(위가 B-스플라인, 12×8인치)과 mm 원기둥 */
  function roofAsm(): Uint8Array {
    const w = new StepText();
    const mm = w.context('mm');
    const inch = w.context('inch');
    const roof = w.product('roof', [roofBlock(w, 12, 8)], inch);
    const cyl = w.product('cyl', [cylinder(w, 5, 20)], mm);
    const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
    w.place(root, roof, w.ax2([0, 0, 0]), 'roof-1');
    w.place(root, cyl, w.ax2([600, 0, 0]), 'cyl-1');
    return w.bytes('roof-asm.stp');
  }

  it('면 표에 식이 없는 면(지붕)만 곡면을 남기고, 단위가 다른 부품은 배율 k로 그물 좌표에 맞춘다 — 세로 축이 지붕을 뚫는 점이 곡면 위(mm, 1e-9)', async () => {
    const bytes = roofAsm();
    const { scene, surfaces } = stepToSceneDeferred(bytes);
    const fx = stepFaceIndex(scene)!;
    const roofMesh = scene.meshes.find((m) => fx.tableOf.has(m.id) && surfaces!.tables[fx.tableOf.get(m.id)!])!;
    expect(roofMesh).toBeTruthy();
    const ti = fx.tableOf.get(roofMesh.id)!;
    const t = surfaces!.tables[ti]!;
    expect(t.k).toBeCloseTo(25.4, 12);
    const bs = FACE_KINDS.indexOf('bspline');
    const table = fx.tables[ti]!;
    // 면 표의 B-스플라인 면에만 곡면이 있다
    t.surfs.forEach((s, f) => expect(!!s, `면 ${f}`).toBe(table.kinds[f] === bs));
    // 원기둥(해석 곡면)만 있는 표는 없다
    expect(surfaces!.tables.filter((x) => x)).toHaveLength(1);
    const look = reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces)))!;
    // 세계 (x, y) = 25.4 × (4.3, 3.1)인치를 지나는 세로 축: 지붕 면 삼각형 가운데 그 (x, y)를 덮는 것의 평면과 만나는 점이 코어 점
    const f = table.kinds.indexOf(bs);
    const P = roofMesh.positions;
    const I = roofMesh.indices!;
    const x0 = 25.4 * 4.3;
    const y0 = 25.4 * 3.1;
    let core: V3 | null = null;
    let tri = -1;
    for (let k = table.triStart[f]!; k < table.triStart[f + 1]! && !core; k++) {
      const v = [0, 1, 2].map((j) => [P[I[k * 3 + j]! * 3]!, P[I[k * 3 + j]! * 3 + 1]!, P[I[k * 3 + j]! * 3 + 2]!] as V3);
      const [a, b, c] = v as [V3, V3, V3];
      const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      const l1 = ((x0 - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y0 - a[1])) / det;
      const l2 = ((b[0] - a[0]) * (y0 - a[1]) - (x0 - a[0]) * (b[1] - a[1])) / det;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) {
        core = [x0, y0, a[2] + l1 * (b[2] - a[2]) + l2 * (c[2] - a[2])];
        tri = k;
      }
    }
    expect(core).toBeTruthy();
    const input: SnapRefineFaceInput = {
      kind: 'axisFace',
      point: core!,
      face: { id: roofMesh.id, index: tri, normal: [0, 0, 1] },
      line: { origin: [x0, y0, 400], dir: [0, 0, -1], axis: 'z' },
      first: [x0, y0, 400],
      ray: { origin: [0, 0, 1000], dir: [0, 0, -1] },
    };
    const X = refineFaceHit(input, new Map([[roofMesh.id, roofMesh]]), fx, look)!;
    close(X, [x0, y0, 25.4 * roofZ(4.3 / 12, 3.1 / 8)], 1e-9);
    // 정의를 받기 전(undefined)이면 null
    expect(refineFaceHit(input, new Map([[roofMesh.id, roofMesh]]), fx, () => undefined)).toBeNull();
    // 워커 일(parseStepFile)은 onSurfaces에 넘기고 결과에 그 면 수를 싣는다. 해석 곡면뿐인 파일은 넘기지 않는다
    let got: unknown = null;
    const res = await parseStepFile('roof.stp', bytes, () => {}, {}, () => {}, (s) => (got = s));
    expect(res.surfaces).toBe(1);
    expect(got).toBeTruthy();
    const w = new StepText();
    const mm = w.context('mm');
    w.product('cyl', [cylinder(w, 5, 20)], mm);
    let none = false;
    const plain = await parseStepFile('cyl.stp', w.bytes(), () => {}, {}, () => {}, () => (none = true));
    expect(plain.surfaces).toBeUndefined();
    expect(none).toBe(false);
  });
});

/** 원기둥(반지름 R, z축) 옆면 조각: 각 [a0, a1]·높이 [0, H]를 n×m 칸 삼각형으로(그물 좌표 그대로) */
function cylPatch(R: number, a0: number, a1: number, H: number, n: number, m: number): { mesh: Mesh3d; table: StepFaceTable } {
  const pos: number[] = [];
  for (let j = 0; j <= m; j++)
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pos.push(R * Math.cos(a), R * Math.sin(a), (H * j) / m);
    }
  const idx: number[] = [];
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const q = j * (n + 1) + i;
      idx.push(q, q + 1, q + n + 2, q, q + n + 2, q + n + 1);
    }
  const nt = idx.length / 3;
  const mesh: Mesh3d = { id: 'cyl', positions: Float32Array.from(pos), indices: Uint32Array.from(idx), color: [1, 1, 1, 1] } as Mesh3d;
  const table: StepFaceTable = {
    triStart: Uint32Array.from([0, nt]),
    stepIds: Uint32Array.from([7]),
    kinds: Uint8Array.from([FACE_KINDS.indexOf('cylinder')]),
    params: Float64Array.from([R, 0, 0, 0, 1, 0, 0, 0]),
  };
  return { mesh, table };
}

describe('잘린 면의 경계(insideFace)와 refineFaceHit', () => {
  it('원기둥 옆면 조각(0°~90°, 높이 10): 안쪽 교점은 받고, 경계 밖(각 95°·높이 10.5)은 null', () => {
    const { mesh, table } = cylPatch(10, 0, Math.PI / 2, 10, 6, 4);
    const at = (a: number, z: number): V3 => [10 * Math.cos(a), 10 * Math.sin(a), z];
    const nAt = (a: number): V3 => [Math.cos(a), Math.sin(a), 0];
    expect(insideFace(mesh, table, 0, at(0.3, 4), nAt(0.3), 1e-3)).toBe(true);
    // 경계 꼭짓점 바로 위(꺾인 곳 — 두 삼각형 사이 틈은 허용치가 메운다)
    expect(insideFace(mesh, table, 0, at(Math.PI / 12, 5), nAt(Math.PI / 12), 1e-3)).toBe(true);
    expect(insideFace(mesh, table, 0, at((95 * Math.PI) / 180, 4), nAt((95 * Math.PI) / 180), 1e-3)).toBe(false);
    expect(insideFace(mesh, table, 0, at(0.3, 10.5), nAt(0.3), 1e-3)).toBe(false);
    // 맞은편(뒤쪽, 각 0.3 + π)은 같은 접평면에 겹쳐 보이지 않는다
    expect(insideFace(mesh, table, 0, at(0.3 + Math.PI, 4), nAt(0.3 + Math.PI), 1e-3)).toBe(false);
  });

  it('refineFaceHit: 축 직선이 원기둥 조각을 뚫는 점(1e-12), 평면 면·면 표 밖 삼각형·경계 밖·곡면 정의가 없는 B-스플라인은 null', () => {
    const { mesh, table } = cylPatch(10, 0, Math.PI / 2, 10, 6, 4);
    const fx: SnapFaceIndex = { kinds: FACE_KINDS, tables: [table], tableOf: new Map([['cyl', 0]]) };
    const meshes = new Map([['cyl', mesh]]);
    const input = (origin: V3, dir: V3, point: V3, index = 5): SnapRefineFaceInput => ({
      kind: 'axisFace',
      point,
      face: { id: 'cyl', index, normal: [1, 0, 0] },
      line: { origin, dir, axis: 'x' },
      first: origin,
      ray: { origin: [50, 50, 50], dir: unit([-1, -1, -1]) },
    });
    // y = 3, z = 4인 x축 직선: x = √91
    const X = refineFaceHit(input([20, 3, 4], [-1, 0, 0], [9.5, 3, 4]), meshes, fx);
    close(X, [Math.sqrt(91), 3, 4]);
    // 높이 10.5(면 위 경계 밖)
    expect(refineFaceHit(input([20, 3, 10.5], [-1, 0, 0], [9.5, 3, 10.5]), meshes, fx)).toBeNull();
    // 삼각형 번호가 면 표 밖(단면의 채운 면 −1 등)
    expect(refineFaceHit(input([20, 3, 4], [-1, 0, 0], [9.5, 3, 4], -1), meshes, fx)).toBeNull();
    // 같은 조각을 평면·B-스플라인 면이라고 하면: 평면은 null, B-스플라인은 곡면 정의(lookup)가 없거나 받기 전이면 null
    for (const kind of ['plane', 'bspline'] as const) {
      const t2 = { ...table, kinds: Uint8Array.from([FACE_KINDS.indexOf(kind)]) };
      const f2: SnapFaceIndex = { ...fx, tables: [t2] };
      expect(refineFaceHit(input([20, 3, 4], [-1, 0, 0], [9.5, 3, 4]), meshes, f2)).toBeNull();
      expect(refineFaceHit(input([20, 3, 4], [-1, 0, 0], [9.5, 3, 4]), meshes, f2, () => undefined)).toBeNull();
    }
    // B-스플라인이라 하고 곡면 정의로 원을 z로 민 곡면을 주면 같은 점
    const t3 = { ...table, kinds: Uint8Array.from([FACE_KINDS.indexOf('extrusion')]) };
    const circle = new CircleCurve({ o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, 10);
    const surf = new ExtrusionSurface(circle, [0, 0, 1]);
    close(refineFaceHit(input([20, 3, 4], [-1, 0, 0], [9.5, 3, 4]), meshes, { ...fx, tables: [t3] }, () => ({ surf, k: 1, origin: [0, 0, 0] })), [Math.sqrt(91), 3, 4]);
    // 자리 변환(Z축 90° 돌림 + (100, 0, 0) 옮김)을 거친 그물: 세계 직선 y = 3 → 묶음 좌표 x = 3, 답은 세계 (100 − √91, 3, 4)
    const moved: Mesh3d = { ...mesh, matrix: new Float64Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]) } as Mesh3d;
    close(refineFaceHit(input([80, 3, 4], [1, 0, 0], [90.5, 3, 4]), new Map([['cyl', moved]]), fx), [100 - Math.sqrt(91), 3, 4], 1e-11);
  });
});
