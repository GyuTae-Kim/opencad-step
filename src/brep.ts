/**
 * B-rep(경계 표현) → 삼각형 그물.
 *
 * 입체·껍질·면·고리·모서리를 따라가며, 모서리(EDGE_CURVE)마다 다각선을 한 번만 만들어 이웃 면이 같은 점을 쓰게 한다
 * (꼭짓점은 VERTEX_POINT 좌표 그대로). 허용 오차는 입체 크기에 비례한다.
 * AP242 삼각형 형식(TESSELLATED_SOLID·TESSELLATED_SHELL·TRIANGULATED_FACE·COMPLEX_TRIANGULATED_FACE·
 * TRIANGULATED_SURFACE_SET·COMPLEX_TRIANGULATED_SURFACE_SET)은 있는 삼각형을 그대로 쓴다.
 */
import type { Rgba } from 'opencad-viewer3d/types';
import { BSplineCurve, CircleCurve, EllipseCurve, LineCurve, type Tol } from './curves';
import { bsplineRecord, conicRecord, ellipseAxis } from './edgecurve';
import type { Geometry } from './geometry';
import { isClosedMesh, orientFaces } from './analysis';
import { cross, dist, dot, len, sub, type V3 } from './math';
import { bool, list, numList, refId, refList, type StepFile } from './part21';
import { ConeSurface, CylinderSurface, PlaneSurface, SphereSurface, type Surface, TorusSurface } from './surfaces';
import { FLUX, fluxToProps, PROPS_BREP, trianglesFlux } from './massprops';
import type { EdgeParam, FaceFluxJob, ItemPropsJob, LoopEdge } from './propsjob';
import { type FacePolygon, type MeshOut, tessellateFace, tessellatePlanarLoops } from './tessellate';

/** 면 종류(면 표 kinds의 번호 → 이름) */
export const FACE_KINDS = ['plane', 'cylinder', 'cone', 'sphere', 'torus', 'revolution', 'extrusion', 'bspline', 'offset', 'polygon', 'triangulated', 'unknown'] as const;
export type FaceKind = (typeof FACE_KINDS)[number];

/** 면 표 매개변수 개수(면마다): [r1, r2, ax, ay, az, ox, oy, oz] */
export const FACE_PARAMS = 8;

/**
 * 면 표: 그물 삼각형 → B-rep 면. 면 i의 삼각형은 [triStart[i], triStart[i+1]).
 * params는 면마다 FACE_PARAMS개(형상 항목 좌표·단위):
 * 평면 — 축 = 바깥 법선(면 방향 반영), 원점 = 평면 위 점 · 원기둥 — r1 반지름, 축·축 위 점 ·
 * 원뿔 — r1 기준 반지름, r2 반각(라디안), 축·꼭짓점 쪽 기준점 · 구 — r1 반지름, 원점 = 중심 · 원환 — r1 큰 반지름, r2 작은 반지름, 축·중심.
 */
export interface FaceTableData {
  triStart: Uint32Array;
  /** 면의 STEP 인스턴스 번호(#n) */
  stepIds: Uint32Array;
  /** FACE_KINDS 번호 */
  kinds: Uint8Array;
  params: Float64Array;
  /**
   * B-rep에서 구한 면 넓이(형상 항목 단위²). 평면은 경계 곡선을 따라 그린 정리로, 원기둥·원뿔·구·원환은 매개변수 영역 적분으로 구한다.
   * 못 구했으면 NaN(화면이 삼각형 넓이를 쓴다). 없으면(옛 결과) 모두 NaN으로 친다
   */
  area?: Float64Array;
  /** 경계 길이(형상 항목 단위): 모서리 곡선 길이를 적분해 더한다(이음선 제외). 못 구했으면 NaN */
  perimeter?: Float64Array;
  /**
   * 1이면 넓이·둘레가 정확한 값(평면, 경계가 선·원인 해석적 곡면, 다각형·삼각형 면),
   * 0이면 근삿값(B-스플라인 등 — 삼각형 또는 꺾인 매개변수 경계를 쓴다. 화면은 "≈"로 보인다)
   */
  exact?: Uint8Array;
  /**
   * 닫힌 입체의 질량 속성(massprops.ts PROPS_LEN칸): [부피, 1차 모멘트 3, 2차 모멘트 6(xx·yy·zz·xy·yz·zx), 기준점 3, 부피 어림 오차, 구한 길].
   * 모멘트는 기준점(항목 좌표, 묶음 원점을 빼지 않은 값) 기준이다. 구한 길이 PROPS_BREP면 곡면·모서리 곡선 적분, 아니면 화면용 삼각형.
   * 닫힌 입체(ItemMesh.solid)가 아니면 없다
   */
  props?: Float64Array;
}

/** 모서리 종류(모서리 표 kinds의 번호 → 이름) */
export const EDGE_KINDS = ['line', 'circle', 'ellipse', 'bspline', 'other'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** 모서리 표 매개변수 개수(모서리마다): [r1, r2, nx, ny, nz, cx, cy, cz] — 원은 반지름·법선(원 평면)·중심, 타원은 긴·짧은 반지름 */
export const EDGE_PARAMS = 8;

/**
 * 모서리 표: 그물 윤곽선(ItemMesh.edges·Mesh3d.edges) 선분 → B-rep 모서리(EDGE_CURVE). 모서리 i의 선분은 [segStart[i], segStart[i+1]).
 * 이음선(한 면 안에서 두 번 쓰인 모서리)은 윤곽선에 없으므로 표에도 없다.
 */
export interface EdgeTableData {
  segStart: Uint32Array;
  /** 모서리의 STEP 인스턴스 번호(#n, EDGE_CURVE) */
  stepIds: Uint32Array;
  /** EDGE_KINDS 번호 */
  kinds: Uint8Array;
  /** EDGE_PARAMS개씩(형상 항목 좌표·단위, 묶음 원점을 뺀 중심) */
  params: Float64Array;
  /** 곡선 길이(적분, 형상 항목 단위) */
  length: Float64Array;
  /** 원호가 도는 각(라디안, 원이 아니면 0 — 한 바퀴는 2π) */
  sweep: Float64Array;
  /**
   * 곡선 모서리 두 끝의 단위 접선(EDGE_TANGENTS개씩: 시작 xyz, 끝 xyz — 형상 항목 좌표). 둘 다 모서리 방향(시작 꼭짓점 → 끝 꼭짓점,
   * 다각선 차례)으로 간다 — 끝에서 곡선 안쪽으로 가는 방향은 끝 접선의 반대. B-rep 곡선의 1차 도함수(원·타원은 식, B-스플라인은 도함수)로 구한다.
   * 직선과 매개변수를 모르는 모서리(꼭짓점이 곡선에서 먼 것)는 NaN. 없으면(옛 결과) 모두 모르는 것으로 친다
   */
  tangents?: Float32Array;
  /**
   * 곡선 정의(edgecurve.ts — 측정 접선 잠금·붙잡기 다듬기가 곡선 위 아무 점을 구한다): 모서리 i의 기록은 curves[curveStart[i], curveStart[i+1]).
   * 접선을 아는 곡선 모서리만 — 원·타원 호는 틀 x축과 두 끝 매개변수 각(한 바퀴 원은 없음, 한 바퀴 타원은 틀 x축만), B-스플라인은
   * 차수·매듭·조절점·가중치·모서리 매개변수 구간(한도 BSPLINE_RECORD_MAX를 넘으면 없음). 기록이 하나도 없으면 둘 다 없다(옛 결과와 같다 — 화면은 꺾은선 꼭짓점으로 어림)
   */
  curveStart?: Uint32Array;
  curves?: Float64Array;
}

/** 모서리 표 접선 개수(모서리마다): 시작 접선 xyz, 끝 접선 xyz */
export const EDGE_TANGENTS = 6;

/**
 * 곡선 c를 매개변수 ta → tb로 지날 때 ta에서의 진행 방향 단위 접선(1차 도함수, tb < ta면 뒤집는다). 도함수가 0이면(끝 조절점이 겹친
 * B-스플라인 등) ta에서 tb 쪽으로 조금 간 점까지의 방향. 못 구하면 null
 */
export function curveEndTangent(c: { point(t: number): V3; d1(t: number): V3 }, ta: number, tb: number): V3 | null {
  const s = tb >= ta ? 1 : -1;
  let d = c.d1(ta);
  let l = len(d);
  if (!(l > 1e-12 * (1 + Math.abs(ta)))) {
    const h = (tb - ta) * 1e-6;
    d = sub(c.point(ta + h), c.point(ta));
    l = len(d);
    if (!(l > 0)) return null;
    return [d[0] / l, d[1] / l, d[2] / l];
  }
  const k = s / l;
  return Number.isFinite(k) && d.every(Number.isFinite) ? [d[0] * k, d[1] * k, d[2] * k] : null;
}

/** 한 형상 항목(입체·껍질 등)의 그물(형상 항목 좌표·단위 그대로) */
export interface ItemMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** 면마다 색이 다르면 정점 색 rgba */
  colors?: Float32Array;
  /** 전체 색(면 색이 하나뿐이거나 입체 색) */
  color?: Rgba;
  /** 면 경계 모서리 선분 쌍 */
  edges: Float32Array;
  faces: number;
  failedFaces: number;
  triangles: number;
  /** 닫힌 껍질에서 왔는지(물샐틈없음 검사 대상) */
  closed: boolean;
  bbox: [V3, V3] | null;
  /** 면 실패 이유 → 개수 */
  failures: Map<string, number>;
  /** 삼각형 → 면 표 */
  faceTable?: FaceTableData;
  /** 윤곽선 선분 → 모서리 표(면 표를 만들 때만) */
  edgeTable?: EdgeTableData;
  /** 닫힌 입체이고 삼각형이 틈 없이 맞물렸는지(Mesh3d.closed — 단면 채우기) */
  solid?: boolean;
  /**
   * false면 와이어프레임·숨은선에 삼각형 변을 그리지 않는다(Mesh3d.triangleEdges, 코어 0.7.1): 모서리 고리(EDGE_LOOP)로 된 B-rep 면 그물 —
   * 모서리는 edges에 있고 삼각형 변은 형상이 아니다. 삼각형 형식(삼각형이 곧 형상)과 다각 고리(POLY_LOOP — 모서리 선이 없다) 면이 든 그물은 없다
   */
  triangleEdges?: false;
  /**
   * 큰 좌표일 때만: 묶음 원점(형상 항목 좌표). positions·edges·면 표의 점 매개변수는 이 점을 뺀 값이다(float32 떨림 막기).
   * 기준은 needsOrigin.
   */
  origin?: V3;
  /**
   * 닫힌 입체(B-rep 면)의 질량 속성 적분 거리(propsjob.ts) — 삼각화와 떼어 나중에 적분한다(면 표 props).
   * 질량 속성을 끈 해석(MeshOptions.props false)이나 면 표가 없으면 없다
   */
  propsJob?: ItemPropsJob;
}

/**
 * 묶음 원점이 필요한지: 좌표 크기 M(상자 꼭짓점 성분의 절댓값 최대)이 1e4 단위 이상이고 묶음 크기 S(상자 대각선)의
 * 2000배를 넘을 때. float32 간격은 약 M × 1.2e-7이므로 이때 S의 1/4000(묶음이 화면 1000화소를 채우면 0.25화소) 이상 떨린다.
 */
export function needsOrigin(lo: readonly number[], hi: readonly number[]): boolean {
  if (!Number.isFinite(lo[0]!) || !Number.isFinite(hi[0]!)) return false;
  let m = 0;
  for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(lo[k]!), Math.abs(hi[k]!));
  const size = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
  return m >= 1e4 && m > 2000 * Math.max(size, 1e-9);
}

/** 다시 삼각화할 때 그대로 쓸 면 하나의 결과(정점은 면 안 번호, 면 표 값은 저장한 그대로) */
interface FaceOut {
  pos: number[];
  nrm: number[];
  idx: number[];
  col: Rgba | undefined;
  r: string | null;
  reversed: boolean;
  stepId: number;
  kind: number;
  params: number[];
  area: number;
  perimeter: number;
  exact: number;
  /** 질량 속성 적분 거리(닫힌 껍질 면, 삼각화에 성공했을 때) */
  pj: FaceFluxJob | null;
}

/** 접힌 면 때문에 모서리를 더 잘게 나눠 다시 삼각화하는 최대 횟수 */
const MAX_REFINE_PASS = 2;

/**
 * 면 삼각형 [t0, t1) 가운데 접힌 것(삼각형 법선이 세 정점 법선의 합과 반대이고 넓이가 무시할 만큼 작지 않은 것)의 수.
 * 정점 법선은 곡면 법선(면 방향 반영)이라 곡면 위 삼각형은 같은 쪽을 본다
 */
function countFolds(b: { positions: number[]; normals: number[]; indices: number[] }, t0: number, t1: number, diag: number): number {
  let n = 0;
  const P = b.positions;
  const N = b.normals;
  const I = b.indices;
  const minArea2 = (diag * 1e-6) ** 2;
  for (let t = t0; t < t1; t++) {
    const a = I[t * 3]! * 3;
    const c1 = I[t * 3 + 1]! * 3;
    const c2 = I[t * 3 + 2]! * 3;
    const ux = P[c1]! - P[a]!, uy = P[c1 + 1]! - P[a + 1]!, uz = P[c1 + 2]! - P[a + 2]!;
    const wx = P[c2]! - P[a]!, wy = P[c2 + 1]! - P[a + 1]!, wz = P[c2 + 2]! - P[a + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * nx + ny * ny + nz * nz <= minArea2) continue;
    const s = (N[a]! + N[c1]! + N[c2]!) * nx + (N[a + 1]! + N[c1 + 1]! + N[c2 + 1]!) * ny + (N[a + 2]! + N[c1 + 2]! + N[c2 + 2]!) * nz;
    if (s < 0) n++;
  }
  return n;
}

/** 부호 있는 부피 × 6(원점 사면체 합 — 부호만 볼 때) */
function signedVolume6(P: ArrayLike<number>, I: ArrayLike<number>): number {
  let v = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t]! * 3;
    const b = I[t + 1]! * 3;
    const c = I[t + 2]! * 3;
    v += P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!);
  }
  return v;
}

/** 상자 가운데 */
function boxCenter(lo: readonly number[], hi: readonly number[]): V3 {
  return [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
}

/** xyz… 배열에서 원점을 빼 float32로 */
export function relativeFloat32(src: readonly number[], o: V3 | undefined): Float32Array {
  if (!o) return Float32Array.from(src);
  const out = new Float32Array(src.length);
  for (let i = 0; i + 2 < src.length; i += 3) {
    out[i] = src[i]! - o[0];
    out[i + 1] = src[i + 1]! - o[1];
    out[i + 2] = src[i + 2]! - o[2];
  }
  return out;
}

export interface MeshOptions {
  /** 크기 대비 현 높이(기본 0.001) */
  relTol: number;
  /** 절대 현 높이(모형 단위, 있으면 relTol 대신) */
  absTol?: number;
  /** 최대 각(라디안) */
  angle: number;
  /** 면 표(ItemMesh.faceTable)를 만들지. 기본 true */
  faceTable?: boolean;
  /**
   * 닫힌 입체의 질량 속성(면 표 props)을 곡면 적분으로 구할 거리(ItemMesh.propsJob)를 남길지. 기본 true(면 표가 있을 때만).
   * 적분은 propsjob.ts MassPropsJob이 삼각화와 따로 한다
   */
  props?: boolean;
}

interface FaceRef {
  id: number;
  reversed: boolean;
}

/** 면 하나를 삼각화하며 알아낸 것(면 표용) */
interface FaceInfo {
  stepId: number;
  kind: number;
  params: number[];
  /** B-rep 넓이(못 구하면 NaN) */
  area: number;
  /** 경계 길이(못 구하면 NaN) */
  perimeter: number;
  exact: boolean;
}

/** 5점 가우스-르장드르(구간 [-1, 1]) */
const GAUSS5: readonly [number, number][] = [
  [0, 0.5688888888888889],
  [-0.5384693101056831, 0.4786286704993665],
  [0.5384693101056831, 0.4786286704993665],
  [-0.906179845938664, 0.2369268850561891],
  [0.906179845938664, 0.2369268850561891],
];

/** ∫ f(t) dt를 나눔 점 사이마다 5점 가우스로(끝이 시작보다 작으면 부호가 바뀐다) */
function integrate(ts: readonly number[], f: (t: number) => number): number {
  let s = 0;
  for (let i = 1; i < ts.length; i++) {
    const a = ts[i - 1]!;
    const b = ts[i]!;
    const h = (b - a) / 2;
    if (h === 0) continue;
    const m = (a + b) / 2;
    let q = 0;
    for (const [x, w] of GAUSS5) q += w * f(m + h * x);
    s += q * h;
  }
  return s;
}

const KIND_INDEX = new Map<string, number>(FACE_KINDS.map((k, i) => [k, i]));
const EDGE_KIND_INDEX = new Map<string, number>(EDGE_KINDS.map((k, i) => [k, i]));

/** 곡면·면 방향 → 면 표 종류와 매개변수 */
function surfaceInfo(surf: Surface | null, sameSense: boolean, poly: boolean, info: FaceInfo): void {
  const p = info.params;
  p.fill(0);
  if (!surf || poly) {
    info.kind = KIND_INDEX.get('polygon')!;
    return;
  }
  info.kind = KIND_INDEX.get(surf.kind) ?? KIND_INDEX.get('unknown')!;
  const put = (r1: number, r2: number, a: V3, o: V3) => {
    p[0] = r1;
    p[1] = r2;
    p[2] = a[0];
    p[3] = a[1];
    p[4] = a[2];
    p[5] = o[0];
    p[6] = o[1];
    p[7] = o[2];
  };
  if (surf instanceof PlaneSurface) {
    const z = surf.f.z;
    put(0, 0, sameSense ? z : [-z[0], -z[1], -z[2]], surf.f.o);
  } else if (surf instanceof CylinderSurface) put(Math.abs(surf.r), 0, surf.f.z, surf.f.o);
  else if (surf instanceof ConeSurface) put(Math.abs(surf.r), Math.atan(surf.t), surf.f.z, surf.f.o);
  else if (surf instanceof SphereSurface) put(Math.abs(surf.r), 0, surf.f.z, surf.f.o);
  else if (surf instanceof TorusSurface) put(Math.abs(surf.R), Math.abs(surf.r), surf.f.z, surf.f.o);
}

const SOLID_TYPES = new Set(['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'FACETED_BREP_AND_BREP_WITH_VOIDS']);
const SHELL_TYPES = new Set(['CLOSED_SHELL', 'OPEN_SHELL', 'CONNECTED_FACE_SET', 'ORIENTED_CLOSED_SHELL', 'ORIENTED_OPEN_SHELL']);
const FACE_TYPES = new Set(['ADVANCED_FACE', 'FACE_SURFACE', 'FACE', 'ORIENTED_FACE']);
const TESS_TYPES = new Set([
  'TESSELLATED_SOLID',
  'TESSELLATED_SHELL',
  'TRIANGULATED_FACE',
  'COMPLEX_TRIANGULATED_FACE',
  'TRIANGULATED_SURFACE_SET',
  'COMPLEX_TRIANGULATED_SURFACE_SET',
]);
const SURFACE_MODEL_TYPES = new Set(['SHELL_BASED_SURFACE_MODEL', 'FACE_BASED_SURFACE_MODEL']);

/** 그물로 만들 수 있는 형상 항목인지 */
export function isMeshableType(t: string): boolean {
  return SOLID_TYPES.has(t) || SHELL_TYPES.has(t) || FACE_TYPES.has(t) || TESS_TYPES.has(t) || SURFACE_MODEL_TYPES.has(t);
}

export function isTessellatedType(t: string): boolean {
  return TESS_TYPES.has(t);
}

class Builder implements MeshOut {
  positions: number[] = [];
  normals: number[] = [];
  indices: number[] = [];
  colors: number[] = [];
  faceColors: (Rgba | undefined)[] = [];
  vertsAtFaceStart: number[] = [];
  startFace(color: Rgba | undefined): void {
    this.faceColors.push(color);
    this.vertsAtFaceStart.push(this.positions.length / 3);
  }
}

export class BrepMesher {
  /** 지원하지 않는 위상 개체 종류 → 개수 */
  readonly unsupported = new Map<string, number>();
  private edgeCache = new Map<number, V3[]>();
  /** 다각 고리(POLY_LOOP)로 그린 면 수(그물에 모서리 선이 없는 면이 섞였는지 본다) */
  private polyFaces = 0;
  /** 곡선 모서리의 매개변수(넓이·길이 적분용, 모서리 캐시와 함께 비운다) */
  private edgeParams = new Map<number, EdgeParam>();
  private tol: Tol = { chord: 1, angle: 0.35 };
  private eps = 1e-6;
  /** 방금 삼각화한 면의 경계 고리가 면 법선과 거꾸로 돌았는지(tessellateFace reversed) */
  private faceReversed = false;
  /** 접힌 면 때문에 더 잘게 나눌 모서리 → 현 높이 나눗수(항목 하나 동안) */
  private readonly edgeRefine = new Map<number, number>();

  constructor(
    readonly f: StepFile,
    readonly g: Geometry,
    readonly colorOf: (id: number) => Rgba | undefined,
    readonly opts: MeshOptions,
  ) {}

  private miss(t: string): void {
    this.unsupported.set(t, (this.unsupported.get(t) ?? 0) + 1);
  }

  /** 형상 항목 하나를 그물로(못 만들면 null) */
  meshItem(itemId: number, onFace?: () => void): ItemMesh | null {
    try {
      return this.meshItemPass(itemId, onFace, 0);
    } finally {
      this.edgeRefine.clear();
    }
  }

  /**
   * 한 번 삼각화. 굽은 면(작은 반지름 원환 필렛 등)의 안쪽 점이 성긴 경계 현보다 경계에 가까우면 삼각형이 접혀(3D 법선이 곡면과
   * 반대) 겹치고 단일면 그리기에서 구멍처럼 보인다 — 접힌 면이 있으면 그 면의 모서리를 더 잘게(현 높이 ¼) 나눠 항목을 다시
   * 삼각화한다(두 번까지, 이웃 면도 같은 다각선을 쓰므로 틈이 생기지 않는다). 접힌 면이 없는 항목은 그대로다
   */
  private meshItemPass(itemId: number, onFace: (() => void) | undefined, pass: number, prev?: { outs: FaceOut[]; dirty: Set<number>; folded: number }): ItemMesh | null {
    const e = this.f.get(itemId);
    if (!e) return null;
    if (TESS_TYPES.has(e.type)) return this.meshTessellated(itemId);
    const missBefore = pass < MAX_REFINE_PASS ? new Map(this.unsupported) : null;
    const faces: FaceRef[] = [];
    let closed = false;
    const inherited = new Map<number, Rgba>(); // 면 → 껍질·입체에서 물려받은 색
    const addShell = (sid: number, reversed: boolean, parentColor: Rgba | undefined) => {
      const s = this.f.get(sid);
      if (!s) return;
      if (s.type === 'ORIENTED_CLOSED_SHELL' || s.type === 'ORIENTED_OPEN_SHELL') {
        addShell(refId(s.args[2]), reversed !== !bool(s.args[3], true), this.colorOf(sid) ?? parentColor);
        return;
      }
      if (!SHELL_TYPES.has(s.type)) {
        if (FACE_TYPES.has(s.type)) {
          faces.push({ id: sid, reversed });
          if (parentColor) inherited.set(sid, parentColor);
        } else this.miss(s.type);
        return;
      }
      if (s.type === 'CLOSED_SHELL') closed = true;
      const col = this.colorOf(sid) ?? parentColor;
      for (const fid of refList(s.args[1])) {
        faces.push({ id: fid, reversed });
        if (col) inherited.set(fid, col);
      }
    };
    const solidColor = this.colorOf(itemId);
    if (SOLID_TYPES.has(e.type)) {
      addShell(refId(e.args[1]), false, solidColor);
      if (e.type === 'BREP_WITH_VOIDS' || e.type === 'FACETED_BREP_AND_BREP_WITH_VOIDS') for (const v of refList(e.args[2])) addShell(v, false, solidColor);
    } else if (SHELL_TYPES.has(e.type)) addShell(itemId, false, solidColor);
    else if (e.type === 'SHELL_BASED_SURFACE_MODEL' || e.type === 'FACE_BASED_SURFACE_MODEL') {
      for (const sid of refList(e.args[1])) addShell(sid, false, solidColor);
      closed = false;
    } else if (FACE_TYPES.has(e.type)) faces.push({ id: itemId, reversed: false });
    else return null;
    if (!faces.length) return null;

    // 크기(꼭짓점 상자) → 허용 오차
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    const grow = (p: V3) => {
      for (let k = 0; k < 3; k++) {
        if (p[k]! < lo[k]!) lo[k] = p[k]!;
        if (p[k]! > hi[k]!) hi[k] = p[k]!;
      }
    };
    for (const fr of faces) this.faceVertices(fr.id, grow);
    let diag = Number.isFinite(lo[0]) ? dist(lo, hi) : 0;
    // 꼭짓점이 하나뿐인 닫힌 면(구 전체 등): 곡면 크기로
    let surfSize = 0;
    for (const fr of faces) {
      let fe = this.f.get(fr.id);
      if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
      if (!fe || fe.type === 'FACE') continue;
      const sf = this.g.surface(refId(fe.args[2]));
      if (sf) surfSize = Math.max(surfSize, sf.size());
      if (diag > 0 && surfSize > 0) break;
    }
    if (!(diag > surfSize * 1e-3)) diag = Math.max(diag, surfSize);
    if (!(diag > 0)) diag = 1;
    const chord = this.opts.absTol ?? Math.max(diag * this.opts.relTol, 1e-9);
    // 큰 좌표면 묶음 원점(꼭짓점 상자 가운데)을 빼서 담는다
    const origin = needsOrigin(lo, hi) ? boxCenter(lo, hi) : undefined;
    this.tol = { chord, angle: this.opts.angle };
    this.eps = Math.max(chord * 1e-3, diag * 1e-9);
    this.edgeCache = new Map();
    this.edgeParams = new Map();
    this.healTJunctions(faces);
    const poly0 = this.polyFaces;

    const b = new Builder();
    const edgeUse = new Map<number, number>(); // 모서리 → 쓰인 면 수(이음선 판별은 면 안에서)
    const seams = new Set<number>();
    let failed = 0;
    const failures = new Map<string, number>();
    const fail = (why: string) => {
      failed++;
      failures.set(why, (failures.get(why) ?? 0) + 1);
    };
    const nf = faces.length;
    const table = this.opts.faceTable !== false;
    const triStart = new Uint32Array(table ? nf + 1 : 0);
    const stepIds = new Uint32Array(table ? nf : 0);
    const kinds = new Uint8Array(table ? nf : 0);
    const params = new Float64Array(table ? nf * FACE_PARAMS : 0);
    const areas = new Float64Array(table ? nf : 0);
    const perimeters = new Float64Array(table ? nf : 0);
    const exact = new Uint8Array(table ? nf : 0);
    // 질량 속성(닫힌 껍질): 면마다 적분 거리만 남긴다(적분은 나중에 — propsjob.ts)
    const wantProps = table && closed && this.opts.props !== false;
    const propRef: V3 = Number.isFinite(lo[0]) ? boxCenter(lo, hi) : [0, 0, 0];
    const pjobs: (FaceFluxJob | null)[] | null = wantProps ? new Array<FaceFluxJob | null>(nf).fill(null) : null;
    const info: FaceInfo = { stepId: 0, kind: KIND_INDEX.get('unknown')!, params: new Array<number>(FACE_PARAMS).fill(0), area: NaN, perimeter: NaN, exact: false };
    /** 면마다 첫 삼각형(방향 맞추기용) */
    const faceTri = new Uint32Array(nf + 1);
    /** 경계 고리가 면 법선과 거꾸로 돈 면 */
    const suspect: number[] = [];
    /** 다시 삼각화할 수 있으면 면마다 결과를 남긴다(경계가 바뀌지 않은 면은 다음 번에 그대로 쓴다) */
    const outs: FaceOut[] | null = missBefore ? [] : null;
    for (let fi = 0; fi < nf; fi++) {
      const fr = faces[fi]!;
      onFace?.();
      const cached = prev && !prev.dirty.has(fi) ? prev.outs[fi] : undefined;
      const col = cached ? cached.col : (this.colorOf(fr.id) ?? inherited.get(fr.id));
      b.startFace(col);
      faceTri[fi] = b.indices.length / 3;
      const v0 = b.positions.length / 3;
      if (table) triStart[fi] = b.indices.length / 3;
      let r: string | null;
      let reversed: boolean;
      if (cached) {
        for (const x of cached.pos) b.positions.push(x);
        for (const x of cached.nrm) b.normals.push(x);
        for (const i of cached.idx) b.indices.push(v0 + i);
        this.replayEdgeUse(fr.id, edgeUse, seams);
        r = cached.r;
        reversed = cached.reversed;
        if (table) {
          stepIds[fi] = cached.stepId;
          kinds[fi] = cached.kind;
          params.set(cached.params, fi * FACE_PARAMS);
          areas[fi] = cached.area;
          perimeters[fi] = cached.perimeter;
          exact[fi] = cached.exact;
        }
        if (pjobs) pjobs[fi] = cached.pj;
      } else {
        if (table) {
          info.stepId = fr.id;
          info.kind = KIND_INDEX.get('unknown')!;
          info.params.fill(0);
          info.area = NaN;
          info.perimeter = NaN;
          info.exact = false;
        }
        this.faceReversed = false;
        const pj: { job: FaceFluxJob | null } | null = pjobs ? { job: null } : null;
        r = this.meshFace(fr, b, edgeUse, seams, table ? info : null, pj);
        if (pjobs && pj) pjobs[fi] = pj.job;
        reversed = this.faceReversed;
        if (table) {
          stepIds[fi] = info.stepId;
          kinds[fi] = info.kind;
          // 점 매개변수(평면·원기둥·원뿔·구·원환의 원점)도 묶음 원점 기준으로
          if (origin && info.kind <= KIND_INDEX.get('torus')!) for (let q = 0; q < 3; q++) info.params[5 + q] = info.params[5 + q]! - origin[q]!;
          params.set(info.params, fi * FACE_PARAMS);
          // 삼각화에 실패한 면은 넓이·둘레도 비운다(고를 수 없다)
          const ok = !r;
          areas[fi] = ok ? info.area : NaN;
          perimeters[fi] = ok ? info.perimeter : NaN;
          exact[fi] = ok && info.exact ? 1 : 0;
        }
      }
      if (r) fail(r);
      else if (reversed) suspect.push(fi);
      if (outs) {
        const t0 = faceTri[fi]! * 3;
        outs.push({
          pos: b.positions.slice(v0 * 3),
          nrm: b.normals.slice(v0 * 3),
          idx: b.indices.slice(t0).map((i) => i - v0),
          col,
          r,
          reversed,
          stepId: table ? stepIds[fi]! : 0,
          kind: table ? kinds[fi]! : 0,
          params: table ? Array.from(params.subarray(fi * FACE_PARAMS, (fi + 1) * FACE_PARAMS)) : [],
          area: table ? areas[fi]! : NaN,
          perimeter: table ? perimeters[fi]! : NaN,
          exact: table ? exact[fi]! : 0,
          pj: pjobs ? pjobs[fi]! : null,
        });
      }
    }
    const nTri = b.indices.length / 3;
    faceTri[nf] = nTri;
    if (table) triStart[nf] = nTri;
    // 접힌 삼각형이 있는 면: 그 면의 모서리를 더 잘게 나눠 다시(MAX_REFINE_PASS번까지)
    if (missBefore && nTri > 0) {
      // 평면은 안쪽 점이 없어 경계를 나눠도 달라지지 않는다. 앞 번보다 접힌 면이 줄지 않으면(경계 탓이 아닌 접힘) 더 하지 않는다
      const folded: number[] = [];
      let foldTris = 0;
      for (let fi = 0; fi < nf; fi++) {
        const n = this.isPlanarFace(faces[fi]!.id) ? 0 : countFolds(b, faceTri[fi]!, faceTri[fi + 1]!, diag);
        if (n) folded.push(fi);
        foldTris += n;
      }
      if (folded.length && (!prev || foldTris < prev.folded)) {
        const changed = new Set<number>();
        for (const fi of folded)
          for (const eid of this.faceEdgeIds(faces[fi]!.id)) {
            const k = this.edgeRefine.get(eid) ?? 1;
            if (k < 16) {
              this.edgeRefine.set(eid, k * 4);
              changed.add(eid);
            }
          }
        if (changed.size && outs) {
          // 바뀐 모서리를 쓰는 면만 다시(이웃 면도 같은 다각선을 써야 틈이 없다), 나머지는 앞 결과 그대로
          const dirty = new Set<number>();
          for (let fi = 0; fi < nf; fi++) if (this.faceEdgeIds(faces[fi]!.id).some((eid) => changed.has(eid))) dirty.add(fi);
          this.unsupported.clear();
          for (const [k, v] of missBefore) this.unsupported.set(k, v);
          return this.meshItemPass(itemId, undefined, pass + 1, { outs, dirty, folded: foldTris });
        }
      }
    }
    // 모서리 선(과 모서리 표: 선분 범위·곡선 종류·원 중심·반지름·길이)
    const lines: number[] = [];
    const eStart: number[] = [];
    const eIds: number[] = [];
    const eKinds: number[] = [];
    const eParams: number[] = [];
    const eLen: number[] = [];
    const eSweep: number[] = [];
    const eTan: number[] = [];
    const eCurveStart: number[] = [];
    const eCurves: number[] = [];
    for (const [eid] of edgeUse) {
      if (seams.has(eid)) continue;
      const poly = this.edgeCache.get(eid);
      if (!poly) continue;
      if (table) {
        eStart.push(lines.length / 6);
        eIds.push(eid);
        const ep = this.edgeParams.get(eid);
        const c = ep?.c;
        const p = [0, 0, 0, 0, 0, 0, 0, 0];
        let kind: EdgeKind = 'other';
        let sweep = 0;
        // 매개변수가 없으면(직선·꼭짓점이 곡선에서 먼 모서리) 다각선 그대로: 두 점이면 직선, 아니면 곡선
        if (!c) kind = poly.length <= 2 ? 'line' : 'other';
        else if (c instanceof LineCurve) kind = 'line';
        else if (c instanceof CircleCurve) {
          kind = 'circle';
          p[0] = Math.abs(c.r);
          p.splice(2, 3, ...c.f.z);
          p.splice(5, 3, ...c.f.o.map((v, k) => v - (origin?.[k] ?? 0)));
          sweep = Math.abs(ep!.t[ep!.t.length - 1]! - ep!.t[0]!);
        } else if (c instanceof EllipseCurve) {
          kind = 'ellipse';
          p[0] = Math.abs(c.a);
          p[1] = Math.abs(c.b);
          p.splice(2, 3, ...c.f.z);
          p.splice(5, 3, ...c.f.o.map((v, k) => v - (origin?.[k] ?? 0)));
        } else if (c instanceof BSplineCurve) kind = 'bspline';
        eKinds.push(EDGE_KIND_INDEX.get(kind)!);
        eParams.push(...p);
        eLen.push(this.edgeLength(eid, poly));
        eSweep.push(sweep);
        // 곡선 모서리 두 끝의 접선(측정 잠금 — 모서리 방향으로): 시작은 t1에서 t2 쪽, 끝은 t2에서 모서리 방향(t1에서 멀어지는 쪽)
        const t1 = ep?.t[0];
        const t2 = ep?.t[ep.t.length - 1];
        const ts = c && kind !== 'line' && t1 !== undefined && t2 !== undefined && t1 !== t2 ? curveEndTangent(c, t1, t2) : null;
        const te = ts ? curveEndTangent(c!, t2!, t1!) : null;
        if (ts && te) eTan.push(...ts, -te[0], -te[1], -te[2]);
        else eTan.push(NaN, NaN, NaN, NaN, NaN, NaN);
        // 곡선 정의(접선을 아는 곡선 모서리): 원·타원 호는 틀 x축과 두 끝 매개변수 각(화면이 곡선 가운데 점·호 범위를 끝 꼭짓점(float32)이 아니라 이 각으로 구한다),
        // 한 바퀴 원은 기록 없음(params로 충분 — 끝이 없다), 한 바퀴 타원은 틀 x축만
        eCurveStart.push(eCurves.length);
        const turn = t1 !== undefined && t2 !== undefined && Math.abs(t2 - t1) >= 2 * Math.PI * (1 - 1e-12);
        const rec = !ts || !te
          ? null
          : c instanceof CircleCurve
            ? turn ? null : conicRecord(c.f.x, t1!, t2!)
            : c instanceof EllipseCurve
              ? turn ? ellipseAxis(c.f.x) : conicRecord(c.f.x, t1!, t2!)
              : c instanceof BSplineCurve ? bsplineRecord(c.nc, t1!, t2!, c.period, origin) : null;
        if (rec) for (const v of rec) eCurves.push(v);
      }
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1]!;
        const c = poly[i]!;
        lines.push(a[0], a[1], a[2], c[0], c[1], c[2]);
      }
    }
    if (table) eStart.push(lines.length / 6);
    // 색: 면 색이 모두 같으면 전체 색, 다르면 정점 색
    let color: Rgba | undefined;
    let colors: Float32Array | undefined;
    const distinct = new Set(b.faceColors.map((c) => (c ? c.join(',') : '')));
    if (distinct.size === 1) color = b.faceColors[0];
    else {
      const nv = b.positions.length / 3;
      colors = new Float32Array(nv * 4);
      const dflt: Rgba = solidColor ?? [0.75, 0.75, 0.78, 1];
      for (let fi = 0; fi < b.faceColors.length; fi++) {
        const c = b.faceColors[fi] ?? dflt;
        const s = b.vertsAtFaceStart[fi]!;
        const t = fi + 1 < b.vertsAtFaceStart.length ? b.vertsAtFaceStart[fi + 1]! : nv;
        for (let v = s; v < t; v++) colors.set(c, v * 4);
      }
    }
    const positions = relativeFloat32(b.positions, origin);
    const indices = Uint32Array.from(b.indices);
    // 닫힌 껍질의 면 방향: 고리가 면 법선과 거꾸로 돈 면이 있거나(곡면 법선 약속이 다른 파일 — 예: 압출 곡면의 u·v를 바꿔 쓴 것)
    // 부피가 음수면, 이웃 면과 경계 선분 방향을 맞추고 바깥 법선이 되게 면 묶음을 뒤집는다(삼각형 감기·법선·평면 법선 매개변수)
    let flips: ReturnType<typeof orientFaces> = null;
    if (closed && !failed && nTri > 0 && (suspect.length || signedVolume6(positions, indices) < 0)) {
      flips = orientFaces(positions, indices, faceTri, suspect);
      if (flips) {
        for (let fi = 0; fi < nf; fi++) {
          if (!flips[fi]) continue;
          for (let t = faceTri[fi]!; t < faceTri[fi + 1]!; t++) {
            const x = indices[t * 3 + 1]!;
            indices[t * 3 + 1] = indices[t * 3 + 2]!;
            indices[t * 3 + 2] = x;
          }
          const v0 = b.vertsAtFaceStart[fi]!;
          const v1 = fi + 1 < nf ? b.vertsAtFaceStart[fi + 1]! : b.positions.length / 3;
          for (let k = v0 * 3; k < v1 * 3; k++) b.normals[k] = -b.normals[k]!;
          if (table && kinds[fi] === KIND_INDEX.get('plane')) for (let q = 2; q < 5; q++) params[fi * FACE_PARAMS + q] = -params[fi * FACE_PARAMS + q]!;
        }
      }
    }
    // 닫힌 입체: 닫힌 껍질 + 실패한 면 없음 + (모서리마다 두 면이 같은 다각선을 나눠 쓰면 삼각형도 틈 없이 맞물린다 —
    // 이음선은 한 면 안에서 두 번) 그렇지 않은 드문 경우(퇴화 모서리·다각 고리 면)는 삼각형 모서리 짝을 직접 확인한다
    let solid = false;
    if (closed && !failed && nTri > 0) {
      let topo = edgeUse.size > 0;
      for (const [eid, n] of edgeUse)
        if (n !== 2 && !(n === 1 && seams.has(eid))) {
          topo = false;
          break;
        }
      solid = topo || isClosedMesh(positions, indices);
    }
    const out: ItemMesh = {
      positions,
      normals: Float32Array.from(b.normals),
      indices,
      colors,
      color,
      edges: relativeFloat32(lines, origin),
      ...(this.polyFaces === poly0 ? { triangleEdges: false as const } : {}),
      faces: faces.length,
      failedFaces: failed,
      triangles: nTri,
      closed,
      bbox: Number.isFinite(lo[0]) ? [lo, hi] : boxOf(b.positions),
      failures,
      faceTable: table ? { triStart, stepIds, kinds, params, area: areas, perimeter: perimeters, exact } : undefined,
      edgeTable: table
        ? {
            segStart: Uint32Array.from(eStart),
            stepIds: Uint32Array.from(eIds),
            kinds: Uint8Array.from(eKinds),
            params: Float64Array.from(eParams),
            length: Float64Array.from(eLen),
            sweep: Float64Array.from(eSweep),
            tangents: Float32Array.from(eTan),
            ...(eCurves.length ? { curveStart: Uint32Array.from([...eCurveStart, eCurves.length]), curves: Float64Array.from(eCurves) } : {}),
          }
        : undefined,
    };
    if (solid) out.solid = true;
    if (origin) out.origin = origin;
    // 닫힌 입체의 질량 속성: 삼각화한 그대로(면 방향 맞추기 전 정점·삼각형)와 면마다 적분 거리를 남긴다 — 적분은 나중에(propsjob.ts)
    if (solid && pjobs && out.faceTable && pjobs.every((j) => j)) {
      out.propsJob = { P: b.positions, I: b.indices, faceTri, vStart: b.vertsAtFaceStart, faces: pjobs as FaceFluxJob[], flips, c: propRef, diag, chord };
    }
    return out;
  }

  /** 와이어프레임 모서리용 허용 오차를 정하고 모서리 캐시를 비운다(그 뒤 edgePolyline을 부른다) */
  setWireTolerance(chord: number): void {
    this.tol = { chord, angle: this.opts.angle };
    this.eps = Math.max(chord * 1e-3, 1e-12);
    this.edgeCache = new Map();
    this.edgeParams = new Map();
  }

  /**
   * 모서리 다각선을 미리 만들고, 다른 모서리의 꼭짓점이 어떤 모서리 토막 위에 놓이면(B-rep의 T자 이음)
   * 그 점을 다각선에 넣는다. 이웃 면이 같은 다각선을 쓰므로 틈 없이 맞물린다.
   */
  private healTJunctions(faces: FaceRef[]): void {
    const edges = new Set<number>();
    for (const fr of faces) {
      let fe = this.f.get(fr.id);
      if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
      if (!fe) continue;
      for (const bid of refList(fe.args[1])) {
        const loop = this.f.get(refId(this.f.get(bid)?.args[1]));
        if (!loop || loop.type !== 'EDGE_LOOP') continue;
        for (const oid of refList(loop.args[1])) {
          let eid = refId(this.f.get(oid)?.args[3]);
          let inner = this.f.get(eid);
          while (inner && inner.type === 'ORIENTED_EDGE') {
            eid = refId(inner.args[3]);
            inner = this.f.get(eid);
          }
          if (eid) edges.add(eid);
        }
      }
    }
    if (edges.size > 200_000) return;
    const polys = new Map<number, V3[]>();
    const verts: V3[] = [];
    const seen = new Set<string>();
    for (const eid of edges) {
      const pl = this.edgePolyline(eid);
      if (!pl || pl.length < 2) continue;
      polys.set(eid, pl);
      for (const p of [pl[0]!, pl[pl.length - 1]!]) {
        const k = `${p[0]},${p[1]},${p[2]}`;
        if (!seen.has(k)) {
          seen.add(k);
          verts.push(p);
        }
      }
    }
    if (verts.length < 3) return;
    const tol = Math.max(this.eps * 2, this.tol.chord * 1e-3);
    // 격자 해시
    const cell = Math.max(this.tol.chord * 20, tol * 100);
    const grid = new Map<string, V3[]>();
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const p of verts) {
      const k = key(p[0], p[1], p[2]);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(p);
    }
    for (const [eid, pl] of polys) {
      let changed = false;
      const out: V3[] = [pl[0]!];
      for (let i = 1; i < pl.length; i++) {
        const a = pl[i - 1]!;
        const c = pl[i]!;
        const d = sub(c, a);
        const l2 = dot(d, d);
        const ins: [number, V3][] = [];
        if (l2 > tol * tol) {
          const lo = [Math.min(a[0], c[0]) - tol, Math.min(a[1], c[1]) - tol, Math.min(a[2], c[2]) - tol];
          const hi = [Math.max(a[0], c[0]) + tol, Math.max(a[1], c[1]) + tol, Math.max(a[2], c[2]) + tol];
          const n = [0, 1, 2].map((k) => Math.floor(hi[k]! / cell) - Math.floor(lo[k]! / cell) + 1);
          if (n[0]! * n[1]! * n[2]! <= 4096) {
            for (let gx = Math.floor(lo[0]! / cell); gx <= Math.floor(hi[0]! / cell); gx++)
              for (let gy = Math.floor(lo[1]! / cell); gy <= Math.floor(hi[1]! / cell); gy++)
                for (let gz = Math.floor(lo[2]! / cell); gz <= Math.floor(hi[2]! / cell); gz++) {
                  for (const p of grid.get(`${gx},${gy},${gz}`) ?? []) {
                    const t = dot(sub(p, a), d) / l2;
                    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
                    const q: V3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
                    if (dist(q, p) <= tol && dist(p, a) > tol && dist(p, c) > tol) ins.push([t, p]);
                  }
                }
          }
        }
        if (ins.length) {
          ins.sort((x, y) => x[0] - y[0]);
          for (const [, p] of ins) out.push(p);
          changed = true;
        }
        out.push(c);
      }
      if (changed) this.edgeCache.set(eid, out);
    }
  }

  /** 평면(또는 곡면을 모르는·다각 고리) 면인지 — 안쪽 점 없이 고리만으로 삼각화한다 */
  private isPlanarFace(faceId: number): boolean {
    let fe = this.f.get(faceId);
    if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
    if (!fe || fe.type === 'FACE') return true;
    const surf = this.g.surface(refId(fe.args[2]));
    return !surf || surf.planar;
  }

  /** 그대로 쓰는 면의 모서리 쓰임(meshFace와 같게 — 다각선이 있는 모서리만, 한 면 안 두 번이면 이음선) */
  private replayEdgeUse(faceId: number, edgeUse: Map<number, number>, seams: Set<number>): void {
    const inFace = new Map<number, number>();
    for (const eid of this.faceEdgeIds(faceId)) if (this.edgePolyline(eid)) inFace.set(eid, (inFace.get(eid) ?? 0) + 1);
    for (const [eid, n] of inFace) {
      edgeUse.set(eid, (edgeUse.get(eid) ?? 0) + 1);
      if (n >= 2) seams.add(eid);
    }
  }

  /** 면 경계 고리의 모서리(EDGE_CURVE) 번호들 */
  private faceEdgeIds(faceId: number): number[] {
    const out: number[] = [];
    let fe = this.f.get(faceId);
    if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
    if (!fe) return out;
    for (const bid of refList(fe.args[1])) {
      const loop = this.f.get(refId(this.f.get(bid)?.args[1]));
      if (!loop || loop.type !== 'EDGE_LOOP') continue;
      for (const oid of refList(loop.args[1])) {
        let eid = refId(this.f.get(oid)?.args[3]);
        let inner = this.f.get(eid);
        while (inner && inner.type === 'ORIENTED_EDGE') {
          eid = refId(inner.args[3]);
          inner = this.f.get(eid);
        }
        if (eid) out.push(eid);
      }
    }
    return out;
  }

  /** 면의 꼭짓점들을 cb로 */
  private faceVertices(faceId: number, cb: (p: V3) => void): void {
    let fe = this.f.get(faceId);
    if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
    if (!fe) return;
    for (const bid of refList(fe.args[1])) {
      const bnd = this.f.get(bid);
      if (!bnd) continue;
      const loop = this.f.get(refId(bnd.args[1]));
      if (!loop) continue;
      if (loop.type === 'EDGE_LOOP') {
        for (const oid of refList(loop.args[1])) {
          const oe = this.f.get(oid);
          const ec = oe ? this.f.get(refId(oe.args[3])) : undefined;
          if (!ec) continue;
          const p = this.g.point(refId(ec.args[1]));
          if (p) cb(p);
        }
      } else if (loop.type === 'POLY_LOOP') {
        for (const pid of refList(loop.args[1])) {
          const p = this.g.point(pid);
          if (p) cb(p);
        }
      } else if (loop.type === 'VERTEX_LOOP') {
        const p = this.g.point(refId(loop.args[1]));
        if (p) cb(p);
      }
    }
  }

  /** 모서리 다각선(시작 꼭짓점 → 끝 꼭짓점) */
  edgePolyline(edgeId: number): V3[] | null {
    const hit = this.edgeCache.get(edgeId);
    if (hit) return hit;
    const e = this.f.get(edgeId);
    if (!e) return null;
    if (e.type === 'ORIENTED_EDGE') {
      const inner = this.edgePolyline(refId(e.args[3]));
      return inner ? (bool(e.args[4], true) ? inner : inner.slice().reverse()) : null;
    }
    if (e.type !== 'EDGE_CURVE' && e.type !== 'SUBEDGE') {
      this.miss(e.type);
      return null;
    }
    const P1 = this.g.point(refId(e.args[1]));
    const P2 = this.g.point(refId(e.args[2]));
    if (!P1 || !P2) return null;
    let poly: V3[];
    const c = e.type === 'EDGE_CURVE' ? this.g.curve(refId(e.args[3]), true) : null;
    if (!c) poly = [P1, P2];
    else if (c.linear) poly = [P1, P2];
    else {
      const same = bool(e.args[4], true);
      const closed = dist(P1, P2) <= this.eps;
      let t1 = c.project(P1);
      let t2 = closed ? t1 : c.project(P2, t1);
      if (c.period > 0) {
        const P = c.period;
        if (same) {
          let d = (((t2 - t1) % P) + P) % P;
          if (closed || d < 1e-12 * P) d = closed ? P : d;
          t2 = t1 + d;
        } else {
          let d = (((t1 - t2) % P) + P) % P;
          if (closed || d < 1e-12 * P) d = closed ? P : d;
          t2 = t1 - d;
        }
      } else if (closed) {
        t1 = same ? c.t0 : c.t1;
        t2 = same ? c.t1 : c.t0;
      }
      const ts: number[] = [];
      if (Number.isFinite(t1) && Number.isFinite(t2) && t1 !== t2) {
        const k = this.edgeRefine.get(edgeId);
        c.sample(t1, t2, k ? { chord: this.tol.chord / k, angle: this.tol.angle } : this.tol, ts);
        // 넓이·길이 적분용(나눔 점 사이마다 가우스) — 꼭짓점이 곡선 위에 있을 때만(멀면 다각선 그대로 잰다)
        const tol = Math.max(this.tol.chord, this.eps * 10);
        if (dist(c.point(t1), P1) <= tol && dist(c.point(t2), P2) <= tol) this.edgeParams.set(edgeId, { c, t: [t1, ...ts, t2] });
      }
      poly = [P1];
      for (const t of ts) poly.push(c.point(t));
      poly.push(P2);
    }
    this.edgeCache.set(edgeId, poly);
    return poly;
  }

  /** 모서리 길이: 곡선이면 |c'(t)| 적분, 아니면 다각선 길이(이음 꼭짓점을 넣어도 같다) */
  private edgeLength(edgeId: number, poly: V3[]): number {
    const ep = this.edgeParams.get(edgeId);
    if (ep) return Math.abs(integrate(ep.t, (t) => len(ep.c.d1(t))));
    let s = 0;
    for (let i = 1; i < poly.length; i++) s += dist(poly[i - 1]!, poly[i]!);
    return s;
  }

  /**
   * 평면 위 모서리 하나의 그린 적분 ½∮(x dy − y dx)(시작 → 끝 방향, 평면 좌표 x·y = 틀의 x·y 축).
   * 곡선이면 매개변수로 적분하고, 직선·다각선은 토막마다 정확히 더한다
   */
  private edgeGreen(edgeId: number, poly: V3[], o: V3, ex: V3, ey: V3): number {
    const ep = this.edgeParams.get(edgeId);
    if (ep && !(ep.c instanceof LineCurve)) {
      const c = ep.c;
      return integrate(ep.t, (t) => {
        const p = sub(c.point(t), o);
        const d = c.d1(t);
        const x = dot(p, ex);
        const y = dot(p, ey);
        return (x * dot(d, ey) - y * dot(d, ex)) / 2;
      });
    }
    let s = 0;
    for (let i = 1; i < poly.length; i++) {
      const a = sub(poly[i - 1]!, o);
      const b = sub(poly[i]!, o);
      s += (dot(a, ex) * dot(b, ey) - dot(b, ex) * dot(a, ey)) / 2;
    }
    return s;
  }

  /** 면 하나(실패하면 이유) */
  private meshFace(fr: FaceRef, b: Builder, edgeUse: Map<number, number>, seams: Set<number>, info: FaceInfo | null, pj: { job: FaceFluxJob | null } | null = null): string | null {
    let fe = this.f.get(fr.id);
    let reversed = fr.reversed;
    if (fe && fe.type === 'ORIENTED_FACE') {
      reversed = reversed !== !bool(fe.args[3], true);
      fe = this.f.get(refId(fe.args[2]));
    }
    if (!fe) return '면 개체 없음';
    if (info) info.stepId = fe.id;
    if (!FACE_TYPES.has(fe.type)) {
      this.miss(fe.type);
      return `지원하지 않는 면 ${fe.type}`;
    }
    const loops: V3[][] = [];
    const inFace = new Map<number, number>();
    let poly = false;
    // 넓이·둘레용: 고리마다 모서리(다각선, 고리를 도는 방향 ±1)와 바깥 고리인지
    const loopEdges: LoopEdge[][] = [];
    const loopOuter: boolean[] = [];
    /** 고리마다 FACE_BOUND 방향(질량 속성의 틈 메우기 방향) */
    const loopOrient: boolean[] = [];
    for (const bid of refList(fe.args[1])) {
      const bnd = this.f.get(bid);
      if (!bnd) continue;
      const loop = this.f.get(refId(bnd.args[1]));
      if (!loop) continue;
      const orient = bool(bnd.args[2], true);
      let pts: V3[] = [];
      const edges: LoopEdge[] = [];
      if (loop.type === 'EDGE_LOOP') {
        for (const oid of refList(loop.args[1])) {
          const oe = this.f.get(oid);
          if (!oe) continue;
          let eid = refId(oe.args[3]);
          let fwd = bool(oe.args[4], true);
          // 중첩된 ORIENTED_EDGE
          let inner = this.f.get(eid);
          while (inner && inner.type === 'ORIENTED_EDGE') {
            fwd = fwd === bool(inner.args[4], true);
            eid = refId(inner.args[3]);
            inner = this.f.get(eid);
          }
          const pl = this.edgePolyline(eid);
          if (!pl) continue;
          inFace.set(eid, (inFace.get(eid) ?? 0) + 1);
          edges.push({ eid, poly: pl, dir: fwd ? 1 : -1 });
          const seq = fwd ? pl : pl.slice().reverse();
          for (let i = 0; i < seq.length - 1; i++) pts.push(seq[i]!);
        }
      } else if (loop.type === 'POLY_LOOP') {
        if (!poly) this.polyFaces++;
        poly = true;
        pts = refList(loop.args[1])
          .map((p) => this.g.point(p))
          .filter((p): p is V3 => !!p);
        if (pts.length > 1 && dist(pts[0]!, pts[pts.length - 1]!) === 0) pts.pop();
      } else if (loop.type === 'VERTEX_LOOP') {
        const p = this.g.point(refId(loop.args[1]));
        if (p) pts = [p];
      } else {
        this.miss(loop.type);
        continue;
      }
      if (!orient) pts.reverse();
      loops.push(pts);
      loopEdges.push(edges);
      loopOuter.push(bnd.type === 'FACE_OUTER_BOUND');
      loopOrient.push(orient);
    }
    for (const [eid, n] of inFace) {
      edgeUse.set(eid, (edgeUse.get(eid) ?? 0) + 1);
      if (n >= 2) seams.add(eid);
    }
    const surfId = fe.type === 'FACE' ? 0 : refId(fe.args[2]);
    let sameSense = fe.type === 'FACE' ? true : bool(fe.args[3], true);
    const surf = surfId ? this.g.surface(surfId) : null;
    if (reversed) {
      sameSense = !sameSense;
      for (const l of loops) l.reverse();
    }
    if (info) surfaceInfo(surf, sameSense, poly, info);
    const triStart = b.indices.length;
    if (!surf || poly) {
      // 평면 다각형으로(곡면을 모르거나 다각 고리)
      let hint: V3 | null = null;
      if (surf && surf.planar) hint = surf.normal(0, 0);
      if (hint && !sameSense) hint = [-hint[0], -hint[1], -hint[2]];
      if (!surf && surfId) {
        if (!isPlanar(loops, this.tol.chord)) {
          const t = this.f.typeOf(surfId);
          // 아는 곡면인데 못 만들었으면(자리·곡선 개체가 없거나 값이 잘못됨 — 끊긴 파일 등) 지원하지 않는다고 하지 않는다
          return !t || this.g.unsupported.has(t) ? `지원하지 않는 곡면 ${t || '?'}` : `곡면 ${t}을(를) 읽지 못함(가리키는 개체가 없거나 값이 잘못됨)`;
        }
      }
      const n = tessellatePlanarLoops(loops, hint, b);
      if (!n) return '평면 삼각화 실패';
      // 다각 고리 면은 다각형 자체가 형상이다
      if (info && poly) {
        info.area = facetArea(b, triStart);
        info.perimeter = loops.reduce((s, l) => s + ringLength(l), 0);
        info.exact = true;
      }
      // 질량 속성: 평평한 면이라 삼각형 그대로(정확). 모서리 곡선이 있으면 틈을 메운다(나중에 — propsjob.ts)
      if (pj) pj.job = { surf: null, loopEdges, loopOrient, inFace, reversed, sameSense, edgeParams: this.edgeParams };
      return null;
    }
    const acc: { area: number; polys?: FacePolygon[]; uv?: number[] } = { area: 0, ...(pj ? { uv: [] } : {}) };
    const r = tessellateFace(surf, loops, sameSense, this.tol, this.eps, b, undefined, info || pj ? acc : undefined);
    if (r.error) return r.error;
    if (r.reversed) this.faceReversed = true;
    if (!r.triangles) return '삼각형 없음';
    if (info) this.faceMetrics(surf, loopEdges, loopOuter, inFace, acc.area, facetArea(b, triStart), info);
    // 질량 속성: 해석적 곡면은 매개변수 공간 다각형의 경계 적분, 그 밖은 삼각형 — 적분 거리만 남긴다(propsjob.ts)
    if (pj) pj.job = { surf, polys: acc.polys, uv: acc.uv, loopEdges, loopOrient, inFace, reversed, sameSense, edgeParams: this.edgeParams };
    return null;
  }

  /**
   * 면 넓이·둘레(B-rep): 둘레는 이음선을 뺀 모서리 곡선 길이의 합. 넓이는 평면이면 고리마다 그린 적분(|바깥| − Σ|구멍|),
   * 원기둥·원뿔·구·원환이면 매개변수 영역 적분(uvArea), 그 밖은 비워 둔다(화면이 삼각형 넓이를 "≈"로 보인다).
   * 삼각형 넓이의 절반~두 배(+ 경계 띠 여유) 밖이면 무언가 어긋난 것으로 보고 버린다.
   */
  private faceMetrics(
    surf: Surface,
    loopEdges: LoopEdge[][],
    loopOuter: boolean[],
    inFace: Map<number, number>,
    uvArea: number,
    facet: number,
    info: FaceInfo,
  ): void {
    let perimeter = 0;
    let perimExact = true;
    for (const l of loopEdges)
      for (const e of l) {
        if ((inFace.get(e.eid) ?? 0) >= 2) continue;
        perimeter += this.edgeLength(e.eid, e.poly);
        if (!this.edgeParams.has(e.eid) && e.poly.length > 2) perimExact = false;
      }
    info.perimeter = perimeter;
    // 크게 어긋난 값(고리 방향·바깥 고리 판단이 틀린 경우 등)만 버린다. 작은 면은 입체 크기에 맞춘 현 허용 오차로 거칠게
    // 나뉘어 삼각형 넓이가 몇 % 넘게 다를 수 있으므로(경계 띠 ≈ 둘레 × 현 높이) 그만큼 넉넉히 둔다
    const slack = 2 * perimeter * this.tol.chord + 1e-12;
    const sane = (a: number) => Number.isFinite(a) && a > 0 && a <= facet * 2 + slack && a >= facet * 0.5 - slack;
    // 모서리가 모두 직선·원이고(원은 매개변수로 적분할 수 있어야) — 해석적 곡면 넓이가 정확한 조건
    const simple = loopEdges.every((l) =>
      l.every((e) => {
        const ep = this.edgeParams.get(e.eid);
        return ep ? ep.c instanceof CircleCurve || ep.c instanceof LineCurve : e.poly.length <= 2;
      }),
    );
    let area = NaN;
    let areaExact = false;
    if (surf instanceof PlaneSurface) {
      const fr = surf.f;
      const sums = loopEdges.map((l) => Math.abs(l.reduce((s, e) => s + e.dir * this.edgeGreen(e.eid, e.poly, fr.o, fr.x, fr.y), 0)));
      if (sums.length) {
        let outer = loopOuter.indexOf(true);
        if (outer < 0 || loopOuter.indexOf(true, outer + 1) >= 0) outer = sums.indexOf(Math.max(...sums));
        area = sums.reduce((s, a, i) => (i === outer ? s + a : s - a), 0);
        areaExact = perimExact;
      }
    } else if (uvArea > 0) {
      area = uvArea;
      areaExact = simple;
    }
    if (!sane(area)) {
      area = NaN;
      areaExact = false;
    }
    info.area = area;
    // 넓이·둘레 모두 정확할 때만 정확(하나라도 근사면 화면은 "≈")
    info.exact = areaExact && perimExact;
  }

  /** AP242 삼각형 형식 */
  private meshTessellated(itemId: number): ItemMesh | null {
    const b = new Builder();
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    let faces = 0;
    let closed = false;
    const triStart: number[] = [];
    const stepIds: number[] = [];
    const visit = (id: number, depth: number, parentColor: Rgba | undefined) => {
      if (depth > 4) return;
      const e = this.f.get(id);
      if (!e) return;
      const col = this.colorOf(id) ?? parentColor;
      if (e.type === 'TESSELLATED_SOLID' || e.type === 'TESSELLATED_SHELL') {
        if (e.type === 'TESSELLATED_SOLID') closed = true;
        for (const c of refList(e.args[1])) visit(c, depth + 1, col);
        return;
      }
      if (!TESS_TYPES.has(e.type)) {
        this.miss(e.type);
        return;
      }
      faces++;
      b.startFace(col);
      triStart.push(b.indices.length / 3);
      stepIds.push(id);
      const complex = e.type.startsWith('COMPLEX_');
      const isFace = e.type.endsWith('_FACE');
      // (name, coordinates, pnmax, normals, [geometric_link,] pnindex, triangles | strips, fans)
      const coordsE = this.f.get(refId(e.args[1]));
      const coords = coordsE ? list(coordsE.args[2]).map((c) => numList(c)) : [];
      const normals = list(e.args[3]).map((c) => numList(c));
      const k = isFace ? 5 : 4;
      const pnindex = numList(e.args[k]);
      const tris: number[] = [];
      if (complex) {
        for (const strip of list(e.args[k + 1])) {
          const s = numList(strip);
          for (let i = 0; i + 2 < s.length; i++) {
            if (i % 2 === 0) tris.push(s[i]!, s[i + 1]!, s[i + 2]!);
            else tris.push(s[i + 1]!, s[i]!, s[i + 2]!);
          }
        }
        for (const fan of list(e.args[k + 2])) {
          const s = numList(fan);
          for (let i = 1; i + 1 < s.length; i++) tris.push(s[0]!, s[i]!, s[i + 1]!);
        }
      } else for (const t of list(e.args[k + 1])) tris.push(...numList(t));
      addTriangles(b, coords, normals, pnindex, tris, lo, hi);
    };
    visit(itemId, 0, undefined);
    if (!b.indices.length) return null;
    let color: Rgba | undefined;
    let colors: Float32Array | undefined;
    const distinct = new Set(b.faceColors.map((c) => (c ? c.join(',') : '')));
    if (distinct.size === 1) color = b.faceColors[0];
    else {
      const nv = b.positions.length / 3;
      colors = new Float32Array(nv * 4);
      for (let fi = 0; fi < b.faceColors.length; fi++) {
        const c = b.faceColors[fi] ?? ([0.75, 0.75, 0.78, 1] as Rgba);
        const s = b.vertsAtFaceStart[fi]!;
        const t = fi + 1 < b.vertsAtFaceStart.length ? b.vertsAtFaceStart[fi + 1]! : nv;
        for (let v = s; v < t; v++) colors.set(c, v * 4);
      }
    }
    const origin = needsOrigin(lo, hi) ? boxCenter(lo, hi) : undefined;
    const positions = relativeFloat32(b.positions, origin);
    const indices = Uint32Array.from(b.indices);
    const out: ItemMesh = {
      positions,
      normals: Float32Array.from(b.normals),
      indices,
      colors,
      color,
      edges: new Float32Array(0),
      faces,
      failedFaces: 0,
      triangles: b.indices.length / 3,
      closed,
      bbox: Number.isFinite(lo[0]) ? [lo, hi] : null,
      failures: new Map(),
      faceTable:
        this.opts.faceTable === false
          ? undefined
          : {
              triStart: Uint32Array.from([...triStart, b.indices.length / 3]),
              stepIds: Uint32Array.from(stepIds),
              kinds: new Uint8Array(stepIds.length).fill(KIND_INDEX.get('triangulated')!),
              params: new Float64Array(stepIds.length * FACE_PARAMS),
              // 삼각형 면은 삼각형이 곧 형상: 넓이는 삼각형 넓이, 둘레는 화면이 경계 변으로 잰다(NaN)
              area: Float64Array.from(stepIds.map((_, i) => facetRange(b, triStart[i]! * 3, (triStart[i + 1] ?? b.indices.length / 3) * 3))),
              perimeter: new Float64Array(stepIds.length).fill(NaN),
              exact: new Uint8Array(stepIds.length).fill(1),
            },
    };
    // 삼각형 입체(TESSELLATED_SOLID)는 파일의 삼각형이 정말 닫혔을 때만
    if (closed && isClosedMesh(positions, indices)) out.solid = true;
    if (origin) out.origin = origin;
    // 질량 속성: 삼각형이 곧 형상이라 삼각형 값이 정확하다
    if (out.solid && out.faceTable && this.opts.props !== false && Number.isFinite(lo[0])) {
      const c = boxCenter(lo, hi);
      const tri = new Float64Array(FLUX);
      trianglesFlux(tri, b.positions, indices, 0, indices.length / 3, c);
      if (tri[0]! > 0) out.faceTable.props = fluxToProps(tri, c, 0, PROPS_BREP);
    }
    return out;
  }
}

function addTriangles(b: Builder, coords: number[][], normals: number[][], pnindex: number[], tris: number[], lo: V3, hi: V3): void {
  const base = b.positions.length / 3;
  const map = new Map<number, number>();
  const pos = (k: number): number[] | undefined => {
    const ci = pnindex.length ? pnindex[k - 1] : k;
    return ci === undefined ? undefined : coords[ci - 1];
  };
  const nrm = (k: number): number[] | undefined => (normals.length === 1 ? normals[0] : normals[k - 1]);
  const idx: number[] = [];
  let agree = 0;
  let disagree = 0;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = tris[t]!;
    const c = tris[t + 1]!;
    const d = tris[t + 2]!;
    if (a === c || c === d || d === a) continue;
    const pa = pos(a);
    const pc = pos(c);
    const pd = pos(d);
    if (!pa || !pc || !pd) continue;
    const fn = cross(sub(pc as V3, pa as V3), sub(pd as V3, pa as V3));
    if (len(fn) === 0) continue;
    const na = nrm(a);
    if (na && na.length >= 3) {
      if (dot(fn, na as V3) >= 0) agree++;
      else disagree++;
    }
    idx.push(a, c, d);
  }
  const flip = disagree > agree;
  for (let i = 0; i < idx.length; i += 3) {
    const tri = flip ? [idx[i]!, idx[i + 2]!, idx[i + 1]!] : [idx[i]!, idx[i + 1]!, idx[i + 2]!];
    for (const k of tri) {
      let v = map.get(k);
      if (v === undefined) {
        const p = pos(k)!;
        v = base + map.size;
        map.set(k, v);
        b.positions.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
        for (let q = 0; q < 3; q++) {
          if (p[q]! < lo[q]!) lo[q] = p[q]!;
          if (p[q]! > hi[q]!) hi[q] = p[q]!;
        }
        const n = nrm(k);
        if (n && n.length >= 3) b.normals.push(n[0]!, n[1]!, n[2]!);
        else b.normals.push(NaN, NaN, NaN);
      }
      b.indices.push(v);
    }
  }
  // 법선이 없는 정점은 이웃 삼각형 법선 평균
  fillMissingNormals(b, base);
}

function fillMissingNormals(b: Builder, base: number): void {
  const nv = b.positions.length / 3;
  let missing = false;
  for (let v = base; v < nv; v++) if (Number.isNaN(b.normals[v * 3]!)) missing = true;
  if (!missing) return;
  const acc = new Float64Array((nv - base) * 3);
  for (let t = 0; t < b.indices.length; t += 3) {
    const a = b.indices[t]!;
    if (a < base) continue;
    const c = b.indices[t + 1]!;
    const d = b.indices[t + 2]!;
    const P = (i: number): V3 => [b.positions[i * 3]!, b.positions[i * 3 + 1]!, b.positions[i * 3 + 2]!];
    const n = cross(sub(P(c), P(a)), sub(P(d), P(a)));
    for (const i of [a, c, d])
      for (let q = 0; q < 3; q++) acc[(i - base) * 3 + q] = acc[(i - base) * 3 + q]! + n[q]!;
  }
  for (let v = base; v < nv; v++) {
    if (!Number.isNaN(b.normals[v * 3]!)) continue;
    const x = acc[(v - base) * 3]!;
    const y = acc[(v - base) * 3 + 1]!;
    const z = acc[(v - base) * 3 + 2]!;
    const l = Math.hypot(x, y, z) || 1;
    b.normals[v * 3] = x / l;
    b.normals[v * 3 + 1] = y / l;
    b.normals[v * 3 + 2] = z / l;
  }
}

function isPlanar(loops: V3[][], tol: number): boolean {
  const pts = loops.flat();
  if (pts.length < 3) return false;
  let n: V3 = [0, 0, 0];
  for (const l of loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i]!;
      const c = l[(i + 1) % l.length]!;
      n = [n[0] + (a[1] - c[1]) * (a[2] + c[2]), n[1] + (a[2] - c[2]) * (a[0] + c[0]), n[2] + (a[0] - c[0]) * (a[1] + c[1])];
    }
  }
  const l = len(n);
  if (!(l > 0)) return false;
  const u: V3 = [n[0] / l, n[1] / l, n[2] / l];
  const d0 = dot(u, pts[0]!);
  return pts.every((p) => Math.abs(dot(u, p) - d0) <= tol * 4);
}

function boxOf(pos: number[]): [V3, V3] | null {
  if (!pos.length) return null;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, pos[i + k]!);
      hi[k] = Math.max(hi[k]!, pos[i + k]!);
    }
  return [lo, hi];
}

/** 이번 면이 더한 삼각형(색인 triStart부터)의 넓이 */
function facetArea(b: Builder, triStart: number): number {
  return facetRange(b, triStart, b.indices.length);
}

/** 색인 [from, to)의 삼각형 넓이 */
function facetRange(b: Builder, from: number, to: number): number {
  const P = b.positions;
  const I = b.indices;
  let s = 0;
  for (let t = from; t + 2 < to; t += 3) {
    const a = I[t]! * 3;
    const c = I[t + 1]! * 3;
    const d = I[t + 2]! * 3;
    const ux = P[c]! - P[a]!;
    const uy = P[c + 1]! - P[a + 1]!;
    const uz = P[c + 2]! - P[a + 2]!;
    const vx = P[d]! - P[a]!;
    const vy = P[d + 1]! - P[a + 1]!;
    const vz = P[d + 2]! - P[a + 2]!;
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
}

/** 닫힌 고리 둘레 */
function ringLength(l: readonly V3[]): number {
  let s = 0;
  for (let i = 0; i < l.length; i++) s += dist(l[i]!, l[(i + 1) % l.length]!);
  return s;
}
