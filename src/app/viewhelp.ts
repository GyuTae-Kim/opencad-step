/**
 * 면을 기준으로 보기·자르기(순수 계산 + 카메라 움직임):
 * - 정면으로 보기(Look At): 평면은 바깥 법선 쪽에서, 원기둥·원뿔·원환은 축 방향(지금 보는 쪽)에서 그 면을 맞춰 본다.
 * - 이 면으로 자르기: 평면은 그 면 자리에서 바깥 쪽을 잘라 내고, 축이 있는 면은 축을 지나며 눈 쪽 절반을 잘라 낸다(구멍 안이 보인다).
 * - 카메라 옮기기는 코어 setCamera를 프레임마다 불러 부드럽게(lerpCamera).
 */
import type { CameraState, Viewer3d } from 'opencad-viewer3d';
import { basisFromAngles, dirToAngles, fitCamera, lerpCamera } from 'opencad-viewer3d/camera';
import type { Box3 } from 'opencad-viewer3d/types';
import type { FacePick } from './faces';

type V3 = [number, number, number];

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm = (a: V3): V3 | null => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

/** 면 경계와 가운데로 잡은 범위(세계 좌표) */
export function faceBox(f: Pick<FacePick, 'boundary' | 'boundaryOrigin' | 'center'>): Box3 {
  const o = f.boundaryOrigin ?? [0, 0, 0];
  const lo: V3 = [...f.center] as V3;
  const hi: V3 = [...f.center] as V3;
  const b = f.boundary;
  for (let i = 0; i + 2 < b.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = b[i + k]! + o[k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  return { min: lo, max: hi };
}

/** 정면으로 볼 눈 방향(대상 → 눈). 평면은 바깥 법선, 축이 있는 면은 지금 보는 쪽 축 방향. 못 정하면 null */
export function faceViewDir(f: Pick<FacePick, 'normal' | 'axis'>, back: readonly number[]): V3 | null {
  if (f.normal) return norm([...f.normal] as V3);
  if (f.axis) {
    const a = norm([...f.axis] as V3);
    if (!a) return null;
    return dot(a, back) >= 0 ? a : [-a[0], -a[1], -a[2]];
  }
  return null;
}

/**
 * 면으로 자를 평면(normal·p > offset 쪽을 잘라 낸다). 평면 면은 그 자리(바깥 쪽을 잘라 낸다 — 단면 손잡이로 안쪽으로 민다),
 * 축이 있는 면은 축을 지나고 눈 쪽 절반을 잘라 낸다. 못 정하면 null
 */
export function faceSectionPlane(f: Pick<FacePick, 'normal' | 'axis' | 'origin' | 'center'>, back: readonly number[]): { normal: V3; offset: number } | null {
  if (f.normal) {
    const n = norm([...f.normal] as V3);
    return n ? { normal: n, offset: dot(n, f.center) } : null;
  }
  if (f.axis && f.origin) {
    const a = norm([...f.axis] as V3);
    if (!a) return null;
    // 눈 방향에서 축 성분을 뺀 방향(축을 지나며 눈을 향한 법선)
    const k = dot(back, a);
    let n = norm([back[0]! - a[0] * k, back[1]! - a[1] * k, back[2]! - a[2] * k]);
    if (!n) n = norm(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]]);
    return n ? { normal: n, offset: dot(n, f.origin) } : null;
  }
  return null;
}

/** 지금 카메라의 눈 방향(대상 → 눈) */
export function cameraBack(c: Pick<CameraState, 'yaw' | 'pitch'>): V3 {
  return basisFromAngles(c.yaw, c.pitch).back;
}

/** 눈 방향(대상 → 눈)과 맞출 범위로 카메라 */
export function cameraLooking(c: CameraState, dir: readonly number[], box: Box3, aspect: number): CameraState {
  const a = dirToAngles(dir, c.yaw);
  return fitCamera({ ...c, yaw: a.yaw, pitch: a.pitch }, box, aspect);
}

let anim = 0;

/** 카메라를 ms 동안 부드럽게 옮긴다(앞의 움직임은 그만둔다) */
export function animateCamera(v: Viewer3d, to: CameraState, ms = 320): void {
  const from = v.getCamera();
  const id = ++anim;
  if (typeof requestAnimationFrame !== 'function' || ms <= 0) {
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
