/**
 * B-rep 질량 속성(massprops.ts·brep.ts·physics.ts): 해석적 입체를 합성 STEP으로 만들어 부피·무게중심·무게중심 기준 2차 모멘트를
 * 닫힌 식과 견준다. 평면·원기둥·원뿔·구·원환과 직선·원 모서리로 된 입체는 곡면 적분이라 반올림 수준(여기서는 상대 1e-9)으로 맞아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { stepToScene } from '../src/index';
import { FLUX, KRONROD15, PROPS_BREP, PROPS_LEN, PROPS_TIMEOUT, addSliverFlux, faceFlux, gaussRule, lineCurve, trianglesFlux } from '../src/massprops';
import type { StepFaceTable } from '../src/scene';
import { scaleProps } from '../src/scene';
import { createDoc } from '../src/app/doc';
import { accuracyText, localProps, physProps } from '../src/app/physics';
import { cone, cube, cylinder, plateWithHole, r, sphere, StepText, torus, type P3 } from './stepText';

type Sym = [number, number, number, number, number, number];
interface Expect {
  V: number;
  c: P3;
  /** 무게중심 기준 ∫y yᵀ dV [xx, yy, zz, xy, yz, zx] */
  S: Sym;
}

/** 20점 가우스–르장드르(다항식 39차까지 정확) — 회전체의 기대값 */
function gauss(f: (x: number) => number, a: number, b: number): number {
  const n = 20;
  // 골럽–웰시 대신 뉴턴으로 르장드르 근
  let s = 0;
  for (let i = 1; i <= n; i++) {
    let x = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    const w = 2 / ((1 - x * x) * dp * dp);
    s += w * f((a + b) / 2 + ((b - a) / 2) * x);
  }
  return (s * (b - a)) / 2;
}

/** z축 회전체(반지름 ρ(z), z ∈ [z0, z1]). breaks: ρ가 조각 다항식이면 그 이음 z(가우스를 조각마다) */
function revolved(rho: (z: number) => number, z0: number, z1: number, breaks: number[] = []): Expect {
  const zs = [z0, ...breaks, z1];
  const g = (f: (z: number) => number) => zs.slice(1).reduce((s, b, i) => s + gauss(f, zs[i]!, b), 0);
  const V = g((z) => Math.PI * rho(z) ** 2);
  const zc = g((z) => z * Math.PI * rho(z) ** 2) / V;
  const xx = g((z) => (Math.PI * rho(z) ** 4) / 4);
  const zz = g((z) => (z - zc) ** 2 * Math.PI * rho(z) ** 2);
  return { V, c: [0, 0, zc], S: [xx, xx, zz, 0, 0, 0] };
}

/** 원환(큰 반지름 R, 작은 반지름 rr, z축) */
function torusExpect(R: number, rr: number): Expect {
  const V = 2 * Math.PI * Math.PI * R * rr * rr;
  const xx = (V * (R * R + (3 * rr * rr) / 4)) / 2;
  return { V, c: [0, 0, 0], S: [xx, xx, (V * rr * rr) / 4, 0, 0, 0] };
}

/** 3차 B-스플라인 값(드 부어) */
function deBoor3(knots: number[], ctrl: number[], t: number): number {
  const p = 3;
  let k = p;
  while (k < ctrl.length - 1 && t >= knots[k + 1]!) k++;
  const d = Array.from({ length: p + 1 }, (_, j) => ctrl[j + k - p]!);
  for (let r = 1; r <= p; r++)
    for (let j = p; j >= r; j--) {
      const i = j + k - p;
      const a = (t - knots[i]!) / (knots[i + p - r + 1]! - knots[i]!);
      d[j] = (1 - a) * d[j - 1]! + a * d[j]!;
    }
  return d[p]!;
}

/**
 * 꽃병 윤곽: 매듭 하나(t = VASE_KNOT — 삼각화가 이음선을 나누는 t = 1/2와 다른 자리)인 3차 B-스플라인, 반지름 조절점 VASE_R,
 * 높이는 z = VASE_H·t(그레빌 점에 둔 조절점 — 일차 정확)
 */
const VASE_KNOT = 0.3;
const VASE_KNOTS = [0, 0, 0, 0, VASE_KNOT, 1, 1, 1, 1];
const VASE_R = [6, 9, 4, 7, 5];
const VASE_H = 12;
const vaseRho = (z: number) => deBoor3(VASE_KNOTS, VASE_R, z / VASE_H);

/** a×b×c 상자(모서리 o) */
function boxExpect(a: number, b: number, c: number, o: P3 = [0, 0, 0]): Expect {
  const V = a * b * c;
  return { V, c: [o[0] + a / 2, o[1] + b / 2, o[2] + c / 2], S: [(V * a * a) / 12, (V * b * b) / 12, (V * c * c) / 12, 0, 0, 0] };
}

/** 원점 기준 2차 모멘트로 옮겼다가 빼기(구멍 판 = 상자 − 원기둥) */
function minus(A: Expect, B: Expect): Expect {
  const raw = (e: Expect): Sym => [e.S[0] + e.V * e.c[0] ** 2, e.S[1] + e.V * e.c[1] ** 2, e.S[2] + e.V * e.c[2] ** 2, e.S[3] + e.V * e.c[0] * e.c[1], e.S[4] + e.V * e.c[1] * e.c[2], e.S[5] + e.V * e.c[2] * e.c[0]];
  const V = A.V - B.V;
  const c: P3 = [0, 1, 2].map((k) => (A.V * A.c[k]! - B.V * B.c[k]!) / V) as P3;
  const ra = raw(A);
  const rb = raw(B);
  const r = ra.map((x, i) => x - rb[i]!);
  return { V, c, S: [r[0]! - V * c[0] ** 2, r[1]! - V * c[1] ** 2, r[2]! - V * c[2] ** 2, r[3]! - V * c[0] * c[1], r[4]! - V * c[1] * c[2], r[5]! - V * c[2] * c[0]] };
}

/** 밑 반지름 r1(z=0), 윗 반지름 r2(z=h) 원뿔대(r1 > r2 — 원뿔 축은 위에서 아래로) */
function frustum(w: StepText, r1: number, r2: number, h: number): number {
  const Vb = w.vertex([r1, 0, 0]);
  const Vt = w.vertex([r2, 0, h]);
  const Cb = w.edge(Vb, Vb, w.circle([0, 0, 0], r1));
  const Ct = w.edge(Vt, Vt, w.circle([0, 0, h], r2));
  const L = w.edge(Vb, Vt, w.line([r1, 0, 0], [r2, 0, h]));
  const bottom = w.face([w.bound(w.loop([w.oe(Cb, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(Ct, true)]))], w.plane([0, 0, h]));
  const surf = w.add('CONICAL_SURFACE', `'',#${w.ax2([0, 0, h], [0, 0, -1], [1, 0, 0])},${r2},${Math.atan((r1 - r2) / h)}`);
  const side = w.face([w.bound(w.loop([w.oe(Cb, true), w.oe(L, true), w.oe(Ct, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'frustum');
}

/**
 * 옆면을 다른 곡면으로 쓴 원기둥: extrusion이면 원을 z로 민 곡면(SURFACE_OF_LINEAR_EXTRUSION — 곡면 적분),
 * offset이면 반지름 rad − 1 원기둥 곡면을 1 띄운 곡면(OFFSET_SURFACE — 적분하지 않는 곡면)
 */
function sideCylinder(w: StepText, rad: number, h: number, kind: 'extrusion' | 'offset'): number {
  const V0 = w.vertex([rad, 0, 0]);
  const V1 = w.vertex([rad, 0, h]);
  const C0 = w.edge(V0, V0, w.circle([0, 0, 0], rad));
  const C1 = w.edge(V1, V1, w.circle([0, 0, h], rad));
  const L = w.edge(V0, V1, w.line([rad, 0, 0], [rad, 0, h]));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  let surf: number;
  if (kind === 'extrusion') {
    const vec = w.add('VECTOR', `'',#${w.dir([0, 0, 1])},1.`);
    surf = w.add('SURFACE_OF_LINEAR_EXTRUSION', `'',#${w.circle([0, 0, 0], rad)},#${vec}`);
  } else surf = w.add('OFFSET_SURFACE', `'',#${w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2([0, 0, 0])},${rad - 1}`)},1.,.F.`);
  const side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'xcyl');
}

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

/** B-스플라인 곡선(가중치가 있으면 유리) */
function bsCurve(w: StepText, p: number, U: readonly number[], pts: readonly P3[], wts?: readonly number[]): number {
  const [m, k] = knotSpec(U);
  const list = `(${pts.map((x) => `#${w.pt(x)}`).join(',')})`;
  if (!wts) return w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',${p},${list},.UNSPECIFIED.,.F.,.F.,${m},${k},.UNSPECIFIED.`);
  return w.raw(
    `(BOUNDED_CURVE() B_SPLINE_CURVE(${p},${list},.UNSPECIFIED.,.F.,.F.) B_SPLINE_CURVE_WITH_KNOTS(${m},${k},.UNSPECIFIED.) CURVE() GEOMETRIC_REPRESENTATION_ITEM() RATIONAL_B_SPLINE_CURVE((${wts.map(r).join(',')})) REPRESENTATION_ITEM(''))`,
  );
}

/** B-스플라인 곡면(조절점 net[i][j] — i가 u 방향, 가중치가 있으면 유리) */
function bsSurface(w: StepText, p: number, q: number, U: readonly number[], V: readonly number[], net: readonly (readonly P3[])[], wts?: readonly (readonly number[])[]): number {
  const [mu, ku] = knotSpec(U);
  const [mv, kv] = knotSpec(V);
  const list = `(${net.map((row) => `(${row.map((x) => `#${w.pt(x)}`).join(',')})`).join(',')})`;
  if (!wts) return w.add('B_SPLINE_SURFACE_WITH_KNOTS', `'',${p},${q},${list},.UNSPECIFIED.,.F.,.F.,.F.,${mu},${mv},${ku},${kv},.UNSPECIFIED.`);
  return w.raw(
    `(BOUNDED_SURFACE() B_SPLINE_SURFACE(${p},${q},${list},.UNSPECIFIED.,.F.,.F.,.F.) B_SPLINE_SURFACE_WITH_KNOTS(${mu},${mv},${ku},${kv},.UNSPECIFIED.) GEOMETRIC_REPRESENTATION_ITEM() RATIONAL_B_SPLINE_SURFACE((${wts
      .map((row) => `(${row.map(r).join(',')})`)
      .join(',')})) REPRESENTATION_ITEM('') SURFACE())`,
  );
}

/** 3차 B-스플라인 기저 N_i(t)(드 부어 — 조절점 i만 1) */
function basis3(U: readonly number[], n: number, i: number, t: number): number {
  return deBoor3(U as number[], Array.from({ length: n }, (_, k) => (k === i ? 1 : 0)), t);
}

/** 매듭 벡터의 그레빌 점(3차) */
const greville3 = (U: readonly number[], n: number) => Array.from({ length: n }, (_, i) => (U[i + 1]! + U[i + 2]! + U[i + 3]!) / 3);

/** 매듭 구간마다 가우스(20점)로 [U[3], U[n]] 적분 — 조각 다항식이면 정확 */
function spanGauss(U: readonly number[], f: (t: number) => number): number {
  const ks = [...new Set(U)];
  return ks.slice(1).reduce((s, b, i) => s + gauss(f, ks[i]!, b), 0);
}

/**
 * 평면 여섯 면을 모두 비선형 매개변수의 3차 B-스플라인 곡면(평면 위 조절점 — u에 매듭 둘, v에 매듭 하나, 간격이 고르지 않음)으로 쓰고
 * 모서리는 곧은 선인 a×b×c 상자: 안쪽 적분은 u 매듭에서, 곧은 모서리는 v 매듭을 지나는 곳에서 나눠야 맞는다
 */
const BOX_U = [0, 0, 0, 0, 0.3, 0.55, 1, 1, 1, 1];
const BOX_X = [0, 0.05, 0.4, 0.5, 0.8, 1];
const BOX_V = [0, 0, 0, 0, 0.6, 1, 1, 1, 1];
const BOX_Y = [0, 0.35, 0.45, 0.9, 1];
function splineBox(w: StepText, a: number, b: number, c: number, o: P3): number {
  const P = (i: number): P3 => [o[0] + (i & 1 ? a : 0), o[1] + (i & 2 ? b : 0), o[2] + (i & 4 ? c : 0)];
  const V = Array.from({ length: 8 }, (_, i) => w.vertex(P(i)));
  const edges = new Map<string, number>();
  const oe = (i: number, j: number) => {
    const k = i < j ? `${i}-${j}` : `${j}-${i}`;
    let e = edges.get(k);
    if (e === undefined) {
      const [s, t] = i < j ? [i, j] : [j, i];
      e = w.edge(V[s]!, V[t]!, w.line(P(s), P(t)));
      edges.set(k, e);
    }
    return w.oe(e, i < j);
  };
  // 바깥에서 볼 때 반시계: (B − A) × (D − A)가 바깥 법선 — u는 A→B, v는 A→D
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const faces = quads.map((q) => {
    const A = P(q[0]!);
    const E1 = P(q[1]!).map((x, k) => x - A[k]!);
    const E2 = P(q[3]!).map((x, k) => x - A[k]!);
    // 안쪽 조절점을 조금 비틀어 x가 v에도, y가 u에도 기대게(평면 그대로, 끝 줄은 곧은 모서리) — 모서리 위 적분 값이 v 매듭에서 꺾인다
    const net = BOX_X.map((x0, i) =>
      BOX_Y.map((y0, j) => {
        const x = i > 0 && i < BOX_X.length - 1 ? x0 + 0.02 * (j - 2) * (i % 2 ? 1 : -1) : x0;
        const y = j > 0 && j < BOX_Y.length - 1 ? y0 + 0.015 * (i - 2.5) * (j % 2 ? 1 : -1) : y0;
        return [0, 1, 2].map((k) => A[k]! + x * E1[k]! + y * E2[k]!) as P3;
      }),
    );
    const lp = w.loop(q.map((i, k) => oe(i, q[(k + 1) % 4]!)));
    return w.face([w.bound(lp)], bsSurface(w, 3, 3, BOX_U, BOX_V, net));
  });
  return w.solid(faces, 'bbox');
}

/**
 * 위가 B-스플라인 곡면 z(x, y)(3차 × 3차, u 매듭 둘·v 매듭 하나, 그레빌 점에 둔 조절점이라 x = a·u, y = b·v)인 a×b 블록.
 * 옆 네 평면의 윗변은 그 곡면의 끝 줄 조절점으로 쓴 B-스플라인 곡선
 */
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
function roofZ(u: number, v: number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) {
    const bu = basis3(ROOF_U, 6, i, u);
    if (bu) for (let j = 0; j < 5; j++) s += bu * basis3(ROOF_V, 5, j, v) * ROOF_Z[i]![j]!;
  }
  return s;
}
function roofBlock(w: StepText, a: number, b: number): number {
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
  // 윗변: y=0(u), x=a(v), y=b(u), x=0(v) — 모두 매개변수가 느는 방향
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

/** 블록 기대값: 0 ≤ z ≤ Z(x, y) 위에서 ∫ 다항식(매듭 구간마다 가우스 — 정확) */
function roofExpect(a: number, b: number): Expect {
  const I = (f: (x: number, y: number, z: number) => number) => a * b * spanGauss(ROOF_U, (u) => spanGauss(ROOF_V, (v) => f(a * u, b * v, roofZ(u, v))));
  return momentsExpect(I);
}

/** 기대값 묶음: I(f)는 입체 위로 이미 z 적분한 몫 — f(x, y, Z)에서 [∫1, ∫x, ∫y, ∫z, ∫x², ∫y², ∫z², ∫xy, ∫yz, ∫zx] dz를 고른다 */
function momentsExpect(I: (f: (x: number, y: number, z: number) => number) => number): Expect {
  const V = I((_x, _y, z) => z);
  const c: P3 = [I((x, _y, z) => x * z) / V, I((_x, y, z) => y * z) / V, I((_x, _y, z) => (z * z) / 2) / V];
  const S: Sym = [
    I((x, _y, z) => (x - c[0]) ** 2 * z),
    I((_x, y, z) => (y - c[1]) ** 2 * z),
    I((_x, _y, z) => ((z - c[2]) ** 3 + c[2] ** 3) / 3),
    I((x, y, z) => (x - c[0]) * (y - c[1]) * z),
    I((_x, y, z) => ((y - c[1]) * ((z - c[2]) ** 2 - c[2] ** 2)) / 2),
    I((x, _y, z) => ((x - c[0]) * ((z - c[2]) ** 2 - c[2] ** 2)) / 2),
  ];
  return { V, c, S };
}

/** 차수 p B-스플라인 값(드 부어 — 아무 매듭) */
function deBoorP(p: number, knots: readonly number[], ctrl: readonly number[], t: number): number {
  let k = p;
  while (k < ctrl.length - 1 && t >= knots[k + 1]!) k++;
  const d = Array.from({ length: p + 1 }, (_, j) => ctrl[j + k - p]!);
  for (let rr = 1; rr <= p; rr++)
    for (let j = p; j >= rr; j--) {
      const i = j + k - p;
      const a = (t - knots[i]!) / (knots[i + p - rr + 1]! - knots[i]!);
      d[j] = (1 - a) * d[j - 1]! + a * d[j]!;
    }
  return d[p]!;
}

/**
 * 주기 B-스플라인 관: 단면이 닫힌 3차 B-스플라인(균일 주기 매듭, 조절점 여섯을 셋 겹쳐 씀)이고 높이 z(v)가 v 매듭 하나인 비선형 3차라
 * 옆면 S(u,v) = (x(u), y(u), z(v))는 u로 닫힌 B-스플라인 곡면. 옆면 경계는 위·아래 닫힌 곡선 둘뿐(이음선 모서리 없음 — 삼각화가
 * 매개변수 공간 이음선으로 잇는다. 그 직선 토막이 v 매듭을 지난다), 위·아래는 평면
 */
const TUBE_X = [6, 3, -4, -6, -2, 4];
const TUBE_Y = [0, 5, 4, -1, -5, -4];
const TUBE_K = Array.from({ length: 13 }, (_, i) => i - 3);
const TUBE_V = [0, 0, 0, 0, 0.4, 1, 1, 1, 1];
const TUBE_Z = [0, 0.1, 0.5, 0.6, 1];
const wrap3 = (a: readonly number[]) => [...a, a[0]!, a[1]!, a[2]!];
function splineTube(w: StepText, h: number, topScale = 1): number {
  const X = wrap3(TUBE_X);
  const Y = wrap3(TUBE_Y);
  // topScale ≠ 1이면 위 닫힌 곡선만 원점에서 그만큼 키운다(위 평면 위 그대로, 옆 곡면에서는 바깥으로 조금 떨어진다)
  const ring = (z: number, k = 1) => X.map((x, i) => [k * x, k * Y[i]!, z] as P3);
  const net = X.map((x, i) => TUBE_Z.map((z) => [x, Y[i]!, h * z] as P3));
  const surf = bsSurface(w, 3, 3, TUBE_K, TUBE_V, net);
  const x0 = deBoorP(3, TUBE_K, X, 0);
  const y0 = deBoorP(3, TUBE_K, Y, 0);
  const V0 = w.vertex([x0, y0, 0]);
  const V1 = w.vertex([topScale * x0, topScale * y0, h]);
  const C0 = w.edge(V0, V0, bsCurve(w, 3, TUBE_K, ring(0)));
  const C1 = w.edge(V1, V1, bsCurve(w, 3, TUBE_K, ring(h, topScale)));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  const side = w.face([w.bound(w.loop([w.oe(C0, true)])), w.bound(w.loop([w.oe(C1, false)]), false)], surf);
  return w.solid([bottom, top, side], 'tube');
}

/** 관 기대값: 단면 넓이·1·2차 모멘트를 그린 정리로(∮ x dy 등 — 매듭 구간마다 가우스, 정확), 높이 방향은 닫힌 식 */
function tubeExpect(h: number): Expect {
  const X = wrap3(TUBE_X);
  const Y = wrap3(TUBE_Y);
  const dK = TUBE_K.slice(1, -1);
  const dX = X.slice(1).map((x, i) => x - X[i]!);
  const dY = Y.slice(1).map((y, i) => y - Y[i]!);
  const I = (f: (x: number, y: number, dx: number, dy: number) => number) =>
    spanGauss([0, 1, 2, 3, 4, 5, 6], (u) => f(deBoorP(3, TUBE_K, X, u), deBoorP(3, TUBE_K, Y, u), deBoorP(2, dK, dX, u), deBoorP(2, dK, dY, u)));
  const A = I((x, _y, _dx, dy) => x * dy);
  const cx = I((x, _y, _dx, dy) => (x * x * dy) / 2) / A;
  const cy = -I((_x, y, dx) => (y * y * dx) / 2) / A;
  const Ixx = I((x, _y, _dx, dy) => (x ** 3 * dy) / 3);
  const Iyy = -I((_x, y, dx) => (y ** 3 * dx) / 3);
  const Ixy = I((x, y, _dx, dy) => (x * x * y * dy) / 2);
  const V = A * h;
  return { V, c: [cx, cy, h / 2], S: [h * (Ixx - A * cx * cx), h * (Iyy - A * cy * cy), (V * h * h) / 12, h * (Ixy - A * cx * cy), 0, 0] };
}

/**
 * NURBS 원기둥: 옆면이 유리 2차(u, 90° 호 넷 — 가중치 √2/2) × 1차(v) B-스플라인 곡면, 이음선 모서리 하나, 위·아래 원판
 */
function nurbsCylinder(w: StepText, rad: number, h: number): number {
  const s = Math.SQRT1_2;
  const ring: [number, number, number][] = [
    [1, 0, 1],
    [1, 1, s],
    [0, 1, 1],
    [-1, 1, s],
    [-1, 0, 1],
    [-1, -1, s],
    [0, -1, 1],
    [1, -1, s],
    [1, 0, 1],
  ];
  const net = ring.map(([x, y]) => [0, h].map((z) => [rad * x, rad * y, z] as P3));
  const wts = ring.map(([, , wt]) => [wt, wt]);
  const surf = bsSurface(w, 2, 1, [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [0, 0, 1, 1], net, wts);
  const V0 = w.vertex([rad, 0, 0]);
  const V1 = w.vertex([rad, 0, h]);
  const C0 = w.edge(V0, V0, w.circle([0, 0, 0], rad));
  const C1 = w.edge(V1, V1, w.circle([0, 0, h], rad));
  const L = w.edge(V0, V1, w.line([rad, 0, 0], [rad, 0, h]));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  const side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'ncyl');
}

/**
 * B-스플라인 곡선 y = f(x)(3차, 매듭 둘, 그레빌 점 조절점이라 x = a·t)를 z로 민 곡면(SURFACE_OF_LINEAR_EXTRUSION)이 옆면인
 * 0 ≤ y ≤ f(x), 0 ≤ x ≤ a, 0 ≤ z ≤ h 기둥
 */
const PRISM_U = [0, 0, 0, 0, 0.35, 0.6, 1, 1, 1, 1];
const PRISM_F = [4, 7, 2, 6, 3, 5];
const prismF = (t: number) => deBoor3(PRISM_U, PRISM_F, t);
function splinePrism(w: StepText, a: number, h: number): number {
  const gx = greville3(PRISM_U, 6);
  const prof = (z: number) => gx.map((t, i) => [a * t, PRISM_F[i]!, z] as P3);
  const f0 = PRISM_F[0]!;
  const fa = PRISM_F[5]!;
  const pts: P3[] = [
    [0, 0, 0],
    [a, 0, 0],
    [a, fa, 0],
    [0, f0, 0],
  ];
  const lo = pts.map((x) => w.vertex(x));
  const hi = pts.map((x) => w.vertex([x[0], x[1], h]));
  const line = (A: number, B: number, pa: P3, pb: P3) => w.edge(A, B, w.line(pa, pb));
  const up = pts.map((x, k) => line(lo[k]!, hi[k]!, x, [x[0], x[1], h]));
  const bot = [line(lo[0]!, lo[1]!, pts[0]!, pts[1]!), line(lo[1]!, lo[2]!, pts[1]!, pts[2]!), line(lo[3]!, lo[0]!, pts[3]!, pts[0]!)];
  const ph = pts.map((x) => [x[0], x[1], h] as P3);
  const tops = [line(hi[0]!, hi[1]!, ph[0]!, ph[1]!), line(hi[1]!, hi[2]!, ph[1]!, ph[2]!), line(hi[3]!, hi[0]!, ph[3]!, ph[0]!)];
  // 윤곽 곡선: x = 0(점 3) → x = a(점 2)
  const cb = w.edge(lo[3]!, lo[2]!, bsCurve(w, 3, PRISM_U, prof(0)));
  const ct = w.edge(hi[3]!, hi[2]!, bsCurve(w, 3, PRISM_U, prof(h)));
  const bottom = w.face([w.bound(w.loop([w.oe(bot[0]!, true), w.oe(bot[1]!, true), w.oe(cb, false), w.oe(bot[2]!, true)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(tops[0]!, true), w.oe(tops[1]!, true), w.oe(ct, false), w.oe(tops[2]!, true)]))], w.plane([0, 0, h]));
  const sY0 = w.face([w.bound(w.loop([w.oe(bot[0]!, true), w.oe(up[1]!, true), w.oe(tops[0]!, false), w.oe(up[0]!, false)]))], w.plane([0, 0, 0], [0, -1, 0]));
  const sXa = w.face([w.bound(w.loop([w.oe(bot[1]!, true), w.oe(up[2]!, true), w.oe(tops[1]!, false), w.oe(up[1]!, false)]))], w.plane([a, 0, 0], [1, 0, 0], [0, 1, 0]));
  const sX0 = w.face([w.bound(w.loop([w.oe(bot[2]!, false), w.oe(up[3]!, true), w.oe(tops[2]!, true), w.oe(up[0]!, false)]))], w.plane([0, 0, 0], [-1, 0, 0], [0, 1, 0]));
  const vec = w.add('VECTOR', `'',#${w.dir([0, 0, 1])},1.`);
  const surf = w.add('SURFACE_OF_LINEAR_EXTRUSION', `'',#${bsCurve(w, 3, PRISM_U, prof(0))},#${vec}`);
  // 곡면 법선 C′ × z는 −y 쪽(안쪽)이라 same_sense .F.
  const side = w.face([w.bound(w.loop([w.oe(up[3]!, true), w.oe(ct, true), w.oe(up[2]!, false), w.oe(cb, false)]))], surf, false);
  return w.solid([bottom, top, sY0, sXa, sX0, side], 'xprism');
}

function prismExpect(a: number, h: number): Expect {
  // X(g) = ∫ g(x, f(x)) dx(매듭 구간마다 가우스) — y 적분은 닫힌 식으로 g 안에
  const X = (fn: (x: number, f: number) => number) => a * spanGauss(PRISM_U, (t) => fn(a * t, prismF(t)));
  const V = h * X((_x, f) => f);
  const c: P3 = [(h * X((x, f) => x * f)) / V, (h * X((_x, f) => (f * f) / 2)) / V, h / 2];
  const S: Sym = [
    h * X((x, f) => (x - c[0]) ** 2 * f),
    h * X((_x, f) => ((f - c[1]) ** 3 + c[1] ** 3) / 3),
    (V * h * h) / 12,
    h * X((x, f) => ((x - c[0]) * ((f - c[1]) ** 2 - c[1] ** 2)) / 2),
    0,
    0,
  ];
  return { V, c, S };
}

/** z축 회전 곡면(SURFACE_OF_REVOLUTION) */
function revSurface(w: StepText, curve: number): number {
  const axis = w.add('AXIS1_PLACEMENT', `'',#${w.pt([0, 0, 0])},#${w.dir([0, 0, 1])}`);
  return w.add('SURFACE_OF_REVOLUTION', `'',#${curve},#${axis}`);
}

/** 원환을 회전 곡면으로: xz 평면의 원(가운데 (R,0,0), 반지름 rr)을 z축 둘레로 돌린 면 하나, 두 이음선 원 */
function revTorus(w: StepText, R: number, rr: number): number {
  const V = w.vertex([R + rr, 0, 0]);
  const Q = w.edge(V, V, w.circle([0, 0, 0], R + rr));
  const M = w.edge(V, V, w.circle([R, 0, 0], rr, [0, -1, 0], [1, 0, 0]));
  const surf = revSurface(w, w.circle([R, 0, 0], rr, [0, -1, 0], [1, 0, 0]));
  const f = w.face([w.bound(w.loop([w.oe(Q, true), w.oe(M, true), w.oe(Q, false), w.oe(M, false)]))], surf);
  return w.solid([f], 'rtorus');
}

/**
 * 꽃병: B-스플라인 윤곽(xz 평면)을 z축 둘레로 돌린 옆면과 위·아래 원판. seam이면 윤곽 이음선 모서리 하나,
 * 아니면 옆면 경계가 위·아래 원 둘뿐(삼각화가 매개변수 공간 이음선으로 잇는다 — 그 직선 토막이 매듭을 지난다)
 */
function vase(w: StepText, seam = true): number {
  const greville = VASE_R.map((_, i) => (VASE_KNOTS[i + 1]! + VASE_KNOTS[i + 2]! + VASE_KNOTS[i + 3]!) / 3);
  const pts = VASE_R.map((x, i) => w.pt([x, 0, VASE_H * greville[i]!]));
  const profile = () => w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${pts.map((p) => `#${p}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,1,4),(0.,${VASE_KNOT},1.),.UNSPECIFIED.`);
  const r0 = VASE_R[0]!;
  const r1 = VASE_R[VASE_R.length - 1]!;
  const V0 = w.vertex([r0, 0, 0]);
  const V1 = w.vertex([r1, 0, VASE_H]);
  const C0 = w.edge(V0, V0, w.circle([0, 0, 0], r0));
  const C1 = w.edge(V1, V1, w.circle([0, 0, VASE_H], r1));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, VASE_H]));
  let side: number;
  if (seam) {
    const L = w.edge(V0, V1, profile());
    side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], revSurface(w, profile()));
  } else side = w.face([w.bound(w.loop([w.oe(C0, true)])), w.bound(w.loop([w.oe(C1, false)]), false)], revSurface(w, profile()));
  return w.solid([bottom, top, side], 'vase');
}

/** 입체 하나를 열어 면 표 질량 속성과 장면을 돌려준다 */
function open(build: (w: StepText) => number, opts: Parameters<typeof stepToScene>[1] = {}, unit: 'mm' | 'inch' = 'mm') {
  const w = new StepText();
  const ctx = w.context(unit);
  w.product('p', [build(w)], ctx);
  const scene = stepToScene(w.bytes(), opts);
  const tables = (scene.meta as { faceTables?: StepFaceTable[] }).faceTables ?? [];
  return { scene, props: tables[0]?.props };
}

/** props → 부피·무게중심·무게중심 기준 2차 모멘트 */
function central(p: Float64Array): Expect {
  const V = p[0]!;
  const M: P3 = [p[1]!, p[2]!, p[3]!];
  const c: P3 = [p[10]! + M[0] / V, p[11]! + M[1] / V, p[12]! + M[2] / V];
  const S: Sym = [p[4]! - (M[0] * M[0]) / V, p[5]! - (M[1] * M[1]) / V, p[6]! - (M[2] * M[2]) / V, p[7]! - (M[0] * M[1]) / V, p[8]! - (M[1] * M[2]) / V, p[9]! - (M[2] * M[0]) / V];
  return { V, c, S };
}

/** 상대 오차: 부피, 무게중심(크기 대비), 2차 모멘트(V·크기² 대비) */
function relErr(got: Expect, want: Expect, size: number): { V: number; c: number; S: number } {
  return {
    V: Math.abs(got.V - want.V) / want.V,
    c: Math.max(...got.c.map((x, k) => Math.abs(x - want.c[k]!))) / size,
    S: Math.max(...got.S.map((x, k) => Math.abs(x - want.S[k]!))) / (want.V * size * size),
  };
}

const CASES: { name: string; build: (w: StepText) => number; want: Expect; size: number }[] = [
  { name: '정육면체(자리 옮김)', build: (w) => cube(w, 10, [3, -4, 5]).solid, want: boxExpect(10, 10, 10, [3, -4, 5]), size: 10 },
  { name: '원기둥', build: (w) => cylinder(w, 5, 20), want: revolved(() => 5, 0, 20), size: 20 },
  { name: '구', build: (w) => sphere(w, 7), want: { V: (4 / 3) * Math.PI * 343, c: [0, 0, 0], S: [0, 1, 2].map(() => ((4 / 3) * Math.PI * 343 * 49) / 5).concat([0, 0, 0]) as Sym }, size: 14 },
  { name: '원환', build: (w) => torus(w, 10, 3), want: torusExpect(10, 3), size: 26 },
  { name: '회전 곡면(원 윤곽) 원환', build: (w) => revTorus(w, 10, 3), want: torusExpect(10, 3), size: 26 },
  { name: '회전 곡면(B-스플라인 윤곽, 매듭 하나) 꽃병', build: (w) => vase(w), want: revolved(vaseRho, 0, VASE_H, [VASE_H * VASE_KNOT]), size: 18 },
  { name: '회전 곡면 꽃병(윤곽 이음선 모서리 없이 위·아래 원만)', build: (w) => vase(w, false), want: revolved(vaseRho, 0, VASE_H, [VASE_H * VASE_KNOT]), size: 18 },
  { name: '구멍 판', build: (w) => plateWithHole(w), want: minus(boxExpect(20, 10, 2), { ...revolved(() => 2, 0, 2), c: [10, 5, 1] }), size: 20 },
  { name: '원뿔대', build: (w) => frustum(w, 6, 2, 8), want: revolved((z) => 6 + ((2 - 6) * z) / 8, 0, 8), size: 12 },
  { name: '원뿔(꼭짓점 극)', build: (w) => cone(w, 4, 9), want: revolved((z) => 4 * (1 - z / 9), 0, 9), size: 9 },
];

describe('B-rep 질량 속성(곡면 적분)', () => {
  for (const c of CASES)
    it(`${c.name}: 부피·무게중심·2차 모멘트가 닫힌 식과 상대 1e-9 안, 곡면 적분(PROPS_BREP)·어림 오차 0 수준`, () => {
      const { scene, props } = open(c.build);
      expect(scene.meshes[0]!.closed).toBe(true);
      expect(props).toBeDefined();
      expect(props!.length).toBe(PROPS_LEN);
      expect(props![14]).toBe(PROPS_BREP);
      const e = relErr(central(props!), c.want, c.size);
      expect(e.V).toBeLessThan(1e-9);
      expect(e.c).toBeLessThan(1e-9);
      expect(e.S).toBeLessThan(1e-9);
      expect(props![13]! / c.want.V).toBeLessThan(1e-9);
      // 화면용 삼각형 값은 곡면에서 그보다 훨씬 어긋난다(보통 품질) — 적분이 삼각형을 그대로 쓰지 않았다는 확인
      const tri = localProps(scene.meshes[0]!);
      if (c.name !== '정육면체(자리 옮김)') expect(Math.abs(tri.volume - c.want.V) / c.want.V).toBeGreaterThan(1e-5);
    });

  it('곡면 품질을 바꿔도 같은 값(삼각형 수와 상관없다)', () => {
    const a = open((w) => torus(w, 10, 3)).props!;
    const b = open((w) => torus(w, 10, 3), { tolerance: 0.0001, angleTolerance: 5 }).props!;
    for (let k = 0; k < 10; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThan(1e-9 * Math.max(1, Math.abs(a[k]!)));
  });

  it('큰 좌표(1e6 mm 떨어진 정육면체)도 무게중심 기준 2차 모멘트가 맞는다', () => {
    const o: P3 = [1e6, 2e6, -3e5];
    const { props } = open((w) => cube(w, 10, o).solid);
    const e = relErr(central(props!), boxExpect(10, 10, 10, o), 10);
    expect(e.V).toBeLessThan(1e-9);
    expect(e.S).toBeLessThan(1e-7);
  });

  it('mm 조립에 놓인 인치 부품: 장면 단위(mm)로 바꾼 값(부피 k³·모멘트 k⁴·k⁵·기준점 k)', () => {
    const w = new StepText();
    const mm = w.context('mm');
    const inch = w.context('inch');
    const part = w.product('p', [cylinder(w, 1, 2)], inch);
    const at = w.ax2([0, 0, 0]);
    const root = w.product('asm', [at], mm, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    const s = stepToScene(w.bytes());
    expect(s.units).toBe('mm');
    const props = (s.meta as { faceTables: StepFaceTable[] }).faceTables[0]!.props!;
    const k = 25.4;
    const e = relErr(central(props), revolved(() => 1 * k, 0, 2 * k), 2 * k);
    expect(e.V).toBeLessThan(1e-9);
    expect(e.c).toBeLessThan(1e-9);
    expect(e.S).toBeLessThan(1e-9);
    const p = new Float64Array(PROPS_LEN).fill(1);
    const q = scaleProps(p, 2);
    expect([q[0], q[1], q[4], q[10], q[13], q[14]]).toEqual([8, 16, 32, 2, 8, 1]);
  });

  it('원을 민 곡면(SURFACE_OF_LINEAR_EXTRUSION) 옆면도 곡면 적분 — 원기둥과 상대 1e-9 안, 어림 오차 0 수준', () => {
    const { props } = open((w) => sideCylinder(w, 5, 20, 'extrusion'));
    expect(props![14]).toBe(PROPS_BREP);
    const e = relErr(central(props!), revolved(() => 5, 0, 20), 20);
    expect(Math.max(e.V, e.c, e.S)).toBeLessThan(1e-9);
    expect(props![13]! / (Math.PI * 25 * 20)).toBeLessThan(1e-9);
  });

  it('적분하지 않는 곡면(원기둥을 띄운 OFFSET_SURFACE 옆면)이 섞이면 그 면만 삼각형 + 띠로, 어림 오차 안에 참값이 든다', () => {
    const { props } = open((w) => sideCylinder(w, 5, 20, 'offset'));
    const want = revolved(() => 5, 0, 20);
    expect(props![14]).toBe(PROPS_BREP);
    const got = central(props!);
    const bound = props![13]!;
    expect(bound).toBeGreaterThan(0);
    expect(Math.abs(got.V - want.V)).toBeLessThanOrEqual(bound);
    // 어림 오차는 삼각형 값의 실제 오차보다 작지 않다(닫힌 겉면이라 띠가 없으면 이보다 훨씬 어긋난다)
    expect(bound / want.V).toBeLessThan(0.05);
  });

  it('시간 한도를 넘으면 삼각형 값(PROPS_TIMEOUT)과 그 어림 오차, 장면 통계에 개수', () => {
    const { scene, props } = open((w) => cylinder(w, 5, 20), { propsBudget: { minMs: -1, share: 0 } });
    expect(props![14]).toBe(PROPS_TIMEOUT);
    expect(props![13]).toBeGreaterThan(0);
    const tri = localProps(scene.meshes[0]!);
    expect(Math.abs(props![0]! - tri.volume) / tri.volume).toBeLessThan(1e-6);
    expect((scene.meta as { stats: { propsTimedOut?: number } }).stats.propsTimedOut).toBe(1);
  });

  it('질량 속성을 끄면(props: false) 면 표에 없다', () => {
    expect(open((w) => cylinder(w, 5, 20), { props: false }).props).toBeUndefined();
  });

  it('physProps: B-rep 값이면 정확(≈ 없음) — 원기둥 강철의 질량·관성, 자리 돌림(90°)과 옮김', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('cyl', [cylinder(w, 5, 10)], ctx);
    // x축으로 90° 돌려(z → -y) (100, 0, 0)에
    const at = w.ax2([100, 0, 0], [1, 0, 0], [0, 0, 1]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'c1');
    const s = stepToScene(w.bytes());
    const doc = createDoc('c.stp', 1, { scene: s, ms: 0 });
    const p = physProps(s.meshes, null, { faces: doc.faces, sceneMm: 1, picked: 7850 });
    expect(p.exact).toBe(true);
    expect(p.volumeBound).not.toBeNull();
    const V = Math.PI * 25 * 10;
    expect(Math.abs(p.volume - V) / V).toBeLessThan(1e-12);
    const m = 7850 * V * 1e-9;
    expect(Math.abs(p.mass! - m) / m).toBeLessThan(1e-12);
    const r = 0.005;
    const h = 0.01;
    // 주 관성: 축 둘레 m r²/2(하나), 가로 m(3r² + h²)/12(둘)
    const Ia = (m * r * r) / 2;
    const It = (m * (3 * r * r + h * h)) / 12;
    const want = [Ia, It, It].sort((a, b) => a - b);
    p.inertia!.principal.forEach((x, i) => expect(Math.abs(x - want[i]!) / want[i]!).toBeLessThan(1e-9));
    // 무게중심: 놓인 자리 원점 + 돌린 축의 가운데
    const cz = 5;
    const cen = p.centroid!;
    expect(Math.hypot(cen[0] - 100, cen[1], cen[2]) - cz).toBeLessThan(1e-9);
    // 면 표 없이(옛 결과)는 삼각형 값 — 어림 오차를 모른다
    const old = physProps(s.meshes, null, { sceneMm: 1, picked: 7850 });
    expect(old.exact).toBe(false);
    expect(old.volumeBound).toBeNull();
  });

  it('정확도 글: 정확 · 근삿값(±유효 두 자리 %) · 아주 작으면 미만 · 어림 오차를 모르면 화면용 삼각형', () => {
    expect(accuracyText({ exact: true, volumeBound: 0, volume: 1 }).text).toBe('정확(B-rep 곡면 적분)');
    expect(accuracyText({ exact: false, volumeBound: 0.00083, volume: 1 }).text).toBe('근삿값(±0.083%)');
    expect(accuracyText({ exact: false, volumeBound: 0.0123, volume: 1 }).text).toBe('근삿값(±1.2%)');
    expect(accuracyText({ exact: false, volumeBound: 1e-9, volume: 1 }).text).toBe('근삿값(±0.001% 미만)');
    expect(accuracyText({ exact: false, volumeBound: null, volume: 1 }).text).toBe('근삿값(화면용 삼각형)');
    // 표시 언어의 수 꼴(소수점 쉼표 등)은 넘겨준 함수로
    expect(accuracyText({ exact: false, volumeBound: 0.0123, volume: 1 }, (v) => String(v).replace('.', ',')).text).toBe('근삿값(±1,2%)');
  });

  it('faceFlux·trianglesFlux·띠: 평면 정사각형 면 하나와 그 삼각형 둘이 같은 흐름 값, 곧은 띠는 0', () => {
    // z = 1 평면 위 [0,2]×[0,3] 사각형(법선 +z): 3V 몫 = ∬ q·n = 넓이 × 1
    const plane = { kind: 'plane' } as never;
    expect(Number.isNaN(faceFlux(plane, [], [0, 0, 0], () => null, new Float64Array(FLUX)))).toBe(true);
    const tri = new Float64Array(FLUX);
    trianglesFlux(tri, [0, 0, 1, 2, 0, 1, 2, 3, 1, 0, 3, 1], [0, 1, 2, 0, 2, 3], 0, 2, [0, 0, 0]);
    expect(tri[0]).toBeCloseTo(6, 12);
    expect(tri[12]).toBeCloseTo(6, 12);
    const sl = new Float64Array(FLUX);
    addSliverFlux(sl, [0, 0, 0], [1, 0, 0], lineCurve([0, 0, 0], [1, 0, 0]), 0, 1, [0, 0, 0]);
    expect(sl.every((x) => Math.abs(x) < 1e-15)).toBe(true);
  });
});

describe('B-스플라인 곡면·B-스플라인 곡선을 민 곡면 질량 속성(곡면 적분)', () => {
  const SPLINE: { name: string; build: (w: StepText) => number; want: Expect; size: number; curved: boolean }[] = [
    { name: '여섯 면이 비선형 매개변수 B-스플라인 평면인 상자(자리 옮김)', build: (w) => splineBox(w, 10, 6, 4, [3, -2, 5]), want: boxExpect(10, 6, 4, [3, -2, 5]), size: 13, curved: false },
    { name: '위가 B-스플라인 곡면, 옆 윗변이 B-스플라인 곡선인 블록', build: (w) => roofBlock(w, 12, 8), want: roofExpect(12, 8), size: 16, curved: true },
    { name: 'B-스플라인 곡선을 민 곡면이 옆면인 기둥', build: (w) => splinePrism(w, 10, 5), want: prismExpect(10, 5), size: 13, curved: true },
    { name: 'u로 닫힌 B-스플라인 관(이음선 모서리 없이 위·아래 닫힌 곡선만, 높이는 v의 비선형 3차)', build: (w) => splineTube(w, 9), want: tubeExpect(9), size: 15, curved: true },
  ];
  for (const c of SPLINE)
    it(`${c.name}: 부피·무게중심·2차 모멘트가 닫힌 식과 상대 1e-9 안, 곡면 적분(PROPS_BREP)·어림 오차 0 수준`, () => {
      const { scene, props } = open(c.build);
      expect(scene.meshes[0]!.closed).toBe(true);
      expect(props![14]).toBe(PROPS_BREP);
      const e = relErr(central(props!), c.want, c.size);
      expect(e.V).toBeLessThan(1e-9);
      expect(e.c).toBeLessThan(1e-9);
      expect(e.S).toBeLessThan(1e-9);
      expect(props![13]! / c.want.V).toBeLessThan(1e-9);
      const tri = localProps(scene.meshes[0]!);
      if (c.curved) expect(Math.abs(tri.volume - c.want.V) / c.want.V).toBeGreaterThan(1e-6);
    });

  it('적분 규칙: n점 가우스는 2n−1차, 15점 크론로드는 22차, 그 안의 7점 가우스는 13차 다항식까지 정확', () => {
    const exact = (k: number) => (k % 2 ? 0 : 2 / (k + 1));
    for (const n of [1, 3, 8, 15, 23]) {
      const g = gaussRule(n);
      for (let k = 0; k <= 2 * n - 1; k++) {
        let s = 0;
        for (let i = 0; i < g.length; i += 2) s += g[i + 1]! * g[i]! ** k;
        expect(Math.abs(s - exact(k))).toBeLessThan(1e-14);
      }
    }
    const sum = (k: number, col: 1 | 2) => KRONROD15.reduce((s, row) => s + row[col] * (row[0] ? row[0] ** k + (-row[0]) ** k : k === 0 ? 1 : 0), 0);
    for (let k = 0; k <= 22; k++) expect(Math.abs(sum(k, 1) - exact(k))).toBeLessThan(1e-14);
    for (let k = 0; k <= 13; k++) expect(Math.abs(sum(k, 2) - exact(k))).toBeLessThan(1e-14);
    expect(Math.abs(sum(24, 1) - exact(24))).toBeGreaterThan(1e-12);
  });

  it('유리 B-스플라인(NURBS) 원기둥 옆면: 근삿값이지만 어림 오차 안에 참값이 들고 어림 오차가 아주 작다', () => {
    const { props } = open((w) => nurbsCylinder(w, 5, 20));
    expect(props![14]).toBe(PROPS_BREP);
    const want = revolved(() => 5, 0, 20);
    const got = central(props!);
    const bound = props![13]!;
    expect(Math.abs(got.V - want.V)).toBeLessThanOrEqual(bound + 1e-12 * want.V);
    expect(bound / want.V).toBeLessThan(1e-7);
    const e = relErr(got, want, 20);
    expect(Math.max(e.V, e.c, e.S)).toBeLessThan(1e-9);
  });
});

/**
 * 반지름 rad·높이 h 원기둥의 위·아래 원과 이음선을 반지름 방향으로 dr, 위아래로 dz 바깥에 둔 입체(모서리 곡선이 원기둥 곡면·평면에서 떨어졌다).
 * 원기둥 곡면·두 평면은 그대로라 곡면들이 둘러싼 부피는 π·rad²·h — 곡선이 곡면에서 떨어진 거리만큼은 모형의 허용 오차다
 */
function offCylinder(w: StepText, rad: number, h: number, dr: number, dz: number): number {
  const R = rad + dr;
  const V0 = w.vertex([R, 0, -dz]);
  const V1 = w.vertex([R, 0, h + dz]);
  const C0 = w.edge(V0, V0, w.circle([0, 0, -dz], R));
  const C1 = w.edge(V1, V1, w.circle([0, 0, h + dz], R));
  const L = w.edge(V0, V1, w.line([R, 0, -dz], [R, 0, h + dz]));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  const surf = w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2([0, 0, 0])},${r(rad)}`);
  const side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'offcyl');
}

/** 반지름 R 구를 가운데에서 d 떨어진 기울어진 평면(법선 n)으로 자른 조각. 평면 위 원 모서리의 반지름만 dr 바꿔 구에서 떨어지게 한다 */
function offCap(w: StepText, R: number, d: number, dr: number, n: P3): number {
  const L = Math.hypot(...n);
  const z: P3 = [n[0] / L, n[1] / L, n[2] / L];
  const x0: P3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dd = x0[0] * z[0] + x0[1] * z[1] + x0[2] * z[2];
  const xr: P3 = [x0[0] - dd * z[0], x0[1] - dd * z[1], x0[2] - dd * z[2]];
  const xl = Math.hypot(...xr);
  const x: P3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
  const o: P3 = [z[0] * d, z[1] * d, z[2] * d];
  const rc = Math.sqrt(R * R - d * d) + dr;
  const V0 = w.vertex([o[0] + rc * x[0], o[1] + rc * x[1], o[2] + rc * x[2]]);
  const C = w.edge(V0, V0, w.circle(o, rc, z, x));
  // 평면 바깥 법선은 −n(조각은 n·p ≥ d 쪽)
  const pl = w.face([w.bound(w.loop([w.oe(C, false)]))], w.plane(o, z, x), false);
  const surf = w.add('SPHERICAL_SURFACE', `'',#${w.ax2([0, 0, 0], z, x)},${r(R)}`);
  const cap = w.face([w.bound(w.loop([w.oe(C, true)]))], surf);
  return w.solid([pl, cap], 'offcap');
}

describe('모서리 곡선이 곡면에서 조금 떨어진 입체: 두 면이 각자 되짚은 경계에서 곡선까지 띠로 이어 겉면을 닫는다', () => {
  it('원기둥의 위·아래 원·이음선이 반지름 방향으로 1e-3 바깥: 두 띠가 평면 위에서 지워져 닫힌 식 그대로, 어림 오차는 관 단면(π·d²)이라 아주 작다', () => {
    const { props } = open((w) => offCylinder(w, 5, 20, 1e-3, 0));
    expect(props![14]).toBe(PROPS_BREP);
    const want = revolved(() => 5, 0, 20);
    const got = central(props!);
    const e = relErr(got, want, 20);
    expect(Math.max(e.V, e.c, e.S)).toBeLessThan(1e-9);
    const bound = props![13]!;
    expect(Math.abs(got.V - want.V)).toBeLessThanOrEqual(bound);
    // 1차 어림(떨어진 거리 × 거리 × 길이 / 3)이면 상대 1e-4 수준 — 관 단면은 d²라 그 천분의 일 밑
    expect(bound / want.V).toBeLessThan(1e-6);
  });

  it('원이 반지름 방향(dr)과 위아래(dz)로 함께 떨어지면 모서리마다 dr × dz 사각형 둘레만큼(−2·2π·R·dr·dz) 다르고, 그것도 어림 오차 안', () => {
    const R = 5;
    for (const [dr, dz] of [
      [1e-3, -2e-3],
      [1e-4, 1e-4],
    ] as const) {
      const { props } = open((w) => offCylinder(w, R, 20, dr, dz));
      expect(props![14]).toBe(PROPS_BREP);
      const err = props![0]! - Math.PI * R * R * 20;
      const corner = -2 * 2 * Math.PI * (R + dr / 2) * dr * dz;
      expect(Math.abs(err - corner)).toBeLessThan(1e-3 * Math.abs(corner));
      expect(Math.abs(err)).toBeLessThanOrEqual(props![13]!);
    }
  });

  it('구 조각: 기울어진 평면 위 원의 반지름이 구에서 1e-4 어긋나도 참값이 어림 오차 안, 어림 오차 상대 1e-8 밑', () => {
    const R = 7;
    for (const [d, dr] of [
      [2, 1e-4],
      [-3, -1e-4],
    ] as const) {
      const { props } = open((w) => offCap(w, R, d, dr, [1, 2, 3]));
      expect(props![14]).toBe(PROPS_BREP);
      const h = R - d;
      const V = (Math.PI * h * h * (3 * R - h)) / 3;
      expect(Math.abs(props![0]! - V)).toBeLessThanOrEqual(props![13]!);
      expect(props![13]! / V).toBeLessThan(1e-8);
    }
  });

  it('B-스플라인 관: 위 닫힌 곡선이 옆 곡면에서 바깥으로 떨어져도(정의역 끝에 걸린 되짚기) 띠가 위 평면과 지워져 닫힌 식 그대로', () => {
    const { props } = open((w) => splineTube(w, 9, 1 + 1e-4));
    expect(props![14]).toBe(PROPS_BREP);
    const want = tubeExpect(9);
    const got = central(props!);
    const e = relErr(got, want, 15);
    expect(Math.max(e.V, e.c, e.S)).toBeLessThan(1e-9);
    expect(Math.abs(got.V - want.V)).toBeLessThanOrEqual(props![13]!);
    expect(props![13]! / want.V).toBeLessThan(1e-6);
  });
});
