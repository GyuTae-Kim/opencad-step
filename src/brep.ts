/**
 * B-rep(경계 표현) → 삼각형 그물.
 *
 * 입체·껍질·면·고리·모서리를 따라가며, 모서리(EDGE_CURVE)마다 다각선을 한 번만 만들어 이웃 면이 같은 점을 쓰게 한다
 * (꼭짓점은 VERTEX_POINT 좌표 그대로). 허용 오차는 입체 크기에 비례한다.
 * AP242 삼각형 형식(TESSELLATED_SOLID·TESSELLATED_SHELL·TRIANGULATED_FACE·COMPLEX_TRIANGULATED_FACE·
 * TRIANGULATED_SURFACE_SET·COMPLEX_TRIANGULATED_SURFACE_SET)은 있는 삼각형을 그대로 쓴다.
 */
import type { Rgba } from 'opencad-viewer3d/types';
import { BSplineCurve, CircleCurve, type Curve, EllipseCurve, LineCurve, type Tol } from './curves';
import { bsplineRecord, conicRecord, ellipseAxis } from './edgecurve';
import type { Geometry } from './geometry';
import { isClosedMesh, orientFaces } from './analysis';
import { cross, dist, dot, len, sub, type V3 } from './math';
import { bool, list, numList, refId, refList, type StepFile } from './part21';
import { ConeSurface, CylinderSurface, PlaneSurface, SphereSurface, type Surface, TorusSurface } from './surfaces';
import { FLUX, fluxToProps, PROPS_BREP, trianglesFlux } from './massprops';
import type { EdgeParam, FaceFluxJob, ItemPropsJob, LoopEdge } from './propsjob';
import { distToSegment, type FacePolygon, type MeshOut, tessellateFace, tessellatePlanarLoops } from './tessellate';

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
  /**
   * 면 표에 식이 없는 곡면(회전·밀기·B-스플라인·띄운 곡면 — PARAM_FACE_KINDS)의 면마다 곡면(형상 항목 좌표, 그 밖의 면은 null).
   * 측정에서 축이 곡면을 뚫는 점을 그 곡면 위로 옮길 때 앱 워커가 화면에 보낸다(src/facesurf.ts). 장면(Scene3d)에는 넣지 않는다. 그런 면이 없으면 없다
   */
  faceSurfaces?: (Surface | null)[];
}

/** 면 표에 식(매개변수)이 없어 곡면 정의를 따로 보내는 면 종류 */
export const PARAM_FACE_KINDS: readonly FaceKind[] = ['revolution', 'extrusion', 'bspline', 'offset'];

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
  /** 나눈 경계 고리가 서로(또는 스스로) 엇갈린 평면 면이면 엇갈린 곡선 모서리 → 필요한 현 높이 나눗수(crossingEdges) */
  cross: Map<number, number> | null;
  /** 삼각형 넓이가 나눈 고리 넓이와 다른 평면 면에서 서로 엇갈린 현 짝(crossingEdges) */
  crossChords: CrossChord[] | null;
}

/** 서로 엇갈린 두 현: [모서리, 다각선 토막 번호, 모서리, 다각선 토막 번호] */
type CrossChord = [number, number, number, number];

/** 접힌 면 때문에 모서리를 더 잘게 나눠 다시 삼각화하는 최대 횟수 */
const MAX_REFINE_PASS = 2;

/**
 * 70차: 세 정점이 모두 경계 점인 접힌 삼각형·서로 엇갈린 평면 고리의 현을 풀려고 그 경계 현을 건너편 점에 맞춰 나눠 다시 삼각화하는 최대 횟수.
 * 띠 폭이 경계 현의 처짐보다 좁은 면은 안쪽 점이 없어 경계를 나누는 것 말고는 풀 길이 없다(접힌 면은 한두 번, 두 곡선이 같은 꼭짓점에서 접하며 벌어지는 끝은 몇 번 더 걸린다)
 */
const MAX_BAND_PASS = 8;
/** 면 하나에서 적어 두는 엇갈린 현 짝 수의 상한 */
const MAX_CROSS_CHORDS = 256;
/**
 * 잘못 메워졌던 평면 면에서 곡선 현의 처짐이 건너편 경계까지 거리(띠 폭)의 이 배수를 넘으면 더 나눈다. 활꼴 넓이는 처짐 × 현 길이의 ⅔라
 * 면 넓이 어긋남을 3% 안으로 두려면 처짐이 폭의 4.5%쯤이어야 한다
 */
const BAND_SAG_RATIO = 0.05;
/** 띠 폭을 재는 면의 경계 선분 수 상한(현마다 모든 선분을 훑는다) */
const BAND_WIDTH_SEGS = 2000;
/** 항목 하나에서 위 까닭으로 경계에 더 넣는 점 수의 상한(깨진 면에서 끝없이 늘지 않게) */
const MAX_BAND_POINTS = 4096;

/**
 * 나눈 경계 고리가 엇갈린 평면 면의 곡선 모서리를 잘게 나눌 때 현 높이 나눗수의 상한(필요한 만큼 한 번만 나눠 보고 풀리지 않으면 되돌린다).
 * 60차 표본에서 구멍 고리가 바깥 원에 0.002 mm까지 다가간 면(원 반지름 3.56 mm — 20° 현의 처짐 0.054 mm, 64배 필요)이 있어
 * 접힌 면(4배씩 16배까지)보다 크게 잡았다
 */
const CROSS_REFINE_MAX = 256;

/**
 * ORIENTED_EDGE 안의 ORIENTED_EDGE, 방향 껍질 안의 방향 껍질을 벗기는 최대 겹 수(실제 파일은 한두 겹 — 선 형상 wire.ts와 같은 8).
 * 깨진 파일의 자기·순환 참조가 끝없는 고리·재귀가 되지 않게 한다
 */
const ORIENTED_HOPS = 8;

/** ORIENTED_EDGE를 벗겨 안쪽 모서리 번호와 방향(fwd — 겹마다 곱한다) */
function unwrapEdge(f: StepFile, eid: number, fwd: boolean): { eid: number; fwd: boolean } {
  let inner = f.get(eid);
  for (let hop = 0; inner && inner.type === 'ORIENTED_EDGE' && hop < ORIENTED_HOPS; hop++) {
    fwd = fwd === bool(inner.args[4], true);
    eid = refId(inner.args[3]);
    inner = f.get(eid);
  }
  return { eid, fwd };
}

/**
 * 면 삼각형 [t0, t1) 가운데 접힌 것(삼각형 법선이 세 정점 법선의 합과 반대이고 넓이가 무시할 만큼 작지 않은 것)의 수.
 * 정점 법선은 곡면 법선(면 방향 반영)이라 곡면 위 삼각형은 같은 쪽을 본다
 */
function countFolds(b: FoldMesh, t0: number, t1: number, diag: number): number {
  let n = 0;
  const minArea2 = (diag * 1e-6) ** 2;
  for (let t = t0; t < t1; t++) if (triFolded(b, t, minArea2)) n++;
  return n;
}

/** 삼각형 위치·법선·번호(countFolds가 읽는 것) */
type FoldMesh = { positions: number[]; normals: number[]; indices: number[] };

/** 삼각형 t가 접혔는지(법선 길이 제곱이 minArea2 아래인 것은 빼고) */
function triFolded(b: FoldMesh, t: number, minArea2: number): boolean {
  const P = b.positions;
  const N = b.normals;
  const I = b.indices;
  const a = I[t * 3]! * 3;
  const c1 = I[t * 3 + 1]! * 3;
  const c2 = I[t * 3 + 2]! * 3;
  const ux = P[c1]! - P[a]!, uy = P[c1 + 1]! - P[a + 1]!, uz = P[c1 + 2]! - P[a + 2]!;
  const wx = P[c2]! - P[a]!, wy = P[c2 + 1]! - P[a + 1]!, wz = P[c2 + 2]! - P[a + 2]!;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  if (nx * nx + ny * ny + nz * nz <= minArea2) return false;
  return (N[a]! + N[c1]! + N[c2]!) * nx + (N[a + 1]! + N[c1 + 1]! + N[c2 + 1]!) * ny + (N[a + 2]! + N[c1 + 2]! + N[c2 + 2]!) * nz < 0;
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
const PARAM_KIND_INDEX = new Set(PARAM_FACE_KINDS.map((k) => KIND_INDEX.get(k)!));
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
  /** 방금 삼각화한 평면 면의 나눈 고리가 엇갈렸으면 그 자리의 곡선 모서리(crossingEdges — 없으면 null) */
  private faceCross: Map<number, number> | null = null;
  /** 방금 삼각화한 평면 면이 잘못 메워졌으면(삼각형 넓이 ≠ 나눈 고리 넓이) 서로 엇갈린 현 짝(없으면 null) */
  private faceCrossChords: CrossChord[] | null = null;
  /** 방금 삼각화한 평면 면의 나눈 고리에 곡선 모서리가 낀 엇갈림이 있었는지(풀 수 없는 것 포함 — 잘게 나눠 본 뒤 되돌릴지 볼 때) */
  private faceCrossed = false;
  /** 잘게 나눠 본 번: 넓이가 맞아 보여도 엇갈림을 찾는다(되돌릴지 정하려고) */
  private crossCheckAll = false;
  /** 69차: 이 번은 경계 현에 붙은 접힌 삼각형도 푼다(경계를 더 나눠도 접힘이 남은 면만 다시 삼각화하는 번 — tessellateFace chords) */
  private faceChords = false;
  /** 접힌 면 때문에 더 잘게 나눌 모서리 → 현 높이 나눗수(항목 하나 동안) */
  private readonly edgeRefine = new Map<number, number>();
  /** 70차: 띠 맞춤 나눔으로 모서리 곡선에 더 넣는 매개변수(모서리 → 곡선 t들 — 항목 하나 동안, bandSplits) */
  private readonly edgeBreaks = new Map<number, number[]>();

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
      this.edgeBreaks.clear();
    }
  }

  /**
   * 한 번 삼각화. 굽은 면(작은 반지름 원환 필렛 등)의 안쪽 점이 성긴 경계 현보다 경계에 가까우면 삼각형이 접혀(3D 법선이 곡면과
   * 반대) 겹치고 단일면 그리기에서 구멍처럼 보인다 — 접힌 면이 있으면 그 면의 모서리를 더 잘게(현 높이 ¼) 나눠 항목을 다시
   * 삼각화한다(두 번까지, 이웃 면도 같은 다각선을 쓰므로 틈이 생기지 않는다). 접힌 면이 없는 항목은 그대로다
   */
  private meshItemPass(
    itemId: number,
    onFace: (() => void) | undefined,
    pass: number,
    /** 앞 번의 면 결과와 다시 할 면, 접힌 삼각형 수, 앞 번에 엇갈림 때문에 더 잘게 나눈 모서리 → 그 전 나눗수 */
    prev?: {
      outs: FaceOut[];
      dirty: Set<number>;
      folded: number;
      crossTried?: Map<number, number>;
      chords?: boolean;
      /** 70차: 띠 맞춤 나눔 — 몇 번째 번인지 */
      band?: number;
      /** 띠 맞춤 나눔을 시작한 번의 결과(접힌 삼각형이 줄지 않으면 여기로 되돌린다) */
      bandStart?: { outs: FaceOut[]; folded: number; folds: number };
      /** 띠 맞춤 나눔 중 잘못 메워진 적이 있는 평면 면(면 번호) */
      bandFaces?: Set<number>;
      /** 띠 맞춤 나눔을 그만둠(되돌린 뒤) */
      bandDone?: boolean;
    },
  ): ItemMesh | null {
    const e = this.f.get(itemId);
    if (!e) return null;
    if (TESS_TYPES.has(e.type)) return this.meshTessellated(itemId);
    const missBefore = pass <= MAX_REFINE_PASS && !prev?.chords ? new Map(this.unsupported) : null;
    const faces: FaceRef[] = [];
    let closed = false;
    const inherited = new Map<number, Rgba>(); // 면 → 껍질·입체에서 물려받은 색
    const addShell = (sid: number, reversed: boolean, parentColor: Rgba | undefined, depth = 0) => {
      const s = this.f.get(sid);
      if (!s) return;
      if (s.type === 'ORIENTED_CLOSED_SHELL' || s.type === 'ORIENTED_OPEN_SHELL') {
        // 방향 껍질 안의 방향 껍질은 몇 겹까지만(깨진 파일의 자기 참조가 끝없는 재귀가 되지 않게)
        if (depth < ORIENTED_HOPS) addShell(refId(s.args[2]), reversed !== !bool(s.args[3], true), this.colorOf(sid) ?? parentColor, depth + 1);
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
    /** 면 표에 식이 없는 곡면(측정 refineFace용 — ItemMesh.faceSurfaces) */
    let surfs: (Surface | null)[] | null = null;
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
    /** 나눈 고리가 엇갈린 평면 면과 그 곡선 모서리 */
    const crossing: number[] = [];
    const crossEdges = new Map<number, number>();
    /** 잘게 나눠 본 번에 다시 삼각화한 면 가운데 아직 엇갈린 면(되돌림) */
    const stillCrossing: number[] = [];
    /** 잘못 메워진 평면 면의 엇갈린 현 짝(70차 — bandSplits) */
    const crossed: CrossChord[] = [];
    const bandFaces = new Set<number>(prev?.bandFaces);
    this.crossCheckAll = !!prev?.crossTried;
    this.faceChords = !!prev?.chords;
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
      let cross: Map<number, number> | null;
      let crossChords: CrossChord[] | null;
      if (cached) {
        for (const x of cached.pos) b.positions.push(x);
        for (const x of cached.nrm) b.normals.push(x);
        for (const i of cached.idx) b.indices.push(v0 + i);
        this.replayEdgeUse(fr.id, edgeUse, seams);
        r = cached.r;
        reversed = cached.reversed;
        cross = cached.cross;
        crossChords = cached.crossChords;
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
        this.faceCross = null;
        this.faceCrossChords = null;
        this.faceCrossed = false;
        const pj: { job: FaceFluxJob | null } | null = pjobs ? { job: null } : null;
        r = this.meshFace(fr, b, edgeUse, seams, table ? info : null, pj);
        if (pjobs && pj) pjobs[fi] = pj.job;
        reversed = this.faceReversed;
        cross = this.faceCross;
        crossChords = this.faceCrossChords;
        if (this.faceCrossed) stillCrossing.push(fi);
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
      if (table && !r && PARAM_KIND_INDEX.has(kinds[fi]!)) {
        const s = this.faceSurface(stepIds[fi]!);
        if (s) (surfs ??= new Array<Surface | null>(nf).fill(null))[fi] = s;
      }
      if (r) fail(r);
      else if (reversed) suspect.push(fi);
      if (cross) {
        crossing.push(fi);
        for (const [eid, k] of cross) crossEdges.set(eid, Math.max(k, crossEdges.get(eid) ?? 0));
      }
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
          cross,
          crossChords,
        });
      }
      if (crossChords) {
        crossed.push(...crossChords);
        bandFaces.add(fi);
      }
    }
    const nTri = b.indices.length / 3;
    faceTri[nf] = nTri;
    if (table) triStart[nf] = nTri;
    // 접힌 삼각형이 있는 면: 그 면의 모서리를 더 잘게 나눠 다시(MAX_REFINE_PASS번까지)
    if (missBefore && nTri > 0) {
      // 평면은 안쪽 점이 없어 경계를 나눠도 달라지지 않는다. 앞 번보다 접힌 면이 줄지 않으면(경계 탓이 아닌 접힘) 더 하지 않는다
      const folded: number[] = [];
      /** 69차: 넓이 문턱 없이 접힌 삼각형이 있는 곡면 면(경계 현 풀기는 문턱 아래 아주 얇은 삼각형도 — 경계를 더 나눌지는 위 문턱으로) */
      const anyFold: number[] = [];
      let foldTris = 0;
      /** 문턱 없이 접힌 곡면 삼각형 수(띠 맞춤 나눔이 줄였는지 볼 때) */
      let foldAll = 0;
      for (let fi = 0; fi < nf; fi++) {
        const planar = this.isPlanarFace(faces[fi]!.id);
        const n = planar ? 0 : countFolds(b, faceTri[fi]!, faceTri[fi + 1]!, diag);
        if (n) folded.push(fi);
        const m = planar ? 0 : countFolds(b, faceTri[fi]!, faceTri[fi + 1]!, 0);
        if (m) anyFold.push(fi);
        foldTris += n;
        foldAll += m;
      }
      const changed = new Set<number>();
      if (folded.length && pass < MAX_REFINE_PASS && (!prev || foldTris < prev.folded))
        for (const fi of folded)
          for (const eid of this.faceEdgeIds(faces[fi]!.id)) {
            const k = this.edgeRefine.get(eid) ?? 1;
            if (k < 16) {
              this.edgeRefine.set(eid, k * 4);
              changed.add(eid);
            }
          }
      // 나눈 경계 고리가 서로 엇갈린 평면 면(곡선의 현이 아주 가까운 다른 고리를 넘어 구멍이 메워지거나 삼각형이 겹친다 — 60차):
      // 첫 번에 엇갈린 곡선 모서리만 틈에 맞춰 잘게 나눠 다시 해 보고(crossingEdges), 그래도 엇갈리는 면의 모서리는 다음 번에 처음 나눔으로
      // 되돌린다(그 면과 이웃 면은 예전 그대로). 잘게 나눈 경계에 이웃 곡면의 삼각형이 더 접히면(접힌 삼각형이 늘면) 모두 되돌린다
      const tried = pass < MAX_REFINE_PASS ? prev?.crossTried : undefined;
      if (tried) {
        const revert = (eid: number) => {
          const k = tried.get(eid);
          if (k === undefined || changed.has(eid)) return;
          if (k === 1) this.edgeRefine.delete(eid);
          else this.edgeRefine.set(eid, k);
          changed.add(eid);
        };
        if (foldTris > prev!.folded) for (const eid of tried.keys()) revert(eid);
        else for (const fi of stillCrossing) for (const eid of this.faceEdgeIds(faces[fi]!.id)) revert(eid);
      }
      let crossTried: Map<number, number> | undefined;
      if (crossing.length && pass === 0)
        for (const [eid, need] of crossEdges) {
          const k = this.edgeRefine.get(eid) ?? 1;
          if (changed.has(eid) || need <= k) continue;
          (crossTried ??= new Map()).set(eid, k);
          this.edgeRefine.set(eid, need);
          changed.add(eid);
        }
      if (changed.size && outs) {
        // 바뀐 모서리를 쓰는 면만 다시(이웃 면도 같은 다각선을 써야 틈이 없다), 나머지는 앞 결과 그대로
        const dirty = new Set<number>();
        for (let fi = 0; fi < nf; fi++) if (this.faceEdgeIds(faces[fi]!.id).some((eid) => changed.has(eid))) dirty.add(fi);
        this.unsupported.clear();
        for (const [k, v] of missBefore) this.unsupported.set(k, v);
        return this.meshItemPass(itemId, undefined, pass + 1, { outs, dirty, folded: foldTris, ...(crossTried ? { crossTried } : {}) });
      }
      // 70차: 띠 폭이 경계 현의 처짐보다 좁은 면 — 세 정점이 모두 경계 점인 접힌 삼각형은 안쪽 점이 없어 경계를 나누는 것 말고는 풀 길이 없다. 평면 면에서 두 곡선이 같은 꼭짓점에서
      // 접하며 벌어지는 끝(초승달)도 현끼리 엇갈려 잘못 메워진다(60차 나눗수는 틈이 0으로 모여 쓸 수 없었다) — 엇갈린 현만 나눈다(bandSplits).
      // 번을 거듭해도 접힌 삼각형·엇갈린 현이 시작보다 줄지 않으면 넣은 점을 모두 되돌린다(시작한 번의 결과 그대로 — 그 뒤 69차 길로)
      const bandScore = foldAll + crossed.length;
      // 엇갈림이 풀린 뒤에도 현 처짐이 띠 폭을 넘는 동안은 같은 번을 잇는다(bandSplits의 띠 폭 기준 — 넓이가 틀리지 않게)
      if ((bandScore || prev?.bandStart) && outs && !prev?.bandDone) {
        const round = prev?.band ?? 0;
        const added = round < MAX_BAND_PASS ? this.bandSplits(faces, anyFold, faceTri, b, crossed, bandFaces) : null;
        if (added?.size) {
          const dirty = new Set<number>();
          for (let fi = 0; fi < nf; fi++) if (this.faceEdgeIds(faces[fi]!.id).some((eid) => added.has(eid))) dirty.add(fi);
          this.unsupported.clear();
          for (const [k, v] of missBefore) this.unsupported.set(k, v);
          const bandStart = prev?.bandStart ?? { outs, folded: foldTris, folds: bandScore };
          return this.meshItemPass(itemId, undefined, MAX_REFINE_PASS, { outs, dirty, folded: foldTris, band: round + 1, bandStart, bandFaces, ...(prev?.crossTried ? { crossTried: prev.crossTried } : {}) });
        }
        const start = prev?.bandStart;
        if (start && bandScore >= start.folds) {
          this.edgeBreaks.clear();
          this.unsupported.clear();
          for (const [k, v] of missBefore) this.unsupported.set(k, v);
          return this.meshItemPass(itemId, undefined, MAX_REFINE_PASS, { outs: start.outs, dirty: new Set(), folded: start.folded, bandDone: true, ...(prev?.crossTried ? { crossTried: prev.crossTried } : {}) });
        }
      }
      // 69차: 경계를 더 나눠도 접힌 삼각형이 남은 면 — 경계 다각선은 그대로 두고 그 면만 경계 현 둘레의 안쪽 점을 빼고 다시 삼각화한다(tessellate.ts unfoldBoundaryChords,
      // 경계를 더 나누는 것이 먼저 — 그것으로 풀리는 면은 예전과 같다)
      if (anyFold.length && outs) {
        this.unsupported.clear();
        for (const [k, v] of missBefore) this.unsupported.set(k, v);
        return this.meshItemPass(itemId, undefined, MAX_REFINE_PASS, { outs, dirty: new Set(anyFold), folded: foldTris, chords: true, ...(prev?.crossTried ? { crossTried: prev.crossTried } : {}) });
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
    if (surfs) out.faceSurfaces = surfs;
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
          const { eid } = unwrapEdge(this.f, refId(this.f.get(oid)?.args[3]), true);
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
    // 격자 해시: 칸 번호 x → y → z 겹 Map(49차 — 토막마다 훑는 칸의 글 열쇠를 만들지 않고, 점이 없는 줄은 건너뛴다.
    // 훑는 칸·칸 안 점의 차례와 계산은 예전 글 열쇠 판과 같다 — 큰 조립 해석에서 이 함수가 자기 시간 1위였다)
    const cell = Math.max(this.tol.chord * 20, tol * 100);
    const grid = new Map<number, Map<number, Map<number, V3[]>>>();
    for (const p of verts) {
      const gx = Math.floor(p[0] / cell);
      const gy = Math.floor(p[1] / cell);
      const gz = Math.floor(p[2] / cell);
      let mx = grid.get(gx);
      if (!mx) grid.set(gx, (mx = new Map()));
      let my = mx.get(gy);
      if (!my) mx.set(gy, (my = new Map()));
      let l = my.get(gz);
      if (!l) my.set(gz, (l = []));
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
          const x0 = Math.floor((Math.min(a[0], c[0]) - tol) / cell);
          const y0 = Math.floor((Math.min(a[1], c[1]) - tol) / cell);
          const z0 = Math.floor((Math.min(a[2], c[2]) - tol) / cell);
          const x1 = Math.floor((Math.max(a[0], c[0]) + tol) / cell);
          const y1 = Math.floor((Math.max(a[1], c[1]) + tol) / cell);
          const z1 = Math.floor((Math.max(a[2], c[2]) + tol) / cell);
          // 칸 번호가 2^52를 넘으면(좌표가 칸 크기의 수천조 배 — 깨진 파일의 9e15 등) 1을 더해도 그대로라 칸 고리가 끝나지 않았다(57차 퍼징)
          const huge = Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1), Math.abs(z0), Math.abs(z1)) >= 2 ** 52;
          if (!huge && (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) <= 4096) {
            for (let gx = x0; gx <= x1; gx++) {
              const mx = grid.get(gx);
              if (mx)
                for (let gy = y0; gy <= y1; gy++) {
                  const my = mx.get(gy);
                  if (my)
                    for (let gz = z0; gz <= z1; gz++) {
                      const l = my.get(gz);
                      if (l)
                        for (const p of l) {
                          // dot(sub(p, a), d) / l2와 같은 셈(같은 차례 — 배열만 만들지 않는다)
                          const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2;
                          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
                          const q: V3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
                          if (dist(q, p) <= tol && dist(p, a) > tol && dist(p, c) > tol) ins.push([t, p]);
                        }
                    }
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
  /** 면 개체(ORIENTED_FACE를 벗긴 것 — 면 표 stepIds)의 곡면(없으면 null) */
  private faceSurface(faceId: number): Surface | null {
    const fe = this.f.get(faceId);
    if (!fe || fe.type === 'FACE' || !FACE_TYPES.has(fe.type)) return null;
    return this.g.surface(refId(fe.args[2]));
  }

  private isPlanarFace(faceId: number): boolean {
    let fe = this.f.get(faceId);
    if (fe && fe.type === 'ORIENTED_FACE') fe = this.f.get(refId(fe.args[2]));
    if (!fe || fe.type === 'FACE') return true;
    const surf = this.g.surface(refId(fe.args[2]));
    return !surf || surf.planar;
  }

  /**
   * 70차: 세 정점이 모두 경계 점인 접힌 삼각형의 경계 현을 건너편 정점에 맞춰 나눌 매개변수(모서리 → 더 넣을 t들)를 구해 edgeBreaks에 더한다.
   * 띠 폭이 현의 처짐보다 좁으면 매개변수에서 맞는 삼각형(현의 두 끝 + 건너편 점)이 3D에서 현 너머로 뒤집힌다 — 곡선의 그 자리(건너편 점의 발)에 점 하나를 넣으면
   * 현이 곡선으로 다가가 뒤집힘이 풀린다(이웃 면도 같은 다각선을 쓴다). 곧은 현(처짐이 eps 아래)과 매개변수 표가 없는 모서리는 건너뛴다.
   * 잘못 메워진 평면 면의 엇갈린 현 짝(crossed)은 긴 쪽 현을 반으로 나눈다 — 두 곡선이 접하며 벌어지는 끝은 필요한 현 길이가 꼭짓점에서 멀어질수록 길어져, 엇갈린 현만 거듭 나누면
   * 꼭짓점 쪽으로 촘촘해진다(건너편 끝점에 맞추면 엇갈린 자리가 현의 먼 끝 가까이라 현이 조금씩밖에 줄지 않는다)
   */
  private bandSplits(faces: FaceRef[], fis: number[], faceTri: Uint32Array, b: Builder, crossed: readonly CrossChord[], bandFaces: ReadonlySet<number>): Map<number, number[]> {
    const added = new Map<number, number[]>();
    let room = MAX_BAND_POINTS;
    for (const ts of this.edgeBreaks.values()) room -= ts.length;
    const P = b.positions;
    const I = b.indices;
    const pt = (i: number): V3 => [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!];
    const near = this.eps * 1e-3;
    /** 매개변수 표와 다각선 점 수가 맞는 곡선 모서리(T자 점이 든 다각선은 표와 어긋나 건너뛴다) */
    const curveEdge = (eid: number): { eid: number; pl: V3[]; c: Curve; t: number[] } | null => {
      const pl = this.edgeCache.get(eid);
      const ep = this.edgeParams.get(eid);
      return pl && ep && !(ep.c instanceof LineCurve) && ep.t.length === pl.length ? { eid, pl, c: ep.c, t: ep.t } : null;
    };
    /** 모서리 e의 토막 lo를 foot의 발(foot이 없거나 발이 현 안쪽 10~90%가 아니면 가운데)에서 나눈다. 곧은 현은 넘긴다(나눴거나 이미 나눌 자리가 있으면 참) */
    const split = (e: { eid: number; pl: V3[]; c: Curve; t: number[] }, lo: number, foot: V3 | null): boolean => {
      const ta = e.t[lo]!;
      const tb = e.t[lo + 1]!;
      const A = e.pl[lo]!;
      const B = e.pl[lo + 1]!;
      const mid = (ta + tb) / 2;
      const chordLen = dist(A, B);
      if (!(chordLen > 0) || !(len(cross(sub(e.c.point(mid), A), sub(B, A))) / chordLen > this.eps)) return false;
      let at = mid;
      if (foot) {
        at = e.c.project(foot, mid);
        if (e.c.period > 0) at -= Math.round((at - mid) / e.c.period) * e.c.period;
        const s = (at - ta) / (tb - ta);
        if (!(s > 0.1 && s < 0.9)) at = mid;
      }
      const l = added.get(e.eid);
      // 한 번에 현 하나에 점 하나(접힌 삼각형·엇갈린 짝 둘이 같은 현을 쓰면 겹침)
      if (l?.some((x) => Math.abs(x - at) <= Math.abs(tb - ta) * 0.1)) return true;
      if (l) l.push(at);
      else added.set(e.eid, [at]);
      room--;
      return true;
    };
    for (const fi of fis) {
      const edges: { eid: number; pl: V3[]; c: Curve; t: number[] }[] = [];
      for (const eid of new Set(this.faceEdgeIds(faces[fi]!.id))) {
        const e = curveEdge(eid);
        if (e) edges.push(e);
      }
      for (let t = faceTri[fi]!; t < faceTri[fi + 1]!; t++) {
        if (!triFolded(b, t, 0) || room <= 0) continue;
        const V = [pt(I[t * 3]!), pt(I[t * 3 + 1]!), pt(I[t * 3 + 2]!)] as const;
        const on = V.map((p) => {
          const hits: [number, number][] = [];
          edges.forEach((e, k) => {
            e.pl.forEach((q, i) => {
              if (dist(p, q) <= near) hits.push([k, i]);
            });
          });
          return hits;
        });
        if (on.some((h) => !h.length)) continue; // 안쪽 점이 낀 접힌 삼각형은 69차 길로
        for (const [p, q, r] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]] as const) {
          for (const [k, i] of on[p]!) {
            const j = on[q]!.find(([k2, i2]) => k2 === k && Math.abs(i2 - i) === 1);
            if (!j) continue;
            split(edges[k]!, Math.min(i, j[1]), V[r]!);
          }
        }
      }
    }
    /** 참 곡선이 닿아 나눠도 풀리지 않는 엇갈림에 든 모서리 */
    const stuck = new Set<number>();
    for (const [es, is, et, it] of crossed) {
      if (room <= 0) break;
      const plS = this.edgeCache.get(es);
      const plT = this.edgeCache.get(et);
      if (!plS || !plT) continue;
      const S = curveEdge(es);
      const T = curveEdge(et);
      const lenS = dist(plS[is]!, plS[is + 1]!);
      const lenT = dist(plT[it]!, plT[it + 1]!);
      // 건너편 현의 끝점이 곡선 위에 닿아 있으면(모서리 끝 꼭짓점 말고 — 구멍 꼭짓점이 원 위에 놓인 면 등) 나눠도 풀리지 않는다
      const touches = (e: { pl: V3[]; c: Curve }, o: V3[], oi: number): boolean =>
        [o[oi]!, o[oi + 1]!].some((p) => dist(p, e.pl[0]!) > this.eps && dist(p, e.pl[e.pl.length - 1]!) > this.eps && dist(e.c.point(e.c.project(p)), p) <= this.eps * 1e-3);
      if ((S && touches(S, plT, it)) || (T && touches(T, plS, is))) {
        stuck.add(es);
        stuck.add(et);
        continue;
      }
      const trySplit = (first: boolean): boolean => (first ? !!S && split(S, is, null) : !!T && split(T, it, null));
      if (!trySplit(lenS >= lenT)) trySplit(lenS < lenT);
    }
    // 잘못 메워졌던 평면 면: 곡선 현의 처짐이 건너편 경계까지 거리(띠 폭)를 넘지 않을 때까지 나눈다(엇갈림만 풀면 현이 띠를 깎아 넓이가 틀린다).
    // 풀리지 않는 엇갈림(참 곡선이 닿음)이 남은 면은 폭이 0이라 끝없이 나누게 되므로 뺀다
    for (const fi of bandFaces) {
      if (room <= 0) break;
      const ids = new Set(this.faceEdgeIds(faces[fi]!.id));
      if ([...ids].some((eid) => stuck.has(eid))) continue;
      const segs: [number, V3, V3][] = [];
      for (const eid of ids) {
        const pl = this.edgeCache.get(eid);
        if (pl) for (let i = 0; i + 1 < pl.length; i++) segs.push([eid, pl[i]!, pl[i + 1]!]);
      }
      if (segs.length > BAND_WIDTH_SEGS) continue;
      for (const eid of ids) {
        const e = curveEdge(eid);
        if (!e) continue;
        for (let lo = 0; lo + 1 < e.pl.length && room > 0; lo++) {
          const M = e.c.point((e.t[lo]! + e.t[lo + 1]!) / 2);
          const sag = distToSegment(M, e.pl[lo]!, e.pl[lo + 1]!);
          if (!(sag > this.eps)) continue;
          let width = Infinity;
          for (const [other, a, c] of segs) if (other !== eid) width = Math.min(width, distToSegment(M, a, c));
          if (sag > BAND_SAG_RATIO * width) split(e, lo, null);
        }
      }
    }
    for (const [eid, ts] of added) this.edgeBreaks.set(eid, [...(this.edgeBreaks.get(eid) ?? []), ...ts]);
    return added;
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
        const { eid } = unwrapEdge(this.f, refId(this.f.get(oid)?.args[3]), true);
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
  edgePolyline(edgeId: number, depth = 0): V3[] | null {
    const hit = this.edgeCache.get(edgeId);
    if (hit) return hit;
    const e = this.f.get(edgeId);
    if (!e) return null;
    if (e.type === 'ORIENTED_EDGE') {
      if (depth >= ORIENTED_HOPS) return null;
      const inner = this.edgePolyline(refId(e.args[3]), depth + 1);
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
      // 닫힌 곡선(한 바퀴)은 시작·끝 꼭짓점이 같은 개체이거나(edge_start = edge_end), 다른 개체라도 사실상 같은 점(eps의 1/1000 안 —
      // 고리 점 합치기와 같은 거리)일 때만이다. 꼭짓점 개체가 다르면 그 사이 곡선 토막이다 — 두 꼭짓점이 eps 안인 아주 짧은 원호
      // (표본: 7.4e-5 mm, 보통 품질 eps 7.9e-5)를 한 바퀴 원으로 읽어 면 고리가 원기둥을 한 바퀴 돌아 그리지 못하거나(67차 표본 1면)
      // 이웃 면과 틈이 났다(표본 2파일). 아주 세밀 품질은 eps가 작아 짧은 호로 읽었다
      const closed = refId(e.args[1]) === refId(e.args[2]) || dist(P1, P2) <= this.eps * 1e-3;
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
        const extra = this.edgeBreaks.get(edgeId);
        if (extra) {
          ts.push(...extra);
          ts.sort((p, q) => (t2 > t1 ? p - q : q - p));
        }
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
    /** 읽지 못한 경계 모서리(개체가 없거나 꼭짓점이 없음 — 끊긴 파일 등) 수 */
    let gaps = 0;
    /** 같은 모서리를 두 번 넘게 쓴 고리가 있다 */
    let overused = false;
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
          if (!oe) {
            gaps++;
            continue;
          }
          // 중첩된 ORIENTED_EDGE
          const { eid, fwd } = unwrapEdge(this.f, refId(oe.args[3]), bool(oe.args[4], true));
          const pl = this.edgePolyline(eid);
          if (!pl) {
            gaps++;
            continue;
          }
          const uses = (inFace.get(eid) ?? 0) + 1;
          inFace.set(eid, uses);
          if (uses > 2) {
            // 모서리는 한 면에서 많아야 두 번(이음선) 쓰인다. 더 쓴 고리는 깨진 것이다 — 같은 모서리 수천 번을 다각형 하나로
            // 삼각화하느라 수십 초 멈췄다(57차 퍼징)
            overused = true;
            break;
          }
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
    // 경계 고리에서 읽지 못한 모서리가 있으면 고리가 끊겨 면 모양을 알 수 없다 — 남은 모서리를 곧게 이어 그리면 틀린 모양이 된다
    // (57차 퍼징 — 중간에 끊긴 파일). 실제 파일의 모서리는 늘 읽힌다(지원하지 않는 곡선도 두 꼭짓점을 잇는 선분으로 읽는다)
    if (gaps) return '경계 모서리를 읽지 못함(가리키는 개체가 없거나 값이 잘못됨)';
    if (overused) return '경계 고리가 같은 모서리를 두 번 넘게 지남';
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
    const r = tessellateFace(surf, loops, sameSense, this.tol, this.eps, b, undefined, info || pj ? acc : undefined, this.faceChords);
    if (r.error) return r.error;
    if (r.reversed) this.faceReversed = true;
    if (!r.triangles) return '삼각형 없음';
    if (surf instanceof PlaneSurface) this.faceCross = this.crossingEdges(surf, loopEdges, loops, facetArea(b, triStart));
    if (info) this.faceMetrics(surf, loopEdges, loopOuter, inFace, acc.area, facetArea(b, triStart), info);
    // 질량 속성: 해석적 곡면은 매개변수 공간 다각형의 경계 적분, 그 밖은 삼각형 — 적분 거리만 남긴다(propsjob.ts)
    if (pj) pj.job = { surf, polys: acc.polys, uv: acc.uv, loopEdges, loopOrient, inFace, reversed, sameSense, edgeParams: this.edgeParams };
    return null;
  }

  /**
   * 평면 면의 나눈 경계 고리가 서로(또는 스스로) 엇갈리는지. 삼각형 넓이가 나눈 고리의 넓이(평면 좌표 신발끈 합 — 바깥 − 구멍)와 맞으면 보지 않는다.
   * 엇갈린 선분 짝마다 곡선 모서리 쪽 현이 걸친 참 곡선 토막과 상대 선분 사이 거리(틈)를 재, 현 높이를 그 틈의 0.8배 아래로 줄이는 나눗수를
   * 곡선 모서리마다 돌려준다(2의 거듭제곱, CROSS_REFINE_MAX까지) — 곡선의 현이 아주 가까운 다른 고리를 넘은 것이라 그만큼 잘게 나누면 풀린다
   * (B-rep 고리는 서로 엇갈리지 않는다 — ISO 10303-42 face_bound). 참 곡선이 상대 선분에 닿거나 넘으면(두 곡선이 접하는 자리 등) 나눠도
   * 풀리지 않아 넣지 않는다. 구멍 고리가 바깥 고리를 넘으면 삼각화가 구멍을 빼지 못해 메우고, 이웃 면과 경계 점이 어긋나 틈이 생겼다
   * (60차 표본 평면 면 21개)
   */
  private crossingEdges(surf: PlaneSurface, loopEdges: LoopEdge[][], loops: V3[][], facet: number): Map<number, number> | null {
    const fr = surf.f;
    const to2 = (p: V3): [number, number] => {
      const d = sub(p, fr.o);
      return [dot(d, fr.x), dot(d, fr.y)];
    };
    let sum = 0;
    for (const l of loops) {
      if (l.length < 3) continue;
      let a = 0;
      for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
        const p = to2(l[j]!);
        const q = to2(l[i]!);
        a += p[0] * q[1] - q[0] * p[1];
      }
      sum += a / 2;
    }
    const area = Math.abs(sum);
    /** 삼각형 넓이가 나눈 고리 넓이와 다르다(잘못 메워졌다 — 엇갈린 현 짝은 이때만 적는다) */
    const wrong = Math.abs(facet - area) > 1e-6 * Math.max(area, facet);
    if (!this.crossCheckAll && !wrong) return null;
    interface Seg {
      a: [number, number];
      b: [number, number];
      a3: V3;
      b3: V3;
      eid: number;
      /** 직선이 아닌 곡선 모서리의 곡선(매개변수를 아는 것만) */
      c: Curve | null;
      x0: number;
      x1: number;
      /** 모서리 다각선의 토막 번호 */
      i: number;
    }
    const chords: CrossChord[] = [];
    const segs: Seg[] = [];
    for (const l of loopEdges)
      for (const e of l) {
        const ep = this.edgeParams.get(e.eid);
        const c = ep && !(ep.c instanceof LineCurve) ? ep.c : null;
        for (let i = 0; i + 1 < e.poly.length; i++) {
          const a = to2(e.poly[i]!);
          const b = to2(e.poly[i + 1]!);
          segs.push({ a, b, a3: e.poly[i]!, b3: e.poly[i + 1]!, eid: e.eid, c, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), i });
        }
      }
    if (segs.length > 20_000) return null;
    segs.sort((s, t) => s.x0 - t.x0);
    /** 현 s가 걸친 참 곡선 토막과 선분 t 사이 가장 짧은 거리(곡선이 t를 넘으면 0) */
    const gap = (s: Seg, t: Seg): number => {
      const c = s.c!;
      const ta = c.project(s.a3);
      let d = c.project(s.b3, ta) - ta;
      if (c.period > 0) d -= Math.round(d / c.period) * c.period;
      const ux = t.b[0] - t.a[0];
      const uy = t.b[1] - t.a[1];
      const l2 = ux * ux + uy * uy;
      let g = Infinity;
      let side = 0;
      for (let k = 0; k <= 8; k++) {
        const q = to2(c.point(ta + (d * k) / 8));
        const wx = q[0] - t.a[0];
        const wy = q[1] - t.a[1];
        const h = l2 > 0 ? Math.min(1, Math.max(0, (wx * ux + wy * uy) / l2)) : 0;
        g = Math.min(g, Math.hypot(wx - h * ux, wy - h * uy));
        if (h > 0 && h < 1) {
          const sd = Math.sign(ux * wy - uy * wx);
          if (sd && side && sd !== side) return 0;
          if (sd) side = sd;
        }
      }
      return g;
    };
    const out = new Map<number, number>();
    const need = (s: Seg, t: Seg) => {
      if (!s.c) return;
      const g = gap(s, t);
      if (!(g > this.eps * 10) || !(this.tol.chord > 0.8 * g)) return;
      const k = 2 ** Math.max(1, Math.ceil(Math.log2(this.tol.chord / (0.8 * g))));
      if (k <= CROSS_REFINE_MAX && k > (out.get(s.eid) ?? 0)) out.set(s.eid, k);
    };
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      for (let j = i + 1; j < segs.length && segs[j]!.x0 <= s.x1; j++) {
        const t = segs[j]!;
        if (!(s.c || t.c) || !properCross(s.a, s.b, t.a, t.b)) continue;
        this.faceCrossed = true;
        if (wrong && chords.length < MAX_CROSS_CHORDS) chords.push([s.eid, s.i, t.eid, t.i]);
        need(s, t);
        need(t, s);
      }
    }
    if (chords.length) this.faceCrossChords = chords;
    return out.size ? out : null;
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
        if (outer < 0 || loopOuter.indexOf(true, outer + 1) >= 0) outer = sums.indexOf(sums.reduce((m, s) => Math.max(m, s), -Infinity));
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
      } else for (const t of list(e.args[k + 1])) for (const v of numList(t)) tris.push(v);
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

/** 두 평면 선분이 끝점이 아닌 곳에서 엇갈리는지(끝점이 다른 선분 위에 닿기만 한 것은 아님 — 길이에 맞춘 여유) */
function properCross(p: readonly number[], q: readonly number[], a: readonly number[], b: readonly number[]): boolean {
  const o = (x: readonly number[], y: readonly number[], z: readonly number[]) => (y[0]! - x[0]!) * (z[1]! - x[1]!) - (y[1]! - x[1]!) * (z[0]! - x[0]!);
  const d1 = o(p, q, a);
  const d2 = o(p, q, b);
  const d3 = o(a, b, p);
  const d4 = o(a, b, q);
  const scale = Math.max(Math.abs(q[0]! - p[0]!) + Math.abs(q[1]! - p[1]!), Math.abs(b[0]! - a[0]!) + Math.abs(b[1]! - a[1]!)) ** 2 * 1e-12;
  return ((d1 > scale && d2 < -scale) || (d1 < -scale && d2 > scale)) && ((d3 > scale && d4 < -scale) || (d3 < -scale && d4 > scale));
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
