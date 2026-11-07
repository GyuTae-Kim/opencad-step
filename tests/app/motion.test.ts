/**
 * 움직임 줄이기(55차 — WCAG 2.3.3, prefers-reduced-motion: reduce): 앱이 카메라를 옮길 때(홈 뷰·면 정면·저장된 보기) 줄이기를 켠 사용자에게는
 * 프레임마다 옮기지 않고 바로 그 자리로 둔다. 코어가 옮기는 것(표준 뷰·전체 보기·뷰 큐브)은 뷰어를 만들 때 animate 선택으로 끈다(app.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CameraState, Viewer3d } from 'opencad-viewer3d';
import { defaultCamera } from 'opencad-viewer3d/camera';
import { animateCamera, REDUCED_MOTION, reducedMotion } from '../../src/app/motion';

/** 카메라만 가진 가짜 뷰어(setCamera 부름을 모은다) */
function fakeViewer(start: CameraState): { v: Viewer3d; set: CameraState[] } {
  let cam = start;
  const set: CameraState[] = [];
  const v = {
    getCamera: () => cam,
    setCamera: (c: CameraState) => {
      cam = c;
      set.push(c);
    },
  } as unknown as Viewer3d;
  return { v, set };
}

/** matchMedia 흉내: 움직임 줄이기 켬·끔 */
function media(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q === REDUCED_MOTION, media: q }));
}

/** requestAnimationFrame 흉내: 부른 것을 모아 두고 run(t)으로 한 프레임씩 돌린다 */
function frames(): { run: (t: number) => void; pending: () => number } {
  let q: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    q.push(cb);
    return q.length;
  });
  return {
    run: (t) => {
      const now = q;
      q = [];
      for (const cb of now) cb(t);
    },
    pending: () => q.length,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('움직임 줄이기', () => {
  const from = defaultCamera();
  const to: CameraState = { ...from, yaw: from.yaw + 1, pitch: 0.2, distance: from.distance * 2 };

  it('설정을 matchMedia로 읽는다(matchMedia가 없는 환경은 끈 것으로)', () => {
    expect(REDUCED_MOTION).toBe('(prefers-reduced-motion: reduce)');
    vi.stubGlobal('matchMedia', undefined);
    expect(reducedMotion()).toBe(false);
    media(true);
    expect(reducedMotion()).toBe(true);
    media(false);
    expect(reducedMotion()).toBe(false);
  });

  it('끔: 0.32초 동안 프레임마다 사이 카메라를 거쳐 끝 카메라로', () => {
    media(false);
    const f = frames();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { v, set } = fakeViewer(from);
    animateCamera(v, to);
    expect(set).toEqual([]);
    expect(f.pending()).toBe(1);
    f.run(1160);
    expect(set).toHaveLength(1);
    expect(set[0]!.distance).toBeGreaterThan(from.distance);
    expect(set[0]!.distance).toBeLessThan(to.distance);
    f.run(1400);
    expect(set.at(-1)).toBe(to);
    expect(f.pending()).toBe(0);
  });

  it('켬: 프레임을 기다리지 않고 바로 끝 카메라 한 번, 앞의 움직임도 그만둔다', () => {
    media(false);
    const f = frames();
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { v, set } = fakeViewer(from);
    animateCamera(v, to);
    media(true);
    const to2: CameraState = { ...to, yaw: to.yaw + 0.5 };
    animateCamera(v, to2);
    expect(set).toEqual([to2]);
    // 앞의 움직임은 다음 프레임에 멈춘다(카메라를 되돌리지 않는다)
    f.run(1100);
    expect(set).toEqual([to2]);
  });

  it('앱은 카메라 옮기기를 뷰어 조각에서 받고(첫 화면 JS 밖), 뷰어를 만들 때 코어 animate를 설정에 맞춘다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const kit = readFileSync(join(__dirname, '../../src/app/viewerkit.ts'), 'utf8');
    expect(kit).toMatch(/export \{ animateCamera, reducedMotion \} from '\.\/motion'/);
    expect(app).toMatch(/new core\.Viewer3d\(this\.hostEl, \{[^}]*animate: !core\.reducedMotion\(\) \}\)/);
    expect(app).not.toMatch(/import [^;]*animateCamera/);
    expect(app.match(/this\.ent\?\.animateCamera\(/g)).toHaveLength(3);
  });
});
