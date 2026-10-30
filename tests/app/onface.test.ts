/**
 * 코어 0.21.0~0.23.0으로 올린 뒤 면 위 점 다듬기(app/facesnap.ts refineFaceHit)와 다듬기 기억 비우기.
 * - 'onFace'(붙잡지 않은 면 위 점 — line = 커서 광선): 광선 쪽 첫 근(앞을 보는 곡면 위)
 *   · 원기둥 옆면을 실루엣 둘레에서 스치는 광선: 코어 점(맞은 삼각형 위)이 두 근 사이이고 나가는 근(뒤쪽)이 더 가깝다 —
 *     'axisFace' 규칙(코어 점에 가장 가까운 근)이면 그 뒤쪽 근인데 'onFace'는 들어가는 근(1e-9)
 *   · 같은 스침을 민 곡면(원을 z로 민 옆면 — 해석 워커의 곡면 정의, 뉴턴법)에서도 들어가는 근
 *   · 판 구멍 안쪽 벽(오목): 위에서 비스듬히 들여다본 맞은편 벽 위 근(가까운 쪽 벽의 근은 받지 않는다)
 *   · 평면 면은 null(삼각형 위 점이 곧 면 위 점)
 * - 0.22.0 열린 후보('axisFace', open): 선이 삼각형을 비켜 가도 열리지 않은 것과 같은 계산(point 둘레 교점)
 * - 실제 코어(가짜 DOM·WebGL2 뷰어)와 함께: 원기둥·B-스플라인 지붕 위를 가리키면 곡면 위 점("곡면 위 점"), 평면이면 그대로("면 위 점").
 *   곡면 정의를 받기 전에 미리 본 축과 지붕의 교차는 받은 뒤에도 코어 기억(null) 그대로이고, clearMeasureRefine 뒤에 곡면 위로(앱은 곡면 정의를 받으면 부른다)
 * 화면 좌표로 가리킬 때는 그물 경계를 정확히 가리키지 않고 면 안쪽으로 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type SnapRefineFaceInput } from 'opencad-viewer3d';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepToSceneDeferred } from '../../src/scene';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, MEASURE_INFERENCE, measureSnapOptions, refinedKind, snapPair, SURFACE_POINT_LABEL } from '../../src/app/snap';
import { curveSnap, toWorld } from '../../src/app/curvesnap';
import { analyticHit, type FaceSurfaceLookup, refineFaceHit } from '../../src/app/facesnap';
import { packFaceSurfaces, reviveFaceSurfaces } from '../../src/facesurf';
import { plateWithHole, StepText, type P3 } from '../stepText';
import { translate } from '../../site/i18n.mjs';
import { type FakeElement, installDom } from './fakeview';
import { cylinderRim, RIM_H, RIM_R, type V3 } from './curvescene';
import { extrudedCylinder, hangingPlate, roofBlock, roofZ } from './facescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

function oneSolid(name: string, make: (w: StepText) => number): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  w.product(name, [make(w)], mm);
  return w.bytes(`${name}.stp`);
}

/** 그물 삼각형 t의 세 꼭짓점(세계) */
function corners(mesh: Mesh3d, t: number): [V3, V3, V3] {
  const I = mesh.indices!;
  const P = mesh.positions;
  return [0, 1, 2].map((c) => {
    const q = I[t * 3 + c]! * 3;
    return toWorld(mesh, P[q]!, P[q + 1]!, P[q + 2]!);
  }) as [V3, V3, V3];
}

/** 광선과 삼각형의 교차 매개변수(앞쪽만 — Möller–Trumbore), 없으면 null */
function rayTri(O: V3, D: V3, [A, B, C]: [V3, V3, V3]): number | null {
  const e1 = sub(B, A);
  const e2 = sub(C, A);
  const p = cross(D, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-14) return null;
  const tv = sub(O, A);
  const u = dot(tv, p) / det;
  if (u < 0 || u > 1) return null;
  const q = cross(tv, e1);
  const v = dot(D, q) / det;
  if (v < 0 || u + v > 1) return null;
  const s = dot(e2, q) / det;
  return s > 0 ? s : null;
}

/** 장면에서 광선이 처음 맞는 그물 삼각형(코어 고르기와 같은 것 — 그물 하나짜리 장면) */
function firstHit(s: Scene3d, O: V3, D: V3): { mesh: Mesh3d; t: number; point: V3; normal: V3 } {
  let best: { mesh: Mesh3d; t: number; s: number } | null = null;
  for (const mesh of s.meshes)
    for (let t = 0; t < mesh.indices!.length / 3; t++) {
      const k = rayTri(O, D, corners(mesh, t));
      if (k !== null && (!best || k < best.s)) best = { mesh, t, s: k };
    }
  expect(best, '광선이 그물을 맞는다').toBeTruthy();
  const [A, B, C] = corners(best!.mesh, best!.t);
  const n = cross(sub(B, A), sub(C, A));
  const l = Math.hypot(...n) * (dot(n, D) > 0 ? -1 : 1);
  return { mesh: best!.mesh, t: best!.t, point: [O[0] + best!.s * D[0], O[1] + best!.s * D[1], O[2] + best!.s * D[2]], normal: [n[0] / l, n[1] / l, n[2] / l] };
}

function onFaceInput(hit: ReturnType<typeof firstHit>, O: V3, D: V3, kind: SnapRefineFaceInput['kind'] = 'onFace'): SnapRefineFaceInput {
  return { kind, point: hit.point, face: { id: hit.mesh.id, index: hit.t, normal: hit.normal }, line: { origin: O, dir: D }, first: null, ray: { origin: O, dir: D } };
}

/** z축 원기둥(반지름 R) 옆면 꼭짓점들의 서로 다른 각(작은 차례) */
function sideAngles(mesh: Mesh3d, R: number): number[] {
  const P = mesh.positions;
  const out: number[] = [];
  for (let i = 0; i < P.length / 3; i++) {
    const w = toWorld(mesh, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!);
    if (Math.abs(Math.hypot(w[0], w[1]) - R) > 1e-4) continue;
    const a = Math.atan2(w[1], w[0]);
    if (!out.some((b) => Math.abs(b - a) < 1e-6)) out.push(a);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 원기둥 옆면 꼭짓점 각 θ1(이웃 θ0 < θ1 < θ2, 간격 Δ) 둘레를 스치는 수평 광선(높이 z): 반지름 방향 φ = θ1 − 0.4Δ에 수직, 원점에서 R cos α(α = 0.45Δ).
 * 광선은 θ1 − 0.85Δ에서 원기둥에 들어가(Qa — 앞) θ1 + 0.05Δ에서 나간다(Qb — 뒤). 꺾은선 꼭짓점 θ1만 광선 바깥이라 광선이 그 모퉁이를 얕게 자른다:
 * 처음 맞는 삼각형은 θ0~θ1 옆 칸이고 그 점은 모퉁이 θ1 둘레(Qb에 더 가깝다)
 */
function grazing(mesh: Mesh3d, R: number, z: number) {
  const as = sideAngles(mesh, R);
  const k = Math.floor(as.length / 2);
  const [t0, t1, t2] = [as[k - 1]!, as[k]!, as[k + 1]!];
  const step = Math.min(t1 - t0, t2 - t1);
  const alpha = 0.45 * step;
  const phi = t1 - 0.4 * step;
  const u: V3 = [-Math.sin(phi), Math.cos(phi), 0];
  const d = R * Math.cos(alpha);
  const at = (tau: number): V3 => [d * Math.cos(phi) + tau * u[0], d * Math.sin(phi) + tau * u[1], z];
  const sa = R * Math.sin(alpha);
  return { O: at(-sa - 30), D: u, Qa: at(-sa), Qb: at(sa) };
}

describe("'onFace' — 커서 광선이 곡면을 뚫는 점 가운데 광선 쪽 첫 근", () => {
  it('원기둥 옆면을 실루엣 둘레에서 스치는 광선: 코어 점에 더 가까운 것은 나가는 근(뒤쪽)인데, 들어가는 근(앞)을 준다(1e-9)', () => {
    const s = stepToScene(oneSolid('cyl', (w) => cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])));
    const fx = stepFaceIndex(s)!;
    const meshes = new Map(s.meshes.map((m) => [m.id, m] as const));
    for (const z of [0.37 * RIM_H, 0.81 * RIM_H]) {
      const g = grazing(s.meshes[0]!, RIM_R, z);
      const hit = firstHit(s, g.O, g.D);
      // 전제: 코어 점은 두 근 사이(앞 근 → 코어 점 → 뒤 근)이고 뒤 근에 더 가깝다
      const sA = dot(sub(g.Qa, g.O), g.D);
      const sB = dot(sub(g.Qb, g.O), g.D);
      const sP = dot(sub(hit.point, g.O), g.D);
      expect(sA < sP && sP < sB).toBe(true);
      expect(dist(hit.point, g.Qb)).toBeLessThan(dist(hit.point, g.Qa));
      // 코어 0.19.0 'axisFace' 규칙(코어 점에 가장 가까운 근)이면 뒤 근
      close(refineFaceHit(onFaceInput(hit, g.O, g.D, 'axisFace'), meshes, fx), g.Qb);
      const q = refineFaceHit(onFaceInput(hit, g.O, g.D), meshes, fx)!;
      close(q, g.Qa);
      expect(Math.abs(Math.hypot(q[0], q[1]) - RIM_R)).toBeLessThan(1e-12);
    }
  });

  it('민 곡면(원을 z로 민 옆면 — 해석 워커가 남긴 곡면 정의, 뉴턴법)을 스치는 광선도 들어가는 근(1e-9)', () => {
    const { scene: s, surfaces } = stepToSceneDeferred(oneSolid('xcyl', (w) => extrudedCylinder(w, RIM_R, RIM_H)));
    const look = reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces!)))!;
    const fx = stepFaceIndex(s)!;
    const meshes = new Map(s.meshes.map((m) => [m.id, m] as const));
    for (const z of [0.37 * RIM_H, 0.63 * RIM_H]) {
      const g = grazing(s.meshes[0]!, RIM_R, z);
      const hit = firstHit(s, g.O, g.D);
      expect(dist(hit.point, g.Qb)).toBeLessThan(dist(hit.point, g.Qa));
      const q = refineFaceHit(onFaceInput(hit, g.O, g.D), meshes, fx, look)!;
      close(q, g.Qa);
      // 곡면 정의를 받기 전이면 null(삼각형 위 점 그대로)
      expect(refineFaceHit(onFaceInput(hit, g.O, g.D), meshes, fx, () => undefined)).toBeNull();
    }
  });

  it('판 구멍 안쪽 벽(오목): 위에서 비스듬히 들여다본 맞은편 벽 위 근 — 가까운 쪽 벽(판 위)의 근은 받지 않는다', () => {
    const s = stepToScene(oneSolid('plate', (w) => plateWithHole(w)));
    const fx = stepFaceIndex(s)!;
    const meshes = new Map(s.meshes.map((m) => [m.id, m] as const));
    // 구멍(중심 (10, 5), 반지름 2, 판 두께 2): 가까운 쪽 위 모서리 (8, 5, 2) 바로 안쪽 위를 지나 20° 내려가는 광선
    const b = (20 * Math.PI) / 180;
    const D: V3 = [Math.cos(b), 0.05, -Math.sin(b)];
    const l = Math.hypot(...D);
    const Du: V3 = [D[0] / l, D[1] / l, D[2] / l];
    const through: V3 = [8.3, 5, 2];
    const O: V3 = [through[0] - 12 * Du[0], through[1] - 12 * Du[1], through[2] - 12 * Du[2]];
    const hit = firstHit(s, O, Du);
    const q = refineFaceHit(onFaceInput(hit, O, Du), meshes, fx)!;
    expect(q).toBeTruthy();
    // 맞은편 벽(x > 10) 위, 판 두께 안, 반지름 2
    expect(Math.abs(Math.hypot(q[0] - 10, q[1] - 5) - 2)).toBeLessThan(1e-12);
    expect(q[0]).toBeGreaterThan(10);
    expect(q[2]).toBeGreaterThan(0);
    expect(q[2]).toBeLessThan(2);
    // 광선 위
    const w = sub(q, O);
    const c = cross(w, Du);
    expect(Math.hypot(...c)).toBeLessThan(1e-9);
  });

  it('평면 면은 null(삼각형 위 점이 곧 면 위 점)', () => {
    const s = stepToScene(oneSolid('cyl', (w) => cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])));
    const fx = stepFaceIndex(s)!;
    const meshes = new Map(s.meshes.map((m) => [m.id, m] as const));
    const O: V3 = [1, 2, 50];
    const D: V3 = [0, 0, -1];
    const hit = firstHit(s, O, D);
    close(hit.point, [1, 2, RIM_H], 1e-5);
    expect(refineFaceHit(onFaceInput(hit, O, D), meshes, fx)).toBeNull();
  });
});

describe("0.22.0 열린 후보('axisFace', open)", () => {
  it('축이 원기둥 옆 삼각형을 비켜 가며 곡면만 뚫는 자리: open이어도 열리지 않은 입력과 같은 교점(point 둘레 — 원기둥 위 1e-12)', () => {
    const s = stepToScene(oneSolid('cyl', (w) => cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])));
    const fx = stepFaceIndex(s)!;
    const meshes = new Map(s.meshes.map((m) => [m.id, m] as const));
    const mesh = s.meshes[0]!;
    const g = grazing(mesh, RIM_R, 0.5 * RIM_H);
    // 스치는 선이 꺾은선 모퉁이를 자르지 않게 바깥으로 민 선(곡면과는 만나고 삼각형은 비켜 간다): θ1 꼭짓점의 반지름 방향 거리보다 조금 바깥
    const as = sideAngles(mesh, RIM_R);
    const t1 = as[Math.floor(as.length / 2)]!;
    // 광선 방향 (−sin φ, cos φ, 0)에 수직인 반지름 방향 φ
    const phi = Math.atan2(-g.D[0], g.D[1]);
    const reach = RIM_R * Math.cos(t1 - phi);
    const d = 0.5 * (reach + RIM_R);
    const n: V3 = [Math.cos(phi), Math.sin(phi), 0];
    const O: V3 = [d * n[0] - 30 * g.D[0], d * n[1] - 30 * g.D[1], 0.5 * RIM_H];
    // 선 위에서 원기둥과의 두 교점 가운데 앞 것을 힌트로(삼각형 무게중심 쪽 점과 같은 역할)
    const sa = Math.sqrt(RIM_R * RIM_R - d * d);
    const X: V3 = [d * n[0] - sa * g.D[0], d * n[1] - sa * g.D[1], 0.5 * RIM_H];
    const hint: V3 = [X[0] + 0.01 * g.D[0], X[1] + 0.01 * g.D[1], X[2]];
    // 그 둘레 옆면 삼각형(힌트에 가장 가까운 무게중심)
    let best = -1;
    let bd = Infinity;
    for (let t = 0; t < mesh.indices!.length / 3; t++) {
      const c = corners(mesh, t);
      if (c.some((p) => Math.abs(Math.hypot(p[0], p[1]) - RIM_R) > 1e-4)) continue;
      const m: V3 = [(c[0][0] + c[1][0] + c[2][0]) / 3, (c[0][1] + c[1][1] + c[2][1]) / 3, (c[0][2] + c[1][2] + c[2][2]) / 3];
      if (dist(m, hint) < bd) [best, bd] = [t, dist(m, hint)];
    }
    // 전제: 선은 그 삼각형을 뚫지 않는다(열린 후보 자리)
    expect(rayTri(O, g.D, corners(mesh, best))).toBeNull();
    const base: SnapRefineFaceInput = { kind: 'axisFace', point: hint, face: { id: mesh.id, index: best, normal: [n[0], n[1], 0] }, line: { origin: O, dir: g.D }, first: O, ray: { origin: [0, 0, 100], dir: [0, 0, -1] } };
    const closed = refineFaceHit(base, meshes, fx)!;
    const open = refineFaceHit({ ...base, open: true }, meshes, fx)!;
    expect(open).toEqual(closed);
    close(open, X, 1e-12);
    // 해석 곡면 교점 함수와 같은 근(코어 점에 가까운 근)
    close(analyticHit('cylinder', [RIM_R, 0, 0, 0, 1, 0, 0, 0], O, g.D, hint)!.X, X, 1e-12);
  });
});

/** 실제 코어(가짜 DOM·WebGL2 뷰어) — measurelockface.test.ts와 같은 손잡이 */
interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(s: Scene3d, surfaces: FaceSurfaceLookup | null = null): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(s);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  const e = stepEdgeIndex(s);
  const f = stepFaceIndex(s);
  v.setMeasureSnap({ ...measureSnapOptions(s.meshes, e, circleCenters(s.meshes, e), curveSnap(s.meshes, e, f, surfaces)), inference: MEASURE_INFERENCE });
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
const hoverAt = (w: View, p: readonly number[]): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + 3, q.y + 2, 0);
  ptr(w, 'pointermove', q.x, q.y, 0);
  w.v.renderNow();
};
const clickAt = (w: View, p: readonly number[]): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0);
  ptr(w, 'pointerdown', q.x, q.y, 1);
  ptr(w, 'pointerup', q.x, q.y, 0);
  w.v.renderNow();
};
const zoomAround = (w: View, p: readonly number[], r: number): void => {
  const a = w.v.project([p[0]! - r, p[1]! - r, p[2]!])!;
  const b = w.v.project([p[0]! + r, p[1]! + r, p[2]!])!;
  const c = at(w, p);
  const half = Math.max(4, Math.hypot(a.x - b.x, a.y - b.y) / 2);
  w.v.zoomToRect(c.x - half, c.y - half, c.x + half, c.y + half, false);
  w.v.renderNow();
};

describe('실제 코어와 함께: 붙잡지 않은 곡면 위 점(0.21.0 onFace)', () => {
  it('원기둥 옆면을 가리키면 곡면 위 점(반지름 1e-9, "곡면 위 점"), 평면 윗면은 그대로("면 위 점"), 찍은 결과도', () => {
    const s = stepToScene(oneSolid('cyl', (w) => cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])));
    const w = view(s);
    const { v } = w;
    // 앞을 보는 옆면 위(이음선·꼭짓점·모서리에서 떨어진 자리)
    const a = (-75 * Math.PI) / 180;
    const P: V3 = [RIM_R * Math.cos(a), RIM_R * Math.sin(a), 0.43 * RIM_H];
    zoomAround(w, P, 4);
    hoverAt(w, P);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBe(true);
    expect(h.segment).toBeUndefined();
    expect(refinedKind(h)).toBe('face');
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(dist(h.point, P)).toBeLessThan(0.05);
    expect(hoverSnapLabel(h)).toBe(SURFACE_POINT_LABEL);
    clickAt(w, P);
    const p0 = v.measurePoints[0]!;
    expect(p0.refined).toBe(true);
    expect(Math.abs(Math.hypot(p0.point[0], p0.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(snapPair({ snapA: p0.snap, snapB: 'vertex', refinedA: refinedKind(p0) })).toEqual(['곡면 위 점', '꼭짓점']);
    v.clearMeasure();
    v.fit(false);
    v.renderNow();
    // 평면 윗면
    hoverAt(w, [2.3, -1.7, RIM_H]);
    const t = v.measureHoverSnap!;
    expect(t.snap).toBeNull();
    expect(t.refined).toBeUndefined();
    expect(hoverSnapLabel(t)).toBe('면 위 점');
  });

  it('새 이름은 4개 언어 사전에 있다', () => {
    for (const code of ['en', 'ja', 'zh-CN', 'de']) expect(translate(SURFACE_POINT_LABEL, code), code).not.toMatch(/[가-힣]/);
    expect(translate('곡면 위 점', 'en')).toBe('Point on curved surface');
  });
});

describe('곡면 정의를 받은 뒤 다듬기 기억 비우기(코어 0.21.0 clearMeasureRefine — 앱은 곡면 정의를 받으면 부른다)', () => {
  it('받기 전에 미리 본 축과 B-스플라인 지붕의 교차는 받은 뒤에도 삼각형 위(코어가 null을 기억), 비우면 곡면 위(1e-9) — 찍은 첫 점은 그대로', () => {
    const A = 12;
    const B = 8;
    const P: P3 = [4.3, 3.1, 11];
    const w0 = new StepText();
    const mm = w0.context('mm');
    const roof = w0.product('roof', [roofBlock(w0, A, B)], mm);
    const plate = w0.product('plate', [hangingPlate(w0, P)], mm, 'SHAPE_REPRESENTATION');
    const root = w0.product('roof-axis', [w0.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
    w0.place(root, roof, w0.ax2([0, 0, 0]), 'roof-1');
    w0.place(root, plate, w0.ax2([0, 0, 0]), 'plate-1');
    const { scene: s, surfaces } = stepToSceneDeferred(w0.bytes('roof.stp'));
    const look = reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces!)))!;
    // 앱처럼: 받기 전에는 undefined(그동안 그 면은 삼각형 위 점)
    let ready = false;
    let calls = 0;
    const lookup: FaceSurfaceLookup = (t, f) => {
      calls++;
      return ready ? look(t, f) : undefined;
    };
    const w = view(s, lookup);
    const { v } = w;
    clickAt(w, P);
    const F = v.measurePoints[0]!.point;
    const Z: V3 = [F[0], F[1], roofZ(F[0] / A, F[1] / B)];
    zoomAround(w, Z, 1);
    const near: V3 = [Z[0] + 0.04, Z[1], roofZ((Z[0] + 0.04) / A, Z[1] / B)];
    hoverAt(w, near);
    let h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.refined).toBeUndefined();
    expect(calls).toBeGreaterThan(0);
    // 곡면 정의가 왔다 — 같은 자리를 다시 가리켜도 코어 기억(null) 그대로
    ready = true;
    hoverAt(w, near);
    h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.refined).toBeUndefined();
    // 기억만 비운다: 미리 보기를 그 자리에서 다시 구해 곡면 위로, 첫 점·측정 모드는 그대로
    expect(v.clearMeasureRefine()).toBeGreaterThan(0);
    v.renderNow();
    h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.refined).toBe(true);
    expect(Math.abs(h.point[2] - Z[2])).toBeLessThan(1e-9);
    expect(v.measurePointCount).toBe(1);
    expect(v.measurePoints[0]!.point).toEqual(F);
    // 첫 점 축에서 떨어진 지붕 위(붙잡지 않은 점)도 곡면 위(onFace — 곡면 정의로 뉴턴법)
    v.clearMeasure();
    v.fit(false);
    v.renderNow();
    const Q: V3 = [7.7, 5.3, roofZ(7.7 / A, 5.3 / B)];
    zoomAround(w, Q, 1.5);
    hoverAt(w, Q);
    const o = v.measureHoverSnap!;
    expect(o.snap).toBeNull();
    expect(o.refined).toBe(true);
    expect(Math.abs(o.point[2] - roofZ(o.point[0] / A, o.point[1] / B))).toBeLessThan(1e-9);
    expect(hoverSnapLabel(o)).toBe('곡면 위 점');
  });
});
