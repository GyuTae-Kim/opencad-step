/**
 * 곡선 모서리 끝에서 그 곡선의 접선 방향으로 잠그기(app/tangent.ts TangentLock)를 실제 코어(opencad-viewer3d) 판정과 함께 본다:
 * 원기둥 윗 테두리 원·타원 호·B-스플라인 모서리 STEP 장면과 앱의 붙잡기 선택(measureSnapOptions)을 가짜 DOM·WebGL2 뷰어에 주고
 * 포인터·키 사건을 넣는다. Shift는 앱처럼 접선 잠금이 코어보다 먼저 보고(창 keydown 캡처 단계), 떼면 코어 다음에 푼다.
 * - 코어는 첫 점(곡선 끝)에서 꺾은선 꼭짓점을 가리키면 그 토막(현) 방향으로 잠그려 한다 — 커서 아래 점이 곡선 위면 접선이 먼저다.
 * - 커서 아래가 방향 추론(축 등)이면 코어 판정 그대로다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, measureSnapOptions, snapPair, viewerLockHint, viewerLockName } from '../../src/app/snap';
import { curveEndsAt, endPolyline, TangentLock } from '../../src/app/tangent';
import { StepText } from '../stepText';
import { type FakeElement, installDom } from './fakeview';
import { BS_END, BS_START, BS_T0, curveStep, ELL_START, ELL_T0, ellTangent, RIM, RIM_TANGENT, type V3 } from './curvescene';

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
