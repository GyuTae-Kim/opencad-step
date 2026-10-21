/**
 * 모서리 고르기(순수, DOM 없음): 코어가 돌려준 윤곽선 선분 번호(Pick3d kind 'edge', index = Mesh3d.edges 선분 번호) →
 * 모서리 표(meta.edgeTables)의 B-rep 모서리 → 종류·정확한 길이·원호 지름/반지름/중심/축·끝점·가운데 점(세계 좌표).
 * 길이는 해석기가 곡선에서 적분한 값(B-rep, 자리 변환 배율 반영)이고, 끝점·가운데 점은 윤곽선 꺾은선에서 잰다.
 */
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { StepEdgeTable } from '../scene';

/** 모서리 표 매개변수 개수(brep.ts EDGE_PARAMS와 같다) */
const NP = 8;
type V3 = [number, number, number];

export interface EdgePick {
  meshId: string;
  /** 모서리 표 안 번호 */
  edge: number;
  /** EDGE_CURVE STEP 번호 */
  stepId: number;
  /** line·circle·ellipse·bspline·other */
  kind: string;
  /** 윤곽선 선분 범위(Viewer3d.highlightRanges의 edges) */
  segStart: number;
  segCount: number;
  /** 곡선 길이(세계 단위) */
  length: number;
  /** 원: 반지름, 타원: 긴 반지름 */
  radius?: number;
  /** 타원: 짧은 반지름 */
  minorRadius?: number;
  /** 원·타원 중심(세계) */
  center?: V3;
  /** 원·타원 평면의 법선(세계, 단위) */
  axis?: V3;
  /** 원호가 도는 각(도, 한 바퀴 360) */
  sweepDeg?: number;
  /** 시작·끝 점(세계) */
  ends: [V3, V3];
  /** 곡선 길이로 가운데 점(세계) */
  mid: V3;
  /** 강조용 선분 쌍 xyz,xyz…(segOrigin 기준 — setHighlightSegments의 origin) */
  segs: Float32Array;
  segOrigin: V3;
}

/** 선분 번호 → 모서리 번호(이분 탐색, 없으면 -1) */
export function edgeAt(table: Pick<StepEdgeTable, 'segStart'>, seg: number): number {
  const s = table.segStart;
  const n = s.length - 1;
  if (n <= 0 || seg < 0 || seg >= s[n]!) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid]! <= seg) lo = mid;
    else hi = mid - 1;
  }
  // 선분이 없는 모서리는 건너뛴다(같은 시작을 가진 것 가운데 선분이 있는 마지막)
  while (lo + 1 < n && s[lo + 1]! <= seg) lo++;
  return lo;
}

function xf(m: ArrayLike<number> | undefined, p: readonly number[]): V3 {
  if (!m) return [p[0]!, p[1]!, p[2]!];
  return [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
}
function xd(m: ArrayLike<number> | undefined, d: readonly number[]): V3 {
  const v: V3 = m ? [m[0]! * d[0]! + m[4]! * d[1]! + m[8]! * d[2]!, m[1]! * d[0]! + m[5]! * d[1]! + m[9]! * d[2]!, m[2]! * d[0]! + m[6]! * d[1]! + m[10]! * d[2]!] : [d[0]!, d[1]!, d[2]!];
  const l = Math.hypot(...v);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : v;
}

/** 모서리 하나의 자세한 정보(없으면 null) */
export function edgeDetails(mesh: Mesh3d, table: StepEdgeTable, e: number, kinds: readonly string[]): EdgePick | null {
  const s0 = table.segStart[e];
  const s1 = table.segStart[e + 1];
  const E = mesh.edges;
  if (s0 === undefined || s1 === undefined || s1 <= s0 || !E || E.length < s1 * 6) return null;
  const o = mesh.origin ?? [0, 0, 0];
  const m = mesh.matrix;
  // 자리 변환의 길이 배율(닮음 변환만 — STEP 자리 변환은 회전·이동·균등 배율)
  const sc = m ? Math.cbrt(Math.abs(m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!))) || 1 : 1;
  const pt = (i: number): V3 => xf(m, [E[i]! + o[0], E[i + 1]! + o[1], E[i + 2]! + o[2]]);
  // 선분 끝점들을 이어 꺾은선(세계)
  const pts: V3[] = [pt(s0 * 6)];
  for (let k = s0; k < s1; k++) pts.push(pt(k * 6 + 3));
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
    seg.push(l);
    total += l;
  }
  let mid: V3 = pts[0]!;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i]! >= total / 2) {
      const t = seg[i]! > 0 ? (total / 2 - acc) / seg[i]! : 0;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      break;
    }
    acc += seg[i]!;
  }
  // 강조 선분(가운데 점 기준 — 큰 좌표에서도 float32로 떨리지 않게)
  const segs = new Float32Array((s1 - s0) * 6);
  for (let k = s0, j = 0; k < s1; k++) {
    const a = pt(k * 6);
    const b = pt(k * 6 + 3);
    for (let q = 0; q < 3; q++) segs[j + q] = a[q]! - mid[q]!;
    for (let q = 0; q < 3; q++) segs[j + 3 + q] = b[q]! - mid[q]!;
    j += 6;
  }
  const kind = kinds[table.kinds[e]!] ?? 'other';
  const p = table.params.subarray(e * NP, e * NP + NP);
  const len = table.length[e];
  const out: EdgePick = {
    meshId: mesh.id,
    edge: e,
    stepId: table.stepIds[e] ?? 0,
    kind,
    segStart: s0,
    segCount: s1 - s0,
    length: len !== undefined && Number.isFinite(len) && len > 0 ? len * sc : total,
    ends: [pts[0]!, pts[pts.length - 1]!],
    mid,
    segs,
    segOrigin: mid,
  };
  if (kind === 'circle' || kind === 'ellipse') {
    out.radius = p[0]! * sc;
    if (kind === 'ellipse') out.minorRadius = p[1]! * sc;
    out.axis = xd(m, [p[2]!, p[3]!, p[4]!]);
    out.center = xf(m, [p[5]! + o[0], p[6]! + o[1], p[7]! + o[2]]);
    if (kind === 'circle') out.sweepDeg = ((table.sweep[e] ?? 0) * 180) / Math.PI;
  }
  return out;
}

/** 한 바퀴 원(호가 아닌)인지 */
export function isFullCircle(ep: Pick<EdgePick, 'kind' | 'sweepDeg'>): boolean {
  return ep.kind === 'circle' && (ep.sweepDeg ?? 0) >= 359.9;
}

/**
 * 붙잡기: 누른 점(세계)이 화면에서 모서리 끝점(꼭짓점)이나 가운데 점에 tolPx 안이면 그 점.
 * 한 바퀴 원은 끝점·가운데 점이 따로 없어(이음 꼭짓점 하나) 붙잡지 않는다 — 원은 중심으로 잰다.
 * toScreen: 세계 → 화면(CSS 화소), 못 그리면 null
 */
export function snapOnEdge(ep: EdgePick, picked: readonly number[], toScreen: (p: readonly number[]) => { x: number; y: number } | null, tolPx: number): { what: 'vertex' | 'mid'; point: V3 } | null {
  if (isFullCircle(ep)) return null;
  const s = toScreen(picked);
  if (!s) return null;
  let best: { what: 'vertex' | 'mid'; point: V3; d: number } | null = null;
  const cands: ['vertex' | 'mid', V3][] = [
    ['vertex', ep.ends[0]],
    ['vertex', ep.ends[1]],
    ['mid', ep.mid],
  ];
  for (const [what, p] of cands) {
    const q = toScreen(p);
    if (!q) continue;
    const d = Math.hypot(q.x - s.x, q.y - s.y);
    if (d <= tolPx && (!best || d < best.d)) best = { what, point: p, d };
  }
  return best ? { what: best.what, point: best.point } : null;
}

/** 모서리 종류 → 한국어 이름 */
export function edgeKindLabel(kind: string): string {
  return EDGE_LABELS[kind] ?? '곡선 모서리';
}

const EDGE_LABELS: Record<string, string> = {
  line: '직선 모서리',
  circle: '원호 모서리',
  ellipse: '타원 모서리',
  bspline: 'B-스플라인 모서리',
  other: '곡선 모서리',
};
