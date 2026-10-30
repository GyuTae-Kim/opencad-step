/**
 * 간섭 쌍의 겹친 부피(순수, DOM 없음 — 검사 워커가 간섭 검사 뒤에 닫힌 입체 쌍마다 부른다).
 *
 * 1. 두 그물을 세계 좌표(origin·matrix)로 바꾸고 범위 상자가 겹친 상자를 구한다(겹친 몸은 늘 이 상자 안이다).
 * 2. 그 상자의 가장 긴 축 방향으로 나란한 광선을, 그 축에 수직인 면을 고르게 나눈 격자 칸마다 두 개씩(칸 안에 고르게 흩은 자리 —
 *    칸 번호로 정한 의사 난수라 같은 입력이면 같은 값) 쏜다.
 * 3. 광선마다 두 그물의 삼각형과 만나는 깊이를 모아 정렬하고 홀짝으로 짝지어 안쪽 구간을 얻고, 두 입체 구간의 겹친 길이의 칸 평균 × 칸 넓이를 더한다.
 *    광선 방향으로는 정확하고 표본은 격자로만 뜬다 — 겹친 몸의 옆 경계가 지나는 칸에서만 어긋난다.
 *    광선이 삼각형 모서리를 바로 지나는 경우는 모서리를 두 끝점의 차례(좌표 순)로 같은 셈으로 구해 이웃한 두 삼각형 가운데 하나만 맞게 한다.
 * 4. 어림 오차: 칸마다 두 광선의 차로 구한 층화 표본의 표준 오차 × 3. 홀짝이 맞지 않는 광선(조금 비켜 다시 쏴도)은 빼고
 *    그 칸에서 나올 수 있는 가장 큰 부피(칸 넓이 × 상자 깊이)를 어림 오차에 더한다.
 * 그물 삼각형이 곡면을 줄인 만큼(현 오차 — 원기둥은 조금 작다)은 이 값에 들지 않는다. 화면 그물끼리의 겹친 부피다.
 */

/** 겹친 부피를 잴 그물(간섭 검사 그물과 같은 꼴) */
export interface OverlapMesh {
  positions: Float32Array;
  indices?: Uint32Array;
  matrix?: ArrayLike<number>;
  origin?: readonly number[];
}

export interface OverlapVolume {
  /** 겹친 부피(세계 단위³) */
  volume: number;
  /** 어림 오차(세계 단위³ — 층화 표본 표준 오차 × 3 + 뺀 광선 몫) */
  err: number;
  /** 쏜 광선 수(칸마다 둘 — 다시 쏜 것은 세지 않는다) */
  rays: number;
  /** 홀짝이 맞지 않아 뺀 광선 수 */
  skipped: number;
}

type Box = { lo: [number, number, number]; hi: [number, number, number] };

/** 세계 좌표 꼭짓점과 범위 상자 */
function world(m: OverlapMesh): { p: Float64Array; box: Box; tris: number; idx: ArrayLike<number> | null } {
  const P = m.positions;
  const n = P.length / 3;
  const o = m.origin ?? [0, 0, 0];
  const M = m.matrix;
  const p = new Float64Array(n * 3);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
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
  return { p, box: { lo, hi }, tris: Math.floor((idx ? idx.length : n) / 3), idx };
}

/**
 * 한 그물의 광선 판정 표: 투영 면(u, v)에서 겹친 상자에 걸친 삼각형(투영 넓이 0은 뺀다)의 투영 꼭짓점·깊이와,
 * 광선 칸 bs×bs개씩 묶은 통마다 걸친 삼각형 번호(CSR)
 */
interface Caster {
  /** 삼각형마다 u0 v0 w0 u1 v1 w1 u2 v2 w2 */
  t: Float64Array;
  start: Uint32Array;
  list: Uint32Array;
}

function caster(g: ReturnType<typeof world>, ax: [number, number, number], lo: [number, number], hi: [number, number], bins: [number, number], bin: [number, number]): Caster {
  const [U, Vv, W] = ax;
  const keep: number[] = [];
  const P = g.p;
  const at = (t: number, c: number) => (g.idx ? g.idx[t * 3 + c]! : t * 3 + c) * 3;
  for (let t = 0; t < g.tris; t++) {
    const a = at(t, 0);
    const b = at(t, 1);
    const c = at(t, 2);
    const u0 = P[a + U]!, u1 = P[b + U]!, u2 = P[c + U]!;
    const v0 = P[a + Vv]!, v1 = P[b + Vv]!, v2 = P[c + Vv]!;
    if (Math.max(u0, u1, u2) < lo[0] || Math.min(u0, u1, u2) > hi[0] || Math.max(v0, v1, v2) < lo[1] || Math.min(v0, v1, v2) > hi[1]) continue;
    if ((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0) === 0) continue;
    keep.push(t);
  }
  const T = new Float64Array(keep.length * 9);
  keep.forEach((t, k) => {
    for (let c = 0; c < 3; c++) {
      const i = at(t, c);
      T[k * 9 + c * 3] = P[i + U]!;
      T[k * 9 + c * 3 + 1] = P[i + Vv]!;
      T[k * 9 + c * 3 + 2] = P[i + W]!;
    }
  });
  const nb = bins[0] * bins[1];
  const start = new Uint32Array(nb + 1);
  const range = (k: number): [number, number, number, number] => {
    const o = k * 9;
    const cl = (x: number, l: number, s: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor((x - l) / s)));
    return [
      cl(Math.min(T[o]!, T[o + 3]!, T[o + 6]!), lo[0], bin[0], bins[0]),
      cl(Math.max(T[o]!, T[o + 3]!, T[o + 6]!), lo[0], bin[0], bins[0]),
      cl(Math.min(T[o + 1]!, T[o + 4]!, T[o + 7]!), lo[1], bin[1], bins[1]),
      cl(Math.max(T[o + 1]!, T[o + 4]!, T[o + 7]!), lo[1], bin[1], bins[1]),
    ];
  };
  for (let k = 0; k < keep.length; k++) {
    const [i0, i1, j0, j1] = range(k);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) start[i * bins[1] + j + 1]!++;
  }
  for (let c = 0; c < nb; c++) start[c + 1]! += start[c]!;
  const fill = start.slice(0, nb);
  const list = new Uint32Array(start[nb]!);
  for (let k = 0; k < keep.length; k++) {
    const [i0, i1, j0, j1] = range(k);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) list[fill[i * bins[1] + j]!++] = k;
  }
  return { t: T, start, list };
}

/**
 * 변 a→b에 대한 점 (pu, pv)의 변 함수(왼쪽이면 양수). 같은 변을 공유한 두 삼각형이 비트까지 같은 값(부호만 반대)을 얻도록
 * 두 끝점을 좌표 차례로 놓고 구한다
 */
function edgeFn(au: number, av: number, bu: number, bv: number, pu: number, pv: number): number {
  if (au < bu || (au === bu && av < bv)) return (bu - au) * (pv - av) - (bv - av) * (pu - au);
  return -((au - bu) * (pv - bv) - (av - bv) * (pu - bu));
}

/** 변 함수가 0일 때(점이 변 위) 이 삼각형이 맡는지: 반시계로 맞춘 변 방향 (du, dv)마다 반대 방향과 정확히 하나만 참 */
const owns = (du: number, dv: number): boolean => dv > 0 || (dv === 0 && du < 0);

/** 광선 (pu, pv)가 c의 통 bi에서 지나는 깊이들을 out에 모은다(정렬은 부르는 쪽) */
function depths(c: Caster, bi: number, pu: number, pv: number, out: number[]): void {
  out.length = 0;
  const T = c.t;
  for (let k = c.start[bi]!; k < c.start[bi + 1]!; k++) {
    const o = c.list[k]! * 9;
    const u0 = T[o]!, v0 = T[o + 1]!, u1 = T[o + 3]!, v1 = T[o + 4]!, u2 = T[o + 6]!, v2 = T[o + 7]!;
    let e0 = edgeFn(u1, v1, u2, v2, pu, pv);
    let e1 = edgeFn(u2, v2, u0, v0, pu, pv);
    let e2 = edgeFn(u0, v0, u1, v1, pu, pv);
    const area = e0 + e1 + e2;
    if (area === 0) continue;
    // 반시계로 맞춘다(시계면 부호를 뒤집고 변 방향도 뒤집어 본다)
    const s = area > 0 ? 1 : -1;
    e0 *= s;
    e1 *= s;
    e2 *= s;
    if (e0 < 0 || e1 < 0 || e2 < 0) continue;
    if (e0 === 0 && !owns(s * (u2 - u1), s * (v2 - v1))) continue;
    if (e1 === 0 && !owns(s * (u0 - u2), s * (v0 - v2))) continue;
    if (e2 === 0 && !owns(s * (u1 - u0), s * (v1 - v0))) continue;
    out.push((e0 * T[o + 2]! + e1 * T[o + 5]! + e2 * T[o + 8]!) / (e0 + e1 + e2));
  }
}

/** 정렬한 깊이 둘의 짝(안쪽 구간)끼리 겹친 길이 */
function overlapLength(a: number[], b: number[]): number {
  let i = 0;
  let j = 0;
  let len = 0;
  while (i + 1 < a.length && j + 1 < b.length) {
    const lo = Math.max(a[i]!, b[j]!);
    const hi = Math.min(a[i + 1]!, b[j + 1]!);
    if (hi > lo) len += hi - lo;
    if (a[i + 1]! < b[j + 1]!) i += 2;
    else j += 2;
  }
  return len;
}

const byNum = (x: number, y: number) => x - y;

/**
 * 닫힌 그물 두 개의 겹친 부피(광선 격자 표본). n = 투영 면의 긴 변을 나눈 칸 수(기본 128 — 칸마다 광선 둘, 많아야 32,768개).
 * 범위 상자가 겹치지 않으면 0. cache를 주면 그물마다 세계 좌표를 한 번만 구한다(쌍 여럿에 같은 그물이 들 때)
 */
export function overlapVolume(a: OverlapMesh, b: OverlapMesh, opts: { n?: number; cache?: Map<OverlapMesh, ReturnType<typeof world>> } = {}): OverlapVolume {
  const of = (m: OverlapMesh) => {
    let w = opts.cache?.get(m);
    if (!w) {
      w = world(m);
      opts.cache?.set(m, w);
    }
    return w;
  };
  const A = of(a);
  const B = of(b);
  const lo = [0, 1, 2].map((k) => Math.max(A.box.lo[k]!, B.box.lo[k]!));
  const hi = [0, 1, 2].map((k) => Math.min(A.box.hi[k]!, B.box.hi[k]!));
  const ext = [0, 1, 2].map((k) => hi[k]! - lo[k]!);
  if (!ext.every((e) => e > 0 && Number.isFinite(e))) return { volume: 0, err: 0, rays: 0, skipped: 0 };
  // 광선 방향: 투영 면(나머지 두 축)이 가장 네모난 축 — 얇게 겹친 판(두께가 가장 짧은 축)은 두께 방향으로, 가늘게 겹친 막대는 길이 방향으로 쏜다
  // (광선 방향으로는 정확하고, 투영 면의 두 변을 모두 여러 칸으로 나눈다)
  const ord = [0, 1, 2].sort((p, q) => ext[q]! - ext[p]!);
  const [ea, eb, ec] = [ext[ord[0]!]!, ext[ord[1]!]!, ext[ord[2]!]!];
  const W = eb / ec <= ea / eb ? ord[0]! : ord[2]!;
  const U = (W + 1) % 3;
  const V = (W + 2) % 3;
  const n = Math.max(2, Math.floor(opts.n ?? 128));
  const L = Math.max(ext[U]!, ext[V]!);
  const nu = Math.max(2, Math.round((n * ext[U]!) / L));
  const nv = Math.max(2, Math.round((n * ext[V]!) / L));
  const hu = ext[U]! / nu;
  const hv = ext[V]! / nv;
  // 광선 칸 BS×BS개를 한 통으로 묶어 삼각형을 담는다
  const BS = 4;
  const bins: [number, number] = [Math.ceil(nu / BS), Math.ceil(nv / BS)];
  const bin: [number, number] = [hu * BS, hv * BS];
  const plo: [number, number] = [lo[U]!, lo[V]!];
  const phi: [number, number] = [hi[U]!, hi[V]!];
  const ca = caster(A, [U, V, W], plo, phi, bins, bin);
  const cb = caster(B, [U, V, W], plo, phi, bins, bin);
  const da: number[] = [];
  const db: number[] = [];
  /** 광선 (pu, pv)에서 두 입체가 겹친 길이(홀짝이 안 맞으면 NaN) */
  const cast = (bi: number, pu: number, pv: number): number => {
    depths(ca, bi, pu, pv, da);
    if (da.length % 2) return NaN;
    if (!da.length) return 0;
    depths(cb, bi, pu, pv, db);
    if (db.length % 2) return NaN;
    if (!db.length) return 0;
    da.sort(byNum);
    db.sort(byNum);
    return overlapLength(da, db);
  };
  let sum = 0;
  let varSum = 0;
  let skipped = 0;
  const cell = hu * hv;
  // 칸 안 자리(0~1): 칸 번호로 정한 의사 난수(같은 입력이면 같은 값 — 장면 좌표가 둥근 수인 모서리·꼭짓점을 바로 지나지 않게)
  let seed = 0;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** 칸 (i, j) 안 흩은 자리 하나의 겹친 길이(홀짝이 안 맞으면 한 번 다른 자리, 그래도 안 맞으면 NaN) */
  const sample = (bi: number, i: number, j: number): number => {
    for (let k = 0; k < 2; k++) {
      const len = cast(bi, plo[0] + (i + rnd()) * hu, plo[1] + (j + rnd()) * hv);
      if (!Number.isNaN(len)) return len;
    }
    return NaN;
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const bi = Math.floor(i / BS) * bins[1] + Math.floor(j / BS);
      seed = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca77);
      const f1 = sample(bi, i, j);
      const f2 = sample(bi, i, j);
      const n1 = Number.isNaN(f1);
      const n2 = Number.isNaN(f2);
      if (n1 || n2) {
        skipped += Number(n1) + Number(n2);
        // 하나라도 남으면 그 값으로, 둘 다 없으면 0 — 그 칸에서 나올 수 있는 가장 큰 몫을 어림 오차에(아래)
        sum += (n1 ? (n2 ? 0 : f2) : f1) * cell;
        continue;
      }
      sum += ((f1 + f2) / 2) * cell;
      // 칸 평균의 분산 어림: 두 독립 표본이면 (f1 − f2)² / 4
      varSum += ((f1 - f2) * (f1 - f2)) / 4;
    }
  }
  const brokenCells = skipped; // 광선 하나가 빠진 칸도 그 칸 몫 전체를 모른다고 본다
  return { volume: sum, err: 3 * Math.sqrt(varSum) * cell + brokenCells * cell * ext[W]!, rays: 2 * nu * nv, skipped };
}

/** 간섭 쌍(그물 id 둘)과 그 겹친 부피를 채울 자리 */
export interface OverlapPair {
  a: string;
  b: string;
  volume?: number;
  volumeErr?: number;
}

/**
 * 간섭 쌍들의 겹친 부피를 차례로(앞 쌍부터 — 간섭 검사가 안에 든 쌍·교차가 많은 쌍 차례로 둔다) 구해 쌍에 volume·volumeErr로 싣는다.
 * 두 그물이 모두 닫힌 입체인 쌍만. budgetMs를 넘기면 그 뒤 쌍은 시작하지 않는다(화면을 멈추지 않는 워커에서도 결과가 너무 늦지 않게 —
 * 쌍마다 광선 수는 시간과 무관하게 같아 구한 값은 기기와 상관없이 같다). 돌려주는 left = 시간 한도로 구하지 못한 닫힌 쌍 수
 */
export function overlapVolumes(
  meshes: readonly (OverlapMesh & { id: string; closed?: boolean })[],
  pairs: OverlapPair[],
  opts: { budgetMs?: number; n?: number; now?: () => number; onProgress?: (done: number, total: number) => void } = {},
): { done: number; left: number; ms: number } {
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const t0 = now();
  const budget = opts.budgetMs ?? 4000;
  const byId = new Map(meshes.map((m) => [m.id, m] as const));
  const todo = pairs.filter((p) => byId.get(p.a)?.closed && byId.get(p.b)?.closed);
  let done = 0;
  const cache = new Map<OverlapMesh, ReturnType<typeof world>>();
  for (const p of todo) {
    if (now() - t0 > budget) break;
    opts.onProgress?.(done, todo.length);
    const r = overlapVolume(byId.get(p.a)!, byId.get(p.b)!, { n: opts.n, cache });
    p.volume = r.volume;
    p.volumeErr = r.err;
    done++;
  }
  opts.onProgress?.(done, todo.length);
  return { done, left: todo.length - done, ms: Math.round(now() - t0) };
}
