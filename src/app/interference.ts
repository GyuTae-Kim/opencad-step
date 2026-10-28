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
}

/** 검사 워커(src/worker/check.worker.ts) 메시지 */
export type CheckRequest = { id: number; type: 'interference'; meshes: InterferenceMesh[] };
export type CheckResponse = { id: number; type: 'progress'; done: number; total: number } | { id: number; type: 'done'; result: InterferenceResult } | { id: number; type: 'error'; message: string };

export interface InterferenceResult {
  pairs: InterferencePair[];
  /** 범위 상자가 겹친 쌍 수(시험한 쌍) */
  tested: number;
  ms: number;
}

interface World {
  id: string;
  p: Float64Array;
  idx: ArrayLike<number> | null;
  tris: number;
  lo: V3;
  hi: V3;
  closed: boolean;
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
    const w = M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
    for (let k = 0; k < 3; k++) {
      p[i * 3 + k] = w[k]!;
      if (w[k]! < lo[k]!) lo[k] = w[k]!;
      if (w[k]! > hi[k]!) hi[k] = w[k]!;
    }
  }
  const idx = m.indices ?? null;
  return { id: m.id, p, idx, tris: Math.floor((idx ? idx.length : n) / 3), lo, hi, closed: !!m.closed };
}

function vtx(w: World, t: number, c: number): V3 {
  const i = (w.idx ? w.idx[t * 3 + c]! : t * 3 + c) * 3;
  return [w.p[i]!, w.p[i + 1]!, w.p[i + 2]!];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 두 삼각형이 서로의 평면을 eps보다 깊이 지나며 교차하는지(맞닿음·같은 평면은 아님) */
export function trianglesCross(a: [V3, V3, V3], b: [V3, V3, V3], eps: number): boolean {
  const n1 = cross(sub(a[1], a[0]), sub(a[2], a[0]));
  const l1 = Math.hypot(...n1);
  const n2 = cross(sub(b[1], b[0]), sub(b[2], b[0]));
  const l2 = Math.hypot(...n2);
  if (!(l1 > 0) || !(l2 > 0)) return false;
  const d1 = dot(n1, a[0]);
  const db = b.map((p) => (dot(n1, p) - d1) / l1);
  // b가 a 평면 한쪽에만(또는 닿기만) 있으면 교차 아님
  if (!(Math.min(...db) < -eps && Math.max(...db) > eps)) return false;
  const d2 = dot(n2, b[0]);
  const da = a.map((p) => (dot(n2, p) - d2) / l2);
  if (!(Math.min(...da) < -eps && Math.max(...da) > eps)) return false;
  // 두 평면의 교선 위에서 각 삼각형이 차지하는 구간이 겹치는지
  const dir = cross(n1, n2);
  const k = [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])];
  const ax = k[0]! >= k[1]! && k[0]! >= k[2]! ? 0 : k[1]! >= k[2]! ? 1 : 2;
  const span = (t: [V3, V3, V3], d: number[]): [number, number] | null => {
    const pts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const di = d[i]!;
      const dj = d[j]!;
      if ((di < 0 && dj > 0) || (di > 0 && dj < 0)) {
        const s = di / (di - dj);
        pts.push(t[i]![ax]! + (t[j]![ax]! - t[i]![ax]!) * s);
      } else if (di === 0) pts.push(t[i]![ax]!);
    }
    return pts.length >= 2 ? [Math.min(...pts), Math.max(...pts)] : null;
  };
  const sa = span(a, da);
  const sb = span(b, db);
  if (!sa || !sb) return false;
  // 구간이 eps보다 깊이 겹쳐야
  return Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > eps;
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
    const inBox = (w: World) => {
      const out: number[] = [];
      for (let t = 0; t < w.tris; t++) {
        const a = vtx(w, t, 0);
        const b = vtx(w, t, 1);
        const c = vtx(w, t, 2);
        let ok = true;
        for (let k = 0; k < 3 && ok; k++) if (Math.max(a[k]!, b[k]!, c[k]!) < lo[k]! || Math.min(a[k]!, b[k]!, c[k]!) > hi[k]!) ok = false;
        if (ok) out.push(t);
      }
      return out;
    };
    const ta = inBox(A);
    const tb = inBox(B);
    // 겹친 상자에 한쪽 삼각형이 없으면(깊이 든 작은 부품 둘레에 바깥 벽이 없음) 교차는 없다
    if (!ta.length || !tb.length) return contained();
    // 격자: 겹친 상자를 칸 수 ≈ 삼각형 수로 나눈다
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const cells = Math.max(1, Math.min(64, Math.round(Math.cbrt(ta.length + tb.length))));
    const cs = ext.map((e) => Math.max(e / cells, 1e-12));
    const key = (x: number, y: number, z: number) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    const grid = new Map<number, number[]>();
    const bounds = (w: World, t: number) => {
      const a = vtx(w, t, 0);
      const b = vtx(w, t, 1);
      const c = vtx(w, t, 2);
      const r = [0, 1, 2].map((k) => [Math.floor((Math.min(a[k]!, b[k]!, c[k]!) - lo[k]!) / cs[k]!), Math.floor((Math.max(a[k]!, b[k]!, c[k]!) - lo[k]!) / cs[k]!)]);
      return { tri: [a, b, c] as [V3, V3, V3], r };
    };
    for (const t of ta) {
      const { r } = bounds(A, t);
      for (let x = Math.max(0, r[0]![0]!); x <= Math.min(cells - 1, r[0]![1]!); x++)
        for (let y = Math.max(0, r[1]![0]!); y <= Math.min(cells - 1, r[1]![1]!); y++)
          for (let z = Math.max(0, r[2]![0]!); z <= Math.min(cells - 1, r[2]![1]!); z++) {
            const k = key(x, y, z);
            let l = grid.get(k);
            if (!l) grid.set(k, (l = []));
            l.push(t);
          }
    }
    const hitA = new Set<number>();
    const hitB = new Set<number>();
    let count = 0;
    const tested = new Set<number>();
    for (const t of tb) {
      const { tri, r } = bounds(B, t);
      tested.clear();
      for (let x = Math.max(0, r[0]![0]!); x <= Math.min(cells - 1, r[0]![1]!); x++)
        for (let y = Math.max(0, r[1]![0]!); y <= Math.min(cells - 1, r[1]![1]!); y++)
          for (let z = Math.max(0, r[2]![0]!); z <= Math.min(cells - 1, r[2]![1]!); z++)
            for (const s of grid.get(key(x, y, z)) ?? []) {
              if (tested.has(s)) continue;
              tested.add(s);
              if (trianglesCross([vtx(A, s, 0), vtx(A, s, 1), vtx(A, s, 2)], tri, eps)) {
                count++;
                if (hitA.size < limit) hitA.add(s);
                if (hitB.size < limit) hitB.add(t);
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
