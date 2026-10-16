/**
 * 면 단위 고르기(순수 함수, DOM 없음): 3D에서 누른 삼각형 → 면 표(meta.faceTables)의 B-rep 면 →
 * 면 종류·넓이·둘레·법선·곡면 매개변수와 경계 모서리 선분(세계 좌표, Viewer3d.setHighlightSegments에 넘긴다).
 *
 * 경계는 그 면의 삼각형에서 한 번만 쓰인 변이다. 변은 정점 번호가 아니라 위치로 맞춰 보므로
 * 원기둥 이음선처럼 같은 자리에 정점이 둘인 곳은 경계로 치지 않는다.
 */
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { StepFaceTable } from '../scene';

/** 면 표 매개변수 개수(scene.ts FACE_PARAMS와 같다) */
const NP = 8;

export interface FacePick {
  /** 그물 id */
  meshId: string;
  /** 면 표 안 면 번호 */
  face: number;
  /** STEP 인스턴스 번호(#n) */
  stepId: number;
  /** 면 종류 이름(plane·cylinder·…) */
  kind: string;
  /** 그 면의 첫 삼각형 번호(그물 안 — Viewer3d.highlightRanges의 start) */
  triStart: number;
  /** 삼각형 수 */
  triangles: number;
  /** 넓이(세계 단위²) */
  area: number;
  /** 경계 길이(세계 단위) */
  perimeter: number;
  /** 넓이 가운데(세계) */
  center: [number, number, number];
  /** 평면이면 바깥 법선(세계) */
  normal?: [number, number, number];
  /** 원기둥·원뿔·구·원환: 반지름(원환은 큰 반지름) */
  radius?: number;
  /** 원환: 작은 반지름 */
  minorRadius?: number;
  /** 원뿔: 반각(도) */
  halfAngleDeg?: number;
  /** 원기둥·원뿔·원환: 축 방향(세계, 단위 벡터) */
  axis?: [number, number, number];
  /** 원기둥·원뿔: 축 위 점, 구·원환: 중심(세계) */
  origin?: [number, number, number];
  /** 경계 선분 쌍 xyz,xyz…(세계, boundaryOrigin이 있으면 그 점 기준) */
  boundary: Float32Array;
  /** 큰 좌표일 때 경계 선분의 원점(세계) — setHighlightSegments의 origin으로 넘긴다 */
  boundaryOrigin?: [number, number, number];
}

/** 삼각형 번호 → 면 번호(이분 탐색, 없으면 -1) */
export function faceAt(table: Pick<StepFaceTable, 'triStart'>, tri: number): number {
  const s = table.triStart;
  const n = s.length - 1;
  if (n <= 0 || tri < 0 || tri >= s[n]!) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid]! <= tri) lo = mid;
    else hi = mid - 1;
  }
  // 삼각형이 없는 면(실패한 면)은 건너뛴다: 같은 시작을 가진 면 가운데 삼각형이 있는 마지막 것
  while (lo + 1 < n && s[lo + 1]! <= tri) lo++;
  return lo;
}

type V = [number, number, number];

function xf(m: Float64Array | undefined, x: number, y: number, z: number): V {
  if (!m) return [x, y, z];
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}
function xd(m: Float64Array | undefined, x: number, y: number, z: number): V {
  if (!m) return [x, y, z];
  return [m[0]! * x + m[4]! * y + m[8]! * z, m[1]! * x + m[5]! * y + m[9]! * z, m[2]! * x + m[6]! * y + m[10]! * z];
}
function unit(v: V): V {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : v;
}
/** 행렬의 길이 배율(첫 열 길이) */
function matScale(m: Float64Array | undefined): number {
  return m ? Math.hypot(m[0]!, m[1]!, m[2]!) : 1;
}

/** 면 하나의 자세한 정보(면이 없거나 삼각형이 없으면 null) */
export function faceDetails(mesh: Mesh3d, table: StepFaceTable, face: number, kinds: readonly string[]): FacePick | null {
  const t0 = table.triStart[face];
  const t1 = table.triStart[face + 1];
  if (t0 === undefined || t1 === undefined || t1 <= t0) return null;
  const P = mesh.positions;
  const I = mesh.indices;
  const m = mesh.matrix;
  // 묶음 원점(큰 좌표): positions는 이 점 기준
  const o = mesh.origin ?? [0, 0, 0];
  const vtx = (i: number): V => xf(m, P[i * 3]! + o[0], P[i * 3 + 1]! + o[1], P[i * 3 + 2]! + o[2]);
  const idx = (k: number) => (I ? I[k]! : k);
  // 위치 열쇠: 면 상자 크기 대비 1e-7로 맞춘다
  let lo: V = [Infinity, Infinity, Infinity];
  let hi: V = [-Infinity, -Infinity, -Infinity];
  for (let t = t0; t < t1; t++)
    for (let c = 0; c < 3; c++) {
      const v = idx(t * 3 + c);
      for (let k = 0; k < 3; k++) {
        const x = P[v * 3 + k]!;
        if (x < lo[k]) lo[k] = x;
        if (x > hi[k]) hi[k] = x;
      }
    }
  const q = Math.max(Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1e-7, 1e-12);
  const keyOf = new Map<number, number>();
  const keyIds = new Map<string, number>();
  const firstVert: number[] = [];
  const key = (v: number): number => {
    let k = keyOf.get(v);
    if (k !== undefined) return k;
    const s = `${Math.round(P[v * 3]! / q)},${Math.round(P[v * 3 + 1]! / q)},${Math.round(P[v * 3 + 2]! / q)}`;
    k = keyIds.get(s);
    if (k === undefined) {
      k = keyIds.size;
      keyIds.set(s, k);
      firstVert.push(v);
    }
    keyOf.set(v, k);
    return k;
  };
  let area = 0;
  const cen: V = [0, 0, 0];
  const nrm: V = [0, 0, 0];
  const edges = new Map<number, number>();
  const ekey = (a: number, b: number) => (a < b ? a * 0x200000 + b : b * 0x200000 + a);
  for (let t = t0; t < t1; t++) {
    const ia = idx(t * 3);
    const ib = idx(t * 3 + 1);
    const ic = idx(t * 3 + 2);
    const a = vtx(ia);
    const b = vtx(ib);
    const c = vtx(ic);
    const u: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: V = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr: V = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const ar = Math.hypot(cr[0], cr[1], cr[2]) / 2;
    area += ar;
    for (let k = 0; k < 3; k++) {
      cen[k] += ((a[k]! + b[k]! + c[k]!) / 3) * ar;
      nrm[k] += cr[k]!;
    }
    const ka = key(ia);
    const kb = key(ib);
    const kc = key(ic);
    for (const [x, y] of [
      [ka, kb],
      [kb, kc],
      [kc, ka],
    ] as const) {
      if (x === y) continue;
      const e = ekey(x, y);
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  const segs: number[] = [];
  let perimeter = 0;
  for (const [e, n] of edges) {
    if (n !== 1) continue;
    const x = Math.floor(e / 0x200000);
    const y = e - x * 0x200000;
    const a = vtx(firstVert[x]!);
    const b = vtx(firstVert[y]!);
    segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const center: V = area > 0 ? [cen[0] / area, cen[1] / area, cen[2] / area] : vtx(idx(t0 * 3));
  // 큰 좌표면 경계를 면 가운데 기준으로(float32 떨림 막기)
  const big = Math.max(Math.abs(center[0]), Math.abs(center[1]), Math.abs(center[2])) >= 1e4;
  if (big) for (let i = 0; i < segs.length; i++) segs[i] = segs[i]! - center[i % 3]!;
  const kind = kinds[table.kinds[face]!] ?? 'unknown';
  const out: FacePick = {
    meshId: mesh.id,
    face,
    stepId: table.stepIds[face] ?? 0,
    kind,
    triStart: t0,
    triangles: t1 - t0,
    area,
    perimeter,
    center,
    boundary: Float32Array.from(segs),
  };
  if (big) out.boundaryOrigin = center;
  const p = table.params.subarray(face * NP, face * NP + NP);
  const sc = matScale(m);
  const axis = unit(xd(m, p[2]!, p[3]!, p[4]!));
  const origin = xf(m, p[5]! + o[0], p[6]! + o[1], p[7]! + o[2]);
  if (kind === 'plane') out.normal = Math.hypot(...axis) > 0 ? axis : unit(nrm);
  else if (kind === 'polygon' || kind === 'triangulated') {
    // 평평하면 법선
    const n = unit(nrm);
    const l = Math.hypot(nrm[0], nrm[1], nrm[2]) / 2;
    if (area > 0 && l > area * (1 - 1e-6)) out.normal = n;
  } else if (kind === 'cylinder') {
    out.radius = p[0]! * sc;
    out.axis = axis;
    out.origin = origin;
  } else if (kind === 'cone') {
    out.radius = p[0]! * sc;
    out.halfAngleDeg = (p[1]! * 180) / Math.PI;
    out.axis = axis;
    out.origin = origin;
  } else if (kind === 'sphere') {
    out.radius = p[0]! * sc;
    out.origin = origin;
  } else if (kind === 'torus') {
    out.radius = p[0]! * sc;
    out.minorRadius = p[1]! * sc;
    out.axis = axis;
    out.origin = origin;
  }
  return out;
}

/** 면 종류 → 한국어 이름 */
export function faceKindLabel(kind: string): string {
  return FACE_LABELS[kind] ?? kind;
}

const FACE_LABELS: Record<string, string> = {
  plane: '평면',
  cylinder: '원기둥 면',
  cone: '원뿔 면',
  sphere: '구 면',
  torus: '원환 면',
  revolution: '회전 곡면',
  extrusion: '밀기 곡면',
  bspline: 'B-스플라인 곡면',
  offset: '오프셋 곡면',
  polygon: '다각형 면',
  triangulated: '삼각형 면',
  unknown: '알 수 없는 면',
};
