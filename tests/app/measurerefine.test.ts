/**
 * 측정 붙잡기 점을 B-rep 곡선 위로 다듬기(app/curvesnap.ts — 코어 0.14.0 setMeasureSnap refine)를 실제 코어(opencad-viewer3d) 판정과 함께 본다:
 * 원기둥 윗 테두리 원·타원 호·B-스플라인 모서리 STEP 장면과 앱의 붙잡기 선택(곡선 붙잡기 포함)을 가짜 DOM·WebGL2 뷰어에 주고 포인터·키 사건을 넣는다.
 * - 수직 발: 코어는 꺾은선 토막(현) 위 발을 고르고, 앱이 첫 점에서 원으로 내린 정확한 발로 옮긴다(거리 값도 그 발까지)
 * - 모서리 위 점: 타원·B-스플라인 토막 위 점이 곡선 위로, 직선 모서리는 그대로
 * - 곡선 가운데 점(앱 점): 곡선 길이 가운데
 * - 곡선 위로 다듬은 첫 점에서도 곡선 접선 잠금(13·14차)이 그 모서리를 찾는다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import { perpendicularFoot } from 'opencad-viewer3d/inference';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, measureSnapOptions, snapPair } from '../../src/app/snap';
import { curveEndsAt, curveSnap, endPolyline, TangentLock } from '../../src/app/tangent';
import { type FakeElement, installDom } from './fakeview';
import {
  bsAt,
  BS_START,
  bsTangentAt,
  bsWorld,
  curveStep,
  ellAt,
  ELL_END,
  ELL_START,
  ELL_T0,
  ELL_T1,
  ellTangent,
  footParam,
  RIM,
  RIM_R,
  RIM_H,
  rimChordAt,
  rimTangentAt,
  RIM_TANGENT,
  type V3,
} from './curvescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const scene = stepToScene(curveStep());
const ex = stepEdgeIndex(scene)!;
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const neg = (a: readonly number[]): V3 => [-a[0]!, -a[1]!, -a[2]!];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `방향 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
/** 원기둥 윗 테두리 원까지 거리(원 평면 높이 차와 반지름 차) */
const offRim = (p: readonly number[]): number => Math.hypot(Math.hypot(p[0]!, p[1]!) - RIM_R, p[2]! - RIM_H);
/** 곡선(at·tan, 매개변수 [lo, hi])까지 거리와 가장 가까운 매개변수(시험의 기댓값 — 앱 계산과 다른 길) */
const offCurve = (at: (t: number) => V3, tan: (t: number) => V3, p: readonly number[], lo: number, hi: number): { d: number; t: number } => {
  const t = footParam(at, tan, p, lo, hi);
  return { d: dist(at(t), p), t };
};

interface View {
  v: Viewer3d;
  canvas: FakeElement;
  tl: TangentLock;
}

/** 실제 코어 뷰어에 곡선 장면과 앱의 측정 붙잡기 선택(곡선 위로 다듬기 포함 — 곡선 계산 조각을 받은 뒤의 앱)을 주고 남동 등각(측정 모드) */
function view(withCurve = true): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), withCurve ? curveSnap(scene.meshes, ex) : null));
  return { v, canvas: v.canvas as unknown as FakeElement, tl: new TangentLock(() => ({ meshes: scene.meshes, ex })) };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey: boolean): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
const hoverAt = (w: View, p: readonly number[], shift = false): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0, shift);
  w.v.renderNow();
  w.tl.track(w.v);
};
const clickAt = (w: View, p: readonly number[], shift = false): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0, shift);
  ptr(w, 'pointerdown', q.x, q.y, 1, shift);
  ptr(w, 'pointerup', q.x, q.y, 0, shift);
  w.v.renderNow();
  w.tl.track(w.v);
};
const key = (k: string) => ({ key: k, code: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: k === 'Shift', repeat: false, preventDefault() {}, stopPropagation() {} }) as unknown as KeyboardEvent;
const shiftDown = (w: View): void => {
  w.tl.shiftDown(w.v);
  w.v.handleKey(key('Shift'));
  w.v.renderNow();
};
const shiftUp = (w: View): void => {
  w.v.handleKeyUp(key('Shift'));
  w.tl.shiftUp(w.v);
  w.v.renderNow();
};
/** 화면 사각형 확대: 두 세계 점 사이 가운데를 화면 가운데로, 그 둘 사이 화면 거리의 두 배 사각형이 화면을 채우게 */
const zoomAround = (w: View, p: readonly number[], q: readonly number[]): void => {
  const a = at(w, p);
  const b = at(w, q);
  const half = Math.max(4, Math.hypot(a.x - b.x, a.y - b.y));
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  w.v.zoomToRect(cx - half, cy - half, cx + half, cy + half, false);
  w.v.renderNow();
};
const lerp = (a: readonly number[], b: readonly number[], f: number): V3 => [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f, a[2]! + (b[2]! - a[2]!) * f];

const rimPoly = endPolyline(curveEndsAt(scene.meshes, ex, RIM)[0]!);
/** B-스플라인 판의 곧은 모서리 모퉁이(판 좌표 (12, −4)) — 여기서 테두리 원 가까운 쪽 토막 하나에 코어 수직 발이 놓인다 */
const BS_CORNER = bsWorld([12, -4, 0]);
/** 곡선(at, 매개변수 [lo, hi])을 촘촘히 나눈 점들이 화면에서 (x, y)에 가장 가까운 화소 거리 */
const screenMin = (w: View, at: (t: number) => V3, lo: number, hi: number, c: { x: number; y: number }, n = 20000): number => {
  let m = Infinity;
  for (let i = 0; i <= n; i++) {
    const q = w.v.project(at(lo + ((hi - lo) * i) / n))!;
    m = Math.min(m, Math.hypot(q.x - c.x, q.y - c.y));
  }
  return m;
};
const ellPoly = endPolyline(curveEndsAt(scene.meshes, ex, ELL_START)[0]!);
const bsPoly = endPolyline(curveEndsAt(scene.meshes, ex, BS_START)[0]!);

describe('측정 붙잡기를 B-rep 곡선 위로(코어 0.14.0 refine + 앱 curveSnap)', () => {
  it('B-스플라인 판 모서리 끝에서 원기둥 윗 테두리로 내린 수직 발: 코어는 현 위 발, 앱은 원 위 정확한 발(1e-9)이고 거리도 그 발까지', () => {
    const F = BS_CORNER;
    // 코어가 수직 발을 찾는 테두리 토막(첫 점에서 현에 내린 발이 토막 안 — 원의 발은 첫 점 쪽 반지름 방향)
    let pick: { k: number; foot: V3 } | null = null;
    for (let k = 0; k + 1 < rimPoly.length && !pick; k++) {
      const f = perpendicularFoot(F, rimPoly[k]!, rimPoly[k + 1]!, 1e-6);
      const u = f ? dist(f, rimPoly[k]!) / dist(rimPoly[k + 1]!, rimPoly[k]!) : -1;
      if (f && u > 0.2 && u < 0.8 && dot(sub(f, [0, 0, RIM_H]), sub(F, [0, 0, 0])) > 0) pick = { k, foot: f };
    }
    expect(pick, '수직 발이 놓인 테두리 토막').toBeTruthy();
    const { k, foot } = pick!;
    // 원 위 정확한 발: 첫 점 쪽 반지름 방향
    const phi = Math.atan2(F[1], F[0]);
    const exact: V3 = [RIM_R * Math.cos(phi), RIM_R * Math.sin(phi), RIM_H];
    expect(offRim(foot)).toBeGreaterThan(1e-3);
    expect(dist(foot, exact)).toBeGreaterThan(0.05);

    const w = view();
    const { v } = w;
    clickAt(w, F);
    expect(v.measurePointCount).toBe(1);
    expect(v.measurePoints[0]!.refined).toBeUndefined();
    // 토막이 화면에서 수십 화소가 되게(다듬은 발이 코어 발에서 붙잡기 거리 10화소 안이어야 받는다)
    zoomAround(w, rimPoly[Math.max(0, k - 3)]!, rimPoly[k + 4]!);
    const sa = at(w, foot);
    const sb = at(w, exact);
    expect(Math.hypot(sa.x - sb.x, sa.y - sb.y)).toBeLessThan(8);
    hoverAt(w, foot);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.refined).toBe(true);
    close(h.point, exact);
    expect(offRim(h.point)).toBeLessThan(1e-9);
    // 첫 점 → 발이 그 자리 원의 접선에 수직
    const T = rimTangentAt(phi - Math.PI / 6);
    expect(Math.abs(dot(sub(F, h.point), T))).toBeLessThan(1e-9);
    // 잠글 방향도 첫 점 → 다듬은 발
    close(h.direction!, sub(exact, F).map((c) => c / dist(exact, F)), 1e-12);
    expect(hoverSnapLabel(h)).toBe('수직 발');
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, foot);
    expect(got).toHaveLength(1);
    expect(got[0]!.snapB).toBe('perpendicular');
    expect(Math.abs(got[0]!.distance - dist(F, exact))).toBeLessThan(1e-9);
    // 다듬지 않았으면(꺾은선 위 발) 거리가 그만큼 달랐다
    expect(Math.abs(dist(F, foot) - dist(F, exact))).toBeGreaterThan(1e-3);
    expect(v.measurePoints[1]!.refined).toBe(true);
  });

  it('곡선 붙잡기를 주지 않으면(조각을 받기 전) 같은 자리의 수직 발은 꺾은선 위 그대로', () => {
    const F = BS_CORNER;
    let k = -1;
    let foot: V3 | null = null;
    for (let i = 0; i + 1 < rimPoly.length && k < 0; i++) {
      const f = perpendicularFoot(F, rimPoly[i]!, rimPoly[i + 1]!, 1e-6);
      const u = f ? dist(f, rimPoly[i]!) / dist(rimPoly[i + 1]!, rimPoly[i]!) : -1;
      if (f && u > 0.2 && u < 0.8 && dot(sub(f, [0, 0, RIM_H]), sub(F, [0, 0, 0])) > 0) [k, foot] = [i, f];
    }
    const w = view(false);
    clickAt(w, F);
    zoomAround(w, rimPoly[Math.max(0, k - 3)]!, rimPoly[k + 4]!);
    hoverAt(w, foot!);
    expect(w.v.measureHoverSnap!.snap).toBe('perpendicular');
    expect(w.v.measureHoverSnap!.refined).toBeUndefined();
    close(w.v.measureHoverSnap!.point, foot!, 1e-6);
  });

  it('타원 호·B-스플라인 토막 위 점(모서리 위 점)은 곡선 위로, 화면에서는 커서 자리 그대로. 직선 모서리는 그대로', () => {
    const w = view();
    const { v } = w;
    // 타원 호 가운데쯤 토막의 0.3 지점
    const ke = Math.floor(ellPoly.length / 2) - 1;
    zoomAround(w, ellPoly[ke]!, ellPoly[ke + 1]!);
    const pe = lerp(ellPoly[ke]!, ellPoly[ke + 1]!, 0.3);
    hoverAt(w, pe);
    let h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBe(true);
    expect(hoverSnapLabel(h)).toBe('곡선 위 점');
    // 다듬기 전(현 위) 점은 타원에서 떨어져 있고, 다듬은 점은 타원 위
    expect(offCurve(ellAt, ellTangent, pe, ELL_T0, ELL_T1).d).toBeGreaterThan(1e-5);
    expect(offCurve(ellAt, ellTangent, h.point, ELL_T0, ELL_T1).d).toBeLessThan(1e-9);
    // 커서 광선에 가장 가까운 곡선 위 점 — 화면에서 곡선 가운데 커서에 가장 가까운 자리(현의 화살 높이만큼 커서에서 비켜 있다)
    const c = at(w, pe);
    const q = v.project(h.point)!;
    const near = screenMin(w, ellAt, ELL_T0, ELL_T1, c);
    expect(near).toBeGreaterThan(0.5);
    expect(Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - near)).toBeLessThan(0.01);
    // 같은 자리에서 찍으면 미리 본 점 그대로(코어가 앞 결과를 다시 쓴다), 찍은 점에 refined
    clickAt(w, pe);
    expect(v.measurePointCount).toBe(1);
    expect(v.measurePoints[0]!.point).toEqual(h.point);
    expect(v.measurePoints[0]!.refined).toBe(true);

    // B-스플라인(돌린 부품)
    v.clearMeasure();
    v.fit(false);
    v.renderNow();
    const kb = 9;
    zoomAround(w, bsPoly[kb]!, bsPoly[kb + 1]!);
    const pb = lerp(bsPoly[kb]!, bsPoly[kb + 1]!, 0.6);
    hoverAt(w, pb);
    h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBe(true);
    expect(offCurve(bsAt, bsTangentAt, pb, 0, 1).d).toBeGreaterThan(1e-6);
    expect(offCurve(bsAt, bsTangentAt, h.point, 0, 1).d).toBeLessThan(1e-9);
    const cb = at(w, pb);
    const qb = v.project(h.point)!;
    expect(Math.abs(Math.hypot(qb.x - cb.x, qb.y - cb.y) - screenMin(w, bsAt, 0, 1, cb))).toBeLessThan(0.01);

    // 직선 모서리(B-스플라인 판의 곧은 모서리 (12,0) → (12,−4)) 위 점은 다듬지 않는다
    v.fit(false);
    v.renderNow();
    const a = bsWorld([12, 0, 0]);
    const b = bsWorld([12, -4, 0]);
    zoomAround(w, a, b);
    const pl = lerp(a, b, 0.2);
    hoverAt(w, pl);
    h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBeUndefined();
    close(h.point, pl, 1e-5);
    expect(hoverSnapLabel(h)).toBe('면 위 점');
  });

  it('곡선 가운데 점(앱 pointsFor)은 곡선 길이 가운데: 타원 호 위(1e-9)이고 두 끝에서 잰 호 길이가 같다(끝 꼭짓점 float32 정밀도 안)', () => {
    const w = view();
    const { v } = w;
    // 타원 호 길이 가운데의 매개변수(시험이 따로 — 심프슨 적분과 반 나눔)
    const speed = (t: number): number => Math.hypot(12 * Math.sin(t), 6 * Math.cos(t));
    const arc = (a: number, b: number, n = 4000): number => {
      const h = (b - a) / n;
      let s = speed(a) + speed(b);
      for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * speed(a + i * h);
      return (s * h) / 3;
    };
    const L = arc(ELL_T0, ELL_T1);
    let lo = ELL_T0;
    let hi = ELL_T1;
    for (let i = 0; i < 80; i++) {
      const m = 0.5 * (lo + hi);
      if (arc(ELL_T0, m) < L / 2) lo = m;
      else hi = m;
    }
    const mid = ellAt(0.5 * (lo + hi));
    hoverAt(w, mid);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('midpoint');
    expect(h.refined).toBeUndefined();
    // 두 끝 매개변수는 윤곽선 꼭짓점(float32)에서 구하므로 그만큼(좌표 40 둘레에서 1e-6 안) 비킬 수 있다
    close(h.point, mid, 1e-6);
    const tm = offCurve(ellAt, ellTangent, h.point, ELL_T0, ELL_T1);
    expect(tm.d).toBeLessThan(1e-9);
    expect(Math.abs(arc(ELL_T0, tm.t) - arc(tm.t, ELL_T1))).toBeLessThan(1e-6);
  });

  it('곡선 위로 다듬은 첫 점(테두리 30° 지점)에서도 접선 잠금: 그 자리 원 접선(1e-9)으로 잠그고 찍은 거리도 그 직선으로', () => {
    const w = view();
    const { v, tl } = w;
    const c = rimChordAt(rimPoly, Math.PI / 6);
    zoomAround(w, rimPoly[c.seg]!, rimPoly[c.seg + 1]!);
    hoverAt(w, c.point);
    expect(v.measureHoverSnap!.refined).toBe(true);
    clickAt(w, c.point);
    expect(v.measurePointCount).toBe(1);
    const a = v.measurePoints[0]!.point;
    expect(v.measurePoints[0]!.refined).toBe(true);
    // 첫 점은 꺾은선(현)이 아니라 원 위
    expect(offRim(a)).toBeLessThan(1e-9);
    const T = rimTangentAt(Math.atan2(a[1]!, a[0]!) - Math.PI / 6);
    // 같은 토막의 앞 꼭짓점(곡선 위 꼭짓점): 앱은 그 점의 원 접선
    hoverAt(w, rimPoly[c.seg + 1]!);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    close(tl.now(v), T);
    shiftDown(w);
    expect(tl.locked(v)).toBe(true);
    close(v.measureInferenceLock!.direction, T);
    v.fit(false);
    v.renderNow();
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, BS_START, true);
    expect(got).toHaveLength(1);
    expect(got[0]!.distance).toBeCloseTo(Math.abs(dot(sub(BS_START, a), T)), 9);
    expect(tl.result(got[0])).toBe(true);
    // 결과 이름: 첫 점은 곡선 위로 다듬은 점
    expect(snapPair({ ...got[0]!, tangentB: true, refinedA: v.measurePoints[0]!.refined })).toEqual(['곡선 위 점', '접선 방향 · 잠금']);
    shiftUp(w);
  });

  it('곡선 위로 다듬은 커서 아래 점: 첫 점(테두리 이음 꼭짓점·타원 호 가운데 점)에서 같은 곡선 위면 접선', () => {
    // 끝에서: 테두리 이음 꼭짓점 → 원 위로 다듬은 토막 위 점
    const w = view();
    const { v, tl } = w;
    clickAt(w, RIM);
    const k = 3;
    zoomAround(w, rimPoly[k]!, rimPoly[k + 1]!);
    hoverAt(w, lerp(rimPoly[k]!, rimPoly[k + 1]!, 0.5));
    expect(v.measureHoverSnap!.refined).toBe(true);
    expect(offRim(v.measureHoverSnap!.point)).toBeLessThan(1e-9);
    close(tl.now(v), RIM_TANGENT, 1e-6);
    // 가운데에서: 타원 호 곡선 길이 가운데 점(곡선 위 앱 점) → 끝 쪽 다듬은 점·끝 꼭짓점
    const u = view();
    const ee = curveEndsAt(scene.meshes, ex, ELL_START)[0]!;
    const mid = curveSnap(scene.meshes, ex)!.mid(ee.mesh, ee.table, ee.edge)!;
    hoverAt(u, mid);
    expect(u.v.measureHoverSnap!.snap).toBe('midpoint');
    clickAt(u, mid);
    const a = u.v.measurePoints[0]!.point;
    close(a, mid, 1e-12);
    const tm = footParam(ellAt, ellTangent, a, ELL_T0, ELL_T1);
    expect(dist(ellAt(tm), a)).toBeLessThan(1e-9);
    const Te = ellTangent(tm);
    u.tl.track(u.v);
    hoverAt(u, ELL_END);
    close(u.tl.now(u.v), Te, 1e-9);
    const kk = ellPoly.length - 4;
    zoomAround(u, ellPoly[kk]!, ellPoly[kk + 1]!);
    hoverAt(u, lerp(ellPoly[kk]!, ellPoly[kk + 1]!, 0.5));
    expect(u.v.measureHoverSnap!.refined).toBe(true);
    close(u.tl.now(u.v), Te, 1e-9);
    u.v.fit(false);
    u.v.renderNow();
    hoverAt(u, ELL_START);
    close(u.tl.now(u.v), neg(Te), 1e-9);
  });
});
