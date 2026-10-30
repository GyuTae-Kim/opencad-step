/**
 * 축이 곡면을 뚫는 점 시험용 합성 STEP(직접 만든 작은 자료 — tests/massprops.test.ts의 지붕 블록·민 원기둥과 같은 꼴):
 * - 지붕 블록: 위가 3차 × 3차 B-스플라인 곡면 z(x, y)(그레빌 점에 둔 조절점이라 x = a·u, y = b·v — 답 z = roofZ(x/a, y/b)), 옆 넷·밑은 평면
 * - 민 원기둥: 옆면이 원을 z로 민 곡면(SURFACE_OF_LINEAR_EXTRUSION)인 반지름 rad 원기둥
 */
import { r, type StepText, type P3 } from '../stepText';

/** 전체 매듭 벡터 → STEP (배수)·(값) */
function knotSpec(U: readonly number[]): [string, string] {
  const vals: number[] = [];
  const mults: number[] = [];
  for (const x of U) {
    if (vals.length && vals[vals.length - 1] === x) mults[mults.length - 1]!++;
    else {
      vals.push(x);
      mults.push(1);
    }
  }
  return [`(${mults.join(',')})`, `(${vals.map(r).join(',')})`];
}

function bsCurve(w: StepText, p: number, U: readonly number[], pts: readonly P3[]): number {
  const [m, k] = knotSpec(U);
  return w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',${p},(${pts.map((x) => `#${w.pt(x)}`).join(',')}),.UNSPECIFIED.,.F.,.F.,${m},${k},.UNSPECIFIED.`);
}

function bsSurface(w: StepText, p: number, q: number, U: readonly number[], V: readonly number[], net: readonly (readonly P3[])[]): number {
  const [mu, ku] = knotSpec(U);
  const [mv, kv] = knotSpec(V);
  const list = `(${net.map((row) => `(${row.map((x) => `#${w.pt(x)}`).join(',')})`).join(',')})`;
  return w.add('B_SPLINE_SURFACE_WITH_KNOTS', `'',${p},${q},${list},.UNSPECIFIED.,.F.,.F.,.F.,${mu},${mv},${ku},${kv},.UNSPECIFIED.`);
}

/** 3차 B-스플라인 값(드 부어) */
function deBoor3(knots: readonly number[], ctrl: readonly number[], t: number): number {
  const p = 3;
  let k = p;
  while (k < ctrl.length - 1 && t >= knots[k + 1]!) k++;
  const d = Array.from({ length: p + 1 }, (_, j) => ctrl[j + k - p]!);
  for (let s = 1; s <= p; s++)
    for (let j = p; j >= s; j--) {
      const i = j + k - p;
      const a = (t - knots[i]!) / (knots[i + p - s + 1]! - knots[i]!);
      d[j] = (1 - a) * d[j - 1]! + a * d[j]!;
    }
  return d[p]!;
}

const basis3 = (U: readonly number[], n: number, i: number, t: number): number => deBoor3(U, Array.from({ length: n }, (_, k) => (k === i ? 1 : 0)), t);
const greville3 = (U: readonly number[], n: number) => Array.from({ length: n }, (_, i) => (U[i + 1]! + U[i + 2]! + U[i + 3]!) / 3);

const ROOF_U = [0, 0, 0, 0, 0.25, 0.7, 1, 1, 1, 1];
const ROOF_V = [0, 0, 0, 0, 0.4, 1, 1, 1, 1];
const ROOF_Z = [
  [3, 4, 5, 3.5, 4],
  [4, 6, 2, 5, 3],
  [5, 3, 7, 4, 4.5],
  [3.5, 5, 4, 6, 3],
  [4, 2.5, 5, 3, 5],
  [3, 4, 3.5, 4.5, 4],
];

/** 지붕 곡면 높이(u, v ∈ [0, 1]) */
export function roofZ(u: number, v: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) {
    const bu = basis3(ROOF_U, 6, i, u);
    if (bu) for (let j = 0; j < 5; j++) s += bu * basis3(ROOF_V, 5, j, v) * ROOF_Z[i]![j]!;
  }
  return s;
}

/** 위가 B-스플라인 곡면 z(x, y)인 a×b 블록(닫힌 입체) */
export function roofBlock(w: StepText, a: number, b: number): number {
  const gu = greville3(ROOF_U, 6);
  const gv = greville3(ROOF_V, 5);
  const net = gu.map((x, i) => gv.map((y, j) => [a * x, b * y, ROOF_Z[i]![j]!] as P3));
  const zc = (i: number, j: number) => ROOF_Z[i]![j]!;
  const B = [w.vertex([0, 0, 0]), w.vertex([a, 0, 0]), w.vertex([a, b, 0]), w.vertex([0, b, 0])];
  const Tp: P3[] = [
    [0, 0, zc(0, 0)],
    [a, 0, zc(5, 0)],
    [a, b, zc(5, 4)],
    [0, b, zc(0, 4)],
  ];
  const T = Tp.map((x) => w.vertex(x));
  const Bp: P3[] = [
    [0, 0, 0],
    [a, 0, 0],
    [a, b, 0],
    [0, b, 0],
  ];
  const bottomE = [0, 1, 2, 3].map((k) => w.edge(B[k]!, B[(k + 1) % 4]!, w.line(Bp[k]!, Bp[(k + 1) % 4]!)));
  const vert = [0, 1, 2, 3].map((k) => w.edge(B[k]!, T[k]!, w.line(Bp[k]!, Tp[k]!)));
  const cY0 = w.edge(T[0]!, T[1]!, bsCurve(w, 3, ROOF_U, net.map((row) => row[0]!)));
  const cXa = w.edge(T[1]!, T[2]!, bsCurve(w, 3, ROOF_V, net[5]!));
  const cYb = w.edge(T[3]!, T[2]!, bsCurve(w, 3, ROOF_U, net.map((row) => row[4]!)));
  const cX0 = w.edge(T[0]!, T[3]!, bsCurve(w, 3, ROOF_V, net[0]!));
  const top = w.face([w.bound(w.loop([w.oe(cY0, true), w.oe(cXa, true), w.oe(cYb, false), w.oe(cX0, false)]))], bsSurface(w, 3, 3, ROOF_U, ROOF_V, net));
  const bottom = w.face([w.bound(w.loop([w.oe(bottomE[3]!, false), w.oe(bottomE[2]!, false), w.oe(bottomE[1]!, false), w.oe(bottomE[0]!, false)]))], w.plane([0, 0, 0], [0, 0, -1]));
  const sY0 = w.face([w.bound(w.loop([w.oe(bottomE[0]!, true), w.oe(vert[1]!, true), w.oe(cY0, false), w.oe(vert[0]!, false)]))], w.plane([0, 0, 0], [0, -1, 0]));
  const sXa = w.face([w.bound(w.loop([w.oe(bottomE[1]!, true), w.oe(vert[2]!, true), w.oe(cXa, false), w.oe(vert[1]!, false)]))], w.plane([a, 0, 0], [1, 0, 0], [0, 1, 0]));
  const sYb = w.face([w.bound(w.loop([w.oe(bottomE[2]!, true), w.oe(vert[3]!, true), w.oe(cYb, true), w.oe(vert[2]!, false)]))], w.plane([0, b, 0], [0, 1, 0]));
  const sX0 = w.face([w.bound(w.loop([w.oe(bottomE[3]!, true), w.oe(vert[0]!, true), w.oe(cX0, true), w.oe(vert[3]!, false)]))], w.plane([0, 0, 0], [-1, 0, 0], [0, 1, 0]));
  return w.solid([top, bottom, sY0, sXa, sYb, sX0], 'roof');
}

/** 옆면이 원을 z로 민 곡면(SURFACE_OF_LINEAR_EXTRUSION)인 반지름 rad, 높이 h 원기둥(z축, 이음 꼭짓점 (rad, 0)) */
export function extrudedCylinder(w: StepText, rad: number, h: number): number {
  const V0 = w.vertex([rad, 0, 0]);
  const V1 = w.vertex([rad, 0, h]);
  const C0 = w.edge(V0, V0, w.circle([0, 0, 0], rad));
  const C1 = w.edge(V1, V1, w.circle([0, 0, h], rad));
  const L = w.edge(V0, V1, w.line([rad, 0, 0], [rad, 0, h]));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  const vec = w.add('VECTOR', `'',#${w.dir([0, 0, 1])},1.`);
  const surf = w.add('SURFACE_OF_LINEAR_EXTRUSION', `'',#${w.circle([0, 0, 0], rad)},#${vec}`);
  const side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'xcyl');
}

/** 세로 삼각 판(평면 y = p[1]): 꼭짓점 p와 위쪽 두 꼭짓점 p + (±3, 0, 4) — 열린 면 묶음 */
export function hangingPlate(w: StepText, p: P3): number {
  const q: P3[] = [p, [p[0] + 3, p[1], p[2] + 4], [p[0] - 3, p[1], p[2] + 4]];
  const V = q.map((x) => w.vertex(x));
  const es = q.map((x, i) => w.edge(V[i]!, V[(i + 1) % 3]!, w.line(x, q[(i + 1) % 3]!)));
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(p, [0, -1, 0], [1, 0, 0]));
  return w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
}
