/**
 * 두 개체 사이 측정(순수, DOM 없음): 고른 면·모서리·점을 측정용 개체(평면·축·원·직선·점)로 보고 해석적으로 잰다.
 *
 * - 평면–평면: 평행이면 면 사이 거리, 아니면 사이 각(0~90°)
 * - 축–축(원기둥·원뿔 면, 원호 모서리의 축): 평행이면 축 사이 거리(구멍 피치), 아니면 사이 각과 꼬인 축의 최단 거리
 * - 원–원(원호 모서리·원환): 중심 거리, 평면–축: 축이 평면과 나란하면 거리, 아니면 각
 * - 축·직선–원: 원 중심에서 축·모서리까지(원 축이 나란한 축이면 "축 사이 거리"), 누른 차례와 상관없이 같은 결과
 * - 점–평면·점–축·점–직선·점–점: 거리, 직선–직선: 사이 각과 최단 거리(나란하면 거리)
 * 결과는 값 줄(이름표 + 값)과 코어 덧그림(setAnnotations의 distance·angle·point). 이름표는 화면 글(번역), 값은 부르는 쪽이 Fmt로 쓴다.
 * 해석적으로 못 재는 개체(B-스플라인 면 등)는 누른 점으로 다룬다. 몸체 사이 최소 거리는 앱이 코어 closestPoints로 더한다.
 */

export type V3 = [number, number, number];

export type Entity =
  | { type: 'plane'; label: string; point: V3; normal: V3; meshId?: string }
  | { type: 'axis'; label: string; origin: V3; dir: V3; radius?: number; meshId?: string }
  | { type: 'circle'; label: string; center: V3; normal: V3; radius: number; meshId?: string }
  | { type: 'line'; label: string; a: V3; b: V3; meshId?: string }
  | { type: 'point'; label: string; point: V3; meshId?: string };

export interface MeasureLine {
  /** 이름표(번역할 화면 글) */
  label: string;
  /** 'length'면 장면 단위 길이, 'angle'이면 도 */
  unit: 'length' | 'angle';
  value: number;
  /** 화면용 삼각형·선분으로 잰 근삿값(≈) */
  approx?: boolean;
}

export interface Annotation {
  kind: 'distance' | 'angle' | 'point';
  a: V3;
  b?: V3;
  c?: V3;
  /** 이 덧그림이 가리키는 값 줄 번호(글자를 붙일 때) */
  line?: number;
}

export interface EntityMeasure {
  lines: MeasureLine[];
  annotations: Annotation[];
}

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const len = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): V3 => {
  const l = len(a);
  return l > 0 ? [a[0]! / l, a[1]! / l, a[2]! / l] : [a[0]!, a[1]!, a[2]!];
};
const deg = (r: number) => (r * 180) / Math.PI;
/** 나란함 판정(사이 각이 이보다 작으면 나란하다, 라디안) */
const PARALLEL = (0.01 * Math.PI) / 180;

/** 개체의 기준점(덧그림을 붙일 자리) */
export function anchorOf(e: Entity): V3 {
  switch (e.type) {
    case 'plane':
      return e.point;
    case 'axis':
      return e.origin;
    case 'circle':
      return e.center;
    case 'line':
      return scale(add(e.a, e.b), 0.5);
    case 'point':
      return e.point;
  }
}

/** 점 p를 축(o, d) 위에 내린 발 */
function footOnLine(p: V3, o: V3, d: V3): V3 {
  return add(o, scale(d, dot(sub(p, o), d)));
}

/** 점 p를 선분 a–b 위 가장 가까운 점으로 */
function footOnSegment(p: V3, a: V3, b: V3): V3 {
  const d = sub(b, a);
  const l2 = dot(d, d);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return add(a, scale(d, t));
}

/** 두 직선(o1+d1 s, o2+d2 t)의 가장 가까운 두 점(나란하면 null) */
function closestLines(o1: V3, d1: V3, o2: V3, d2: V3): [V3, V3] | null {
  const r = sub(o1, o2);
  const a = dot(d1, d1);
  const b = dot(d1, d2);
  const c = dot(d2, d2);
  const d = dot(d1, r);
  const e = dot(d2, r);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-12 * a * c) return null;
  const s = (b * e - c * d) / den;
  const t = (a * e - b * d) / den;
  return [add(o1, scale(d1, s)), add(o2, scale(d2, t))];
}

/**
 * 두 선분 p1–q1, p2–q2의 가장 가까운 두 점(닫힌 꼴 — Ericson, Real-Time Collision Detection 5.1.9).
 * 길이 0인 선분은 점으로, 나란한 선분은 한쪽 끝을 기준으로 잰다(어느 쌍이든 거리는 같다)
 */
export function closestSegments(p1: V3, q1: V3, p2: V3, q2: V3): [V3, V3] {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const tiny = 1e-24 * Math.max(1, a, e);
  let s: number;
  let t: number;
  if (a <= tiny && e <= tiny) return [[...p1] as V3, [...p2] as V3];
  if (a <= tiny) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= tiny) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      // 나란하면(denom ≈ 0) 아무 s나 — 0에서 시작해 t를 구하고 다시 자른다
      s = denom > 1e-14 * a * e ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return [add(p1, scale(d1, s)), add(p2, scale(d2, t))];
}

/** 축 개체로 볼 수 있으면(축·원·직선) 축 */
function asAxis(e: Entity): { o: V3; d: V3; ref: V3 } | null {
  if (e.type === 'axis') return { o: e.origin, d: unit(e.dir), ref: e.origin };
  if (e.type === 'circle') return { o: e.center, d: unit(e.normal), ref: e.center };
  if (e.type === 'line') return { o: e.a, d: unit(sub(e.b, e.a)), ref: anchorOf(e) };
  return null;
}

/** 점 개체로 볼 수 있으면(점·원 중심) 그 점 */
function asPoint(e: Entity): V3 | null {
  if (e.type === 'point') return e.point;
  if (e.type === 'circle') return e.center;
  return null;
}

/** 각 덧그림: 꼭짓점 v에서 두 방향 u·w로 길이 r만큼 */
function angleAnn(v: V3, u: V3, w: V3, r: number, line: number): Annotation {
  return { kind: 'angle', a: v, b: add(v, scale(unit(u), r)), c: add(v, scale(unit(w), r)), line };
}

/** 두 개체 측정. size는 덧그림 크기 기준(장면 범위 대각선 등) */
export function measureEntities(A: Entity, B: Entity, size = 1): EntityMeasure {
  const lines: MeasureLine[] = [];
  const anns: Annotation[] = [];
  const dist = (label: string, p: V3, q: V3) => {
    lines.push({ label, unit: 'length', value: len(sub(q, p)) });
    anns.push({ kind: 'distance', a: p, b: q, line: lines.length - 1 });
  };
  const arm = Math.max(size * 0.08, 1e-9);
  // 길이 0인 직선 모서리는 점으로
  const asPt = (e: Entity): Entity => (e.type === 'line' && len(sub(e.b, e.a)) <= 1e-12 * Math.max(1, len(e.a)) ? { type: 'point', label: e.label, point: e.a, ...(e.meshId ? { meshId: e.meshId } : {}) } : e);
  A = asPt(A);
  B = asPt(B);
  // 순서를 맞춘다(누른 차례와 상관없이 같은 결과): 평면 > 축 > 직선 > 원 > 점
  const RANK = { plane: 0, axis: 1, line: 2, circle: 3, point: 4 } as const;
  if (RANK[B.type] < RANK[A.type]) [A, B] = [B, A];

  if (A.type === 'plane' && B.type === 'plane') {
    const n1 = unit(A.normal);
    const n2 = unit(B.normal);
    const c = Math.abs(dot(n1, n2));
    if (Math.acos(Math.min(1, c)) < PARALLEL) {
      // A의 기준점에서 B 평면에 내린 발
      const foot = sub(A.point, scale(n1, dot(sub(A.point, B.point), n1)));
      dist('평행 면 거리', A.point, foot);
    } else {
      const ang = Math.acos(Math.min(1, c));
      lines.push({ label: '면 사이 각', unit: 'angle', value: deg(ang) });
      // 교선 위 꼭짓점에서 두 면 안쪽(각 면 가운데 쪽) 방향
      const l = unit(cross(n1, n2));
      const mid = scale(add(A.point, B.point), 0.5);
      const p0 = closestLines(A.point, cross(n1, l), B.point, cross(n2, l));
      const v = p0 ? footOnLine(mid, scale(add(p0[0], p0[1]), 0.5), l) : mid;
      const u = sub(A.point, v);
      const w = sub(B.point, v);
      const pu = sub(u, scale(l, dot(u, l)));
      const pw = sub(w, scale(l, dot(w, l)));
      anns.push(angleAnn(v, pu, pw, arm, lines.length - 1));
    }
    return { lines, annotations: anns };
  }
  if (A.type === 'plane') {
    const n = unit(A.normal);
    const pt = asPoint(B);
    if (pt) {
      const foot = sub(pt, scale(n, dot(sub(pt, A.point), n)));
      dist(B.type === 'circle' ? '중심–면 거리' : '점–면 거리', pt, foot);
      return { lines, annotations: anns };
    }
    const ax = asAxis(B)!;
    const s = Math.abs(dot(n, ax.d));
    if (s < Math.sin(PARALLEL)) {
      const foot = sub(ax.ref, scale(n, dot(sub(ax.ref, A.point), n)));
      dist(B.type === 'line' ? '모서리–면 거리' : '축–면 거리', ax.ref, foot);
    } else {
      const ang = Math.asin(Math.min(1, s));
      lines.push({ label: B.type === 'line' ? '모서리–면 각' : '축–면 각', unit: 'angle', value: deg(ang) });
      // 축이 평면을 뚫는 점에서 축 방향과 그 평면 위 그림자 방향
      const t = dot(sub(A.point, ax.o), n) / dot(ax.d, n);
      const v = add(ax.o, scale(ax.d, t));
      const d = dot(ax.d, n) > 0 ? ax.d : scale(ax.d, -1);
      const shadow = sub(d, scale(n, dot(d, n)));
      anns.push(angleAnn(v, scale(d, -1), len(shadow) > 1e-9 ? shadow : cross(n, [1, 0, 0]), arm, lines.length - 1));
    }
    return { lines, annotations: anns };
  }
  const pa = asPoint(A);
  const pb = asPoint(B);
  if (pa && pb) {
    dist(A.type === 'circle' && B.type === 'circle' ? '중심 거리' : '거리', pa, pb);
    if (A.type === 'circle' && B.type === 'circle') {
      const ang = Math.acos(Math.min(1, Math.abs(dot(unit(A.normal), unit(B.normal)))));
      if (ang >= PARALLEL) lines.push({ label: '축 사이 각', unit: 'angle', value: deg(ang) });
    }
    return { lines, annotations: anns };
  }
  const xa = asAxis(A)!;
  // 축·직선 모서리 – 원: 원 중심에서 축(무한 직선)·모서리(선분)까지. 원의 축이 나란한 축이면 축 사이 거리(구멍 피치)
  if (B.type === 'circle') {
    const cn = unit(B.normal);
    const par = Math.acos(Math.min(1, Math.abs(dot(cn, xa.d)))) < PARALLEL;
    const foot = A.type === 'line' ? footOnSegment(B.center, A.a, A.b) : footOnLine(B.center, xa.o, xa.d);
    dist(A.type === 'line' ? '중심–모서리 거리' : par ? '축 사이 거리' : '중심–축 거리', B.center, foot);
    if (A.type === 'axis' && !par) lines.push({ label: '축 사이 각', unit: 'angle', value: deg(Math.acos(Math.min(1, Math.abs(dot(cn, xa.d))))) });
    return { lines, annotations: anns };
  }
  if (pb) {
    // 축류–점: 직선 모서리는 선분까지, 축은 무한 직선까지
    const foot = A.type === 'line' ? footOnSegment(pb, A.a, A.b) : footOnLine(pb, xa.o, xa.d);
    dist(A.type === 'line' ? '점–모서리 거리' : '점–축 거리', pb, foot);
    return { lines, annotations: anns };
  }
  const xb = asAxis(B)!;
  const c = Math.abs(dot(xa.d, xb.d));
  const ang = Math.acos(Math.min(1, c));
  if (ang < PARALLEL) {
    // 나란한 축·직선: 축 사이 거리(구멍 피치)
    const foot = footOnLine(xa.ref, xb.o, xb.d);
    dist(A.type === 'line' && B.type === 'line' ? '평행 모서리 거리' : '축 사이 거리', xa.ref, foot);
    return { lines, annotations: anns };
  }
  lines.push({ label: A.type === 'line' && B.type === 'line' ? '모서리 사이 각' : '축 사이 각', unit: 'angle', value: deg(ang) });
  const angLine = lines.length - 1;
  // 최단 거리: 둘 다 직선 모서리면 선분끼리, 아니면 축(무한 직선)끼리
  const pq = A.type === 'line' && B.type === 'line' ? closestSegments(A.a, A.b, B.a, B.b) : closestLines(xa.o, xa.d, xb.o, xb.d);
  if (pq) {
    const d = len(sub(pq[1], pq[0]));
    if (d > 1e-9 * Math.max(1, size)) dist('최단 거리', pq[0], pq[1]);
    const v = pq[0];
    const da = dot(sub(xa.ref, v), xa.d) >= 0 ? xa.d : scale(xa.d, -1);
    const db = dot(sub(xb.ref, pq[1]), xb.d) >= 0 ? xb.d : scale(xb.d, -1);
    anns.push(angleAnn(v, da, db, arm, angLine));
  }
  return { lines, annotations: anns };
}

/** 개체 하나의 요약(이름표, 덧그림): 원은 중심 점, 그 밖은 기준점 */
export function entityAnnotation(e: Entity): Annotation {
  return { kind: 'point', a: anchorOf(e) };
}
