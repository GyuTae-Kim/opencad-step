/**
 * 분해 손질 끌기의 붙잡기(47차 — 분해 조각 안, 순수·DOM 없음): 끄는 부품의 평면이 다른 부품의 평면에 닿거나(거리 0) 같은 높이가 되는 자리에 붙는다.
 *
 * - 끄는 길이 선일 때만(장면 축 X·Y·Z, 화면 가로·세로 — 부품은 그 축 위로만 움직이므로 고를 것은 축 위 이동량 하나다).
 *   화면 평면·사방(면 위로 끄는 길)은 붙잡지 않는다.
 * - 후보 면: 면 표(B-rep)의 평면 가운데 바깥 법선이 끄는 축과 나란한 것(1 − |n·a| ≤ PAR — 0.0057° 안). 높이는 B-rep 평면 식으로 잰 그 평면의 축 위 자리
 *   (삼각형이 아니라 — 붙은 두 면 높이 차는 반올림 찌꺼기뿐이다), 축에 수직인 두 방향 범위(사각형)는 그 면 삼각형으로 잰다.
 *   끄는 묶음(끌 단위의 그물)과 그 밖의 보이는(숨기지·흐리게 하지 않은) 그물을 따로 모으고, 지금 분해 이동만큼 옮겨 둔다.
 * - 끌기 시작 자리에서 축 위 이동량 s마다 "끄는 면 높이 + s = 다른 면 높이"인 s가 후보다. 바깥 법선이 서로 마주 보고(축 성분 부호가 반대)
 *   축에 수직인 면에서 두 면이 넓이를 갖고 겹치면(삼각형끼리 분리축으로 — 경계만 맞닿은 것은 겹침이 아니다) "닿음", 그 밖은 "같은 높이".
 * - 붙잡기 거리: 끈 점이 화면에서 px(마우스·펜 10화소, 손가락 14 — 코어 측정 붙잡기 pickTolerance와 같은 규칙) 안으로 옮겨지는 후보만.
 *   닿음이 같은 높이보다 앞서고, 같은 종류는 화면에서 가까운 것(같으면 축 위로 가까운 것).
 * - 한도: 모으는 면 FACE_MAX개(넘으면 그 뒤 그물은 보지 않는다 — cut), 끌기 한 번에 새로 훑는 삼각형 TRI_MAX개(넘으면 그 뒤 그물은 이번 끌기에서 빼고
 *   다음 끌기에 이어 잰다 — 잰 그물은 문서·축마다 남긴다), 한 번 움직일 때 견주는 면 짝 VISIT_MAX개, 두 면 겹침의 삼각형 짝 OVERLAP_PAIR개
 *   (넘으면 겹침을 못 보인 것 — "같은 높이"), 한 번 움직일 때 새로 보는 삼각형 짝 OVERLAP_MOVE개(다 쓰면 남은 짝은 그 움직임에서 "같은 높이" — 다음 움직임에 본다).
 */
import { computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { FaceIndex } from './doc';
import { faceDetails } from './faces';

type V3 = [number, number, number];

/**
 * 붙잡기 거리(화소): 마우스·펜 10, 손가락 14 — 코어 측정 붙잡기 규칙(pointer.ts pickTolerance — SNAP_PX, max(SNAP_PX, TOUCH_PICK_TOLERANCE_PX))과 같다(시험이 본다).
 * 코어 pointer 모듈을 분해 조각에서 가져오면 번들러가 그것을 따로 떼어 첫 화면 JS가 커지므로 수만 둔다
 */
export const snapPx = (touch: boolean): number => (touch ? 14 : 10);

/** 끄는 축과 나란한 법선으로 보는 한도: 1 − |n·a| (각 0.0057° 안 — 내보낸 프로그램의 반올림 찌꺼기만) */
export const SNAP_PAR = 5e-9;
/** 모으는 평면 면 수 한도(끄는 쪽·다른 쪽 합) */
export const SNAP_FACE_MAX = 100_000;
/** 모으며 훑는 삼각형 수 한도 */
export const SNAP_TRI_MAX = 2_000_000;
/** 한 번 움직일 때 견주는 면 짝 한도 */
export const SNAP_VISIT_MAX = 20_000;
/** 두 면 겹침을 가리는 삼각형 짝 한도(넘으면 겹침을 못 보인 것 — 같은 높이) */
export const SNAP_OVERLAP_PAIR = 50_000;
/** 한 번 움직일 때 새로 겹침을 가리는 삼각형 짝 몫(다 쓰면 남은 짝은 다음 움직임에 — 한 짝은 끝까지 본다) */
export const SNAP_OVERLAP_MOVE = 100_000;

/** 붙은 종류: 닿음(마주 본 두 면이 겹친다) · 같은 높이 */
export type SnapKind = 'touch' | 'flush';

/** 붙은 자리: 축 위 이동량, 종류, 끄는 면·다른 면 번호(SnapIndex 안), 화면 거리(화소) */
export interface SnapHit {
  s: number;
  kind: SnapKind;
  i: number;
  j: number;
  px: number;
}

/** 한쪽 면 목록(세계, 지금 분해 이동을 더한 것): 높이, 법선의 축 성분 부호, 사각형 [u0, u1, v0, v1], 그물 번호(장면 안), 면 번호(면 표 안), 이동 */
interface Side {
  h: Float64Array;
  s: Int8Array;
  r: Float64Array;
  m: Int32Array;
  f: Int32Array;
}

/** 끌기 한 번의 붙잡기 자료 */
export interface SnapIndex {
  /** 끄는 축(단위)과 그에 수직인 두 방향 */
  a: V3;
  e1: V3;
  e2: V3;
  /** 끄는 면 */
  drag: Side;
  /** 다른 면(높이 차례) */
  other: Side;
  /** 그물 번호 → 지금 분해 이동(세계) */
  off: Map<number, V3>;
  meshes: readonly Mesh3d[];
  faces: FaceIndex;
  /** 겹침 판정 거리(장면 크기의 1e-6) */
  eps: number;
  /** 한도에 걸려 덜 모았는지 */
  cut: boolean;
  /** 두 면 겹침 결과(끄는 면 × 다른 면 수 + 다른 면) */
  overlap: Map<number, boolean>;
  /** 끌기 한 번 동안 잰 것: 면 삼각형(d·o — 축에 수직인 면 위 2D 좌표, 분해 이동까지), 안내 선 경계(bd·bo — 분해 이동 전 세계) */
  tris: Map<string, Float64Array>;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** 끄는 축에 수직인 두 단위 방향(축에서 가장 작은 성분 쪽으로 세운다 — 같은 축이면 늘 같다) */
export function perpBasis(a: readonly number[]): [V3, V3] {
  const ax = Math.abs(a[0]!);
  const ay = Math.abs(a[1]!);
  const az = Math.abs(a[2]!);
  const t: V3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  const k = dot(t, a);
  const u: V3 = [t[0] - a[0]! * k, t[1] - a[1]! * k, t[2] - a[2]! * k];
  const lu = Math.hypot(u[0], u[1], u[2]);
  const e1: V3 = [u[0] / lu, u[1] / lu, u[2] / lu];
  const e2: V3 = [a[1]! * e1[2] - a[2]! * e1[1], a[2]! * e1[0] - a[0]! * e1[2], a[0]! * e1[1] - a[1]! * e1[0]];
  return [e1, e2];
}

/** 그물 하나의 축에 수직인 평면 면(분해 이동 전 세계): [높이, 부호, u0, u1, v0, v1, 면 번호]씩, 삼각형 수 */
type Packed = { rows: Float64Array; tris: number };

/** 문서(면 표)마다 축 하나의 그물별 평면 면(다시 끌 때 다시 재지 않는다) */
const CACHE = new WeakMap<FaceIndex, { key: string; per: Map<number, Packed> }>();

function meshPlanes(mesh: Mesh3d, faces: FaceIndex, plane: number, a: V3, e1: V3, e2: V3): Packed {
  const ti = faces.tableOf.get(mesh.id);
  const t = ti === undefined ? undefined : faces.tables[ti];
  if (!t || plane < 0) return { rows: new Float64Array(0), tris: 0 };
  const m = mesh.matrix;
  const o = mesh.origin ?? [0, 0, 0];
  const P = mesh.positions;
  const I = mesh.indices;
  const rows: number[] = [];
  let tris = 0;
  const nf = t.kinds.length;
  for (let f = 0; f < nf; f++) {
    if (t.kinds[f] !== plane) continue;
    const t0 = t.triStart[f]!;
    const t1 = t.triStart[f + 1]!;
    if (!(t1 > t0)) continue;
    const q = f * 8;
    const p = t.params;
    let nx = p[q + 2]!;
    let ny = p[q + 3]!;
    let nz = p[q + 4]!;
    if (m) [nx, ny, nz] = [m[0]! * nx + m[4]! * ny + m[8]! * nz, m[1]! * nx + m[5]! * ny + m[9]! * nz, m[2]! * nx + m[6]! * ny + m[10]! * nz];
    const ln = Math.hypot(nx, ny, nz);
    const c = (nx * a[0] + ny * a[1] + nz * a[2]) / ln;
    if (!(ln > 0) || !(1 - Math.abs(c) <= SNAP_PAR)) continue;
    let ox = p[q + 5]! + o[0];
    let oy = p[q + 6]! + o[1];
    let oz = p[q + 7]! + o[2];
    if (m) [ox, oy, oz] = [m[0]! * ox + m[4]! * oy + m[8]! * oz + m[12]!, m[1]! * ox + m[5]! * oy + m[9]! * oz + m[13]!, m[2]! * ox + m[6]! * oy + m[10]! * oz + m[14]!];
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (let k = t0 * 3; k < t1 * 3; k++) {
      const vi = (I ? I[k]! : k) * 3;
      let x = P[vi]! + o[0];
      let y = P[vi + 1]! + o[1];
      let z = P[vi + 2]! + o[2];
      if (m) [x, y, z] = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
      const u = x * e1[0] + y * e1[1] + z * e1[2];
      const v = x * e2[0] + y * e2[1] + z * e2[2];
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    tris += t1 - t0;
    if (!(u1 >= u0) || !(v1 >= v0)) continue;
    rows.push(ox * a[0] + oy * a[1] + oz * a[2], c > 0 ? 1 : -1, u0, u1, v0, v1, f);
  }
  return { rows: Float64Array.from(rows), tris };
}

const ROW = 7;

/**
 * 끌기 한 번의 붙잡기 자료를 모은다: 끄는 축 a(단위), 끄는 그물 id(moving), 다른 쪽으로 볼 그물인지(keep — 보이고 흐리게 하지 않은 것),
 * 그물마다 지금 분해 이동(off — 없으면 제자리), 장면 크기(size — 조립 대각선). 끄는 쪽에 평면이 없으면 null
 */
export function snapIndex(
  meshes: readonly Mesh3d[],
  faces: FaceIndex | null,
  a: readonly number[],
  moving: ReadonlySet<string>,
  keep: (id: string) => boolean,
  off: ReadonlyMap<string, readonly number[]>,
  size: number,
): SnapIndex | null {
  if (!faces || !(size > 0)) return null;
  const ax: V3 = [a[0]!, a[1]!, a[2]!];
  const [e1, e2] = perpBasis(ax);
  const plane = faces.kinds.indexOf('plane');
  const key = ax.join(',');
  let c = CACHE.get(faces);
  if (!c || c.key !== key) CACHE.set(faces, (c = { key, per: new Map() }));
  const lists: [number[], number[]] = [[], []];
  const offs = new Map<number, V3>();
  let faceCount = 0;
  let tris = 0;
  let cut = false;
  // 끄는 그물을 먼저(한도에 걸려도 끄는 쪽은 빠지지 않게)
  const order = meshes.map((_, i) => i).sort((x, y) => Number(moving.has(meshes[y]!.id)) - Number(moving.has(meshes[x]!.id)));
  for (const mi of order) {
    const mesh = meshes[mi]!;
    const mv = moving.has(mesh.id);
    if (!mv && !keep(mesh.id)) continue;
    let pk = c.per.get(mi);
    if (!pk) {
      if (tris >= SNAP_TRI_MAX) {
        cut = true;
        continue;
      }
      c.per.set(mi, (pk = meshPlanes(mesh, faces, plane, ax, e1, e2)));
      tris += pk.tris;
    }
    const n = pk.rows.length / ROW;
    if (!n) continue;
    if (faceCount + n > SNAP_FACE_MAX) {
      cut = true;
      break;
    }
    faceCount += n;
    const d = off.get(mesh.id);
    const o: V3 = d ? [d[0]!, d[1]!, d[2]!] : [0, 0, 0];
    offs.set(mi, o);
    const dh = dot(o, ax);
    const du = dot(o, e1);
    const dv = dot(o, e2);
    const out = lists[mv ? 0 : 1];
    for (let r = 0; r < pk.rows.length; r += ROW) {
      const w = pk.rows;
      out.push(w[r]! + dh, w[r + 1]!, w[r + 2]! + du, w[r + 3]! + du, w[r + 4]! + dv, w[r + 5]! + dv, mi, w[r + 6]!);
    }
  }
  if (!lists[0].length) return null;
  const side = (rows: number[], sorted: boolean): Side => {
    const n = rows.length / 8;
    const idx = Array.from({ length: n }, (_, i) => i);
    if (sorted) idx.sort((x, y) => rows[x * 8]! - rows[y * 8]!);
    const s: Side = { h: new Float64Array(n), s: new Int8Array(n), r: new Float64Array(n * 4), m: new Int32Array(n), f: new Int32Array(n) };
    idx.forEach((k, i) => {
      const b = k * 8;
      s.h[i] = rows[b]!;
      s.s[i] = rows[b + 1]!;
      s.r.set(rows.slice(b + 2, b + 6), i * 4);
      s.m[i] = rows[b + 6]!;
      s.f[i] = rows[b + 7]!;
    });
    return s;
  };
  return { a: ax, e1, e2, drag: side(lists[0], false), other: side(lists[1], true), off: offs, meshes, faces, eps: size * 1e-6, cut, overlap: new Map(), tris: new Map() };
}

/** 정렬된 배열에서 v 이상이 처음 나오는 자리 */
function lowerBound(h: Float64Array, v: number): number {
  let lo = 0;
  let hi = h.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 면 하나의 삼각형(축에 수직인 면 위 2D — u, v 여섯 수씩, 분해 이동까지) */
function faceTris(ix: SnapIndex, side: Side, k: number, tag: string): Float64Array {
  const key = `${tag}${k}`;
  const got = ix.tris.get(key);
  if (got) return got;
  const mi = side.m[k]!;
  const f = side.f[k]!;
  const mesh = ix.meshes[mi]!;
  const t = ix.faces.tables[ix.faces.tableOf.get(mesh.id)!]!;
  const m = mesh.matrix;
  const o = mesh.origin ?? [0, 0, 0];
  const P = mesh.positions;
  const I = mesh.indices;
  const off = ix.off.get(mi) ?? [0, 0, 0];
  const t0 = t.triStart[f]!;
  const t1 = t.triStart[f + 1]!;
  const out = new Float64Array((t1 - t0) * 6);
  const du = dot(off, ix.e1);
  const dv = dot(off, ix.e2);
  let w = 0;
  for (let q = t0 * 3; q < t1 * 3; q++) {
    const vi = (I ? I[q]! : q) * 3;
    let x = P[vi]! + o[0];
    let y = P[vi + 1]! + o[1];
    let z = P[vi + 2]! + o[2];
    if (m) [x, y, z] = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
    out[w++] = x * ix.e1[0] + y * ix.e1[1] + z * ix.e1[2] + du;
    out[w++] = x * ix.e2[0] + y * ix.e2[1] + z * ix.e2[2] + dv;
  }
  ix.tris.set(key, out);
  return out;
}

/** 두 2D 삼각형(A의 i번째·B의 j번째)이 넓이를 갖고 겹치는지(분리축 — eps 안으로만 맞닿은 것은 겹침이 아니다) */
function triOverlap(A: Float64Array, i: number, B: Float64Array, j: number, eps: number): boolean {
  for (const [T, k] of [
    [A, i],
    [B, j],
  ] as const) {
    for (let e = 0; e < 3; e++) {
      const x0 = T[k + e * 2]!;
      const y0 = T[k + e * 2 + 1]!;
      const x1 = T[k + ((e + 1) % 3) * 2]!;
      const y1 = T[k + ((e + 1) % 3) * 2 + 1]!;
      const nx = y0 - y1;
      const ny = x1 - x0;
      const l = Math.hypot(nx, ny);
      if (!(l > 0)) continue;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (let c = 0; c < 3; c++) {
        const pa = (A[i + c * 2]! * nx + A[i + c * 2 + 1]! * ny) / l;
        const pb = (B[j + c * 2]! * nx + B[j + c * 2 + 1]! * ny) / l;
        if (pa < a0) a0 = pa;
        if (pa > a1) a1 = pa;
        if (pb < b0) b0 = pb;
        if (pb > b1) b1 = pb;
      }
      if (a1 <= b0 + eps || b1 <= a0 + eps) return false;
    }
  }
  return true;
}

/**
 * 두 면(끄는 면 i·다른 면 j)이 축에 수직인 면에서 넓이를 갖고 겹치는지: 사각형부터, 삼각형 짝은 OVERLAP_PAIR개까지(넘으면 겹침을 못 보인 것 — 아니오로 남긴다).
 * 이 움직임의 몫(budget)을 다 썼으면 새 짝은 보지 않고 null(다음 움직임에 본다). 본 짝은 끌기 동안 남긴다
 */
function facesOverlap(ix: SnapIndex, i: number, j: number, budget: { n: number }): boolean | null {
  const key = i * ix.other.h.length + j;
  const got = ix.overlap.get(key);
  if (got !== undefined) return got;
  const ra = ix.drag.r;
  const rb = ix.other.r;
  const e = ix.eps;
  if (Math.min(ra[i * 4 + 1]!, rb[j * 4 + 1]!) - Math.max(ra[i * 4]!, rb[j * 4]!) <= e || Math.min(ra[i * 4 + 3]!, rb[j * 4 + 3]!) - Math.max(ra[i * 4 + 2]!, rb[j * 4 + 2]!) <= e) {
    ix.overlap.set(key, false);
    return false;
  }
  if (budget.n <= 0) return null;
  const A = faceTris(ix, ix.drag, i, 'd');
  const B = faceTris(ix, ix.other, j, 'o');
  let n = 0;
  let found = false;
  outer: for (let p = 0; p < A.length; p += 6) {
    const ax0 = Math.min(A[p]!, A[p + 2]!, A[p + 4]!);
    const ax1 = Math.max(A[p]!, A[p + 2]!, A[p + 4]!);
    const ay0 = Math.min(A[p + 1]!, A[p + 3]!, A[p + 5]!);
    const ay1 = Math.max(A[p + 1]!, A[p + 3]!, A[p + 5]!);
    for (let q = 0; q < B.length; q += 6) {
      if (++n > SNAP_OVERLAP_PAIR) break outer;
      if (Math.max(B[q]!, B[q + 2]!, B[q + 4]!) <= ax0 + e || Math.min(B[q]!, B[q + 2]!, B[q + 4]!) >= ax1 - e) continue;
      if (Math.max(B[q + 1]!, B[q + 3]!, B[q + 5]!) <= ay0 + e || Math.min(B[q + 1]!, B[q + 3]!, B[q + 5]!) >= ay1 - e) continue;
      if (triOverlap(A, p, B, q, e)) {
        found = true;
        break outer;
      }
    }
  }
  budget.n -= n;
  ix.overlap.set(key, found);
  return found;
}

/**
 * 붙잡기: 끌기 시작 자리에서 축 위 이동량 s(커서가 정한 것)의 둘레에서 붙을 자리. screen(s)는 그 이동량에서 끈 점의 화면 자리(눈 뒤면 null),
 * px는 붙잡기 거리(화소), limit는 끌기 한도(조립 대각선의 20배 — 그보다 먼 자리는 붙지 않는다). 붙을 자리가 없으면 null
 */
export function snapAlong(ix: SnapIndex, s: number, screen: (s: number) => readonly number[] | null, px: number, limit = Infinity): SnapHit | null {
  const p0 = screen(s);
  const step = Math.max(ix.eps * 1e3, Math.abs(s) * 1e-9);
  const p1 = screen(s + step);
  if (!p0 || !p1) return null;
  const rate = Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!) / step;
  if (!(rate > 0) || !Number.isFinite(rate)) return null;
  // 원근에서 축 위 화소 비율이 바뀌므로 넉넉히 두 배 창에서 찾고 화면 거리로 다시 가린다
  const win = (2 * px) / rate;
  const D = ix.drag;
  const O = ix.other;
  let best: SnapHit | null = null;
  let visits = 0;
  const budget = { n: SNAP_OVERLAP_MOVE };
  for (let i = 0; i < D.h.length && visits < SNAP_VISIT_MAX; i++) {
    const hi = D.h[i]! + s + win;
    for (let j = lowerBound(O.h, D.h[i]! + s - win); j < O.h.length && O.h[j]! <= hi; j++) {
      if (++visits > SNAP_VISIT_MAX) break;
      const sc = O.h[j]! - D.h[i]!;
      if (!(Math.abs(sc) <= limit)) continue;
      const q = screen(sc);
      if (!q) continue;
      const d = Math.hypot(q[0]! - p0[0]!, q[1]! - p0[1]!);
      if (!(d <= px)) continue;
      // 닿음일 수 있는 짝(부호가 반대)만 겹침을 본다 — 이미 고른 것보다 앞설 수 있을 때만
      const may: boolean = D.s[i]! === -O.s[j]! && (!best || best.kind === 'flush' || d < best.px);
      const kind: SnapKind = may && facesOverlap(ix, i, j, budget) === true ? 'touch' : 'flush';
      if (!best || (kind === 'touch' && best.kind === 'flush') || (kind === best.kind && (d < best.px || (d === best.px && Math.abs(sc - s) < Math.abs(best.s - s))))) best = { s: sc, kind, i, j, px: d };
    }
  }
  return best;
}

/**
 * 붙은 두 면의 안내 선(Viewer3d.setHighlightSegments — 선분 쌍, origin 기준): 다른 면 경계(지금 분해 자리)와 끄는 면 경계(붙은 자리).
 * 경계는 면 고르기와 같은 길(faces.ts faceDetails — 그 면 삼각형에서 한 번만 쓰인 변)로 끌기마다 한 번만 잰다. 못 구하면 null
 */
export function snapGuide(ix: SnapIndex, hit: SnapHit): { segs: Float32Array; origin: V3 } | null {
  const parts: [Side, number, string, number][] = [
    [ix.other, hit.j, 'bo', 0],
    [ix.drag, hit.i, 'bd', hit.s],
  ];
  const world: Float64Array[] = [];
  for (const [side, k, tag, s] of parts) {
    const key = `${tag}${k}`;
    let w = ix.tris.get(key);
    if (!w) {
      const mesh = ix.meshes[side.m[k]!]!;
      const fd = faceDetails(mesh, ix.faces.tables[ix.faces.tableOf.get(mesh.id)!]!, side.f[k]!, ix.faces.kinds);
      if (!fd) return null;
      const o = fd.boundaryOrigin ?? [0, 0, 0];
      w = Float64Array.from(fd.boundary, (v, i) => v + o[i % 3]!);
      ix.tris.set(key, w);
    }
    const off = ix.off.get(side.m[k]!) ?? [0, 0, 0];
    world.push(w.map((v, i) => v + off[i % 3]! + ix.a[i % 3]! * s));
  }
  const first = world[0]!;
  if (first.length < 6) return null;
  const origin: V3 = [first[0]!, first[1]!, first[2]!];
  const segs = new Float32Array(world[0]!.length + world[1]!.length);
  let n = 0;
  for (const w of world) for (let i = 0; i < w.length; i++) segs[n++] = w[i]! - origin[i % 3]!;
  return { segs, origin };
}

/** 끄는 선 위 이동량 s → 끈 점(p0 + a·s)의 화면 자리(캔버스 CSS 화소 — 눈 뒤면 null) */
export function lineScreen(cam: CameraState, width: number, height: number, p0: readonly number[], a: readonly number[]): (s: number) => readonly number[] | null {
  const f = computeFrame(cam, width, height, { center: cam.target, radius: Math.max(cam.distance, 1e-9) });
  return (s) => projectToScreen(f, [p0[0]! + a[0]! * s, p0[1]! + a[1]! * s, p0[2]! + a[2]! * s]);
}
