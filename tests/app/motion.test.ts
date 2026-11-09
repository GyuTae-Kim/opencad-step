// @vitest-environment jsdom
/**
 * 움직임 줄이기(55차 — WCAG 2.3.3, prefers-reduced-motion: reduce): 카메라를 옮길 때(표준 뷰·전체 보기·뷰 큐브, 앱의 홈 뷰·면 정면·저장된 보기)
 * 줄이기를 켠 사용자에게는 날리지 않고 바로 그 자리로 둔다. 61차부터 코어가 맡는다 — 뷰어를 animate 'auto'(코어 0.48.0 — 선호를 듣고 연 뒤 바뀌어도 따른다)로 만들고
 * 앱이 옮기는 카메라는 코어 flyTo(0.49.0 — 0.32초, 같은 설정)로 준다(55~60차는 앱의 matchMedia 읽기와 프레임 고리 motion.ts).
 * 링크로 연 보기는 예전처럼 setCamera로 바로 둔다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Viewer3d, type CameraState } from 'opencad-viewer3d';
import { jsdomViewer } from './jsdomview';

const REDUCE = '(prefers-reduced-motion: reduce)';

afterEach(() => {
  vi.restoreAllMocks();
});

/** 움직임 줄이기 선호를 흉내 내는 matchMedia(change 사건을 보낼 수 있다) */
function prefersReduce(on: boolean): { mm: typeof window.matchMedia; set: (v: boolean) => void } {
  let matches = on;
  const ls = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    media: REDUCE,
    get matches() {
      return matches;
    },
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => void ls.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => void ls.delete(cb),
    addListener: (cb: (e: { matches: boolean }) => void) => void ls.add(cb),
    removeListener: (cb: (e: { matches: boolean }) => void) => void ls.delete(cb),
  };
  const mm = ((q: string) => (q === REDUCE ? mql : { media: q, matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  return {
    mm,
    set: (v) => {
      matches = v;
      for (const cb of ls) cb({ matches: v });
    },
  };
}

describe('움직임 줄이기(61차 — 코어 animate auto·flyTo)', () => {
  it("앱은 뷰어를 animate 'auto'로 만들고 홈 뷰·면 정면·저장된 보기를 코어 flyTo로 옮긴다(앱의 설정 읽기·프레임 고리는 없다)", () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/new core\.Viewer3d\(this\.hostEl, \{[^}]*animate: 'auto' \}\)/);
    expect(app.match(/void v\.flyTo\(/g)).toHaveLength(3);
    expect(app).not.toMatch(/animateCamera|reducedMotion/);
    // 링크로 연 보기는 바로(움직이지 않는다)
    expect(app).toMatch(/v\.setCamera\(\{ \.\.\.v\.getCamera\(\), \.\.\.link\.cam/);
    expect(existsSync(join(__dirname, '../../src/app/motion.ts'))).toBe(false);
  });

  it('실제 코어: 선호가 없으면 flyTo가 0.32초 동안 옮기고, 줄이기를 켜면(연 뒤에 바꿔도) 바로 끝 자리로', async () => {
    const { host, restore } = jsdomViewer();
    const pref = prefersReduce(false);
    const saved = window.matchMedia;
    window.matchMedia = pref.mm;
    const v = new Viewer3d(host, { animate: 'auto', keyboard: false });
    try {
      v.setScene({ name: 'box', units: 'mm', meshes: [{ id: 'a', positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]), color: [0.6, 0.6, 0.6, 1] }], lines: [] });
      v.fit(false);
      expect(v.animateSetting).toBe('auto');
      expect(v.animate).toBe(true);
      const from = v.getCamera();
      const to: CameraState = { ...from, yaw: from.yaw + 1, distance: from.distance * 2 };
      // 움직임: 부른 그때는 그 자리 그대로(프레임마다 옮긴다)
      void v.flyTo(to);
      expect(v.getCamera().distance).toBeCloseTo(from.distance, 9);
      // 연 뒤 줄이기로 바꾸면 옮기던 것을 끝 자리로 마치고, 다음 flyTo는 곧바로 끝 자리
      pref.set(true);
      expect(v.animate).toBe(false);
      expect(v.getCamera().distance).toBeCloseTo(to.distance, 9);
      const to2: CameraState = { ...to, yaw: to.yaw + 0.5 };
      const done = v.flyTo(to2);
      expect(v.getCamera().yaw).toBeCloseTo(to2.yaw, 9);
      await expect(done).resolves.toBe(true);
    } finally {
      v.dispose();
      window.matchMedia = saved;
      restore();
    }
  });
});
