/**
 * 두 점 측정의 곡선–면 교차점 붙잡기(46차 — 순수, DOM 없음, 접선 조각): 커서 아래 B-rep 모서리 곡선이 다른 면(평면·곡면, 다른 부품 포함)을 뚫는 점을
 * 앱 점(코어 pointsFor — kind 'intersection', 이름 "교차점", 61차부터 우선 'fallback' — 다른 붙잡기가 없을 때만)으로 준다. BricsCAD의 3D 개체 스냅 ZINTersection("모서리·선과 면의 교차")과 같은 자리이고,
 * AutoCAD 3D 개체 스냅(꼭짓점·모서리 가운데·면 가운데·매듭·수직·면에 가장 가까운 점)과 SOLIDWORKS 측정에는 없는 자리라 이 앱이 더한다
 * (SOLIDWORKS는 참조 점 "교차"로 두 개체가 만나는 점을 따로 만든다).
 *
 * 후보 수·비용을 묶는 규칙(모서리 하나마다 한 번 — 결과는 그 모서리로만 정해져 코어의 pointsFor 기억 약속을 지킨다, 그 모서리를 따라 커서를 옮기면 다시 구하지 않는다):
 * - 모서리: 코어가 커서 아래에서 고른 윤곽선의 모서리 하나뿐(커서 둘레 모서리). 면 표가 있는 그물의 면만 본다.
 * - 면: 모서리 꺾은선의 세계 상자와 겹치는 그물만(그물 세계 상자는 한 번 재 둔다), 그 그물에서 삼각형 상자가 꺾은선 상자와 겹치는 것만
 *   꺾은선 토막과 맞대 본다. 토막의 두 끝이 삼각형 평면의 서로 다른 쪽에 있고(평면에서 떨어진 거리가 둘 다 허용치 밖) 뚫는 점이 삼각형 안일 때만 —
 *   모서리를 품은 이웃 면(토막이 그 면 삼각형 위)과 모서리 끝 꼭짓점에서 만나는 면(토막 끝이 평면 위)은 그래서 빠진다.
 * - 일 예산(시간이 아니라 개수 — 같은 모서리면 늘 같은 답): 훑는 삼각형 CROSS_TRIS개, 다듬는 후보 CROSS_MAX개. 넘으면 그 뒤는 보지 않는다.
 *   화면 붙잡기 거리 밖의 점은 코어가 버린다(앱은 화면 크기를 모른다 — 모서리 전체에서 구해 그 모서리 동안 다시 쓴다).
 * 정확도: 꺾은선 토막이 삼각형을 뚫는 점에서 시작해 모서리 곡선(원·타원·B-스플라인 — 모서리 표 곡선 정의, 곧은 모서리는 꺾은선 두 끝의 직선)과
 * 면(평면은 면 가운데·법선, 곡면은 면 표의 식·워커가 준 곡면 정의)의 교점 C(t) = S(u, v)를 뉴턴법으로 푼다(rootNear — 개체 측정 최소 거리 다듬기
 * exactdist.ts의 개체·되짚기·잘린 경계 판정을 그대로 쓴다. 최소 거리 뉴턴은 잔차가 0인 근에서 정류 판정이 반올림에 걸려 따로 푼다).
 * |C − S|가 장면 크기 × 1e-12 안으로 수렴하고 면의 잘린 경계 안이며 그 토막 둘레(토막 길이 두 배 안)일 때만 받는다.
 * 뚫는 점이 그 면의 경계(그 그물 윤곽선 — 곡선 토막은 토막 길이 0.1배 안) 위면 두 모서리의 교차점이라 뺀다 — 코어 교차점(선분 식별자가 실리고 앱이 곡선 위로 다듬는다)이 맡아
 * 기존 결과가 그대로다.
 * 곡면 정의를 아직 받지 않은 면(B-스플라인 등)은 다듬지 못해 빼고, 그 모서리는 기억하지 않는다(받은 뒤 다시 구한다).
 * 꺾은선 토막이 현의 처짐만큼 비켜 곡면만 뚫는 자리(곡선이 곡면에 아주 얕게 닿는 자리)는 찾지 못한다.
 */
import type { Mesh3d, SnapPoint } from 'opencad-viewer3d/types';
import type { StepEdgeTable } from '../scene';
import { toLocal, toWorld } from './curvesnap';
import { edgeAt } from './edges';
import { edgeGeo, type ExactGeo, faceGeo, segmentGeo } from './exactdist';
import { faceAt, faceDetails } from './faces';
import type { FaceSurfaceLookup, SnapFaceIndex } from './facesnap';
import type { SnapEdgeIndex } from './snap';

type V3 = [number, number, number];

/** 모서리 하나에 훑는 삼각형 한도 */
export const CROSS_TRIS = 300_000;
/** 모서리 하나에 다듬는 후보(뚫는 점) 한도 */
export const CROSS_MAX = 8;

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const mag = (p: readonly number[]): number => Math.max(Math.abs(p[0]!), Math.abs(p[1]!), Math.abs(p[2]!));

/** 한 모서리를 구한 기록(시험·비용 재기): 훑은 삼각형, 토막–삼각형 맞대기, 뚫는 점 후보, 받은 점, 예산을 넘었는지, 다듬지 못한 면이 있었는지 */
export interface CrossStats {
  tris: number;
  tests: number;
  hits: number;
  points: number;
  truncated: boolean;
  pending: boolean;
  /** 주면 받은 점마다 그 면 번호(그 점의 id 그물 — 시험·비용 재기) */
  faces?: number[];
  /** 주면 받지 못한 후보의 까닭(진단) */
  why?: string[];
}

/** 상자(세계 — 낮은 끝·높은 끝) */
type Box = [V3, V3];

/** 그물의 세계 상자(그물 좌표 상자의 여덟 구석을 자리 변환으로 — 넉넉한 상자). 꼭짓점이 없으면 null */
export function meshBox(m: Mesh3d): Box | null {
  const P = m.positions;
  if (P.length < 3) return null;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const x = P[i + k]!;
      if (x < lo[k]!) lo[k] = x;
      if (x > hi[k]!) hi[k] = x;
    }
  const out: Box = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (let c = 0; c < 8; c++) {
    const w = toWorld(m, c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]);
    for (let k = 0; k < 3; k++) {
      out[0][k] = Math.min(out[0][k]!, w[k]!);
      out[1][k] = Math.max(out[1][k]!, w[k]!);
    }
  }
  return out.every((v) => v.every(Number.isFinite)) ? out : null;
}

const overlap = (a: Box, b: Box, eps: number): boolean => a[0].every((x, k) => x <= b[1][k]! + eps && b[0][k]! <= a[1][k]! + eps);

/**
 * 장면의 곡선–면 교차점 찾기(snap.ts CurveSnap.crossings — 모서리마다 한 번 구해 기억한다). known(그 모서리의 끝점·가운데 점·중심·접점)과
 * 좌표 크기의 1e-6배 안으로 겹치는 점은 뺀다(그 점 붙잡기가 맡는다)
 */
export function edgeCrossings(
  meshes: readonly Mesh3d[],
  ex: SnapEdgeIndex,
  fx: SnapFaceIndex,
  lookup: FaceSurfaceLookup | null,
): (mesh: Mesh3d, table: StepEdgeTable, e: number, known: readonly SnapPoint[]) => SnapPoint[] {
  const memo = new Map<string, SnapPoint[]>();
  const boxes = new Map<Mesh3d, Box | null>();
  const boxOf = (m: Mesh3d): Box | null => {
    let b = boxes.get(m);
    if (b === undefined) boxes.set(m, (b = meshBox(m)));
    return b;
  };
  return (mesh, table, e, known) => {
    const key = `${mesh.id}:${e}`;
    let pts = memo.get(key);
    if (!pts) {
      const st: CrossStats = { tris: 0, tests: 0, hits: 0, points: 0, truncated: false, pending: false };
      pts = crossingsOf(mesh, table, e, meshes, ex, fx, lookup, boxOf, st);
      if (!st.pending) memo.set(key, pts);
    }
    const near = (q: readonly number[], p: readonly number[]): boolean => dist(q, p) <= 1e-6 * (1 + mag(p));
    return pts.filter((s) => !known.some((k) => near(s.point, k.point)));
  };
}

/**
 * 모서리 e(그물 mesh, 모서리 표 table)의 곡선이 장면의 면을 뚫는 점(머리글 규칙). boxOf는 그물 세계 상자, st는 기록
 */
export function crossingsOf(
  mesh: Mesh3d,
  table: StepEdgeTable,
  e: number,
  meshes: readonly Mesh3d[],
  ex: SnapEdgeIndex,
  fx: SnapFaceIndex,
  lookup: FaceSurfaceLookup | null,
  boxOf: (m: Mesh3d) => Box | null = meshBox,
  st: CrossStats = { tris: 0, tests: 0, hits: 0, points: 0, truncated: false, pending: false },
): SnapPoint[] {
  const E = mesh.edges;
  const s0 = table.segStart[e];
  const s1 = table.segStart[e + 1];
  if (!E || s0 === undefined || s1 === undefined || !(s1 > s0)) return [];
  // 꺾은선(세계): 토막마다 두 끝
  const W: V3[] = [];
  for (let s = s0; s < s1; s++) W.push(toWorld(mesh, E[s * 6]!, E[s * 6 + 1]!, E[s * 6 + 2]!), toWorld(mesh, E[s * 6 + 3]!, E[s * 6 + 4]!, E[s * 6 + 5]!));
  const eb: Box = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const p of W)
    for (let k = 0; k < 3; k++) {
      eb[0][k] = Math.min(eb[0][k]!, p[k]!);
      eb[1][k] = Math.max(eb[1][k]!, p[k]!);
    }
  const size = 1 + Math.max(mag(eb[0]), mag(eb[1])) + dist(eb[0], eb[1]);
  const eps = 1e-7 * size;
  // 그 모서리의 그물부터, 그 뒤 장면 차례
  const order = [mesh, ...meshes.filter((m) => m !== mesh)];
  const hits: { m: Mesh3d; f: number; X: V3; k: number }[] = [];
  scan: for (const m of order) {
    const ti = fx.tableOf.get(m.id);
    const ft = ti === undefined ? undefined : fx.tables[ti];
    const I = m.indices;
    const b = ft && I ? boxOf(m) : null;
    if (!b || !overlap(b, eb, eps)) continue;
    // 꺾은선을 그 그물 좌표로(삼각형은 float32 그대로 본다)
    const L: V3[] = [];
    for (const p of W) {
      const q = toLocal(m, p);
      if (!q) continue scan;
      L.push(q.p);
    }
    const lb: Box = [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity],
    ];
    for (const p of L)
      for (let k = 0; k < 3; k++) {
        lb[0][k] = Math.min(lb[0][k]!, p[k]!);
        lb[1][k] = Math.max(lb[1][k]!, p[k]!);
      }
    const leps = 1e-7 * (1 + Math.max(mag(lb[0]), mag(lb[1])) + dist(lb[0], lb[1]));
    const P = m.positions;
    const tris = I!.length / 3;
    for (let t = 0; t < tris; t++) {
      if (++st.tris > CROSS_TRIS) {
        st.truncated = true;
        break scan;
      }
      const a: V3 = [P[I![t * 3]! * 3]!, P[I![t * 3]! * 3 + 1]!, P[I![t * 3]! * 3 + 2]!];
      const bb: V3 = [P[I![t * 3 + 1]! * 3]!, P[I![t * 3 + 1]! * 3 + 1]!, P[I![t * 3 + 1]! * 3 + 2]!];
      const c: V3 = [P[I![t * 3 + 2]! * 3]!, P[I![t * 3 + 2]! * 3 + 1]!, P[I![t * 3 + 2]! * 3 + 2]!];
      let out = false;
      for (let k = 0; k < 3 && !out; k++) out = Math.min(a[k]!, bb[k]!, c[k]!) > lb[1][k]! + leps || Math.max(a[k]!, bb[k]!, c[k]!) < lb[0][k]! - leps;
      if (out) continue;
      const n = cross(sub(bb, a), sub(c, a));
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (!(nl > 0)) continue;
      for (let k = 0; k + 1 < L.length; k += 2) {
        const p0 = L[k]!;
        const p1 = L[k + 1]!;
        st.tests++;
        const d0 = dot(n, sub(p0, a)) / nl;
        const d1 = dot(n, sub(p1, a)) / nl;
        // 서로 다른 쪽, 둘 다 평면에서 허용치 밖(토막이 그 면 위거나 끝이 평면 위면 아니다)
        if (!(d0 * d1 < 0) || Math.abs(d0) <= leps || Math.abs(d1) <= leps) continue;
        const tau = d0 / (d0 - d1);
        const X: V3 = [p0[0] + (p1[0] - p0[0]) * tau, p0[1] + (p1[1] - p0[1]) * tau, p0[2] + (p1[2] - p0[2]) * tau];
        if (!inTri(X, a, bb, c, n)) continue;
        const f = faceAt(ft!, t);
        if (f < 0) continue;
        const Xw = toWorld(m, X[0], X[1], X[2]);
        // 같은 면 이웃 삼각형이 함께 쓰는 변 위 자리(두 번 걸림)는 하나로
        if (hits.some((h) => h.m === m && h.f === f && dist(h.X, Xw) <= eps)) continue;
        st.hits++;
        hits.push({ m, f, X: Xw, k: k / 2 });
      }
    }
  }
  // 다듬기
  const kind = ex.kinds[table.kinds[e]!] ?? '';
  let A: ExactGeo | null | undefined;
  const out: SnapPoint[] = [];
  for (const h of hits.slice(0, CROSS_MAX)) {
    const ti = fx.tableOf.get(h.m.id)!;
    const ft = fx.tables[ti]!;
    const fk = fx.kinds[ft.kinds[h.f]!] ?? '';
    const fp = fk === 'plane' ? faceDetails(h.m, ft, h.f, fx.kinds) : null;
    const B = faceGeo(h.m, fx, h.f, lookup, fp?.normal ? { center: fp.center, normal: fp.normal } : null);
    if (!B) {
      // 곡면 정의를 아직 받지 않은 면(받으면 다시 구한다)
      if (lookup && lookup(ti, h.f) === undefined) st.pending = true;
      continue;
    }
    A ??= kind === 'line' ? segmentGeo(W[0]!, W[W.length - 1]!) : edgeGeo(mesh, ex, e);
    if (!A) break;
    const segLen = dist(W[h.k * 2]!, W[h.k * 2 + 1]!);
    const P = rootNear(A, B, h.X, size, 2 * segLen + eps);
    if (!P) st.why?.push(`hit ${h.X}`);
    if (!P || out.some((s) => dist(s.point, P!) <= eps)) {
      if (P) st.why?.push(`same ${P}`);
      continue;
    }
    // 뚫는 점이 그 면의 경계(그물 윤곽선) 위면 두 모서리의 교차점이다 — 코어 교차점(선분 식별자와 함께 — 곡선 위로 다듬음)이 맡는다
    if (onOutline(h.m, ex, P, eps)) {
      st.why?.push(`outline ${P}`);
      continue;
    }
    // 61차(코어 0.41.0 priority 'fallback'): 다른 붙잡기(점·축·나란함·끌어온 점 등)가 하나도 없을 때만 붙는다 — 46차가 곡선–면 교차점으로 바꾼 자리 가운데
    // 다른 붙잡기였던 자리(축 방향·가운데 점·수직 발)는 예전 붙잡기로 돌아가고, 붙잡지 않던 자리만 교차점이다
    out.push({ point: P, kind: 'intersection', id: h.m.id, priority: 'fallback' });
    st.faces?.push(h.f);
  }
  st.points = out.length;
  return out;
}

/**
 * 모서리 개체 A(매개변수 하나)와 면 개체 B(둘)의 교점: X(꺾은선이 삼각형을 뚫는 점)를 두 개체 위로 되짚은 매개변수에서 C(t) − S(u, v) = 0을
 * 뉴턴법으로(3×3 야코비 [C′, −S_u, −S_v], 줄지 않으면 걸음을 반씩 — 정의역 안으로 자름). |C − S| ≤ 장면 크기 × 1e-12로 수렴하고 X에서 reach 안이며
 * 면의 잘린 경계 안이면 두 점의 가운데, 아니면 null
 */
function rootNear(A: ExactGeo, B: ExactGeo, X: V3, size: number, reach: number): V3 | null {
  let xa = A.near(X);
  let xb = B.near(X);
  if (!xa || !xb || A.dims !== 1 || B.dims !== 2) return null;
  const tol = size * 1e-12;
  let ea = A.ev(xa);
  let eb = B.ev(xb);
  if (!ea || !eb) return null;
  let r = sub(ea.P, eb.P);
  let rn = Math.hypot(r[0], r[1], r[2]);
  for (let i = 0; i < 40 && rn > tol; i++) {
    const c0 = ea.D[0]!;
    const c1 = eb.D[0]!.map((x) => -x);
    const c2 = eb.D[1]!.map((x) => -x);
    const det = dot(c0, cross(c1, c2));
    if (!(Math.abs(det) > 1e-300)) return null;
    // 크라메르: [c0 c1 c2] d = −r
    const m: V3 = [-r[0], -r[1], -r[2]];
    const d = [dot(m, cross(c1, c2)) / det, dot(c0, cross(m, c2)) / det, dot(c0, cross(c1, m)) / det];
    let moved = false;
    for (let s = 1; s > 1e-6 && !moved; s /= 2) {
      const na = A.clamp([xa[0]! + s * d[0]!]);
      const nb = B.clamp([xb[0]! + s * d[1]!, xb[1]! + s * d[2]!]);
      const fa = A.ev(na);
      const fb = B.ev(nb);
      if (!fa || !fb) continue;
      const nr = sub(fa.P, fb.P);
      const nn = Math.hypot(nr[0], nr[1], nr[2]);
      if (nn < rn) {
        [xa, xb, ea, eb, r, rn, moved] = [na, nb, fa, fb, nr, nn, true];
      }
    }
    if (!moved) return null;
  }
  if (!(rn <= tol)) return null;
  const P: V3 = [(ea.P[0] + eb.P[0]) / 2, (ea.P[1] + eb.P[1]) / 2, (ea.P[2] + eb.P[2]) / 2];
  if (!(dist(P, X) <= reach)) return null;
  // 잘린 면의 경계 안(허용치: X와 곡면 사이만큼의 두 배 — 삼각형이 곡면에서 벗어난 만큼 — refineClosest와 같은 꼴)
  const q = B.near(X);
  const off = q ? B.ev(q) : null;
  return B.inside(xb, 2 * (off ? dist(off.P, X) : 0) + 1e-6 * (1 + mag(P))) ? P : null;
}

/**
 * 세계 점 P가 그물 m의 윤곽선(모서리 꺾은선) 위인지: 어느 토막까지 거리가 eps 안, 곡선 모서리 토막이면 그 토막 길이의 0.1배 안
 * (현과 곡선 사이 — 코어 넓힌 교차의 활꼴 높이 한도와 같다)
 */
function onOutline(m: Mesh3d, ex: SnapEdgeIndex, P: V3, eps: number): boolean {
  const E = m.edges;
  const L = E ? toLocal(m, P) : null;
  if (!E || !L) return false;
  const ti = ex.tableOf.get(m.id);
  const et = ti === undefined ? undefined : ex.tables[ti];
  const p = L.p;
  const tol = eps / L.scale;
  for (let s = 0; s * 6 + 5 < E.length; s++) {
    const a: V3 = [E[s * 6]!, E[s * 6 + 1]!, E[s * 6 + 2]!];
    const ab = sub([E[s * 6 + 3]!, E[s * 6 + 4]!, E[s * 6 + 5]!], a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
    const d = dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
    if (d <= tol) return true;
    if (d <= 0.1 * Math.sqrt(l2) && et) {
      const e = edgeAt(et, s);
      if (e >= 0 && ex.kinds[et.kinds[e]!] !== 'line') return true;
    }
  }
  return false;
}

/** 삼각형 평면 위 점 X가 삼각형 abc 안인지(법선 n — 변마다 같은 쪽, 경계 포함) */
function inTri(X: V3, a: V3, b: V3, c: V3, n: V3): boolean {
  const s1 = dot(cross(sub(b, a), sub(X, a)), n);
  const s2 = dot(cross(sub(c, b), sub(X, b)), n);
  const s3 = dot(cross(sub(a, c), sub(X, c)), n);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
