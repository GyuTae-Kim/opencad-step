/**
 * 코어 0.15.0 열린 후보·교차점 다듬기를 실제 코어(opencad-viewer3d) 판정과 함께 본다(가짜 DOM·WebGL2 뷰어에 포인터 사건):
 * 원기둥 윗 테두리 원과 3D로 만나는 곧은 모서리·세로 원·B-스플라인, 멀리 떨어진 판(crossscene.ts)에 앱의 측정 붙잡기 선택(곡선 붙잡기 포함)을 준다.
 * - 멀리서 내린 원 위 발: 첫 점에서 꺾은선 토막에 내린 발이 모두 토막 밖이라 0.14.0까지는 후보가 없던 자리 — 코어가 열린 후보로 넘기고 앱이 원 위 발로
 * - 교차점: 테두리 꺾은선(현)은 세 모서리를 비켜 지나가 꺾은선 교차점이 없다 — 코어의 넓힌 교차를 앱이 두 곡선의 정확한 교차점으로
 * - 곡선 붙잡기를 주지 않으면(조각을 받기 전) 둘 다 후보가 없다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import { perpendicularFoot } from 'opencad-viewer3d/inference';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, measureSnapOptions, snapPair } from '../../src/app/snap';
import { curveSnap, toWorld } from '../../src/app/curvesnap';
import { type FakeElement, installDom } from './fakeview';
import { crossStep, FAR, FAR_FOOT, LINE_X, RIM_H, RIM_R, RING_X, SPL_X } from './crossscene';
import type { V3 } from './curvescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const scene = stepToScene(crossStep());
const ex = stepEdgeIndex(scene)!;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};

/** 원기둥 윗 테두리 꺾은선(세계) */
const rimPoly = ((): V3[] => {
  for (const mesh of scene.meshes) {
    const t = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const E = mesh.edges!;
    for (let e = 0; e + 1 < t.segStart.length; e++) {
      const s0 = t.segStart[e]!;
      const p0 = toWorld(mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!);
      if (ex.kinds[t.kinds[e]!] !== 'circle' || p0[2] !== RIM_H || Math.abs(Math.hypot(p0[0], p0[1]) - RIM_R) > 1e-5) continue;
      const out = [p0];
      for (let s = s0; s < t.segStart[e + 1]!; s++) out.push(toWorld(mesh, E[s * 6 + 3]!, E[s * 6 + 4]!, E[s * 6 + 5]!));
      return out;
    }
  }
  throw new Error('테두리 원이 없다');
})();

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

/** 실제 코어 뷰어에 장면과 앱의 측정 붙잡기 선택(withCurve면 곡선 붙잡기 — 곡선 계산 조각을 받은 뒤의 앱)을 주고 남동 등각(측정 모드) */
function view(withCurve = true): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), withCurve ? curveSnap(scene.meshes, ex) : null));
  return { v, canvas: v.canvas as unknown as FakeElement };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
/** 커서를 p로(열린 후보는 미리 보기 한 번에 앱 함수를 6번까지만 새로 부르므로 옆에서 한 번 지나온 뒤) */
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
/** 화면 사각형 확대: p 둘레 ±r(세계 xy) 사각형이 화면을 채우게 */
const zoomAround = (w: View, p: readonly number[], r: number): void => {
  const a = w.v.project([p[0]! - r, p[1]! - r, p[2]!])!;
  const b = w.v.project([p[0]! + r, p[1]! + r, p[2]!])!;
  const c = at(w, p);
  const half = Math.max(4, Math.hypot(a.x - b.x, a.y - b.y) / 2);
  w.v.zoomToRect(c.x - half, c.y - half, c.x + half, c.y + half, false);
  w.v.renderNow();
};

describe('코어 0.15.0 열린 후보 다듬기(앱 curveSnap)', () => {
  it('멀리 떨어진 첫 점에서 원기둥 테두리로 내린 발: 꺾은선 토막에 내린 발은 모두 토막 밖이지만 원 위 정확한 발(1e-9)을 붙잡고 거리도 √2000', () => {
    for (let k = 0; k + 1 < rimPoly.length; k++) expect(perpendicularFoot(FAR, rimPoly[k]!, rimPoly[k + 1]!, 1e-9)).toBeNull();
    const w = view();
    const { v } = w;
    clickAt(w, FAR);
    expect(v.measurePointCount).toBe(1);
    close(v.measurePoints[0]!.point, FAR, 1e-6);
    zoomAround(w, FAR_FOOT, 1.5);
    hoverAt(w, FAR_FOOT);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.refined).toBe(true);
    close(h.point, FAR_FOOT);
    expect(hoverSnapLabel(h)).toBe('수직 발');
    // 코어 점(토막 끝 꼭짓점)이 아니라 원 위 발 — 가장 가까운 꼭짓점과도 떨어져 있다
    expect(Math.min(...rimPoly.map((p) => dist(p, FAR_FOOT)))).toBeGreaterThan(0.1);
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, FAR_FOOT);
    expect(got).toHaveLength(1);
    expect(got[0]!.snapB).toBe('perpendicular');
    expect(Math.abs(got[0]!.distance - Math.sqrt(2000))).toBeLessThan(1e-9);
    expect(v.measurePoints[1]!.refined).toBe(true);
  });

  it('세 모서리와 테두리 원의 교차점(곧은 모서리·세로 원·B-스플라인): 넓힌 교차를 두 곡선의 교차점(1e-9)으로, 찍은 거리도 그 점까지', () => {
    const w = view();
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    for (const X of [LINE_X, RING_X, SPL_X]) {
      v.clearMeasure();
      v.fit(false);
      v.renderNow();
      clickAt(w, FAR);
      zoomAround(w, X, 1.5);
      hoverAt(w, X);
      const h = v.measureHoverSnap!;
      expect(h.snap, `${X}`).toBe('intersection');
      expect(h.refined).toBe(true);
      close(h.point, X);
      expect(hoverSnapLabel(h)).toBe('교차점');
      clickAt(w, X);
      const m = got[got.length - 1]!;
      expect(m.snapB).toBe('intersection');
      expect(Math.abs(m.distance - dist(FAR, X))).toBeLessThan(1e-9);
      expect(snapPair(m)).toEqual(['끝점', '교차점']);
    }
    expect(got).toHaveLength(3);
  });

  it('곡선 붙잡기를 주지 않으면(조각을 받기 전) 먼 발·넓힌 교차점 후보가 없다', () => {
    const w = view(false);
    const { v } = w;
    clickAt(w, FAR);
    zoomAround(w, FAR_FOOT, 1.5);
    hoverAt(w, FAR_FOOT);
    expect(v.measureHoverSnap!.snap).not.toBe('perpendicular');
    expect(v.measureHoverSnap!.refined).toBeUndefined();
    v.fit(false);
    v.renderNow();
    zoomAround(w, SPL_X, 1.5);
    hoverAt(w, SPL_X);
    expect(v.measureHoverSnap!.snap).not.toBe('intersection');
  });
});
