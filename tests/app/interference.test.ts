import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/index';
import { findInterference, trianglesCross, triRanges, type InterferenceMesh } from '../../src/app/interference';
import { sampleStepBytes } from '../../src/app/sample';
import { cube, cylinder, sphere, StepText } from '../stepText';

type V3 = [number, number, number];

describe('간섭 검사', () => {
  it('삼각형 교차: 뚫고 지나가면 참, 맞닿거나(같은 평면·모서리) 떨어지면 거짓', () => {
    const a: [V3, V3, V3] = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
    ];
    expect(trianglesCross(a, [[0.5, 0.5, -1], [0.5, 0.5, 1], [1, 0.2, 0]], 1e-9)).toBe(true);
    expect(trianglesCross(a, [[0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 0]], 1e-9)).toBe(false);
    expect(trianglesCross(a, [[0.5, 0.5, 0], [1, 0.5, 0], [0.5, 1, 1]], 1e-9)).toBe(false);
    expect(trianglesCross(a, [[5, 5, -1], [5, 5, 1], [6, 5, 0]], 1e-9)).toBe(false);
  });

  it('겹친 두 정육면체는 간섭, 예제(맞닿은 블록·구멍을 지나는 핀)는 간섭 없음', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('a', [cube(w, 10, [0, 0, 0], 'a').solid], ctx);
    const w2 = new StepText();
    const ctx2 = w2.context();
    const a = w2.product('a', [cube(w2, 10).solid], ctx2);
    const b = w2.product('b', [cube(w2, 10).solid], ctx2);
    const g1 = w2.ax2([0, 0, 0]);
    const g2 = w2.ax2([5, 5, 5]);
    const g3 = w2.ax2([10, 0, 0]);
    const root = w2.product('asm', [g1, g2, g3], ctx2, 'SHAPE_REPRESENTATION');
    w2.place(root, a, g1, 'a1');
    w2.place(root, b, g2, 'b1');
    w2.place(root, a, g3, 'a2');
    const s = stepToScene(w2.bytes());
    const r = findInterference(s.meshes);
    // a1 ↔ b1, b1 ↔ a2 는 뚫고, a1 ↔ a2는 맞닿기만(x = 10 면)
    const key = (x: string, y: string) => [x, y].sort().join('|');
    const [m0, m1, m2] = s.meshes.map((m) => m.id);
    expect(r.pairs.map((p) => key(p.a, p.b)).sort()).toEqual([key(m0!, m1!), key(m1!, m2!)].sort());
    expect(r.pairs.every((p) => p.trisA.length > 0 && p.trisB.length > 0)).toBe(true);
    const sample = stepToScene(sampleStepBytes());
    expect(findInterference(sample.meshes).pairs).toEqual([]);
    expect(stepToScene(w.bytes()).meshes).toHaveLength(1);
  });

  it('삼각형 번호 → 이어진 구간', () => {
    expect(triRanges([1, 2, 3, 7, 9, 10])).toEqual([
      { start: 1, count: 3 },
      { start: 7, count: 1 },
      { start: 9, count: 2 },
    ]);
  });
});

/** 축 나란한 상자 그물(바깥 법선 감기, inward면 거꾸로 — 빈 곳 껍질), 닫힌 입체 */
function box(lo: V3, hi: V3, inward = false): { positions: number[]; indices: number[] } {
  const P: number[] = [];
  for (let i = 0; i < 8; i++) P.push(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  // 면마다 두 삼각형(바깥에서 보아 반시계)
  const q = [
    [0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5],
  ];
  const I: number[] = [];
  for (const [a, b, c, d] of q) I.push(...(inward ? [a!, c!, b!, a!, d!, c!] : [a!, b!, c!, a!, c!, d!]));
  return { positions: P, indices: I };
}
const mesh = (id: string, parts: { positions: number[]; indices: number[] }[], closed = true): InterferenceMesh => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const base = positions.length / 3;
    positions.push(...p.positions);
    indices.push(...p.indices.map((i) => i + base));
  }
  return { id, positions: new Float32Array(positions), indices: new Uint32Array(indices), ...(closed ? { closed: true } : {}) };
};
const summary = (ms: InterferenceMesh[]) => findInterference(ms).pairs.map((p) => `${p.a}${p.inside ? ' in ' : ' x '}${p.b}`);

describe('간섭 검사: 한 부품이 다른 부품 안에 통째로 든 경우', () => {
  const big = mesh('big', [box([0, 0, 0], [100, 60, 40])]);

  it('상자 안의 작은 상자는 "안에 듦"(앞이 안쪽), 안쪽 벽에 맞닿아 들어도 안에 듦, 겉면을 뚫으면 예전처럼 교차', () => {
    expect(summary([big, mesh('small', [box([10, 10, 10], [20, 20, 20])])])).toEqual(['small in big']);
    // 차례를 바꿔도 앞이 안쪽
    expect(summary([mesh('small', [box([10, 10, 10], [20, 20, 20])]), big])).toEqual(['small in big']);
    // 바닥 벽에 맞닿아(z = 0) 안에 든 상자 — 맞닿은 면 위 점은 쓰지 않는다
    expect(summary([big, mesh('flush', [box([30, 0, 0], [40, 60, 40])])])).toEqual(['flush in big']);
    const cross = findInterference([big, mesh('cross', [box([90, 10, 10], [110, 20, 20])])]).pairs;
    expect(cross).toHaveLength(1);
    expect(cross[0]!.inside).toBeUndefined();
    expect(cross[0]!.count).toBeGreaterThan(0);
  });

  it('밖에서 맞닿기만 한 상자, 떨어진 상자, 상자가 들어도 입체 밖(오목한 곳)인 부품은 간섭이 아니다', () => {
    expect(summary([big, mesh('touch', [box([100, 0, 0], [120, 60, 40])])])).toEqual([]);
    expect(summary([big, mesh('far', [box([200, 0, 0], [220, 10, 10])])])).toEqual([]);
    // ㄷ자(바닥과 두 벽) 안쪽 빈 곳에 든 상자: 범위 상자는 들지만 입체 밖
    const u = mesh('u', [box([0, 0, 0], [100, 60, 10]), box([0, 0, 10], [10, 60, 40]), box([90, 0, 10], [100, 60, 40])]);
    expect(summary([u, mesh('in-u', [box([40, 20, 20], [60, 40, 30])])])).toEqual([]);
  });

  it('빈 곳(BREP_WITH_VOIDS — 안쪽 껍질은 거꾸로 감김) 안에 든 부품은 안에 들지 않음, 입체 살 속이면 안에 듦', () => {
    const hollow = mesh('hollow', [box([0, 0, 0], [100, 100, 100]), box([20, 20, 20], [80, 80, 80], true)]);
    expect(summary([hollow, mesh('in-void', [box([40, 40, 40], [60, 60, 60])])])).toEqual([]);
    expect(summary([hollow, mesh('in-wall', [box([2, 2, 2], [10, 10, 10])])])).toEqual(['in-wall in hollow']);
  });

  it('같은 자리에 겹쳐 놓인 같은 부품은 안에 듦 한 쌍, 열린 면(닫히지 않은 그물)은 건너뛴다, 감기가 거꾸로인 안쪽 입체도', () => {
    expect(summary([mesh('one', [box([0, 0, 0], [10, 10, 10])]), mesh('two', [box([0, 0, 0], [10, 10, 10])])])).toHaveLength(1);
    expect(summary([big, mesh('open', [box([10, 10, 10], [20, 20, 20])], false)])).toEqual([]);
    expect(summary([mesh('open-big', [box([0, 0, 0], [100, 60, 40])], false), mesh('small', [box([10, 10, 10], [20, 20, 20])])])).toEqual([]);
    expect(summary([big, mesh('rev', [box([10, 10, 10], [20, 20, 20], true)])])).toEqual(['rev in big']);
  });

  it('STEP 조립: 상자 안의 원기둥·구(곡면 삼각형, 자리 변환)는 안에 듦, 상자 밖 구는 아님', () => {
    const w = new StepText();
    const ctx = w.context();
    const box40 = w.product('box', [cube(w, 40).solid], ctx);
    const pin = w.product('pin', [cylinder(w, 3, 10)], ctx);
    const ball = w.product('ball', [sphere(w, 4)], ctx);
    const g = [w.ax2([0, 0, 0]), w.ax2([20, 20, 5]), w.ax2([10, 30, 30]), w.ax2([80, 0, 0])];
    const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
    w.place(root, box40, g[0]!, 'box-1');
    w.place(root, pin, g[1]!, 'pin-1');
    w.place(root, ball, g[2]!, 'ball-1');
    w.place(root, ball, g[3]!, 'ball-2');
    const s = stepToScene(w.bytes());
    expect(s.meshes.every((m) => m.closed)).toBe(true);
    const name = new Map(s.meshes.map((m) => [m.id, m.group]));
    const r = findInterference(s.meshes);
    expect(r.pairs.map((p) => `${name.get(p.a)}${p.inside ? ' in ' : ' x '}${name.get(p.b)}`).sort()).toEqual(['ball in box', 'pin in box']);
  });
});

// ───────────── 그물마다 다시 쓰기(12차) 전·후 같은 결과 ─────────────

type Tri = [V3, V3, V3];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 11차까지의 삼각형 교차 판정(꼭짓점 배열로 셈하던 것 그대로) — 기준 */
function refCross(a: Tri, b: Tri, eps: number): boolean {
  const n1 = cross3(sub3(a[1], a[0]), sub3(a[2], a[0]));
  const l1 = Math.hypot(...n1);
  const n2 = cross3(sub3(b[1], b[0]), sub3(b[2], b[0]));
  const l2 = Math.hypot(...n2);
  if (!(l1 > 0) || !(l2 > 0)) return false;
  const d1 = dot3(n1, a[0]);
  const db = b.map((p) => (dot3(n1, p) - d1) / l1);
  if (!(Math.min(...db) < -eps && Math.max(...db) > eps)) return false;
  const d2 = dot3(n2, b[0]);
  const da = a.map((p) => (dot3(n2, p) - d2) / l2);
  if (!(Math.min(...da) < -eps && Math.max(...da) > eps)) return false;
  const dir = cross3(n1, n2);
  const k = [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])];
  const ax = k[0]! >= k[1]! && k[0]! >= k[2]! ? 0 : k[1]! >= k[2]! ? 1 : 2;
  const span = (t: Tri, d: number[]): [number, number] | null => {
    const pts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const di = d[i]!;
      const dj = d[j]!;
      if ((di < 0 && dj > 0) || (di > 0 && dj < 0)) pts.push(t[i]![ax]! + (t[j]![ax]! - t[i]![ax]!) * (di / (di - dj)));
      else if (di === 0) pts.push(t[i]![ax]!);
    }
    return pts.length >= 2 ? [Math.min(...pts), Math.max(...pts)] : null;
  };
  const sa = span(a, da);
  const sb = span(b, db);
  if (!sa || !sb) return false;
  return Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > eps;
}

/**
 * 11차까지의 교차 쌍 찾기(쌍마다 두 그물 전체에서 겹친 상자 안 삼각형을 다시 고르고, 칸 열쇠 Map 격자) — 기준.
 * 교차하는 쌍만(안에 듦은 바꾸지 않았다)
 */
function refPairs(meshes: InterferenceMesh[], limit: number): { a: string; b: string; count: number; trisA: number[]; trisB: number[] }[] {
  const W = meshes.map((m) => {
    const p = Float64Array.from(m.positions);
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i++) {
      lo[i % 3] = Math.min(lo[i % 3]!, p[i]!);
      hi[i % 3] = Math.max(hi[i % 3]!, p[i]!);
    }
    return { id: m.id, p, idx: m.indices!, tris: m.indices!.length / 3, lo, hi };
  });
  type Wd = (typeof W)[number];
  const vtx = (w: Wd, t: number, c: number): V3 => {
    const i = w.idx[t * 3 + c]! * 3;
    return [w.p[i]!, w.p[i + 1]!, w.p[i + 2]!];
  };
  const glo = [0, 1, 2].map((k) => Math.min(...W.map((w) => w.lo[k]!)));
  const ghi = [0, 1, 2].map((k) => Math.max(...W.map((w) => w.hi[k]!)));
  const eps = Math.max(Math.hypot(ghi[0]! - glo[0]!, ghi[1]! - glo[1]!, ghi[2]! - glo[2]!) * 1e-6, 1e-12);
  const order = W.map((_, i) => i).sort((i, j) => W[i]!.lo[0] - W[j]!.lo[0]);
  const out: ReturnType<typeof refPairs> = [];
  for (let s0 = 0; s0 < order.length; s0++)
    for (let t0 = s0 + 1; t0 < order.length; t0++) {
      const A = W[order[s0]!]!;
      const B = W[order[t0]!]!;
      if (B.lo[0] > A.hi[0] - eps) break;
      if (B.lo[1] > A.hi[1] - eps || B.hi[1] < A.lo[1] + eps || B.lo[2] > A.hi[2] - eps || B.hi[2] < A.lo[2] + eps) continue;
      const lo = [0, 1, 2].map((k) => Math.max(A.lo[k]!, B.lo[k]!) - eps);
      const hi = [0, 1, 2].map((k) => Math.min(A.hi[k]!, B.hi[k]!) + eps);
      const inBox = (w: Wd) => {
        const r: number[] = [];
        for (let t = 0; t < w.tris; t++) {
          const [a, b, c] = [vtx(w, t, 0), vtx(w, t, 1), vtx(w, t, 2)];
          if ([0, 1, 2].every((k) => !(Math.max(a[k]!, b[k]!, c[k]!) < lo[k]! || Math.min(a[k]!, b[k]!, c[k]!) > hi[k]!))) r.push(t);
        }
        return r;
      };
      const ta = inBox(A);
      const tb = inBox(B);
      if (!ta.length || !tb.length) continue;
      const cells = Math.max(1, Math.min(64, Math.round(Math.cbrt(ta.length + tb.length))));
      const cs = [0, 1, 2].map((k) => Math.max((hi[k]! - lo[k]!) / cells, 1e-12));
      const key = (x: number, y: number, z: number) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
      const range = (w: Wd, t: number) => {
        const v = [vtx(w, t, 0), vtx(w, t, 1), vtx(w, t, 2)];
        return [0, 1, 2].map((k) => [
          Math.max(0, Math.floor((Math.min(...v.map((q) => q[k]!)) - lo[k]!) / cs[k]!)),
          Math.min(cells - 1, Math.floor((Math.max(...v.map((q) => q[k]!)) - lo[k]!) / cs[k]!)),
        ]);
      };
      const grid = new Map<number, number[]>();
      for (const t of ta) {
        const r = range(A, t);
        for (let x = r[0]![0]!; x <= r[0]![1]!; x++)
          for (let y = r[1]![0]!; y <= r[1]![1]!; y++)
            for (let z = r[2]![0]!; z <= r[2]![1]!; z++) {
              const k = key(x, y, z);
              if (!grid.has(k)) grid.set(k, []);
              grid.get(k)!.push(t);
            }
      }
      const hitA = new Set<number>();
      const hitB = new Set<number>();
      let count = 0;
      for (const t of tb) {
        const r = range(B, t);
        const tri: Tri = [vtx(B, t, 0), vtx(B, t, 1), vtx(B, t, 2)];
        const seen = new Set<number>();
        for (let x = r[0]![0]!; x <= r[0]![1]!; x++)
          for (let y = r[1]![0]!; y <= r[1]![1]!; y++)
            for (let z = r[2]![0]!; z <= r[2]![1]!; z++)
              for (const s of grid.get(key(x, y, z)) ?? []) {
                if (seen.has(s)) continue;
                seen.add(s);
                if (refCross([vtx(A, s, 0), vtx(A, s, 1), vtx(A, s, 2)], tri, eps)) {
                  count++;
                  if (hitA.size < limit) hitA.add(s);
                  if (hitB.size < limit) hitB.add(t);
                }
              }
      }
      if (count) out.push({ a: A.id, b: B.id, count, trisA: [...hitA].sort((x, y) => x - y), trisB: [...hitB].sort((x, y) => x - y) });
    }
  return out.sort((x, y) => y.count - x.count);
}

/** 물결 높이 그물 z = h(x, y) — n×n 칸(삼각형 2n²), 정점은 float32 */
function wave(id: string, n: number, size: number, h: (x: number, y: number) => number, o: V3 = [0, 0, 0]): InterferenceMesh {
  const P = new Float32Array((n + 1) * (n + 1) * 3);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * size;
      const y = (j / n) * size;
      P.set([x + o[0], y + o[1], h(x, y) + o[2]], (j * (n + 1) + i) * 3);
    }
  const I = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      I.set([a, a + 1, a + n + 2, a, a + n + 2, a + n + 1], k);
      k += 6;
    }
  return { id, positions: P, indices: I };
}

describe('간섭 검사: 그물마다 한 번 구한 삼각형 상자·평면을 쌍 사이에 다시 써도 결과가 같다', () => {
  it('삼각형 교차 판정이 예전 셈과 같다(흩뿌린 삼각형·같은 평면·꼭짓점이 평면 위·아주 납작함)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    const pt = (s = 1): V3 => [rnd() * s, rnd() * s, rnd() * s];
    let hits = 0;
    for (let i = 0; i < 20000; i++) {
      const a: Tri = [pt(), pt(), pt()];
      const kind = i % 5;
      const b: Tri =
        kind === 0 ? [pt(), pt(), pt()]
        : kind === 1 ? [[a[0][0], a[0][1], a[0][2]], pt(), pt()] // 꼭짓점 하나를 함께
        : kind === 2 ? [[(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2, (a[0][2] + a[1][2]) / 2], pt(), pt()] // a의 변 위 점
        : kind === 3 ? [pt(), pt(), [a[2][0] + 1e-9, a[2][1], a[2][2]]] // 거의 맞닿음
        : [pt(), [a[1][0] + rnd() * 1e-7, a[1][1], a[1][2]], [a[2][0], a[2][1] + rnd() * 1e-7, a[2][2]]]; // 아주 납작·거의 같은 평면
      for (const eps of [1e-9, 1e-6, 1e-3]) {
        const want = refCross(a, b, eps);
        expect(trianglesCross(a, b, eps), `${i} ${eps}`).toBe(want);
        if (want) hits++;
      }
    }
    expect(hits).toBeGreaterThan(1000);
  });

  it('여러 그물(쌍마다 겹친 상자가 다름)과 강조 삼각형 한도: 예전 방법과 쌍·교차 수·강조 삼각형이 같다', () => {
    const ms = [
      wave('a', 40, 100, (x, y) => 20 * Math.sin(x / 9) * Math.cos(y / 13)),
      wave('b', 37, 100, (x, y) => 15 * Math.cos(x / 7 + 1) + 5 * Math.sin(y / 5)),
      wave('c', 25, 60, (x, y) => 30 * Math.sin((x + y) / 11), [30, 10, -5]),
      wave('d', 18, 40, () => 3, [70, 60, 0]),
      wave('far', 10, 10, () => 0, [500, 500, 500]),
    ];
    for (const limit of [2000, 37, 5]) {
      const got = findInterference(ms, { limit }).pairs.filter((p) => !p.inside);
      expect(got.length).toBeGreaterThan(3);
      expect(got).toEqual(refPairs(ms, limit));
    }
  });

  it('겹친 상자 안 삼각형이 많아 칸이 57칸 넘는 쌍(예전 Map 격자에서 열쇠가 같은 칸 짝이 생김)도 같다', () => {
    const ms = [wave('a', 220, 100, (x, y) => 40 * Math.sin(x / 6) * Math.sin(y / 7)), wave('b', 220, 100, (x, y) => 40 * Math.cos(x / 5) * Math.sin(y / 9 + 0.5))];
    const r = findInterference(ms, { limit: 300 });
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.count).toBeGreaterThan(300);
    expect(r.pairs).toEqual(refPairs(ms, 300));
  });

  it('예전 Map 격자에서 열쇠가 같은 두 칸((22,23,45)·(56,17,13), 58칸)의 목록을 함께 보던 차례까지 같다(강조 한도 1)', () => {
    // 두 그물의 범위를 [0, 58]³으로(구석 작은 삼각형), 겹친 상자 안 삼각형이 19만여 개라 칸이 58칸(한 칸 ≈ 1)
    const corners: Tri[] = [
      [[0, 0, 0], [0.01, 0, 0], [0, 0.01, 0]],
      [[58, 58, 58], [57.99, 58, 58], [58, 57.99, 58]],
    ];
    const filler = (y0: number): Tri[] =>
      Array.from({ length: 96000 }, (_, i) => {
        const p: V3 = [1 + (i % 50) * 0.18, y0 + (Math.floor(i / 50) % 40) * 0.18, 1 + Math.floor(i / 2000) * 0.18];
        return [p, [p[0] + 0.01, p[1], p[2]], [p[0], p[1] + 0.01, p[2]]];
      });
    // B의 큰 삼각형 t: 범위가 (22,23,45) 칸과 (56,17,13) 칸을 모두 덮는다
    const T: Tri = [[22.5, 23.5, 45.5], [57.5, 17.5, 12.5], [57.5, 17.5, 30]];
    const at = (w: number[]): V3 => [0, 1, 2].map((k) => w[0]! * T[0][k]! + w[1]! * T[1][k]! + w[2]! * T[2][k]!) as V3;
    const n = cross3(sub3(T[1], T[0]), sub3(T[2], T[0]));
    const nl = Math.hypot(...n);
    const nu: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    const e = sub3(T[2], T[1]);
    const el = Math.hypot(...e);
    const eu: V3 = [e[0] / el, e[1] / el, e[2] / el];
    // t를 뚫는 작은 삼각형: s2는 (56,17,13) 칸, s3는 x 36칸(방문 차례로는 s3가 먼저지만 예전 격자는 (22,23,45)에서 s2를 먼저 만났다)
    const pierce = (c: V3): Tri => [
      [c[0] + 0.3 * nu[0], c[1] + 0.3 * nu[1], c[2] + 0.3 * nu[2]],
      [c[0] - 0.3 * nu[0] + 0.2 * eu[0], c[1] - 0.3 * nu[1] + 0.2 * eu[1], c[2] - 0.3 * nu[2] + 0.2 * eu[2]],
      [c[0] - 0.3 * nu[0] - 0.2 * eu[0], c[1] - 0.3 * nu[1] - 0.2 * eu[1], c[2] - 0.3 * nu[2] - 0.2 * eu[2]],
    ];
    const p2 = at([0.02, 0.97, 0.01]);
    const p3 = at([0.6, 0.2, 0.2]);
    expect(p2.map(Math.floor)).toEqual([56, 17, 13]);
    expect(Math.floor(p3[0])).toBe(36);
    const toMesh = (id: string, tris: Tri[]): InterferenceMesh => ({ id, positions: new Float32Array(tris.flat(2)), indices: Uint32Array.from(tris.flatMap((_, i) => [i * 3, i * 3 + 1, i * 3 + 2])) });
    const A = toMesh('a', [...corners, ...filler(50), pierce(p3), pierce(p2)]);
    const B = toMesh('b', [...corners, ...filler(40), T]);
    const s3 = 2 + 96000;
    const s2 = s3 + 1;
    const ref = refPairs([A, B], 1);
    expect(ref).toEqual([{ a: 'a', b: 'b', count: 2, trisA: [s2], trisB: [2 + 96000] }]);
    expect(findInterference([A, B], { limit: 1 }).pairs).toEqual(ref);
    expect(findInterference([A, B], { limit: 2 }).pairs[0]!.trisA).toEqual([s3, s2]);
  });
});
