/**
 * 곡선 모서리 끝에서 그 곡선의 접선 방향으로 잠그기(app/tangent.ts TangentLock)를 실제 코어(opencad-viewer3d) 판정과 함께 본다:
 * 원기둥 윗 테두리 원·타원 호·B-스플라인 모서리 STEP 장면과 앱의 붙잡기 선택(measureSnapOptions)을 가짜 DOM·WebGL2 뷰어에 주고
 * 포인터·키 사건을 넣는다. Shift는 앱처럼 접선 잠금이 코어보다 먼저 보고(창 keydown 캡처 단계), 떼면 코어 다음에 푼다.
 * - 코어는 첫 점(곡선 끝)에서 꺾은선 꼭짓점을 가리키면 그 토막(현) 방향으로 잠그려 한다 — 커서 아래 점이 곡선 위면 접선이 먼저다.
 * - 커서 아래가 방향 추론(축 등)이면 코어 판정 그대로다.
 * - 122차(코어 0.120.0 앱 몫): Shift 누름이 건 접선 잠금은 그 같은 누름의 첫 Shift+Tab이 걸기 전으로 되돌리고 그 Tab을 코어 마우스 Tab 돌리기에 넘긴다
 *   (TangentLock.key — 앱 창 keydown 캡처 단계, 코어 캔버스 리스너보다 먼저). 받지 못하는 자리는 같은 접선으로 다시 잠가 121차와 같고,
 *   다른 키·4화소 넘는 이동·떠남 뒤에는 버린다. 곡선 밖 자리는 코어 0.120.0 되돌리기 그대로
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, measureSnapOptions, snapPair, viewerLockHint, viewerLockName } from '../../src/app/snap';
import { curveEndsAt, endPolyline, TangentLock, type TangentViewer } from '../../src/app/tangent';
import { StepText } from '../stepText';
import { type FakeElement, installDom } from './fakeview';
import {
  bsAt,
  BS_END,
  BS_START,
  BS_T0,
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
  halfway,
  RIM,
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
const angleDeg = (a: readonly number[], b: readonly number[]): number => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180) / Math.PI;
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-6): void => {
  expect(a, `방향 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};

interface View {
  v: Viewer3d;
  canvas: FakeElement;
  tl: TangentLock;
}

/** 실제 코어 뷰어에 곡선 장면과 앱의 측정 붙잡기 선택을 주고 남동 등각으로 맞춘다(측정 모드) + 앱의 접선 잠금 */
function view(s = scene): View {
  const x = s === scene ? ex : stepEdgeIndex(s)!;
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(s);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(measureSnapOptions(s.meshes, x, circleCenters(s.meshes, x)));
  return { v, canvas: v.canvas as unknown as FakeElement, tl: new TangentLock(() => ({ meshes: s.meshes, ex: x })) };
}

/** 반원판: (10,0,0) → (−10,0,0) 지름과 +y 쪽 반원(반지름 10) — 첫 점 A = (10,0,0)은 반원의 끝이자 지름의 시작 */
function halfDisc() {
  const w = new StepText();
  const mm = w.context('mm');
  const A = w.vertex([10, 0, 0]);
  const B = w.vertex([-10, 0, 0]);
  const arc = w.edge(B, A, w.circle([0, 0, 0], 10), false);
  const dia = w.edge(A, B, w.line([10, 0, 0], [-10, 0, 0]));
  const face = w.face([w.bound(w.loop([w.oe(dia, true), w.oe(arc, true)]))], w.plane([0, 0, 0], [0, 0, -1]));
  const item = w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
  w.product('half-disc', [item], mm, 'SHAPE_REPRESENTATION');
  return stepToScene(w.bytes());
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey: boolean): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
/** 세계 점 자리로 커서를 한 번에 옮기고 그린 뒤 앱처럼 커서 아래를 읽는다(접선 잠금 track) */
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
/** 앱처럼: 창 keydown 캡처 단계에서 접선 잠금이 먼저, 그 뒤 코어(handleKey) */
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
/** 첫 점을 찍은 새 뷰어 */
function from(p: V3): View {
  const w = view();
  clickAt(w, p);
  expect(w.v.measurePointCount).toBe(1);
  expect(dist(w.v.measurePoints[0]!.point, p)).toBeLessThan(1e-4);
  return w;
}
const rimEnds = curveEndsAt(scene.meshes, ex, RIM);
const rimPoly = endPolyline(rimEnds[0]!);

describe('곡선 모서리 끝의 접선 잠금: 실제 코어 판정 + 앱 TangentLock', () => {
  it('원기둥 윗 테두리 이음 꼭짓점에서 원 위 꺾은선 꼭짓점: 코어는 현 방향, Shift는 원의 접선으로 잠근다(떼면 푼다)', () => {
    const w = from(RIM);
    const { v, tl } = w;
    hoverAt(w, rimPoly[1]!);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    // 코어가 볼 잠금 = 꺾은선 첫 토막(현) 방향 — 접선과 반 토막 각만큼 다르다
    const chord = v.measureHoverLock!;
    expect(chord).toBeTruthy();
    expect(angleDeg(chord.direction, RIM_TANGENT)).toBeGreaterThan(1);
    close(tl.now(v), RIM_TANGENT);
    expect(viewerLockHint(v, false, tl)).toBe('Shift·화살표로 방향 잠금');
    shiftDown(w);
    const l = v.measureInferenceLock!;
    expect(l).toMatchObject({ kind: 'parallel', source: 'api' });
    close(l.direction, RIM_TANGENT);
    expect(tl.locked(v)).toBe(true);
    expect(viewerLockName(v, tl)).toBe('tangent');
    expect(viewerLockHint(v, false, tl)).toBe('접선 방향으로 잠금');
    expect(hoverSnapLabel(v.measureHoverSnap, tl.locked(v))).toBe('접선 방향 · 잠금');
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
    expect(tl.locked(v)).toBe(false);
  });

  it('테두리 뒤 절반(이음 꼭짓점 바로 앞 꼭짓점): 거꾸로 도는 쪽 접선, 잠근 채 찍으면 결과 이름이 "접선 방향 · 잠금"', () => {
    const w = from(RIM);
    const { v, tl } = w;
    hoverAt(w, rimPoly[rimPoly.length - 2]!);
    close(tl.now(v), neg(RIM_TANGENT));
    shiftDown(w);
    close(v.measureInferenceLock!.direction, neg(RIM_TANGENT));
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    // 잠근 채 B-스플라인 판 끝을 찍으면 접선 직선으로 내린 자리
    clickAt(w, BS_START, true);
    expect(got).toHaveLength(1);
    const m = got[0]!;
    expect(m.lockedB).toBe(true);
    // 접선은 float32(모서리 표)라 16 mm 앞에서 1e-6 mm 안쪽으로 맞는다
    const along = dot(sub(BS_START, RIM), neg(RIM_TANGENT));
    expect(m.distance).toBeCloseTo(Math.abs(along), 5);
    expect(tl.result(m)).toBe(true);
    expect(snapPair({ ...m, tangentB: tl.result(m) })![1]).toBe('접선 방향 · 잠금');
    expect(v.measureInferenceLock).toBeNull();
    shiftUp(w);
  });

  it('커서 아래가 축 방향 추론(첫 점 바로 아래 원기둥 옆면)이면 코어 판정: Shift는 Z축', () => {
    const w = from(RIM);
    const { v, tl } = w;
    hoverAt(w, [RIM[0], RIM[1], RIM[2] - 6]);
    expect(v.measureHoverSnap!.snap).toBe('axis');
    expect(tl.now(v)).toBeNull();
    shiftDown(w);
    expect(viewerLockName(v, tl)).toBe('z');
    shiftUp(w);
  });

  it('타원 호 시작에서 그 호의 B-rep 가운데 점: 코어는 잠글 방향이 없고, ↓·잠금 단추(lockNow)는 타원 접선', () => {
    const w = from(ELL_START);
    const { v, tl } = w;
    const mid = curveEndsAt(scene.meshes, ex, ELL_START)[0]!;
    // 앱 pointsFor가 주는 곡선 길이 가운데 점(꺾은선 위)
    const poly = endPolyline(mid);
    let total = 0;
    for (let i = 1; i < poly.length; i++) total += dist(poly[i]!, poly[i - 1]!);
    let acc = 0;
    let m: V3 = poly[0]!;
    for (let i = 1; i < poly.length; i++) {
      const l = dist(poly[i]!, poly[i - 1]!);
      if (acc + l >= total / 2) {
        const t = (total / 2 - acc) / l;
        m = [0, 1, 2].map((k) => poly[i - 1]![k]! + (poly[i]![k]! - poly[i - 1]![k]!) * t) as V3;
        break;
      }
      acc += l;
    }
    hoverAt(w, m);
    expect(v.measureHoverSnap!.snap).toBe('midpoint');
    expect(v.measureHoverLock).toBeNull();
    expect(viewerLockHint(v, false, null)).toBe('화살표로 축 잠금');
    expect(viewerLockHint(v, false, tl)).toBe('Shift·화살표로 방향 잠금');
    expect(tl.lockNow(v)).toBe(true);
    close(v.measureInferenceLock!.direction, ellTangent(ELL_T0));
    expect(tl.locked(v)).toBe(true);
  });

  it('B-스플라인(돌린 부품) 시작에서 다른 끝을 본 뒤 커서가 떠나도 잠금 단추는 마지막으로 본 접선, 축을 본 뒤면 코어 방향', () => {
    const w = from(BS_START);
    const { v, tl } = w;
    hoverAt(w, BS_END);
    close(tl.now(v), BS_T0);
    w.canvas.fire('pointerleave', {});
    v.renderNow();
    tl.track(v);
    expect(v.measureHoverSnap).toBeNull();
    expect(tl.lockNow(v)).toBe(true);
    close(v.measureInferenceLock!.direction, BS_T0);
    // 다시: 접선을 본 뒤 축 방향 추론을 보고 떠나면 코어의 마지막으로 본 방향(Z축)
    const u = from(BS_START);
    hoverAt(u, BS_END);
    hoverAt(u, [BS_START[0], BS_START[1], BS_START[2] + 6]);
    expect(u.v.measureHoverSnap!.snap).toBe('axis');
    u.canvas.fire('pointerleave', {});
    u.v.renderNow();
    u.tl.track(u.v);
    expect(u.tl.lockNow(u.v)).toBe(true);
    expect(viewerLockName(u.v, u.tl)).toBe('z');
    // 본 것이 없으면 잠그지 않는다
    const x = from(BS_START);
    expect(x.tl.lockNow(x.v)).toBe(false);
  });

  it('반원판: 첫 점(반원 끝·지름 시작)에서 반원의 다른 끝 = 지름의 다른 끝이면 코어의 지름 방향(X축), 반원 꺾은선 꼭짓점이면 반원 접선(+Y)', () => {
    const disc = halfDisc();
    const w = view(disc);
    const { v, tl } = w;
    const A: V3 = [10, 0, 0];
    clickAt(w, A);
    expect(v.measurePointCount).toBe(1);
    // 다른 끝: 코어는 지름(곧은 B-rep 모서리)으로 잠그려 한다 — 반원 현이 아니므로 그대로
    hoverAt(w, [-10, 0, 0]);
    expect(v.measureHoverLock).toMatchObject({ kind: 'axis', axis: 'x' });
    expect(tl.now(v)).toBeNull();
    shiftDown(w);
    expect(viewerLockName(v, tl)).toBe('x');
    shiftUp(w);
    // 반원을 그린 꺾은선의 A 바로 옆 꼭짓점: 코어는 그 현으로 잠그려 하고, 앱은 반원 접선(A에서 +Y)
    const x = stepEdgeIndex(disc)!;
    const arc = curveEndsAt(disc.meshes, x, A)[0]!;
    const poly = endPolyline(arc);
    hoverAt(w, poly[poly.length - 2]!);
    expect(angleDeg(v.measureHoverLock!.direction, [0, 1, 0])).toBeGreaterThan(1);
    close(tl.now(v), [0, 1, 0]);
    shiftDown(w);
    expect(viewerLockName(v, tl)).toBe('tangent');
    close(v.measureInferenceLock!.direction, [0, 1, 0]);
    shiftUp(w);
  });

  it('새 첫 점이면 접선 기록을 잊는다(다른 잠금의 결과를 접선으로 읽지 않는다)', () => {
    const w = from(BS_START);
    const { v, tl } = w;
    hoverAt(w, BS_END);
    shiftDown(w);
    expect(tl.locked(v)).toBe(true);
    shiftUp(w);
    v.clearMeasure();
    clickAt(w, RIM);
    hoverAt(w, [RIM[0], RIM[1], RIM[2] - 6]);
    shiftDown(w);
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, [RIM[0], RIM[1], RIM[2] - 10], true);
    expect(got[0]!.lockedB).toBe(true);
    expect(tl.result(got[0])).toBe(false);
    shiftUp(w);
  });
});

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

describe('곡선 모서리의 끝이 아닌 곳에서의 접선 잠금: 실제 코어 판정 + 앱 TangentLock', () => {
  const ellPoly = endPolyline(curveEndsAt(scene.meshes, ex, ELL_START)[0]!);
  const bsPoly = endPolyline(curveEndsAt(scene.meshes, ex, BS_START)[0]!);

  it('원기둥 테두리 30° 지점(코어 모서리 위 점 — 꺾은선 현 위): 그 토막 끝 꼭짓점에서 코어는 현, Shift·결과는 그 점의 원 접선', () => {
    const w = view();
    const { v, tl } = w;
    const c = rimChordAt(rimPoly, Math.PI / 6);
    // 토막이 화면에서 짧아 꼭짓점에 붙지 않도록 그 토막을 크게 본다
    zoomAround(w, rimPoly[c.seg]!, rimPoly[c.seg + 1]!);
    hoverAt(w, c.point);
    expect(v.measureHoverSnap!.snap).toBeNull();
    clickAt(w, c.point);
    expect(v.measurePointCount).toBe(1);
    const a = v.measurePoints[0]!.point;
    expect(dist(a, c.point)).toBeLessThan(1e-5);
    // 꺾은선(현) 위라 원에서 안쪽으로 비켜 있다 — 접선은 그 점에서 원 위 가장 가까운 점(같은 각)의 접선
    expect(10 - Math.hypot(a[0]!, a[1]!)).toBeGreaterThan(1e-3);
    const th = Math.atan2(a[1]!, a[0]!) - Math.PI / 6;
    const T = rimTangentAt(th);
    expect(Math.abs(th - Math.PI / 6)).toBeLessThan(1e-5);
    // 같은 토막의 앞 꼭짓점: 코어는 그 토막(현) 방향으로 잠그려 한다 — 앱은 원 접선
    hoverAt(w, rimPoly[c.seg + 1]!);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    const chord = v.measureHoverLock!;
    expect(chord).toBeTruthy();
    expect(angleDeg(chord.direction, T)).toBeGreaterThan(1);
    close(tl.now(v), T, 1e-9);
    expect(viewerLockHint(v, false, tl)).toBe('Shift·화살표로 방향 잠금');
    shiftDown(w);
    expect(viewerLockName(v, tl)).toBe('tangent');
    close(v.measureInferenceLock!.direction, T, 1e-9);
    // 다시 다 보이게 한 뒤 잠근 채 B-스플라인 판 끝을 찍으면 접선 직선으로 내린 자리
    v.fit(false);
    v.renderNow();
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, BS_START, true);
    expect(got).toHaveLength(1);
    expect(got[0]!.lockedB).toBe(true);
    expect(got[0]!.distance).toBeCloseTo(Math.abs(dot(sub(BS_START, a), T)), 5);
    expect(tl.result(got[0])).toBe(true);
    shiftUp(w);
  });

  it('타원 호 가운데 점(앱이 주는 곡선 길이 가운데 점): 끝을 보면 그 점의 타원 접선(끝 쪽), 시작을 보면 반대 — 코어는 잠글 방향이 없다', () => {
    const w = view();
    const { v, tl } = w;
    const m = halfway(ellPoly);
    hoverAt(w, m);
    expect(v.measureHoverSnap!.snap).toBe('midpoint');
    clickAt(w, m);
    const a = v.measurePoints[0]!.point;
    expect(dist(a, m)).toBeLessThan(1e-5);
    const tm = footParam(ellAt, ellTangent, a, ELL_T0, ELL_T1);
    const T = ellTangent(tm);
    // 호 가운데 점의 접선은 호 끝 접선과 다르다
    expect(angleDeg(T, ellTangent(ELL_T0))).toBeGreaterThan(30);
    hoverAt(w, ELL_END);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    expect(v.measureHoverLock).toBeNull();
    close(tl.now(v), T, 1e-9);
    hoverAt(w, ELL_START);
    close(tl.now(v), neg(T), 1e-9);
    expect(tl.lockNow(v)).toBe(true);
    close(v.measureInferenceLock!.direction, neg(T), 1e-9);
    expect(tl.locked(v)).toBe(true);
    expect(viewerLockName(v, tl)).toBe('tangent');
  });

  it('B-스플라인(돌린 부품) 중간 꺾은선 꼭짓점: 이웃 꼭짓점에서 코어는 그 토막, Shift는 그 점의 곡선 접선, 뒤 꼭짓점이면 반대', () => {
    const w = view();
    const { v, tl } = w;
    const k = 8;
    const p = bsPoly[k]!;
    zoomAround(w, bsPoly[k - 1]!, bsPoly[k + 1]!);
    hoverAt(w, p);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    clickAt(w, p);
    const a = v.measurePoints[0]!.point;
    expect(dist(a, p)).toBeLessThan(1e-5);
    const u = footParam(bsAt, bsTangentAt, a, 0, 1);
    const T = bsTangentAt(u);
    hoverAt(w, bsPoly[k + 1]!);
    const chord = v.measureHoverLock!;
    expect(chord).toBeTruthy();
    expect(angleDeg(chord.direction, T)).toBeGreaterThan(0.5);
    close(tl.now(v), T, 1e-9);
    shiftDown(w);
    expect(viewerLockName(v, tl)).toBe('tangent');
    close(v.measureInferenceLock!.direction, T, 1e-9);
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
    hoverAt(w, bsPoly[k - 1]!);
    close(tl.now(v), neg(T), 1e-9);
    // 첫 점에서 곡선이 아닌 곳(판의 곧은 모서리 끝)을 보면 코어 판정 그대로
    v.fit(false);
    v.renderNow();
    hoverAt(w, bsWorld([12, -4, 0]));
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    expect(tl.now(v)).toBeNull();
  });
});

describe('코어 0.16.0 선분 식별자로 찾은 첫 점의 곡선과 커서 아래 판정이 좌표로 찾던 것과 같다(실제 코어)', () => {
  /** 식별자를 지운 뷰어 상태(0.15.0 코어처럼) — 같은 코어 상태에서 예전 찾기를 돌린다 */
  const bare = (v: Viewer3d): TangentViewer => ({
    get measureMode() {
      return v.measureMode;
    },
    get measurePointCount() {
      return v.measurePointCount;
    },
    get measurePoints() {
      return v.measurePoints.map((p) => {
        const q = { ...p };
        delete q.segment;
        delete q.other;
        return q;
      });
    },
    get measureHoverSnap() {
      const h = v.measureHoverSnap;
      if (!h) return h;
      const q = { ...h };
      delete q.segment;
      delete q.other;
      return q;
    },
    get measureHoverLock() {
      return v.measureHoverLock;
    },
    get measureInferenceLock() {
      return v.measureInferenceLock;
    },
    setMeasureInferenceLock: (l: Parameters<Viewer3d['setMeasureInferenceLock']>[0]) => v.setMeasureInferenceLock(l),
  });
  const bsPoly = endPolyline(curveEndsAt(scene.meshes, ex, BS_START)[0]!);
  const ellPoly = endPolyline(curveEndsAt(scene.meshes, ex, ELL_START)[0]!);

  /** 첫 점을 찍고 여러 자리를 가리키며 두 TangentLock(식별자·좌표)의 접선을 견준다 */
  function compare(w: View, first: V3, hovers: readonly V3[], by: 'segment' | 'coords', zoom?: [V3, V3]): number {
    if (zoom) zoomAround(w, zoom[0], zoom[1]);
    clickAt(w, first);
    expect(w.v.measurePointCount).toBe(1);
    if (zoom) {
      w.v.fit(false);
      w.v.renderNow();
    }
    const old = new TangentLock(() => ({ meshes: scene.meshes, ex }));
    let locked = 0;
    for (const p of hovers) {
      hoverAt(w, p);
      const a = w.tl.now(w.v);
      const b = old.now(bare(w.v));
      expect(!!a, `${p}`).toBe(!!b);
      if (a && b) {
        locked++;
        for (let k = 0; k < 3; k++) expect(a[k]).toBe(b[k]);
      }
    }
    expect(w.tl.firstBy).toBe(by);
    expect(old.firstBy).toBe('coords');
    return locked;
  }

  it('테두리 30° 지점(모서리 위 점)과 B-스플라인 중간 꼭짓점은 식별자로, 이음 꼭짓점(모서리 끝)·앱이 준 타원 가운데 점은 좌표로 — 접선이 비트까지 같다', () => {
    const c = rimChordAt(rimPoly, Math.PI / 6);
    const rimHovers = [rimPoly[c.seg + 1]!, rimPoly[c.seg + 3]!, rimPoly[c.seg - 1]!, BS_START, RIM];
    expect(compare(view(), c.point, rimHovers, 'segment', [rimPoly[c.seg]!, rimPoly[c.seg + 1]!])).toBeGreaterThanOrEqual(2);
    const k = 8;
    expect(compare(view(), bsPoly[k]!, [bsPoly[k + 1]!, bsPoly[k - 1]!, bsPoly[k + 3]!, bsWorld([12, -4, 0])], 'segment', [bsPoly[k - 1]!, bsPoly[k + 1]!])).toBeGreaterThanOrEqual(2);
    expect(compare(view(), RIM, [rimPoly[2]!, rimPoly[rimPoly.length - 3]!, halfway(rimPoly)], 'coords')).toBeGreaterThanOrEqual(2);
    expect(compare(view(), halfway(ellPoly), [ELL_END, ELL_START], 'coords')).toBe(2);
  });
});

/** 122차: 키 사건(브라우저처럼 막기·멈춤을 적는다 — 막은 사건은 코어 handleKey가 다시 받지 않는다) */
interface KeyEv {
  key: string;
  code: string;
  shiftKey: boolean;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
const kev = (k: string, o: { shiftKey?: boolean; repeat?: boolean } = {}): KeyEv => ({
  key: k,
  code: k,
  shiftKey: o.shiftKey ?? k === 'Shift',
  repeat: !!o.repeat,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  stopped: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
});

/**
 * 앱처럼 창 keydown 한 번: 캡처 단계에서 접선 잠금이 먼저(122차 TangentLock.key — 그것이 없던 121차 판은 app.ts 그때 길: Shift 누름만 shiftDown),
 * 사건을 멈추지 않았으면 코어 캔버스 리스너(handleKey), 그리고 다음 그림. 앱 길이 돌려준 값(0 그대로·1 잠금 바뀜·2 코어 Tab 돌리기가 받음)
 */
const appKey = (w: View, e: KeyEv): number => {
  const tl = w.tl as TangentLock & { key?: TangentLock['key'] };
  const k = e as unknown as KeyboardEvent;
  const r = typeof tl.key === 'function' ? tl.key(w.v, k) : e.key === 'Shift' && !e.repeat ? +tl.shiftDown(w.v) : 0;
  if (!e.stopped) w.v.handleKey(k);
  w.v.renderNow();
  return r;
};

/** 첫 점을 찍은 새 뷰어 — 접선 잠금이 3D 보기 캔버스의 포인터 자리를 듣는다(app.ts처럼 v.canvas를 준다) */
function keyFrom(p: V3): View {
  const w = view();
  const kw: View = { ...w, tl: new TangentLock(() => ({ meshes: scene.meshes, ex }), w.canvas as unknown as EventTarget) };
  clickAt(kw, p);
  expect(kw.v.measurePointCount).toBe(1);
  return kw;
}

/**
 * 원 위 꺾은선 꼭짓점 rimPoly[1]에서 윗면 가운데 쪽으로 3화소 — 그 꼭짓점(첫 후보·접선)과 윗면 점이 겹친 자리(꼭짓점 바로 위는 후보가 하나뿐이다).
 * 경계를 정확히 가리키지 않는다
 */
const nearRim = (w: View): { x: number; y: number } => {
  const c = at(w, rimPoly[1]!);
  const m = at(w, [0, 0, RIM[2]]);
  const k = 3 / Math.hypot(m.x - c.x, m.y - c.y);
  return { x: c.x + (m.x - c.x) * k, y: c.y + (m.y - c.y) * k };
};
/** 화면 자리로 커서를 옮기고 그린 뒤 앱처럼 커서 아래를 읽는다 */
const hoverPx = (w: View, q: { x: number; y: number }, shift = false): void => {
  ptr(w, 'pointermove', q.x, q.y, 0, shift);
  w.v.renderNow();
  w.tl.track(w.v);
};
/** 겹친 후보 자리(nearRim)의 걸기 전 후보와 그 첫 후보가 꼭짓점 rimPoly[1]·접선인지 */
const overlapAt = (w: View): { q: { x: number; y: number }; list: ReturnType<Viewer3d['measureCandidates']>; n: number } => {
  const q = nearRim(w);
  hoverPx(w, q);
  const list = w.v.measureCandidates(q.x, q.y);
  expect(list.length, '그 자리 후보(걸기 전)').toBeGreaterThanOrEqual(2);
  expect(w.v.measureHoverSnap!.cycle).toBeUndefined();
  expect(w.v.measureHoverSnap!.point).toEqual(list[0]!.point);
  expect(dist(list[0]!.point, rimPoly[1]!)).toBeLessThan(1e-4);
  close(w.tl.now(w.v), RIM_TANGENT);
  return { q, list, n: list.length };
};

describe('곡선 위 Shift+Tab을 누르려고 먼저 누른 Shift의 접선 잠금 되돌리기(122차 — 코어 0.120.0 앱 몫, 실제 코어 Tab 돌리기)', () => {
  it('원 위 꺾은선 꼭짓점과 윗면 점이 겹친 자리(돌리지 않던 자리)에서 Shift는 접선 잠금, 같은 누름의 첫 Shift+Tab은 잠금을 풀고 잠그지 않은 그 자리 후보의 끝(코어 차례 n/n — 기본 동작 막음·사건 멈춤) — 4화소 안 이동·키 되풀이·다른 Shift 누름에 다시 잠그지 않고 다음 Shift+Tab은 코어가 이어 돎, 뗀 뒤 새 Shift는 다시 접선 잠금·그 누름도 되돌림', () => {
    const w = keyFrom(RIM);
    const { v, tl } = w;
    const { q, list, n } = overlapAt(w);
    // Shift 누름: 121차처럼 접선 잠금
    expect(appKey(w, kev('Shift'))).toBe(1);
    expect(tl.locked(v)).toBe(true);
    close(v.measureInferenceLock!.direction, RIM_TANGENT);
    expect(viewerLockName(v, tl)).toBe('tangent');
    // 같은 누름의 첫 Shift+Tab: 잠금 없이 코어 Tab 돌리기의 앞 후보(돌리지 않던 자리 → 끝 후보)
    const tab = kev('Tab', { shiftKey: true });
    expect(appKey(w, tab)).toBe(2);
    expect(tab.defaultPrevented).toBe(true);
    expect(tab.stopped).toBe(true);
    expect(v.measureInferenceLock).toBeNull();
    expect(tl.locked(v)).toBe(false);
    expect(viewerLockName(v, tl)).toBeNull();
    expect(v.measureHoverSnap!.cycle).toEqual({ index: n - 1, count: n });
    expect(v.measureHoverSnap!.point).toEqual(list[n - 1]!.point);
    // 같은 누름: Shift 누른 채 4화소 안 이동·키 되풀이·다른 Shift 키 누름 — 다시 잠그지 않고 돌리기도 그대로
    ptr(w, 'pointermove', q.x + 2, q.y + 1, 0, true);
    v.renderNow();
    tl.track(v);
    expect(appKey(w, kev('Shift', { repeat: true }))).toBe(0);
    expect(appKey(w, kev('Shift'))).toBe(0);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap!.cycle).toEqual({ index: n - 1, count: n });
    // 다음 Shift+Tab: 앱은 넘기지 않고 코어가 이어 돈다
    const tab2 = kev('Tab', { shiftKey: true });
    expect(appKey(w, tab2)).toBe(0);
    expect(tab2.defaultPrevented).toBe(true);
    expect(tab2.stopped).toBe(false);
    expect(v.measureHoverSnap!.cycle).toEqual({ index: n - 2, count: n });
    expect(v.measureInferenceLock).toBeNull();
    // 뗀 뒤: 그 자리를 벗어났다 돌아와 새 Shift는 다시 접선 잠금, 그 누름의 Shift+Tab도 되돌린다
    shiftUp(w);
    hoverPx(w, { x: q.x + 12, y: q.y + 12 });
    hoverPx(w, q);
    expect(v.measureHoverSnap!.cycle).toBeUndefined();
    expect(v.measureHoverSnap!.point).toEqual(list[0]!.point);
    expect(appKey(w, kev('Shift'))).toBe(1);
    expect(tl.locked(v)).toBe(true);
    expect(appKey(w, kev('Tab', { shiftKey: true }))).toBe(2);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap!.cycle).toEqual({ index: n - 1, count: n });
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('되돌리기를 버리는 차례(Shift 누른 채 4화소 넘게 갔다 돌아옴·다른 키·3D 보기를 떠났다 돌아옴) 뒤 Shift+Tab은 121차처럼 접선 잠근 채 코어가 받는다 — Tab 없는 Shift는 지금처럼 잠갔다 뗄 때 풂', () => {
    const w = keyFrom(RIM);
    const { v, tl } = w;
    const { q } = overlapAt(w);
    const back = (): void => hoverPx(w, q, true);
    const cases: [string, () => void][] = [
      [
        '4화소 넘게 갔다 돌아옴',
        () => {
          ptr(w, 'pointermove', q.x + 6, q.y, 0, true);
          v.renderNow();
          back();
        },
      ],
      ['다른 키', () => void appKey(w, kev('Control'))],
      [
        '떠났다 돌아옴',
        () => {
          w.canvas.fire('pointerleave', { clientX: q.x, clientY: q.y, pointerId: 1, pointerType: 'mouse' });
          v.renderNow();
          back();
        },
      ],
    ];
    for (const [what, between] of cases) {
      expect(appKey(w, kev('Shift')), what).toBe(1);
      expect(tl.locked(v), what).toBe(true);
      between();
      expect(tl.locked(v), what).toBe(true);
      const tab = kev('Tab', { shiftKey: true });
      expect(appKey(w, tab), what).toBe(0);
      expect(tab.stopped, what).toBe(false);
      expect(tl.locked(v), what).toBe(true);
      close(v.measureInferenceLock!.direction, RIM_TANGENT);
      shiftUp(w);
      expect(v.measureInferenceLock, what).toBeNull();
      // 다음 차례를 같은 자리(돌리지 않던 첫 후보)에서
      hoverPx(w, { x: q.x + 12, y: q.y + 12 });
      hoverPx(w, q);
    }
    // Tab 없는 Shift: 잠갔다 떼면 푼다(121차와 같음)
    expect(appKey(w, kev('Shift'))).toBe(1);
    expect(viewerLockName(v, tl)).toBe('tangent');
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('걸기 전 그 자리 후보가 하나(꺾은선 꼭짓점 바로 위)면 코어 Tab 돌리기가 받지 않아 같은 접선으로 다시 잠근다 — 121차처럼 잠근 채 코어가 받음(잠근 선 위 후보를 돎)', () => {
    const w = keyFrom(RIM);
    const { v, tl } = w;
    hoverAt(w, rimPoly[1]!);
    const q = at(w, rimPoly[1]!);
    expect(v.measureCandidates(q.x, q.y)).toHaveLength(1);
    expect(appKey(w, kev('Shift'))).toBe(1);
    expect(tl.locked(v)).toBe(true);
    const tab = kev('Tab', { shiftKey: true });
    expect(appKey(w, tab)).toBe(0);
    expect(tab.stopped).toBe(false);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(tl.locked(v)).toBe(true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'parallel', source: 'api' });
    close(v.measureInferenceLock!.direction, RIM_TANGENT);
    expect(viewerLockName(v, tl)).toBe('tangent');
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('Tab으로 돌리다 Esc로 푼 자리도 코어 Tab 돌리기가 받지 않아 같은 접선으로 다시 잠근다(121차처럼 잠근 채·초점 이동)', () => {
    const w = keyFrom(RIM);
    const { v, tl } = w;
    const { list } = overlapAt(w);
    const first = list[0]!.point;
    const t1 = kev('Tab');
    expect(appKey(w, t1)).toBe(0);
    expect(t1.defaultPrevented).toBe(true);
    expect(v.measureHoverSnap!.cycle?.index).toBe(1);
    const esc = kev('Escape');
    appKey(w, esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(v.measurePointCount).toBe(1);
    expect(v.measureHoverSnap!.cycle).toBeUndefined();
    expect(v.measureHoverSnap!.point).toEqual(first);
    expect(appKey(w, kev('Shift'))).toBe(1);
    expect(tl.locked(v)).toBe(true);
    const tab = kev('Tab', { shiftKey: true });
    expect(appKey(w, tab)).toBe(0);
    expect(tab.defaultPrevented).toBe(false);
    expect(tab.stopped).toBe(false);
    expect(tl.locked(v)).toBe(true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'parallel', source: 'api' });
    close(v.measureInferenceLock!.direction, RIM_TANGENT);
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('곡선 밖 자리(첫 점 아래 축 — 코어가 잠금)는 앱이 잠그지도 되돌릴 것을 두지도 않아 코어 0.120.0 되돌리기와 같다(앱 없이 코어만 받은 뷰어와 같은 잠금·미리 보기·막기)', () => {
    const below: V3 = [RIM[0], RIM[1], RIM[2] - 6];
    const go = (app: boolean) => {
      const w = keyFrom(RIM);
      const { v } = w;
      hoverAt(w, below);
      expect(v.measureHoverSnap!.snap).toBe('axis');
      const press = (e: KeyEv): number => {
        if (app) return appKey(w, e);
        v.handleKey(e as unknown as KeyboardEvent);
        v.renderNow();
        return 0;
      };
      expect(press(kev('Shift'))).toBe(0);
      expect(v.measureInferenceLock).toMatchObject({ axis: 'z', source: 'shift' });
      const tab = kev('Tab', { shiftKey: true });
      expect(press(tab)).toBe(0);
      return { lock: v.measureInferenceLock, hover: v.measureHoverSnap, prevented: tab.defaultPrevented, stopped: tab.stopped };
    };
    expect(go(true)).toEqual(go(false));
  });

  it('app.ts 길: 창 keydown 캡처가 모든 키를 먼저 접선 잠금(key)에 넘기고 코어 Tab 돌리기가 받았으면 손질·화살표 키를 보지 않으며, 접선 잠금에 3D 보기 캔버스를 준다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain("if (this.tangentShift(ev) || ev.ctrlKey || ev.metaKey || ev.altKey || ev.key === 'Shift') return;");
    expect(app).toContain('const r = ev ? t.key(v, ev) : +t.shiftUp(v);');
    expect(app).toMatch(/new m\.TangentLock\(\(\) => \(this\.doc \? \{[^\n]*\} : null\), v\.canvas\)/);
  });
});
