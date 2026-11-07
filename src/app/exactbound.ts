/**
 * 개체 측정 "부품 사이 최소 거리"의 오목한 자리 받기(45차 — 순수, DOM 없음, 접선 조각 안).
 *
 * 구멍 안에 든 축처럼 오목한 면이 낀 자리는 면을 나눈 현이 곡면 안쪽으로 들어가 삼각형 값이 정확한 값보다 작다. 그래서 exactdist.ts의 다듬기가
 * 삼각형 값보다 먼 정류점에 가면 버렸다(더 가까운 다른 자리가 있을 수 있어서). 여기서는 그 먼 정류점이 두 부품 사이의 전역 최소라는 것을 보인다.
 *
 * 축 H(구멍 쪽 면의 축)에서 잰 거리 ρ(x)를 쓴다. ρ는 1-립시츠라 ρ(y) − ρ(x) ≤ |x − y|이므로,
 * 안쪽 부품의 면이 모두 K_in = {ρ ≤ ρin} 안이고 바깥쪽 부품의 면이 모두 K_out = {ρ ≥ ρout} 안이면 두 부품 사이는 ρout − ρin 이상이다.
 * - 후보: 다듬은 두 면이 H에 나란한 원기둥·원뿔·원환(구멍 쪽 면은 H를 감싼다 — 오목)이고, 면 표의 식으로 닫힌 꼴의 ρ 범위가
 *   안쪽 면 최댓값 ρin < 바깥쪽 면 최솟값 ρout, 다듬은 거리가 ρout − ρin과 같을 때(그 두 면의 전역 최소이고 두 점이 잘린 면 안 — exactdist가 본다)
 * - 면마다 ρ 범위(받는 쪽에 넉넉하게):
 *   · 원기둥·원뿔·원환(H에 나란함)·구: 면 표의 식(닫힌 꼴). 원뿔은 꼭짓점 높이 범위를 처짐만큼 넓힌다
 *   · 평면: 안쪽은 경계 현마다 참 모서리가 K_in 안이면(이웃 면이 K_in 안, 아니면 두 끝과 모서리 처짐) 면도 안(평면 영역은 경계의 볼록 껍질 안 — K_in은 볼록).
 *     바깥쪽은 평면이 H와 만나는 점 p가 면 밖이고(삼각형 밖이며 경계 현마다 처짐보다 멀다) 경계가 모두 K_out 안이면 면도 밖(ρ는 그 평면에서 p만 극소인 볼록 함수)
 *   · 그 밖: 꼭짓점·삼각형의 ρ 범위를 면 처짐만큼 넓힌 것
 * - 나머지 면 짝(K_in·K_out로 갈리지 않는 것)은 차례로 하나라도 서면 된다(모두 하한 ≥ ρout − ρin):
 *   ① 참 면을 품는 두 상자 사이 ② H 둘레 원통 좌표로 두 면의 ρ 범위 틈과 축 방향 범위 틈(√(Δρ² + Δh²))
 *   ③ 평면 법선으로 비춘 두 볼록 집합의 틈(원기둥·원뿔은 두 끝 원, 구·원환은 닫힌 꼴, 평면은 꼭짓점과 경계 현의 그 방향 처짐)
 *   ④ 두 면 삼각형 사이 최소 거리(삼각형 상자로 거른 뒤 삼각형끼리 — 코어 조각과 나눠 받지 않게 여기서 잰다) − 두 면 처짐
 * - 면 처짐(참 면이 그 면 삼각형에서 떨어질 수 있는 한도): 곡면 처짐(원기둥·원뿔·원환은 삼각형이 축 둘레로 덮는 각, 구는 삼각형 평면과 중심 사이 —
 *   닫힌 꼴)의 두 배 + 경계 현의 모서리 처짐 + float32 반올림. 평면은 경계 현의 모서리 처짐뿐이다.
 *   모서리 처짐(모서리 표 곡선 정의): 직선 0, 원은 화살 높이, 타원은 가장 작은 곡률 반지름의 화살 높이(호는 곡선 평면 안 — 그 법선 쪽으로는 0),
 *   B-스플라인은 그 토막 매개변수 구간에 닿는 조절점까지 현 거리의 최댓값(볼록 껍질 — 유리면 가중치가 양수일 때).
 *   B-스플라인·회전·밀기 곡면은 곡면 처짐 상한을 세우지 못해 무한대 — 그런 면은 ①~③으로 갈리지 않으면 받지 않는다(삼각형 값 "≈" 그대로)
 * 이웃 면은 경계 현(그 면 삼각형에서 한 번만 쓰인 변)의 두 끝 좌표(float32 그대로)가 같은 다른 면, 현의 모서리는 그물 윤곽선 토막(같은 좌표)으로 찾는다.
 * 시간 한도를 넘으면 받지 않는다.
 *
 * 46차 — 시간 조각: 받기는 측정할 때 한 번 150 ms까지 돌아 화면(주 스레드)을 그만큼 멈췄다. 그물·면 표·모서리 표는 화면 쪽에만 있다(해석 워커는 결과를
 * 옮겨 보내 그물을 들고 있지 않다 — 워커로 옮기면 두 부품 그물·면 표·모서리 곡선을 잴 때마다 다시 보내거나 워커가 사본을 들어야 한다). 그래서 같은 계산을
 * 생성기(certifySteps — 일 사이사이 yield)로 두고, 앱은 sliced로 8 ms 남짓씩 돌리며 그 사이 화면을 그린다(먼저 "≈" 값을 보이고 받으면 바꾼다).
 * 한도는 쉰 틈을 뺀 시계로 보므로 한 번에 돌린 것(certifyConcave)과 같은 일·같은 답이다.
 */
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { BsplineDef } from '../edgecurve';
import type { StepFaceTable } from '../scene';
import { edgeArc, toWorld } from './curvesnap';
import type { SnapFaceIndex } from './facesnap';
import type { SnapEdgeIndex } from './snap';

type V3 = [number, number, number];

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): V3 | null => {
  const l = norm(a);
  return l > 0 && Number.isFinite(l) ? [a[0]! / l, a[1]! / l, a[2]! / l] : null;
};

/** 축 직선(세계 — 점 o, 단위 방향 a) */
export interface Axis {
  o: V3;
  a: V3;
}

/** 점 x와 축 사이 거리 ρ */
export const rho = (H: Axis, x: readonly number[]): number => {
  const d = sub(x, H.o);
  return norm(sub(d, [H.a[0] * dot(d, H.a), H.a[1] * dot(d, H.a), H.a[2] * dot(d, H.a)]));
};

/** 선분 pq와 축 사이 최소 거리(ρ는 볼록 — 선분 위 이차식의 최소) */
export function segRho(H: Axis, p: readonly number[], q: readonly number[]): number {
  const proj = (v: V3): V3 => sub(v, [H.a[0] * dot(v, H.a), H.a[1] * dot(v, H.a), H.a[2] * dot(v, H.a)]);
  const u = proj(sub(p, H.o));
  const w = proj(sub(q, p));
  const ww = dot(w, w);
  const t = ww > 0 ? Math.min(1, Math.max(0, -dot(u, w) / ww)) : 0;
  return norm([u[0] + w[0] * t, u[1] + w[1] * t, u[2] + w[2] * t]);
}

/** 삼각형 abc와 축 사이 최소 거리(축이 삼각형을 지나면 0, 아니면 세 변의 최소) */
function triRho(H: Axis, a: V3, b: V3, c: V3): number {
  // 축 방향으로 비춘 평면에서 원점(축)이 삼각형 안인지
  const e1 = Math.abs(H.a[0]) < 0.9 ? cross(H.a, [1, 0, 0]) : cross(H.a, [0, 1, 0]);
  const f1 = unit(e1)!;
  const f2 = cross(H.a, f1);
  const q = (v: V3): [number, number] => [dot(sub(v, H.o), f1), dot(sub(v, H.o), f2)];
  const [A, B, C] = [q(a), q(b), q(c)];
  const s = (p: [number, number], r: [number, number]) => p[0] * r[1] - p[1] * r[0];
  const w1 = s([B[0] - A[0], B[1] - A[1]], [-A[0], -A[1]]);
  const w2 = s([C[0] - B[0], C[1] - B[1]], [-B[0], -B[1]]);
  const w3 = s([A[0] - C[0], A[1] - C[1]], [-C[0], -C[1]]);
  if ((w1 >= 0 && w2 >= 0 && w3 >= 0) || (w1 <= 0 && w2 <= 0 && w3 <= 0)) return 0;
  return Math.min(segRho(H, a, b), segRho(H, b, c), segRho(H, c, a));
}

/** 반지름 r 원호의 현 길이 L에 대한 화살 높이(작은 호 — L > 2r이면 무한대) */
const sagitta = (r: number, L: number): number => (L <= 2 * r ? r - Math.sqrt(Math.max(0, r * r - (L * L) / 4)) : Infinity);

/**
 * 경계 현: 꼭짓점 번호 두 개, 이웃 면(-1 = 없음), 모서리 처짐(참 모서리가 현에서 떨어질 수 있는 한도 — 세계), 곡선 자리(원·타원은 곡선 평면 법선,
 * B-스플라인은 그 토막을 품는 조절점 — 어느 방향으로 비춘 처짐을 줄인다)
 */
interface Chord {
  a: number;
  b: number;
  nb: number;
  sag: number;
  dev?: { n?: V3; cp?: V3[] };
}

/** 현 c의 참 모서리가 단위 방향 u로 비춘 현 범위([u·A, u·B])에서 벗어날 수 있는 한도(직선 0, 원·타원은 평면 안 처짐의 u 성분, B-스플라인은 조절점) */
function chordSlack(c: Chord, u: V3, A: V3, B: V3): number {
  if (c.sag === 0) return 0;
  const n = c.dev?.n;
  if (n) return c.sag * Math.sqrt(Math.max(0, 1 - dot(n, u) ** 2));
  const cp = c.dev?.cp;
  if (cp) {
    const lo = Math.min(dot(u, A), dot(u, B));
    const hi = Math.max(dot(u, A), dot(u, B));
    return cp.reduce((m, q) => Math.max(m, dot(u, q) - hi, lo - dot(u, q)), 0);
  }
  return c.sag;
}

/** 면 하나(세계): 종류, 삼각형 범위, 경계 현(꼭짓점 번호 두 개, 이웃 면, 모서리 처짐), 처짐, 상자 */
interface FaceData {
  f: number;
  kind: string;
  t0: number;
  t1: number;
  chords: Chord[];
  /** 참 면이 삼각형에서 떨어질 수 있는 한도(세계 — 무한대면 모름) */
  sag: number;
  lo: V3;
  hi: V3;
  /** 면 표 식을 세계로(축·점·반지름 둘 — 배율을 곱한 것) */
  ax?: V3;
  org?: V3;
  r1?: number;
  r2?: number;
  /** 평면 단위 법선(세계) */
  n?: V3;
  /**
   * 참 면을 품는 상자(세계): 처짐을 알면 삼각형 상자 ± 처짐, 모르면 해석 곡면의 닫힌 꼴(원기둥·원뿔은 축 방향 범위 — 꼭짓점 ± 경계 현 처짐 — 의 두 끝 원,
   * 구·원환은 곡면 전체). 못 정하면 null
   */
  cbox?: [V3, V3] | null;
  /** 경계 현 처짐의 최댓값 + 반올림(세계) */
  es?: number;
  /** 원기둥·원뿔: 참 면을 품는 두 끝 원(중심·반지름 — 축은 ax) */
  ends?: [[V3, number], [V3, number]];
  /** 삼각형(처음 쓸 때 만든다 — ④) */
  tris?: Tri[];
}

/** 축 a에 수직인 반지름 r 원(중심 c)을 품는 상자 */
function circleBox(c: V3, a: V3, r: number): [V3, V3] {
  const e = a.map((x) => r * Math.sqrt(Math.max(0, 1 - x * x))) as V3;
  return [
    [c[0] - e[0], c[1] - e[1], c[2] - e[2]],
    [c[0] + e[0], c[1] + e[1], c[2] + e[2]],
  ];
}
const joinBox = (p: [V3, V3], q: [V3, V3]): [V3, V3] => [
  [Math.min(p[0][0], q[0][0]), Math.min(p[0][1], q[0][1]), Math.min(p[0][2], q[0][2])],
  [Math.max(p[1][0], q[1][0]), Math.max(p[1][1], q[1][1]), Math.max(p[1][2], q[1][2])],
];

/** 부품 하나: 그물, 세계 꼭짓점, 면들 */
interface PartData {
  mesh: Mesh3d;
  W: Float64Array;
  faces: FaceData[];
  /** 꼭짓점 float32 반올림이 세계에서 옮길 수 있는 한도 */
  round: number;
  /** 모서리 처짐을 모르는 경계 현의 까닭별 수(진단) */
  misses: Record<string, number>;
}

/** 그물 자리 변환이 균등 배율(회전·거울·이동 포함)이면 그 배율, 아니면 null */
function uniformScale(mesh: Mesh3d): number | null {
  const m = mesh.matrix;
  if (!m) return 1;
  const c = [0, 1, 2].map((j) => [m[j * 4]!, m[j * 4 + 1]!, m[j * 4 + 2]!]);
  const n = c.map(norm);
  const k = n[0]!;
  const tol = 1e-9 * k;
  if (!(k > 0) || Math.abs(n[1]! - k) > tol || Math.abs(n[2]! - k) > tol) return null;
  if (Math.abs(dot(c[0]!, c[1]!)) > tol * k || Math.abs(dot(c[1]!, c[2]!)) > tol * k || Math.abs(dot(c[0]!, c[2]!)) > tol * k) return null;
  return k;
}

const linear = (mesh: Mesh3d, v: readonly number[]): V3 => {
  const m = mesh.matrix;
  return m ? [m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]!, m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]!, m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]!] : [v[0]!, v[1]!, v[2]!];
};

/** 축 둘레 각 차이의 최댓값(삼각형 세 꼭짓점 — π를 넘으면 π) */
function spanAbout(o: V3, a: V3, p: V3[]): number {
  const e = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
  const f1 = unit(e)!;
  const f2 = cross(a, f1);
  const ang = p.map((v) => Math.atan2(dot(sub(v, o), f2), dot(sub(v, o), f1)));
  let m = 0;
  for (let i = 0; i < ang.length; i++)
    for (let j = i + 1; j < ang.length; j++) {
      let d = Math.abs(ang[i]! - ang[j]!);
      if (d > Math.PI) d = 2 * Math.PI - d;
      m = Math.max(m, d);
    }
  return m;
}

/** 시계(ms): 동기로 돌면 performance.now, 시간 조각으로 나눠 돌면 쉰 틈을 뺀 시계(sliced) */
export type Now = () => number;
const clock: Now = () => performance.now();

/** 이만큼 일할 때마다 한 번 쉴 틈을 준다(조각 운전기가 시간을 본다 — 결과에는 상관없다) */
const TICK = 1024;

/**
 * 부품 자료 만들기(면 표·모서리 표가 있는 그물). 면 표가 모든 삼각형을 덮지 않거나 자리 변환이 균등 배율이 아니면 null.
 * 처짐은 머리글 규칙대로(모르면 무한대). 46차: 일 사이사이 쉴 틈(yield)을 주는 생성기 — 한도는 now로 본다
 */
function* partSteps(mesh: Mesh3d, fx: SnapFaceIndex, ex: SnapEdgeIndex | null, deadline: number, now: Now): Generator<void, PartData | null, void> {
  const ti = fx.tableOf.get(mesh.id);
  const table: StepFaceTable | undefined = ti === undefined ? undefined : fx.tables[ti];
  const k = uniformScale(mesh);
  const I = mesh.indices;
  const P = mesh.positions;
  if (!table || !k || !I) return null;
  const nf = table.kinds.length;
  if (table.triStart[nf] !== I.length / 3) return null;
  const nv = P.length / 3;
  const W = new Float64Array(P.length);
  let big = 0;
  for (let i = 0; i < nv; i++) {
    const w = toWorld(mesh, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!);
    W[i * 3] = w[0];
    W[i * 3 + 1] = w[1];
    W[i * 3 + 2] = w[2];
    big = Math.max(big, Math.abs(P[i * 3]!), Math.abs(P[i * 3 + 1]!), Math.abs(P[i * 3 + 2]!));
    if (i % TICK === TICK - 1) yield;
  }
  // float32 꼭짓점은 참 꼭짓점에서 반올림만큼(상대 2⁻²⁴) — 세계로 배율
  const round = 2 * big * 2 ** -24 * k * Math.sqrt(3);
  // 같은 좌표 꼭짓점을 한 번호로
  const canon = new Int32Array(nv);
  const seen = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const key = `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`;
    const c = seen.get(key);
    if (c === undefined) seen.set(key, (canon[i] = i));
    else canon[i] = c;
    if (i % TICK === TICK - 1) yield;
  }
  if (now() > deadline) return null;
  const ekey = (a: number, b: number) => (canon[a]! < canon[b]! ? canon[a]! * nv + canon[b]! : canon[b]! * nv + canon[a]!);
  // 모서리 표: 윤곽선 토막 → (모서리, 꺾은선 안 토막 번호)
  const segEdge = new Map<number, [number, number]>();
  const eti = ex?.tableOf.get(mesh.id);
  const etab = eti === undefined ? undefined : ex!.tables[eti];
  const E = mesh.edges;
  let work = 0;
  if (etab && E) {
    const vid = (o: number): number => seen.get(`${E[o]},${E[o + 1]},${E[o + 2]}`) ?? -1;
    for (let e = 0; e + 1 < etab.segStart.length; e++)
      for (let s = etab.segStart[e]!; s < etab.segStart[e + 1]!; s++) {
        const a = vid(s * 6);
        const b = vid(s * 6 + 3);
        if (a >= 0 && b >= 0 && a !== b) segEdge.set(ekey(a, b), [e, s - etab.segStart[e]!]);
        if (++work % TICK === 0) yield;
      }
  }
  const misses: Record<string, number> = {};
  const miss = (why: string): number => ((misses[why] = (misses[why] ?? 0) + 1), Infinity);
  /** 경계 현(꼭짓점 a–b)의 모서리 처짐(그물 좌표 — 모르면 무한대) */
  const chordSag = (a: number, b: number): number => {
    const L = Math.hypot(P[a * 3]! - P[b * 3]!, P[a * 3 + 1]! - P[b * 3 + 1]!, P[a * 3 + 2]! - P[b * 3 + 2]!);
    const se = segEdge.get(ekey(a, b));
    if (!se || !etab || !E) return miss('nomatch');
    const kind = ex!.kinds[etab.kinds[se[0]]!] ?? '';
    if (kind === 'line') return 0;
    if (kind !== 'circle' && kind !== 'ellipse' && kind !== 'bspline') return miss(kind);
    const arc = edgeArc(E, etab, se[0], ex!.kinds);
    if (arc?.def.kind === 'bspline') {
      // B-스플라인: 그 토막 매개변수 구간에 닿는 조절점들의 볼록 껍질 안(가중치가 모두 양수일 때) — 현까지 거리의 최댓값
      const pa: V3 = [P[a * 3]!, P[a * 3 + 1]!, P[a * 3 + 2]!];
      const pb: V3 = [P[b * 3]!, P[b * 3 + 1]!, P[b * 3 + 2]!];
      const cp = bsplineCtrlFor(arc.def, arc.param(se[1]), arc.param(se[1] + 1));
      if (!cp) return miss('bspline');
      dev = { cp: cp.map((q) => toWorld(mesh, q[0], q[1], q[2])) };
      return cp.reduce((m, q) => Math.max(m, segDist(q, pa, pb)), 0);
    }
    if (!arc?.conic) return miss('noarc');
    // 그 토막이 덮는 매개변수 각이 반 바퀴보다 작아야 작은 호
    if (!(Math.abs(arc.param(se[1] + 1) - arc.param(se[1])) < Math.PI)) return miss('bigarc');
    const { a: ra, b: rb, X, Y } = arc.conic;
    const cn = unit(linear(mesh, cross(X, Y)));
    if (cn) dev = { n: cn };
    const rmin = Math.min(ra, rb) ** 2 / Math.max(ra, rb);
    return sagitta(rmin, L);
  };
  /** 마지막 chordSag의 곡선 자리(세계): 원·타원은 곡선 평면 법선(호는 그 평면 안), B-스플라인은 그 토막을 품는 조절점 */
  let dev: { n?: V3; cp?: V3[] } | null = null;
  // 면마다 경계 현(그 면 삼각형에서 한 번 쓰인 변)
  const owner = new Map<number, number[]>();
  const faces: FaceData[] = [];
  for (let f = 0; f < nf; f++) {
    const t0 = table.triStart[f]!;
    const t1 = table.triStart[f + 1]!;
    // 삼각형이 없는 면(삼각화에 실패한 면)은 어디 있는지 몰라 받지 않는다
    if (!(t1 > t0)) return null;
    const count = new Map<number, [number, number, number]>();
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (let t = t0; t < t1; t++) {
      for (let c = 0; c < 3; c++) {
        const a = I[t * 3 + c]!;
        const b = I[t * 3 + ((c + 1) % 3)]!;
        const kk = ekey(a, b);
        const was = count.get(kk);
        count.set(kk, was ? [was[0], was[1], was[2] + 1] : [a, b, 1]);
        for (let q = 0; q < 3; q++) {
          lo[q] = Math.min(lo[q]!, W[a * 3 + q]!);
          hi[q] = Math.max(hi[q]!, W[a * 3 + q]!);
        }
      }
      if (++work % TICK === 0) yield;
    }
    const chords: FaceData['chords'] = [];
    for (const [kk, [a, b, n]] of count)
      if (n === 1) {
        dev = null;
        const sag = chordSag(a, b) * k;
        const cd = dev as { n?: V3; cp?: V3[] } | null;
        chords.push(cd ? { a, b, nb: -1, sag, dev: cd } : { a, b, nb: -1, sag });
        const o = owner.get(kk);
        if (o) o.push(f);
        else owner.set(kk, [f]);
        if (++work % TICK === 0) yield;
      }
    const kind = fx.kinds[table.kinds[f]!] ?? '';
    const p = table.params.subarray(f * 8, f * 8 + 8);
    const fd: FaceData = { f, kind, t0, t1, chords, sag: Infinity, lo, hi };
    if (kind !== 'plane' && kind !== '') {
      const ax = unit(linear(mesh, [p[2]!, p[3]!, p[4]!]));
      if (ax) {
        fd.ax = ax;
        fd.org = toWorld(mesh, p[5]!, p[6]!, p[7]!);
        fd.r1 = p[0]! * k;
        fd.r2 = kind === 'cone' ? p[1]! : p[1]! * k;
      }
    }
    faces.push(fd);
    if (now() > deadline) return null;
  }
  // 이웃 면
  for (const fd of faces)
    for (const c of fd.chords) {
      const o = owner.get(ekey(c.a, c.b));
      const nb = o?.find((g) => g !== fd.f);
      if (nb !== undefined) c.nb = nb;
      if (++work % TICK === 0) yield;
    }
  // 처짐
  const v = (i: number): V3 => [W[i * 3]!, W[i * 3 + 1]!, W[i * 3 + 2]!];
  for (const fd of faces) {
    const edge = fd.chords.reduce((m, c) => Math.max(m, c.sag), 0);
    let surf = 0;
    if (fd.kind === 'plane') {
      // 평면 법선: 가장 큰 삼각형
      let best = 0;
      for (let t = fd.t0; t < fd.t1; t++) {
        const n = cross(sub(v(I[t * 3 + 1]!), v(I[t * 3]!)), sub(v(I[t * 3 + 2]!), v(I[t * 3]!)));
        const l = norm(n);
        if (l > best) {
          best = l;
          fd.n = unit(n)!;
        }
        if (++work % TICK === 0) yield;
      }
    } else if (fd.ax && fd.org && (fd.kind === 'cylinder' || fd.kind === 'cone' || fd.kind === 'torus' || fd.kind === 'sphere')) {
      for (let t = fd.t0; t < fd.t1 && surf < Infinity; t++) {
        if (++work % TICK === 0) yield;
        const tri = [v(I[t * 3]!), v(I[t * 3 + 1]!), v(I[t * 3 + 2]!)];
        if (fd.kind === 'sphere') {
          const n = unit(cross(sub(tri[1]!, tri[0]!), sub(tri[2]!, tri[0]!)));
          surf = Math.max(surf, n ? fd.r1! - Math.abs(dot(sub(tri[0]!, fd.org), n)) : 0);
          continue;
        }
        const span = spanAbout(fd.org, fd.ax, tri);
        if (!(span < Math.PI * 0.75)) {
          surf = Infinity;
          break;
        }
        const g = 1 - Math.cos(span / 2);
        const rads = tri.map((x) => {
          const d = sub(x, fd.org!);
          return norm(sub(d, [fd.ax![0] * dot(d, fd.ax!), fd.ax![1] * dot(d, fd.ax!), fd.ax![2] * dot(d, fd.ax!)]));
        });
        const rmax = Math.max(...rads);
        if (fd.kind === 'cylinder') surf = Math.max(surf, fd.r1! * g);
        else if (fd.kind === 'cone') surf = Math.max(surf, rmax * g + (rmax - Math.min(...rads)) * g);
        else {
          // 원환: 큰 원 둘레 각과 관 둘레 각(관 중심 원에서 잰 각)
          const R = fd.r1!;
          const phis = tri.map((x, i) => Math.atan2(dot(sub(x, fd.org!), fd.ax!), rads[i]! - R));
          let dphi = 0;
          for (let i = 0; i < 3; i++)
            for (let j = i + 1; j < 3; j++) {
              let d = Math.abs(phis[i]! - phis[j]!);
              if (d > Math.PI) d = 2 * Math.PI - d;
              dphi = Math.max(dphi, d);
            }
          if (!(dphi < Math.PI * 0.75)) {
            surf = Infinity;
            break;
          }
          surf = Math.max(surf, (R + fd.r2!) * g + fd.r2! * (1 - Math.cos(dphi / 2)));
        }
      }
    } else surf = Infinity;
    fd.sag = (fd.kind === 'plane' ? edge : 2 * surf + edge) + round;
    fd.es = edge + round;
    fd.cbox = faceBox(fd);
    if (++work % TICK === 0) yield;
  }
  return { mesh, W, faces, round, misses };

  /** 참 면을 품는 상자(FaceData.cbox). 원기둥·원뿔은 두 끝 원(FaceData.ends)도 남긴다 */
  function faceBox(fd: FaceData): [V3, V3] | null {
    const s = fd.sag;
    let box: [V3, V3] | null = Number.isFinite(s) ? [sub(fd.lo, [s, s, s]), [fd.hi[0] + s, fd.hi[1] + s, fd.hi[2] + s]] : null;
    if (!fd.ax || !fd.org || fd.r1 === undefined) return box;
    const a = fd.ax;
    const o = fd.org;
    if (fd.kind === 'sphere') return box ?? [sub(o, [fd.r1, fd.r1, fd.r1]), [o[0] + fd.r1, o[1] + fd.r1, o[2] + fd.r1]];
    if (fd.kind === 'torus') {
      const e = a.map((x) => (fd.r1! + fd.r2!) * Math.sqrt(Math.max(0, 1 - x * x)) + fd.r2! * Math.abs(x)) as V3;
      return box ?? [sub(o, e), [o[0] + e[0], o[1] + e[1], o[2] + e[2]]];
    }
    if (fd.kind !== 'cylinder' && fd.kind !== 'cone') return box;
    // 원기둥·원뿔 위 축 방향 좌표는 면 안에서 극값이 없어(곡면 위 기울기가 0이 아님) 경계 위 — 꼭짓점 범위와, 경계 현마다 참 모서리가
    // 축 방향으로 벗어날 수 있는 만큼(chordSlack — 축에 수직인 원은 0). 면은 그 두 높이의 끝 원을 잇는 볼록 껍질 안이다
    let h0 = Infinity;
    let h1 = -Infinity;
    for (let t = fd.t0; t < fd.t1; t++)
      for (let c = 0; c < 3; c++) {
        const h = dot(sub(v(I![t * 3 + c]!), o), a);
        h0 = Math.min(h0, h);
        h1 = Math.max(h1, h);
      }
    for (const c of fd.chords) {
      const A = v(c.a);
      const B = v(c.b);
      const s = chordSlack(c, a, A, B);
      if (!Number.isFinite(s)) return box;
      h0 = Math.min(h0, Math.min(dot(sub(A, o), a), dot(sub(B, o), a)) - s);
      h1 = Math.max(h1, Math.max(dot(sub(A, o), a), dot(sub(B, o), a)) + s);
    }
    h0 -= round;
    h1 += round;
    const tn = fd.kind === 'cone' ? Math.tan(fd.r2!) : 0;
    const end = (h: number): [V3, number] => [[o[0] + a[0] * h, o[1] + a[1] * h, o[2] + a[2] * h], Math.max(0, fd.r1! + h * tn)];
    fd.ends = [end(h0), end(h1)];
    const cb = joinBox(circleBox(fd.ends[0][0], a, fd.ends[0][1]), circleBox(fd.ends[1][0], a, fd.ends[1][1]));
    // 둘 다 있으면 겹친 곳(둘 다 참 면을 품는다)
    if (!box) return cb;
    box = [
      [Math.max(box[0][0], cb[0][0]), Math.max(box[0][1], cb[0][1]), Math.max(box[0][2], cb[0][2])],
      [Math.min(box[1][0], cb[1][0]), Math.min(box[1][1], cb[1][1]), Math.min(box[1][2], cb[1][2])],
    ];
    return box;
  }
}

/**
 * 참 면을 품는 볼록 집합 위에서 n·(x − q)의 범위(평면 짝 — 면이 평면 한쪽에 있으면 그 평면까지가 하한).
 * 원기둥·원뿔은 두 끝 원, 구·원환은 중심에서 닫힌 꼴, 평면은 꼭짓점 ± 경계 현 처짐, 그 밖은 상자 꼭짓점. 못 정하면 null
 */
function signedRange(p: PartData, fd: FaceData, n: V3, q: V3): [number, number] | null {
  if (fd.ends && fd.ax) {
    const ext = Math.sqrt(Math.max(0, 1 - dot(n, fd.ax) ** 2));
    const s = fd.ends.map(([c, r]) => [dot(n, sub(c, q)) - r * ext, dot(n, sub(c, q)) + r * ext]);
    return [Math.min(s[0]![0]!, s[1]![0]!), Math.max(s[0]![1]!, s[1]![1]!)];
  }
  if (fd.org && fd.r1 !== undefined && (fd.kind === 'sphere' || fd.kind === 'torus')) {
    const s = dot(n, sub(fd.org, q));
    const e = fd.kind === 'sphere' ? fd.r1 : (fd.r1 + fd.r2!) * Math.sqrt(Math.max(0, 1 - dot(n, fd.ax!) ** 2)) + fd.r2! * Math.abs(dot(n, fd.ax!));
    return [s - e, s + e];
  }
  if (fd.kind === 'plane') {
    // 삼각형(꼭짓점) 범위와 경계 현마다 참 모서리가 n 쪽으로 벗어날 수 있는 만큼(평면 안 원·타원은 그 평면 법선 쪽으로 0)
    const I = p.mesh.indices!;
    const at = (i: number): V3 => [p.W[i * 3]!, p.W[i * 3 + 1]!, p.W[i * 3 + 2]!];
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = fd.t0; t < fd.t1; t++)
      for (let c = 0; c < 3; c++) {
        const s = dot(n, sub(at(I[t * 3 + c]!), q));
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    let ok = true;
    for (const c of fd.chords) {
      const A = at(c.a);
      const B = at(c.b);
      const s = chordSlack(c, n, A, B);
      if (!Number.isFinite(s)) ok = false;
      lo = Math.min(lo, Math.min(dot(n, sub(A, q)), dot(n, sub(B, q))) - s);
      hi = Math.max(hi, Math.max(dot(n, sub(A, q)), dot(n, sub(B, q))) + s);
    }
    if (ok) return [lo - p.round, hi + p.round];
  }
  const b = fd.cbox;
  if (!b) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let c = 0; c < 8; c++) {
    const s = dot(n, sub([b[c & 1][0], b[(c >> 1) & 1][1], b[(c >> 2) & 1][2]], q));
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return [lo, hi];
}

/** 면 표 식으로 본 그 면의 ρ 범위(닫힌 꼴 — 축이 H에 나란한 원기둥·원뿔·원환, 구). 못 정하면 null */
function closedRange(fd: FaceData, H: Axis, W: Float64Array, I: Uint32Array): [number, number] | null {
  if (!fd.ax || !fd.org || fd.r1 === undefined) return null;
  const e = rho(H, fd.org);
  if (fd.kind === 'sphere') return [Math.max(0, e - fd.r1), e + fd.r1];
  if (norm(cross(fd.ax, H.a)) > 1e-9) return null;
  if (fd.kind === 'cylinder') return [Math.abs(fd.r1 - e), fd.r1 + e];
  if (fd.kind === 'torus') return [Math.max(0, fd.r1 - fd.r2! - e), fd.r1 + fd.r2! + e];
  if (fd.kind === 'cone') {
    // 면 높이 범위(꼭짓점 — 처짐만큼 넓힘)에서 반지름 r1 + h tan(반각)
    let h0 = Infinity;
    let h1 = -Infinity;
    for (let t = fd.t0; t < fd.t1; t++)
      for (let c = 0; c < 3; c++) {
        const i = I[t * 3 + c]!;
        const h = dot(sub([W[i * 3]!, W[i * 3 + 1]!, W[i * 3 + 2]!], fd.org), fd.ax);
        h0 = Math.min(h0, h);
        h1 = Math.max(h1, h);
      }
    if (!Number.isFinite(fd.sag)) return null;
    const tn = Math.tan(fd.r2!);
    const rs = [fd.r1 + (h0 - fd.sag) * tn, fd.r1 + (h1 + fd.sag) * tn].map((x) => Math.max(0, x));
    const rlo = Math.min(...rs);
    const rhi = Math.max(...rs);
    return [e < rlo ? rlo - e : e > rhi ? e - rhi : 0, rhi + e];
  }
  return null;
}

/** 후보: 다듬은 두 면(안쪽 부품 면 fi·바깥쪽 부품 면 fo)과 그 거리 */
export interface ConcaveCandidate {
  inner: { mesh: Mesh3d; face: number };
  outer: { mesh: Mesh3d; face: number };
  distance: number;
}

/**
 * 오목한 자리 받기(머리글 규칙): 두 부품 사이 최소 거리가 정말 candidate.distance인지. 두 면이 H에 나란한 오목한 짝이고 모든 면 짝이 그보다 가깝지 않음을
 * 보이면 true. size는 장면 크기(허용치 기준), deadline은 performance.now() 한도(한 번에 끝까지 — certifySteps를 쉬지 않고 돌린다)
 */
export function certifyConcave(
  cand: ConcaveCandidate,
  fx: SnapFaceIndex,
  ex: SnapEdgeIndex | null,
  size: number,
  deadline: number,
  trace: ((why: string) => void) | null = null,
): boolean {
  return drain(certifySteps(cand, fx, ex, size, deadline, trace, clock));
}

/** 생성기를 쉬지 않고 끝까지 돌린 값 */
export function drain<T>(g: Generator<void, T, void>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/**
 * 시간 조각(46차): 생성기(make — 쉬는 틈마다 yield, 한도는 받은 시계 now로 본다)를 sliceMs 남짓씩 돌리고 setTimeout으로 이어 간다(화면이 그 사이에 그린다).
 * now는 쉰 틈(조각 사이)을 뺀 시계라, 한도가 같으면 한 번에 돌린 것(drain)과 같은 일·같은 답이다. cancel()하면 그만두고 done은 끝나지 않는다.
 * stats: 조각 수, 가장 긴 조각(ms), 일한 시간(ms — 쉰 틈 뺌). tick은 바탕 시계(시험이 바꾼다)
 */
export function sliced<T>(
  make: (now: Now) => Generator<void, T, void>,
  sliceMs = 8,
  tick: Now = clock,
): { done: Promise<T>; cancel(): void; stats: { slices: number; longest: number; busy: number } } {
  let paused = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stats = { slices: 0, longest: 0, busy: 0 };
  const now: Now = () => tick() - paused;
  const done = new Promise<T>((resolve, reject) => {
    let g: Generator<void, T, void> | null = null;
    let last = -1;
    const step = () => {
      if (stopped) return;
      const t0 = tick();
      if (last >= 0) paused += t0 - last;
      try {
        g ??= make(now);
        for (;;) {
          const r = g.next();
          if (r.done) {
            note(t0);
            resolve(r.value);
            return;
          }
          if (tick() - t0 >= sliceMs) break;
        }
      } catch (e) {
        reject(e);
        return;
      }
      last = note(t0);
      timer = setTimeout(step, 0);
    };
    step();
  });
  /** 조각 끝: 잰 값을 남기고 끝 시각 */
  function note(t0: number): number {
    const t1 = tick();
    stats.slices++;
    stats.longest = Math.max(stats.longest, t1 - t0);
    stats.busy += t1 - t0;
    return t1;
  }
  return {
    done,
    cancel() {
      stopped = true;
      clearTimeout(timer);
    },
    stats,
  };
}

/** certifyConcave를 쉴 틈(yield)을 주며 — now는 한도를 보는 시계 */
export function* certifySteps(
  cand: ConcaveCandidate,
  fx: SnapFaceIndex,
  ex: SnapEdgeIndex | null,
  size: number,
  deadline: number,
  trace: ((why: string) => void) | null,
  now: Now,
): Generator<void, boolean, void> {
  const no = (why: string): false => (trace?.(`concave: ${why}`), false);
  // 부품 자료를 만들기 전에 두 면 종류부터(바깥쪽은 H를 감쌀 수 있는 원기둥·원뿔·원환, 안쪽은 그것과 구)
  const kindOf = (m: Mesh3d, f: number) => {
    const ti = fx.tableOf.get(m.id);
    const t = ti === undefined ? undefined : fx.tables[ti];
    return t && t.kinds[f] !== undefined ? (fx.kinds[t.kinds[f]!] ?? '') : '';
  };
  const ko = kindOf(cand.outer.mesh, cand.outer.face);
  const ki = kindOf(cand.inner.mesh, cand.inner.face);
  if (!/^(cylinder|cone|torus)$/.test(ko) || !/^(cylinder|cone|torus|sphere)$/.test(ki)) return no('kinds');
  const pi = yield* partSteps(cand.inner.mesh, fx, ex, deadline, now);
  const po = pi ? yield* partSteps(cand.outer.mesh, fx, ex, deadline, now) : null;
  if (!pi || !po) return no('part');
  if (trace)
    for (const [nm, p] of [
      ['in', pi],
      ['out', po],
    ] as const) {
      const ch = p.faces.flatMap((f) => f.chords);
      const unk = p.faces.filter((f) => !Number.isFinite(f.sag));
      trace(
        `concave: ${nm} faces ${p.faces.length} unknown-sag ${unk.length}(${[...new Set(unk.map((f) => f.kind))].join('/')}) chords ${ch.length} no-neighbor ${ch.filter((c) => c.nb < 0).length} unknown-edge ${ch.filter((c) => !Number.isFinite(c.sag)).length} ${JSON.stringify(p.misses)}`,
      );
    }
  const fo = po.faces[cand.outer.face];
  const fi = pi.faces[cand.inner.face];
  if (!fo?.ax || !fo.org || !fi) return no('faces');
  const H: Axis = { o: fo.org, a: fo.ax };
  const Ii = cand.inner.mesh.indices!;
  const Io = cand.outer.mesh.indices!;
  const ri = closedRange(fi, H, pi.W, Ii);
  const ro = closedRange(fo, H, po.W, Io);
  if (!ri || !ro) return no('range');
  // 오목: 바깥쪽 면이 H를 감싸고(그 면 안쪽이 H 쪽), 안쪽 면 최댓값 < 바깥쪽 면 최솟값
  const rin = ri[1];
  const rout = ro[0];
  const tol = 1e-9 * (1 + size);
  // H가 바깥쪽 면 자신의 축이라, 이 조건은 안쪽 면이 바깥쪽 면에 둘러싸인(오목한) 짝에서만 선다
  if (!(rin < rout) || Math.abs(rout - rin - cand.distance) > tol) return no(`gap ${rout - rin} vs ${cand.distance}`);
  // 면마다 안(K_in)·밖(K_out)
  const v = (p: PartData, i: number): V3 => [p.W[i * 3]!, p.W[i * 3 + 1]!, p.W[i * 3 + 2]!];
  let work = 0;
  const isIn: boolean[] = [];
  for (const fd of pi.faces) {
    const r = closedRange(fd, H, pi.W, Ii);
    let m = 0;
    if (!r && fd.kind !== 'plane' && Number.isFinite(fd.sag))
      for (let t = fd.t0; t < fd.t1; t++) {
        for (let c = 0; c < 3; c++) m = Math.max(m, rho(H, v(pi, Ii[t * 3 + c]!)));
        if (++work % TICK === 0) yield;
      }
    isIn.push(r ? r[1] <= rin + tol : fd.kind === 'plane' || !Number.isFinite(fd.sag) ? false : m + fd.sag <= rin + tol);
    if (++work % TICK === 0) yield;
  }
  // 평면: 경계 현마다 참 모서리가 K_in 안이면 면도 안(되풀이 — 이웃 평면이 안으로 바뀌면 다시 본다)
  for (let changed = true; changed; ) {
    changed = false;
    for (const fd of pi.faces) {
      if (isIn[fd.f] || fd.kind !== 'plane' || !fd.chords.length) continue;
      const ok = fd.chords.every((c) => (c.nb >= 0 && isIn[c.nb]) || Math.max(rho(H, v(pi, c.a)), rho(H, v(pi, c.b))) + c.sag + pi.round <= rin + tol);
      if (ok) changed = isIn[fd.f] = true;
      if ((work += fd.chords.length) >= TICK) {
        work = 0;
        yield;
      }
    }
    if (now() > deadline) return no('time');
  }
  const isOut: boolean[] = [];
  for (const fd of po.faces) {
    const r = closedRange(fd, H, po.W, Io);
    let m = Infinity;
    if (!r && fd.kind !== 'plane' && Number.isFinite(fd.sag))
      for (let t = fd.t0; t < fd.t1; t++) {
        m = Math.min(m, triRho(H, v(po, Io[t * 3]!), v(po, Io[t * 3 + 1]!), v(po, Io[t * 3 + 2]!)));
        if (++work % TICK === 0) yield;
      }
    isOut.push(r ? r[0] >= rout - tol : fd.kind === 'plane' || !Number.isFinite(fd.sag) ? false : m - fd.sag >= rout - tol);
    if (++work % TICK === 0) yield;
  }
  // 평면: H와 만나는 점 p가 면 밖이고 경계가 모두 K_out 안이면 면도 밖
  function* pOut(fd: FaceData): Generator<void, boolean, void> {
    const n = fd.n;
    if (!n || Math.abs(dot(n, H.a)) < 1e-6) return false;
    const q = v(po!, Io[fd.t0 * 3]!);
    const p: V3 = (() => {
      const s = dot(sub(q, H.o), n) / dot(H.a, n);
      return [H.o[0] + H.a[0] * s, H.o[1] + H.a[1] * s, H.o[2] + H.a[2] * s];
    })();
    for (let t = fd.t0; t < fd.t1; t++) {
      if (pointTri(p, v(po!, Io[t * 3]!), v(po!, Io[t * 3 + 1]!), v(po!, Io[t * 3 + 2]!)) <= po!.round + tol) return false;
      if (++work % TICK === 0) yield;
    }
    return fd.chords.every((c) => segDist(p, v(po!, c.a), v(po!, c.b)) > c.sag + po!.round + tol);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const fd of po.faces) {
      if (isOut[fd.f] || fd.kind !== 'plane' || !fd.chords.length) continue;
      const ok = fd.chords.every((c) => (c.nb >= 0 && isOut[c.nb]) || segRho(H, v(po, c.a), v(po, c.b)) - c.sag - po.round >= rout - tol);
      if (ok && (yield* pOut(fd))) changed = isOut[fd.f] = true;
      if ((work += fd.chords.length) >= TICK) {
        work = 0;
        yield;
      }
    }
    if (now() > deadline) return no('time');
  }
  // 나머지 면 짝: 삼각형 사이 최소 거리 − 두 처짐
  const d = cand.distance;
  const boxesGap = (p: readonly [V3, V3], q: readonly [V3, V3]): number => {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const g = Math.max(0, q[0][k]! - p[1][k]!, p[0][k]! - q[1][k]!);
      s += g * g;
    }
    return Math.sqrt(s);
  };
  const boxGap = (a: FaceData, b: FaceData): number => boxesGap([a.lo, a.hi], [b.lo, b.hi]);
  /** 면의 ρ 범위(닫힌 꼴, 아니면 삼각형 범위 ± 처짐 — 못 정하면 null) */
  const ranges = new Map<FaceData, [number, number] | null>();
  const rangeOf = (fd: FaceData, p: PartData, I: Uint32Array): [number, number] | null => {
    let r = ranges.get(fd);
    if (r !== undefined) return r;
    r = closedRange(fd, H, p.W, I);
    if (!r && Number.isFinite(fd.sag)) {
      let lo = Infinity;
      let hi = 0;
      for (let t = fd.t0; t < fd.t1; t++) {
        const tri = [v(p, I[t * 3]!), v(p, I[t * 3 + 1]!), v(p, I[t * 3 + 2]!)] as const;
        lo = Math.min(lo, triRho(H, tri[0], tri[1], tri[2]));
        for (const x of tri) hi = Math.max(hi, rho(H, x));
      }
      r = [Math.max(0, lo - fd.sag), hi + fd.sag];
    }
    ranges.set(fd, r);
    return r;
  };
  /** 면의 축 방향 범위(참 면을 품는 상자의 여덟 꼭짓점을 H에 비춘 것 — 없으면 null) */
  const axialOf = (fd: FaceData): [number, number] | null => {
    const b = fd.cbox;
    if (!b) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let c = 0; c < 8; c++) {
      const h = dot(sub([b[c & 1][0], b[(c >> 1) & 1][1], b[(c >> 2) & 1][2]], H.o), H.a);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return [lo, hi];
  };
  let tested = 0;
  let gap = NaN;
  const why = (a: FaceData, b: FaceData) => {
    const n = b.n ?? a.n;
    const s = n ? [signedRange(pi!, a, n, a.lo), signedRange(po!, b, n, a.lo)] : null;
    return `pair ${a.f}(${a.kind}${isIn[a.f] ? ' in' : ''}) ${b.f}(${b.kind}${isOut[b.f] ? ' out' : ''}) ${gap} sag ${a.sag} ${b.sag} es ${a.es} ${b.es} r ${a.r1} ax ${a.ax} n ${n} along ${JSON.stringify(s)} rho ${JSON.stringify([rangeOf(a, pi!, Ii), rangeOf(b, po!, Io)])} h ${JSON.stringify([axialOf(a), axialOf(b)])}`;
  };
  for (const a of pi.faces) {
    // 안쪽 면(안)과 바깥쪽 면(밖)은 이미 갈렸다 — 안이면 밖이 아닌 바깥쪽 면만
    for (const b of po.faces) {
      if (!(isIn[a.f] && isOut[b.f]) && !(yield* pairOk(a, b))) return no(trace ? why(a, b) : 'pair');
      // 짝 하나는 상자·범위 몇 개(평면 법선 쪽 범위는 두 면 삼각형을 훑는다)
      if ((work += 8 + (a.n || b.n ? a.t1 - a.t0 + b.t1 - b.t0 : 0)) >= TICK) {
        work = 0;
        yield;
      }
    }
    if (now() > deadline) return no('time');
  }
  trace?.(`concave: ok ${tested} triangle pairs`);
  return true;

  function* pairOk(a: FaceData, b: FaceData): Generator<void, boolean, void> {
    // 참 면을 품는 두 상자가 후보보다 멀면 된다(처짐을 모르는 면도)
    if (a.cbox && b.cbox && boxesGap(a.cbox, b.cbox) >= d - tol) return true;
    // H 둘레 원통 좌표: 두 면의 ρ 범위 사이 틈과 축 방향 범위 사이 틈 — |x − y|² ≥ Δh² + Δρ²
    const ra = rangeOf(a, pi!, Ii);
    const rb = rangeOf(b, po!, Io);
    const ha = axialOf(a);
    const hb = axialOf(b);
    if (ra && rb && ha && hb) {
      const gr = Math.max(0, rb[0] - ra[1], ra[0] - rb[1]);
      const gh = Math.max(0, hb[0] - ha[1], ha[0] - hb[1]);
      if (Math.hypot(gr, gh) >= d - tol) return true;
    }
    // 평면 법선 쪽으로 비춘 두 볼록 집합의 틈(가르는 축 — 어느 단위 방향이든 비춘 틈이 하한)
    for (const n of [a.n, b.n]) {
      if (!n) continue;
      const q = a.lo;
      const sa = signedRange(pi!, a, n, q);
      const sb = signedRange(po!, b, n, q);
      if (sa && sb && Math.max(sb[0] - sa[1], sa[0] - sb[1]) >= d - tol) return true;
    }
    const need = d + a.sag + b.sag - tol;
    gap = boxGap(a, b);
    if (!Number.isFinite(need)) return false;
    if (gap >= need) return true;
    tested++;
    const ta = (a.tris ??= faceTris(pi!, a));
    const tb = (b.tris ??= faceTris(po!, b));
    let k = 0;
    for (const x of ta)
      for (const y of tb) {
        if (++k % 4096 === 0 && now() > deadline) return false;
        if (k % 512 === 0) yield;
        if (boxesGap(x.box, y.box) >= need) continue;
        const dd = triTri(x.p, y.p);
        if (dd < need) {
          gap = dd;
          return false;
        }
      }
    return true;
  }
}

/** 면 삼각형(세계 꼭짓점 셋과 상자) */
interface Tri {
  p: [V3, V3, V3];
  box: [V3, V3];
}

function faceTris(p: PartData, fd: FaceData): Tri[] {
  const I = p.mesh.indices!;
  const at = (i: number): V3 => [p.W[i * 3]!, p.W[i * 3 + 1]!, p.W[i * 3 + 2]!];
  const out: Tri[] = [];
  for (let t = fd.t0; t < fd.t1; t++) {
    const q: [V3, V3, V3] = [at(I[t * 3]!), at(I[t * 3 + 1]!), at(I[t * 3 + 2]!)];
    out.push({
      p: q,
      box: [
        [Math.min(q[0][0], q[1][0], q[2][0]), Math.min(q[0][1], q[1][1], q[2][1]), Math.min(q[0][2], q[1][2], q[2][2])],
        [Math.max(q[0][0], q[1][0], q[2][0]), Math.max(q[0][1], q[1][1], q[2][1]), Math.max(q[0][2], q[1][2], q[2][2])],
      ],
    });
  }
  return out;
}

/** 두 삼각형 사이 거리: 서로 뚫으면 0, 아니면 꼭짓점–삼각형 여섯과 변–변 아홉 가운데 최소 */
function triTri(A: readonly [V3, V3, V3], B: readonly [V3, V3, V3]): number {
  for (let i = 0; i < 3; i++) if (segHitsTri(A[i]!, A[(i + 1) % 3]!, B) || segHitsTri(B[i]!, B[(i + 1) % 3]!, A)) return 0;
  let m = Infinity;
  for (let i = 0; i < 3; i++) {
    m = Math.min(m, pointTri(A[i]!, B[0], B[1], B[2]), pointTri(B[i]!, A[0], A[1], A[2]));
    for (let j = 0; j < 3; j++) m = Math.min(m, segSeg(A[i]!, A[(i + 1) % 3]!, B[j]!, B[(j + 1) % 3]!));
  }
  return m;
}

/** 선분 pq가 삼각형 T를 지나는지(묄러–트럼보어, 경계 포함) */
function segHitsTri(p: V3, q: V3, T: readonly [V3, V3, V3]): boolean {
  const d = sub(q, p);
  const e1 = sub(T[1], T[0]);
  const e2 = sub(T[2], T[0]);
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-300) return false;
  const s = sub(p, T[0]);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const qv = cross(s, e1);
  const v = dot(d, qv) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) / det;
  return t >= 0 && t <= 1;
}

/** 두 선분 p1q1·p2q2 사이 거리(Ericson 5.1.9) */
function segSeg(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const cl = (x: number) => Math.min(1, Math.max(0, x));
  let s: number;
  let t: number;
  if (a <= 1e-300 && e <= 1e-300) return norm(r);
  if (a <= 1e-300) {
    s = 0;
    t = cl(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-300) {
      t = 0;
      s = cl(-c / a);
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 0 ? cl((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = cl(-c / a);
      } else if (t > 1) {
        t = 1;
        s = cl((b - c) / a);
      }
    }
  }
  return norm(sub([p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t]));
}

/**
 * B-스플라인 모서리의 매개변수 구간 [t0, t1]을 품는 조절점들(볼록 껍질 성질): 그 구간에 닿는 조절점과 앞뒤 하나씩 더(꼭짓점 매개변수의 어림 몫).
 * 닫힌 곡선이나 구간이 매듭 밖이면 조절점 전부. 유리 곡선의 가중치가 양수가 아니거나 꼴이 틀리면 null
 */
export function bsplineCtrlFor(def: BsplineDef, t0: number, t1: number): V3[] | null {
  const p = def.degree;
  const K = def.knots;
  const n = K.length - p - 1;
  const stride = def.rational ? 4 : 3;
  if (!(n > 0) || def.ctrl.length < n * stride || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const span = (t: number): number => {
    let i = p;
    while (i < n - 1 && K[i + 1]! <= t) i++;
    return i;
  };
  const all = def.period > 0 || lo < K[p]! || hi > K[n]!;
  const i0 = all ? 0 : Math.max(0, span(lo) - p - 1);
  const i1 = all ? n - 1 : Math.min(n - 1, span(hi) + 1);
  const out: V3[] = [];
  for (let i = i0; i <= i1; i++) {
    if (def.rational && !(def.ctrl[i * stride + 3]! > 0)) return null;
    out.push([def.ctrl[i * stride]!, def.ctrl[i * stride + 1]!, def.ctrl[i * stride + 2]!]);
  }
  return out;
}

/** 점 p와 선분 ab 사이 거리 */
function segDist(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  return norm(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}

/** 점 p와 삼각형 abc 사이 거리(Ericson 5.1.5) */
function pointTri(p: V3, a: V3, b: V3, c: V3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const at = (x: V3) => norm(sub(p, x));
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at([a[0] + ab[0] * (d1 / (d1 - d3)), a[1] + ab[1] * (d1 / (d1 - d3)), a[2] + ab[2] * (d1 / (d1 - d3))]);
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at([a[0] + ac[0] * (d2 / (d2 - d6)), a[1] + ac[1] * (d2 / (d2 - d6)), a[2] + ac[2] * (d2 / (d2 - d6))]);
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]);
  }
  const den = 1 / (va + vb + vc);
  return at([a[0] + ab[0] * vb * den + ac[0] * vc * den, a[1] + ab[1] * vb * den + ac[1] * vc * den, a[2] + ab[2] * vb * den + ac[2] * vc * den]);
}
