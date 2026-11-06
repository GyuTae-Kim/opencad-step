/**
 * 움직임 줄이기(55차 — WCAG 2.3.3 상호작용으로 생기는 움직임, 사용자 설정 `prefers-reduced-motion: reduce`):
 * 카메라를 표준 뷰·전체 보기·홈 뷰·면 정면·저장된 보기로 옮길 때, 줄이기를 켠 사용자에게는 0.32초 동안 날아가지 않고 바로 그 자리로 둔다.
 * - 코어가 옮기는 것(표준 뷰·전체 보기·고른 것 맞춰 보기·뷰 큐브·F·1~7 글쇠)은 뷰어를 만들 때 `animate` 선택으로(app.ts — 코어는 만든 뒤 바꾸는 길이 없다)
 * - 앱이 옮기는 것(홈 뷰·면 정면·저장된 보기)은 animateCamera가 부를 때마다 설정을 본다
 * 뷰어 조각(viewerkit.ts)에 든다 — 카메라 옮기기는 뷰어가 있어야 쓴다(첫 화면 JS 밖, 54차까지는 viewhelp.ts).
 */
import type { CameraState, Viewer3d } from 'opencad-viewer3d';
import { lerpCamera } from 'opencad-viewer3d/camera';

/** 움직임을 줄여 달라는 사용자 설정(운영 체제·브라우저의 "동작 줄이기") */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** 지금 움직임 줄이기를 켰는지(matchMedia가 없는 환경은 끈 것으로) */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

let anim = 0;

/** 카메라를 ms 동안 부드럽게 옮긴다(앞의 움직임은 그만둔다). 움직임 줄이기를 켰으면 바로 그 자리로 */
export function animateCamera(v: Viewer3d, to: CameraState, ms = 320): void {
  const from = v.getCamera();
  const id = ++anim;
  if (typeof requestAnimationFrame !== 'function' || ms <= 0 || reducedMotion()) {
    v.setCamera(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    if (id !== anim) return;
    const t = Math.min(1, (now - t0) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    v.setCamera(t >= 1 ? to : lerpCamera(from, to, e));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
