/**
 * 간섭 검사(순수, DOM 없음 — 워커에서 돈다): 서로 다른 그물(부품 자리) 사이에서 삼각형이 서로 뚫고 지나가는 곳을 찾는다.
 *
 * 1. 그물마다 세계 좌표(matrix·origin)로 바꾸고 범위 상자를 구한다.
 * 2. 범위 상자가 겹치는 쌍만(x축으로 정렬해 쓸어 나간다), 겹친 상자 안 삼각형만 격자 칸에 나눠 담는다.
 * 3. 같은 칸의 삼각형 쌍을 Möller 방식으로 시험한다. 서로의 평면 양쪽으로 eps보다 깊이 걸쳐야 교차로 친다 —
 *    맞닿은 면(같은 평면에 놓임)·모서리 접촉은 간섭이 아니다(조립에서 흔하다).
 * 4. 겉면이 서로 뚫지 않은 쌍 가운데 한쪽 범위 상자가 다른 쪽 상자 안에 들면(둘 다 닫힌 입체일 때만), 안쪽 입체 속의 점 몇 개가
 *    바깥 입체 안인지 +x 광선이 지나는 삼각형 수의 홀짝으로 보고 과반이면 "안에 듦"(inside)으로 알린다 — 통째로 들어간 부품,
 *    같은 자리에 겹쳐 놓인 부품. 빈 곳(BREP_WITH_VOIDS) 안에 든 부품은 홀짝이 짝수라 안에 들지 않은 것으로 친다.
 *    점은 안쪽 입체의 넓은 삼각형 가운데에서 바깥 법선 반대로 조금 들인 자리라 맞닿은 면 위에 놓이지 않는다. 열린 면 모형은 건너뛴다.
 *
 * 그물 하나가 여러 쌍에 들므로 삼각형마다의 범위 상자와 평면(법선·길이·원점 거리)은 그물마다 처음 쓸 때 한 번 구해 쌍 사이에 다시 쓰고,
 * 삼각형 쌍 시험은 새 배열을 만들지 않는다. 시험하는 삼각형 쌍과 그 차례·셈은 쌍마다 꼭짓점을 다시 읽어 고르던 때와 같아
 * 결과(쌍·교차 수·강조 삼각형)가 같다.
 */

type V3 = [number, number, number];

export interface InterferenceMesh {
  id: string;
  positions: Float32Array;
  indices?: Uint32Array;
  matrix?: ArrayLike<number>;
  origin?: readonly number[];
  /** 닫힌 입체(안에 듦을 볼 때만 쓴다 — 열린 면은 안팎이 없다) */
  closed?: boolean;
}

export interface InterferencePair {
  a: string;
  b: string;
  /** 교차하는 삼각형 쌍 수 */
  count: number;
  /** 강조할 삼각형 번호(그물마다, 많으면 앞의 limit개) */
  trisA: number[];
  trisB: number[];
  /** 겉면은 만나지 않고 a가 b 안에 통째로 들었다(count 0, 삼각형 없음) */
  inside?: true;
  /** 겹친 부피(세계 단위³, 두 그물이 모두 닫힌 입체일 때 — 검사 워커가 overlap.ts로 어림한다. 시간 한도로 못 구했으면 없다) */
  volume?: number;
  /** 겹친 부피의 어림 오차(세계 단위³) */
  volumeErr?: number;
}

/**
 * 검사 워커(src/worker/check.worker.ts) 메시지: progress(간섭 쌍 찾는 중) → pairs(찾은 쌍 — 겹친 부피 없이 먼저 보인다) →
 * progress phase 'volume'(겹친 부피를 구하는 중, done·total은 쌍 수) → done(겹친 부피를 실은 결과)
 */
export type CheckRequest = { id: number; type: 'interference'; meshes: InterferenceMesh[] };
export type CheckResponse =
  | { id: number; type: 'progress'; done: number; total: number; phase?: 'volume' }
  | { id: number; type: 'pairs'; result: InterferenceResult }
  | { id: number; type: 'done'; result: InterferenceResult }
  | { id: number; type: 'error'; message: string };

export interface InterferenceResult {
  pairs: InterferencePair[];
  /** 범위 상자가 겹친 쌍 수(시험한 쌍) */
  tested: number;
  ms: number;
  /** 겹친 부피: 구한 닫힌 쌍 수, 시간 한도로 못 구한 닫힌 쌍 수, 걸린 시간(ms) — 검사 워커가 싣는다 */
  volumes?: { done: number; left: number; ms: number };
}

interface World {
  id: string;
  p: Float64Array;
  idx: ArrayLike<number> | null;
  tris: number;
  lo: V3;
  hi: V3;
  closed: boolean;
  /** 삼각형마다 범위 상자(최소 x·y·z, 최대 x·y·z — 처음 쓸 때 구한다) */
  box?: Float64Array;
  /** 삼각형마다 평면: 법선(두 변의 외적) x·y·z, 그 길이, 법선 · 첫 꼭짓점(처음 쓸 때 구한다) */
  plane?: Float64Array;
  /** 같은 삼각형을 한 번만 시험하는 표(시험 차례 번호) */
  mark?: Uint32Array;
}

function toWorld(m: InterferenceMesh): World {
  const P = m.positions;
  const n = P.length / 3;
  const o = m.origin ?? [0, 0, 0];
  const M = m.matrix;
  const p = new Float64Array(n * 3);
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const x = P[i * 3]! + o[0]!;
    const y = P[i * 3 + 1]! + o[1]!;
    const z = P[i * 3 + 2]! + o[2]!;
    p[i * 3] = M ? M[0]! * x + M[4]! * y + M[8]! * z + M[12]! : x;
    p[i * 3 + 1] = M ? M[1]! * x + M[5]! * y + M[9]! * z + M[13]! : y;
    p[i * 3 + 2] = M ? M[2]! * x + M[6]! * y + M[10]! * z + M[14]! : z;
    for (let k = 0; k < 3; k++) {
      const v = p[i * 3 + k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  }
  const idx = m.indices ?? null;
  return { id: m.id, p, idx, tris: Math.floor((idx ? idx.length : n) / 3), lo, hi, closed: !!m.closed };
}

/** 삼각형 t의 c번째 꼭짓점이 w.p에서 시작하는 자리 */
const vat = (w: World, t: number, c: number): number => (w.idx ? w.idx[t * 3 + c]! : t * 3 + c) * 3;

function vtx(w: World, t: number, c: number): V3 {
  const i = vat(w, t, c);
  return [w.p[i]!, w.p[i + 1]!, w.p[i + 2]!];
}

/** 삼각형마다 범위 상자(그물마다 한 번) */
function triBoxes(w: World): Float64Array {
  if (w.box) return w.box;
  const P = w.p;
  const box = new Float64Array(w.tris * 6);
  for (let t = 0; t < w.tris; t++) {
    const i0 = vat(w, t, 0);
    const i1 = vat(w, t, 1);
    const i2 = vat(w, t, 2);
    for (let k = 0; k < 3; k++) {
      const a = P[i0 + k]!;
      const b = P[i1 + k]!;
      const c = P[i2 + k]!;
      box[t * 6 + k] = Math.min(a, b, c);
      box[t * 6 + 3 + k] = Math.max(a, b, c);
    }
  }
  return (w.box = box);
}

/** 삼각형마다 평면(그물마다 한 번): trianglesCross가 쓰는 것과 같은 식·차례로 구한 법선·길이·원점 거리 */
function triPlanes(w: World): Float64Array {
  if (w.plane) return w.plane;
  const P = w.p;
  const pl = new Float64Array(w.tris * 5);
  for (let t = 0; t < w.tris; t++) {
    const i0 = vat(w, t, 0);
    const i1 = vat(w, t, 1);
    const i2 = vat(w, t, 2);
    const x0 = P[i0]!, y0 = P[i0 + 1]!, z0 = P[i0 + 2]!;
    const u0 = P[i1]! - x0, u1 = P[i1 + 1]! - y0, u2 = P[i1 + 2]! - z0;
    const v0 = P[i2]! - x0, v1 = P[i2 + 1]! - y0, v2 = P[i2 + 2]! - z0;
    const nx = u1 * v2 - u2 * v1;
    const ny = u2 * v0 - u0 * v2;
    const nz = u0 * v1 - u1 * v0;
    pl[t * 5] = nx;
    pl[t * 5 + 1] = ny;
    pl[t * 5 + 2] = nz;
    pl[t * 5 + 3] = Math.hypot(nx, ny, nz);
    pl[t * 5 + 4] = nx * x0 + ny * y0 + nz * z0;
  }
  return (w.plane = pl);
}

/** 범위 상자가 상자 [lo, hi]와 겹치는 삼각형 번호(작은 차례 — 그물마다 한 번 구한 삼각형 상자로 거른다) */
function trisInBox(w: World, lo: V3, hi: V3): number[] {
  const box = triBoxes(w);
  const out: number[] = [];
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  for (let t = 0, o = 0; t < w.tris; t++, o += 6)
    if (!(box[o + 3]! < x0 || box[o]! > x1 || box[o + 4]! < y0 || box[o + 1]! > y1 || box[o + 5]! < z0 || box[o + 2]! > z1)) out.push(t);
  return out;
}

/** 같은 삼각형을 한 번만 보는 표의 차례 번호(그물마다 mark 표에 쓴다) */
let markStamp = 0;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 두 삼각형이 서로의 평면을 eps보다 깊이 지나며 교차하는지(맞닿음·같은 평면은 아님) */
export function trianglesCross(a: [V3, V3, V3], b: [V3, V3, V3], eps: number): boolean {
  const one = (t: [V3, V3, V3]): World => ({ id: '', p: new Float64Array(t.flat()), idx: null, tris: 1, lo: [0, 0, 0], hi: [0, 0, 0], closed: false });
  return crossAt(one(a), 0, one(b), 0, eps);
}

/** span이 구한 구간(교선 위 좌표의 최소·최대) */
let spanLo = 0;
let spanHi = 0;

/**
 * 삼각형(꼭짓점 자리 i0·i1·i2)이 두 평면의 교선 위에서 차지하는 구간(ax 좌표): 평면까지 부호 거리 d0·d1·d2가 바뀌는 변의 자리와
 * 평면 위 꼭짓점. 둘 이상이면 spanLo·spanHi에 두고 참
 */
function span(P: Float64Array, i0: number, i1: number, i2: number, ax: number, d0: number, d1: number, d2: number): boolean {
  let n = 0;
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  const put = (v: number): void => {
    if (n === 0) q0 = v;
    else if (n === 1) q1 = v;
    else q2 = v;
    n++;
  };
  const edge = (ii: number, ij: number, di: number, dj: number): void => {
    if ((di < 0 && dj > 0) || (di > 0 && dj < 0)) {
      const s = di / (di - dj);
      put(P[ii + ax]! + (P[ij + ax]! - P[ii + ax]!) * s);
    } else if (di === 0) put(P[ii + ax]!);
  };
  edge(i0, i1, d0, d1);
  edge(i1, i2, d1, d2);
  edge(i2, i0, d2, d0);
  if (n < 2) return false;
  spanLo = n === 2 ? Math.min(q0, q1) : Math.min(q0, q1, q2);
  spanHi = n === 2 ? Math.max(q0, q1) : Math.max(q0, q1, q2);
  return true;
}

/**
 * A의 삼각형 s와 B의 삼각형 t가 서로의 평면을 eps보다 깊이 지나며 교차하는지(trianglesCross — 그물마다 한 번 구한 평면으로, 새 배열 없이).
 * 식과 셈 차례는 꼭짓점 배열로 셈하던 것과 같아 판정이 같다
 */
function crossAt(A: World, s: number, B: World, t: number, eps: number): boolean {
  const PA = triPlanes(A);
  const PB = triPlanes(B);
  const l1 = PA[s * 5 + 3]!;
  const l2 = PB[t * 5 + 3]!;
  if (!(l1 > 0) || !(l2 > 0)) return false;
  const P = A.p;
  const Q = B.p;
  const a0 = vat(A, s, 0), a1 = vat(A, s, 1), a2 = vat(A, s, 2);
  const b0 = vat(B, t, 0), b1 = vat(B, t, 1), b2 = vat(B, t, 2);
  const n1x = PA[s * 5]!, n1y = PA[s * 5 + 1]!, n1z = PA[s * 5 + 2]!, d1 = PA[s * 5 + 4]!;
  const db0 = (n1x * Q[b0]! + n1y * Q[b0 + 1]! + n1z * Q[b0 + 2]! - d1) / l1;
  const db1 = (n1x * Q[b1]! + n1y * Q[b1 + 1]! + n1z * Q[b1 + 2]! - d1) / l1;
  const db2 = (n1x * Q[b2]! + n1y * Q[b2 + 1]! + n1z * Q[b2 + 2]! - d1) / l1;
  // b가 a 평면 한쪽에만(또는 닿기만) 있으면 교차 아님
  if (!(Math.min(db0, db1, db2) < -eps && Math.max(db0, db1, db2) > eps)) return false;
  const n2x = PB[t * 5]!, n2y = PB[t * 5 + 1]!, n2z = PB[t * 5 + 2]!, d2 = PB[t * 5 + 4]!;
  const da0 = (n2x * P[a0]! + n2y * P[a0 + 1]! + n2z * P[a0 + 2]! - d2) / l2;
  const da1 = (n2x * P[a1]! + n2y * P[a1 + 1]! + n2z * P[a1 + 2]! - d2) / l2;
  const da2 = (n2x * P[a2]! + n2y * P[a2 + 1]! + n2z * P[a2 + 2]! - d2) / l2;
  if (!(Math.min(da0, da1, da2) < -eps && Math.max(da0, da1, da2) > eps)) return false;
  // 두 평면의 교선 위에서 각 삼각형이 차지하는 구간이 겹치는지
  const k0 = Math.abs(n1y * n2z - n1z * n2y);
  const k1 = Math.abs(n1z * n2x - n1x * n2z);
  const k2 = Math.abs(n1x * n2y - n1y * n2x);
  const ax = k0 >= k1 && k0 >= k2 ? 0 : k1 >= k2 ? 1 : 2;
  if (!span(P, a0, a1, a2, ax, da0, da1, da2)) return false;
  const lo = spanLo;
  const hi = spanHi;
  if (!span(Q, b0, b1, b2, ax, db0, db1, db2)) return false;
  // 구간이 eps보다 깊이 겹쳐야
  return Math.min(hi, spanHi) - Math.max(lo, spanLo) > eps;
}

/** 칸 열쇠(32비트 정수 — 쌍마다 칸 격자를 Map에 담던 때의 열쇠) */
const cellKey = (x: number, y: number, z: number): number => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);

/** 64³ 칸 안에서 열쇠가 앞 칸과 같은 칸들: [앞 칸 x, y, z, 뒤 칸 x, y, z](처음 쓸 때 구한다 — 16쌍, 가장 작은 것도 57칸부터) */
let keyTwins: number[][] | null = null;

/**
 * 한 변 cells칸 격자에서 칸 번호 → 목록 번호. 쌍마다 칸 격자를 열쇠(cellKey)로 Map에 담던 때 열쇠가 같은 두 칸은 한 목록을 함께 써서
 * 시험 차례(강조 삼각형 한도에서 남는 삼각형)가 그 목록을 따랐다 — 그 차례를 지키려고 뒤 칸을 앞 칸 목록으로 보낸다. 그런 칸이 없으면 null
 */
function cellAlias(cells: number): Int32Array | null {
  if (!keyTwins) {
    keyTwins = [];
    const first = new Map<number, number>();
    for (let x = 0; x < 64; x++)
      for (let y = 0; y < 64; y++)
        for (let z = 0; z < 64; z++) {
          const k = cellKey(x, y, z);
          const f = first.get(k);
          if (f === undefined) first.set(k, (x * 64 + y) * 64 + z);
          else keyTwins.push([Math.floor(f / 4096), Math.floor(f / 64) % 64, f % 64, x, y, z]);
        }
  }
  const twins = keyTwins.filter((t) => Math.max(...t) < cells);
  if (!twins.length) return null;
  const alias = new Int32Array(cells * cells * cells);
  for (let c = 0; c < alias.length; c++) alias[c] = c;
  for (const [x0, y0, z0, x1, y1, z1] of twins) alias[(x1! * cells + y1!) * cells + z1!] = alias[(x0! * cells + y0!) * cells + z0!]!;
  return alias;
}

/** 간섭 검사. eps는 길이 허용 오차(기본: 장면 크기 × 1e-6), limit는 쌍마다 강조할 삼각형 수 한도 */
export function findInterference(
  meshes: readonly InterferenceMesh[],
  opts: { eps?: number; limit?: number; maxPairs?: number; onProgress?: (done: number, total: number) => void } = {},
): InterferenceResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const W = meshes.map(toWorld).filter((w) => w.tris > 0);
  let glo: V3 = [Infinity, Infinity, Infinity];
  let ghi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const w of W)
    for (let k = 0; k < 3; k++) {
      glo[k] = Math.min(glo[k]!, w.lo[k]!);
      ghi[k] = Math.max(ghi[k]!, w.hi[k]!);
    }
  const size = Number.isFinite(glo[0]) ? Math.hypot(ghi[0] - glo[0], ghi[1] - glo[1], ghi[2] - glo[2]) : 1;
  const eps = opts.eps ?? Math.max(size * 1e-6, 1e-12);
  const limit = opts.limit ?? 2000;
  // 상자 겹침 쌍(x로 쓸기)
  const order = W.map((_, i) => i).sort((i, j) => W[i]!.lo[0] - W[j]!.lo[0]);
  const cand: [number, number][] = [];
  for (let s = 0; s < order.length; s++) {
    const A = W[order[s]!]!;
    for (let t = s + 1; t < order.length; t++) {
      const B = W[order[t]!]!;
      if (B.lo[0] > A.hi[0] - eps) break;
      if (B.lo[1] > A.hi[1] - eps || B.hi[1] < A.lo[1] + eps || B.lo[2] > A.hi[2] - eps || B.hi[2] < A.lo[2] + eps) continue;
      cand.push([order[s]!, order[t]!]);
      if (opts.maxPairs && cand.length >= opts.maxPairs) break;
    }
  }
  const pairs: InterferencePair[] = [];
  // 바깥 입체마다 한 번 만드는 광선 격자(안에 듦 판정)
  const grids = new Map<World, RayGrid>();
  cand.forEach(([ia, ib], ci) => {
    opts.onProgress?.(ci, cand.length);
    const A = W[ia]!;
    const B = W[ib]!;
    // 겉면이 만나지 않았을 때: 한쪽이 다른 쪽 안에 통째로 들었는지(상자가 든 쪽만, 둘 다 닫힌 입체)
    const contained = () => {
      const inBoxOf = (P: World, Q: World) => [0, 1, 2].every((k) => P.lo[k]! >= Q.lo[k]! - eps && P.hi[k]! <= Q.hi[k]! + eps);
      const [inner, outer] = inBoxOf(A, B) ? [A, B] : inBoxOf(B, A) ? [B, A] : [null, null];
      if (inner && outer && inner.closed && outer.closed && solidInside(inner, outer, size, grids)) pairs.push({ a: inner.id, b: outer.id, count: 0, trisA: [], trisB: [], inside: true });
    };
    // 겹친 상자
    const lo: V3 = [Math.max(A.lo[0], B.lo[0]) - eps, Math.max(A.lo[1], B.lo[1]) - eps, Math.max(A.lo[2], B.lo[2]) - eps];
    const hi: V3 = [Math.min(A.hi[0], B.hi[0]) + eps, Math.min(A.hi[1], B.hi[1]) + eps, Math.min(A.hi[2], B.hi[2]) + eps];
    const ta = trisInBox(A, lo, hi);
    const tb = trisInBox(B, lo, hi);
    // 겹친 상자에 한쪽 삼각형이 없으면(깊이 든 작은 부품 둘레에 바깥 벽이 없음) 교차는 없다
    if (!ta.length || !tb.length) return contained();
    // 격자: 겹친 상자를 칸 수 ≈ 삼각형 수로 나눈다
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const cells = Math.max(1, Math.min(64, Math.round(Math.cbrt(ta.length + tb.length))));
    const cs = ext.map((e) => Math.max(e / cells, 1e-12));
    // 칸마다 A 삼각형 목록(CSR — start[칸]부터 start[칸 + 1] 앞까지, 넣은 차례). 열쇠가 같은 칸 짝은 한 목록(cellAlias)
    const N = cells * cells * cells;
    const alias = cellAlias(cells);
    const at = (x: number, y: number, z: number): number => {
      const c = (x * cells + y) * cells + z;
      return alias ? alias[c]! : c;
    };
    const start = new Uint32Array(N + 1);
    const boxA = triBoxes(A);
    const boxB = triBoxes(B);
    // 삼각형 t(범위 상자 bx)가 걸친 칸 범위
    const r = [0, 0, 0, 0, 0, 0];
    const bounds = (bx: Float64Array, t: number) => {
      for (let k = 0; k < 3; k++) {
        r[k * 2] = Math.max(0, Math.floor((bx[t * 6 + k]! - lo[k]!) / cs[k]!));
        r[k * 2 + 1] = Math.min(cells - 1, Math.floor((bx[t * 6 + 3 + k]! - lo[k]!) / cs[k]!));
      }
    };
    for (const t of ta) {
      bounds(boxA, t);
      for (let x = r[0]!; x <= r[1]!; x++) for (let y = r[2]!; y <= r[3]!; y++) for (let z = r[4]!; z <= r[5]!; z++) start[at(x, y, z) + 1]!++;
    }
    for (let c = 0; c < N; c++) start[c + 1]! += start[c]!;
    const fill = start.slice(0, N);
    const list = new Uint32Array(start[N]!);
    for (const t of ta) {
      bounds(boxA, t);
      for (let x = r[0]!; x <= r[1]!; x++) for (let y = r[2]!; y <= r[3]!; y++) for (let z = r[4]!; z <= r[5]!; z++) list[fill[at(x, y, z)]!++] = t;
    }
    const hitA = new Set<number>();
    const hitB = new Set<number>();
    let count = 0;
    const seen = (A.mark ??= new Uint32Array(A.tris));
    for (const t of tb) {
      bounds(boxB, t);
      const stamp = ++markStamp;
      for (let x = r[0]!; x <= r[1]!; x++)
        for (let y = r[2]!; y <= r[3]!; y++)
          for (let z = r[4]!; z <= r[5]!; z++) {
            const c = at(x, y, z);
            for (let k = start[c]!; k < start[c + 1]!; k++) {
              const s = list[k]!;
              if (seen[s] === stamp) continue;
              seen[s] = stamp;
              if (crossAt(A, s, B, t, eps)) {
                count++;
                if (hitA.size < limit) hitA.add(s);
                if (hitB.size < limit) hitB.add(t);
              }
            }
          }
    }
    if (count) pairs.push({ a: A.id, b: B.id, count, trisA: [...hitA].sort((x, y) => x - y), trisB: [...hitB].sort((x, y) => x - y) });
    else contained();
  });
  opts.onProgress?.(cand.length, cand.length);
  // 안에 든 쌍(3D에서 가려 보이지 않는다) 먼저, 그다음 교차 삼각형이 많은 차례
  pairs.sort((x, y) => Number(!!y.inside) - Number(!!x.inside) || y.count - x.count);
  return { pairs, tested: cand.length, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
}

/** 닫힌 입체 하나의 +x 광선 판정 격자: (y, z) 칸마다 그 칸에 걸친 삼각형 번호(CSR — start[칸]부터 start[칸 + 1] 앞까지) */
interface RayGrid {
  n: number;
  c1: number;
  c2: number;
  start: Uint32Array;
  tris: Uint32Array;
}

function rayGrid(w: World): RayGrid {
  const n = Math.max(1, Math.min(256, Math.round(Math.sqrt(w.tris / 4))));
  const c1 = Math.max((w.hi[1] - w.lo[1]) / n, 1e-12);
  const c2 = Math.max((w.hi[2] - w.lo[2]) / n, 1e-12);
  const cell = (v: number, lo: number, c: number) => Math.max(0, Math.min(n - 1, Math.floor((v - lo) / c)));
  const range = (t: number): [number, number, number, number] => {
    const a = vtx(w, t, 0);
    const b = vtx(w, t, 1);
    const c = vtx(w, t, 2);
    return [cell(Math.min(a[1], b[1], c[1]), w.lo[1], c1), cell(Math.max(a[1], b[1], c[1]), w.lo[1], c1), cell(Math.min(a[2], b[2], c[2]), w.lo[2], c2), cell(Math.max(a[2], b[2], c[2]), w.lo[2], c2)];
  };
  const start = new Uint32Array(n * n + 1);
  for (let t = 0; t < w.tris; t++) {
    const [i0, i1, j0, j1] = range(t);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) start[i * n + j + 1]!++;
  }
  for (let k = 0; k < n * n; k++) start[k + 1]! += start[k]!;
  const fill = start.slice(0, n * n);
  const tris = new Uint32Array(start[n * n]!);
  for (let t = 0; t < w.tris; t++) {
    const [i0, i1, j0, j1] = range(t);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) tris[fill[i * n + j]!++] = t;
  }
  return { n, c1, c2, start, tris };
}

/** 점이 닫힌 그물 w 안인지: +x 쪽으로 쏜 광선이 지나는 삼각형 수가 홀수면 안 */
function pointInside(w: World, g: RayGrid, p: V3): boolean {
  if (p[0] > w.hi[0] || [1, 2].some((k) => p[k]! < w.lo[k]! || p[k]! > w.hi[k]!)) return false;
  const i = Math.max(0, Math.min(g.n - 1, Math.floor((p[1] - w.lo[1]) / g.c1)));
  const j = Math.max(0, Math.min(g.n - 1, Math.floor((p[2] - w.lo[2]) / g.c2)));
  let hits = 0;
  for (let k = g.start[i * g.n + j]!; k < g.start[i * g.n + j + 1]!; k++) {
    const t = g.tris[k]!;
    const a = vtx(w, t, 0);
    const b = vtx(w, t, 1);
    const c = vtx(w, t, 2);
    // (y, z) 평면에서 점이 삼각형 안인지(변 함수 부호가 모두 같음)와 그 자리의 x
    const e = (u: V3, v: V3) => (v[1] - u[1]) * (p[2] - u[2]) - (v[2] - u[2]) * (p[1] - u[1]);
    const d0 = e(b, c);
    const d1 = e(c, a);
    const d2 = e(a, b);
    const sum = d0 + d1 + d2;
    if (sum === 0 || !((d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0))) continue;
    if ((d0 * a[0] + d1 * b[0] + d2 * c[0]) / sum > p[0]) hits++;
  }
  return hits % 2 === 1;
}

/**
 * 닫힌 입체 inner가 닫힌 입체 outer 안에 통째로 들었는지(겉면이 서로 뚫지 않은 쌍에만 쓴다): inner의 넓은 삼각형 7개의 가운데를
 * 안쪽(바깥 법선 반대 — 부피 부호로 감기 방향을 본다)으로 조금 들인 점과 광선 홀짝, 과반이 안이면 참.
 * 점은 (y, z)로 아주 조금 비켜 놓아 광선이 outer의 모서리·꼭짓점을 바로 지나지 않게 한다
 */
function solidInside(inner: World, outer: World, sceneSize: number, grids: Map<World, RayGrid>): boolean {
  let g = grids.get(outer);
  if (!g) grids.set(outer, (g = rayGrid(outer)));
  const K = 7;
  const best: { area: number; t: number }[] = [];
  let vol = 0;
  for (let t = 0; t < inner.tris; t++) {
    const a = vtx(inner, t, 0);
    const n = cross(sub(vtx(inner, t, 1), a), sub(vtx(inner, t, 2), a));
    vol += dot(a, n);
    const area = Math.hypot(...n);
    if (best.length < K || area > best[best.length - 1]!.area) {
      best.push({ area, t });
      best.sort((x, y) => y.area - x.area);
      if (best.length > K) best.pop();
    }
  }
  const diag = Math.hypot(inner.hi[0] - inner.lo[0], inner.hi[1] - inner.lo[1], inner.hi[2] - inner.lo[2]);
  const d = Math.min(1e-5 * sceneSize, 1e-3 * diag) * (vol < 0 ? -1 : 1);
  let inside = 0;
  for (const { area, t } of best) {
    if (!(area > 0)) continue;
    const a = vtx(inner, t, 0);
    const b = vtx(inner, t, 1);
    const c = vtx(inner, t, 2);
    const n = cross(sub(b, a), sub(c, a));
    const p: V3 = [0, 1, 2].map((k) => (a[k]! + b[k]! + c[k]!) / 3 - (n[k]! / area) * d) as V3;
    p[1] += Math.abs(d) * 0.3183;
    p[2] += Math.abs(d) * 0.2718;
    if (pointInside(outer, g, p)) inside++;
  }
  return inside * 2 > Math.min(K, best.length);
}

/** 삼각형 번호들 → 이어진 구간들(Viewer3d.highlightRanges) */
export function triRanges(tris: readonly number[]): { start: number; count: number }[] {
  const out: { start: number; count: number }[] = [];
  for (const t of tris) {
    const last = out[out.length - 1];
    if (last && last.start + last.count === t) last.count++;
    else out.push({ start: t, count: 1 });
  }
  return out;
}
