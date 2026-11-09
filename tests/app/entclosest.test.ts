// 개체 측정 최소 거리를 코어 나눠 돌리기로(62차 — entpick EntClosest, 코어 0.41.0·0.45.0 closestPointsAsync):
// - 면 모양(pickedShape)은 코어 closestPart(면 표의 이어진 삼각형 구간)라 뷰어 closestPoints의 rangeA·rangeB와 바이트까지 같은 답이고,
//   모든 삼각형 쌍을 float64로 잰 최솟값과 1e-9 상대 안쪽이다. 61차 앱 길(면 삼각형을 세계 좌표 − 면 가운데로 float32에 복사)과는 float32 반올림만큼 다르다
// - EntClosest: 구하는 동안 null, 다 구하면 later() 한 번 — 그 뒤 closest·parts는 한 번에 부른 closestPoints·closestBetween과 바이트까지 같다.
//   해석적으로 재는 짝은 찾지 않고, 짝이 바뀌거나 cancel()이면 멈춘다(later 없음 — signal로 거절), 작은 조각 시간이면 여러 조각으로 나뉘어도 같은 답
// - 앱 흐름(EntClosest → measurePicked → 46차 partsLater 받기): 핀–받침판 부품 사이 0.4가 "≈" 뒤 받혀 정확한 값이 된다
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, closestTriTri, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc, stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { edgeDetails } from '../../src/app/edges';
import { closestNeeds, EntClosest, measurePicked, pickedClosest, pickedEdge, pickedFace, pickedPoint, pickedShape, type Picked } from '../../src/app/entpick';
import { entRefine } from '../../src/app/exactdist';
import { faceDetails, type FacePick } from '../../src/app/faces';
import { sampleStepBytes } from '../../src/app/sample';
import { cylinder, StepText, type P3 } from '../stepText';
import { installDom } from './fakeview';

type V3 = [number, number, number];

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
});
afterAll(() => dom.restore());

function open(bytes: Uint8Array) {
  const { scene } = stepToSceneDeferred(bytes);
  const d = createDoc('t.stp', bytes.length, { scene, ms: 0 } as never);
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  v.setScene(scene);
  const meshOf = (id: string): Mesh3d | undefined => scene.meshes.find((m) => m.id === id);
  const faces = (m: Mesh3d): FacePick[] => {
    const fx = stepFaceIndex(scene)!;
    const t = fx.tables[fx.tableOf.get(m.id)!]!;
    return Array.from({ length: t.kinds.length }, (_, i) => faceDetails(m, t, i, fx.kinds)!);
  };
  const named = (name: string): Mesh3d => {
    let id: string | undefined;
    const walk = (n: (typeof d.products)[number]) => {
      if (n.name === name && n.meshIds.length) id ??= n.meshIds[0];
      n.children.forEach(walk);
    };
    d.products.forEach(walk);
    return scene.meshes.find((m) => m.id === id)!;
  };
  return { scene, d, v, meshOf, faces, named };
}

/** 조립: 부품(이름, 만들기, 자리 원점, 자리 z축) — 기운 자리 행렬도 */
function assemblyBytes(parts: [string, (w: StepText) => number, P3, P3?][]): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const g = parts.map(([, , o, z]) => {
    const zz = z ?? [0, 0, 1];
    const x: P3 = Math.abs(zz[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = x[0] * zz[0] + x[1] * zz[1] + x[2] * zz[2];
    return w.ax2(o, zz, [x[0] - d * zz[0], x[1] - d * zz[1], x[2] - d * zz[2]]);
  });
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  return w.bytes();
}

/** 해석적으로 못 재는 면처럼(개체 없음 — 최소 거리로 잰다) */
const loose = (p: Picked): Picked => ({ ...p, entity: null });

/** 그물 정점 i의 세계 좌표(float64 — 자리 행렬 · (정점 + 원점)) */
function world(m: Mesh3d, i: number): V3 {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const x = P[i * 3]! + o[0], y = P[i * 3 + 1]! + o[1], z = P[i * 3 + 2]! + o[2];
  const M = m.matrix;
  return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
}

/** 면 삼각형 쌍을 모두 잰 최소 거리(float64) */
function bruteFaces(ma: Mesh3d, fa: FacePick, mb: Mesh3d, fb: FacePick): number {
  const tri = (m: Mesh3d, t: number): [V3, V3, V3] => {
    const I = m.indices;
    return [0, 1, 2].map((k) => world(m, I ? I[t * 3 + k]! : t * 3 + k)) as [V3, V3, V3];
  };
  const A = Array.from({ length: fa.triangles }, (_, i) => tri(ma, fa.triStart + i));
  const B = Array.from({ length: fb.triangles }, (_, i) => tri(mb, fb.triStart + i));
  let best = Infinity;
  for (const a of A) for (const b of B) best = Math.min(best, closestTriTri(a, b).d2);
  return Math.sqrt(best);
}

/** 61차 앱 길(시험 안 사본): 면 삼각형을 세계 좌표 − 면 가운데로 float32에 복사 */
function legacyClosest(fa: FacePick, ma: Mesh3d, fb: FacePick, mb: Mesh3d): { a: V3; b: V3; distance: number } | null {
  const shape = (f: FacePick, m: Mesh3d): ClosestShape => {
    const c = f.center;
    const I = m.indices;
    const pos = new Float32Array(f.triangles * 9);
    for (let t = 0; t < f.triangles; t++)
      for (let k = 0; k < 3; k++) {
        const w = world(m, I ? I[(f.triStart + t) * 3 + k]! : (f.triStart + t) * 3 + k);
        for (let q = 0; q < 3; q++) pos[t * 9 + k * 3 + q] = w[q]! - c[q]!;
      }
    return { kind: 'triangle', positions: pos, bvh: buildBvh('triangle', pos), model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, c[0], c[1], c[2], 1] };
  };
  const r = closestBetween(shape(fa, ma), shape(fb, mb));
  return r && { a: [...r.a] as V3, b: [...r.b] as V3, distance: r.distance };
}

const same = (r: { a: readonly number[]; b: readonly number[]; distance: number } | null, q: { a: readonly number[]; b: readonly number[]; distance: number } | null) =>
  r && q ? [...r.a, ...r.b, r.distance].every((x, i) => Object.is(x, [...q.a, ...q.b, q.distance][i])) : r === q;

describe('면 모양 = 코어 면 구간(62차)', () => {
  it('예제 조립·기운 원기둥 조립의 면 짝: pickedClosest = 뷰어 closestPoints(rangeA·rangeB) 바이트까지, 삼각형 쌍 전수 최솟값과 1e-9 상대 안쪽, 61차 길과는 float32 반올림만큼', () => {
    const cases = [
      open(sampleStepBytes()),
      open(
        assemblyBytes([
          ['a', (w) => cylinder(w, 2, 6), [0, 0, 0]],
          ['b', (w) => cylinder(w, 1.5, 5), [7, 1, 2], [0.6, 0, 0.8]],
        ]),
      ),
    ];
    let pairs = 0;
    let brute = 0;
    let worstBrute = 0;
    let worstLegacy = 0;
    for (const c of cases) {
      const meshes = c.scene.meshes.filter((m) => m.positions.length >= 9 && !c.d.vis.pmiIds.has(m.id)).slice(0, 3);
      for (let i = 0; i < meshes.length; i++)
        for (let j = i + 1; j < meshes.length; j++) {
          const ma = meshes[i]!, mb = meshes[j]!;
          for (const fa of c.faces(ma))
            for (const fb of c.faces(mb)) {
              const A = loose(pickedFace(fa, fa.center));
              const B = loose(pickedFace(fb, fb.center));
              const r = pickedClosest(A, B, c.meshOf)!;
              const q = c.v.closestPoints(ma.id, mb.id, { rangeA: { start: fa.triStart, count: fa.triangles }, rangeB: { start: fb.triStart, count: fb.triangles } });
              expect(same(r, q), `${ma.id}:${fa.face} ${mb.id}:${fb.face}`).toBe(true);
              pairs++;
              if (fa.triangles * fb.triangles <= 40_000) {
                const e = bruteFaces(ma, fa, mb, fb);
                worstBrute = Math.max(worstBrute, Math.abs(r.distance - e) / Math.max(e, 1e-12));
                expect(Math.abs(r.distance - e)).toBeLessThanOrEqual(1e-9 * Math.max(e, 1));
                brute++;
              }
              const l = legacyClosest(fa, ma, fb, mb)!;
              worstLegacy = Math.max(worstLegacy, Math.abs(l.distance - r.distance));
              expect(Math.abs(l.distance - r.distance)).toBeLessThan(1e-4);
            }
        }
    }
    expect(pairs).toBeGreaterThan(100);
    expect(brute).toBeGreaterThan(50);
    expect(worstBrute).toBeLessThan(1e-9);
    // 61차 길은 세계 좌표를 float32로 다시 반올림했다(이 장면 크기에서 1e-6 남짓)
    expect(worstLegacy).toBeGreaterThan(0);
  });
});

describe('EntClosest: 코어 나눠 돌리기(62차)', () => {
  it('면 짝: 구하는 동안 null → later 한 번 → 고른 면 사이·부품 사이 답이 한 번에 부른 closestPoints와 바이트까지 같다(번호는 면 구간 안)', async () => {
    const c = open(sampleStepBytes());
    const pin = c.named('핀');
    const plate = c.named('받침판');
    const fa = c.faces(pin).find((f) => f.kind === 'cylinder')!;
    const fb = c.faces(plate).find((f) => f.kind === 'cylinder')!;
    const A = loose(pickedFace(fa, fa.center));
    const B = loose(pickedFace(fb, fb.center));
    const spy = vi.spyOn(c.v, 'closestPointsAsync');
    const E = new EntClosest();
    const key = {};
    const later = vi.fn();
    expect(E.get(key, A, B, c.v, c.meshOf, later)).toBeNull();
    await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
    const got = E.get(key, A, B, c.v, c.meshOf, later)!;
    const rangeA = { start: fa.triStart, count: fa.triangles };
    const rangeB = { start: fb.triStart, count: fb.triangles };
    const want = c.v.closestPoints(pin.id, plate.id, { rangeA, rangeB, indices: true })!;
    expect(got.closest!(A, B)).toEqual(want);
    expect(want.rawA! - fa.triStart).toBeGreaterThanOrEqual(0);
    expect(want.rawA! - fa.triStart).toBeLessThan(fa.triangles);
    expect(got.parts!(pin.id, plate.id)).toEqual(c.v.closestPoints(pin.id, plate.id, { indices: true }));
    // 뷰어에 두 번(면 구간 → 부품 통째), 둘 다 번호·멈추기 신호와 함께. 같은 짝을 다시 물어도 다시 찾지 않는다
    expect(spy.mock.calls.map(([a, b, o]) => [a, b, !!o?.rangeA, !!o?.rangeB, o?.indices, o?.signal instanceof AbortSignal])).toEqual([
      [pin.id, plate.id, true, true, true, true],
      [pin.id, plate.id, false, false, true, true],
    ]);
    E.get(key, A, B, c.v, c.meshOf, later);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledTimes(1);
    expect(E.stats.slices).toBeGreaterThanOrEqual(2);
  });

  it('모서리·점이 끼면 순수 나눠 돌리기(같은 그물이면 부품 사이 없음), 해석적으로 재는 짝은 찾지 않는다', async () => {
    const c = open(sampleStepBytes());
    const pin = c.named('핀');
    const fa = c.faces(pin).find((f) => f.kind === 'cylinder')!;
    const ex = stepEdgeIndex(c.scene)!;
    const t = ex.tables[ex.tableOf.get(pin.id)!]!;
    const ep = edgeDetails(pin, t, 0, ex.kinds)!;
    const A = loose(pickedFace(fa, fa.center));
    const B = loose(pickedEdge(ep, ep.ends[0]));
    expect(closestNeeds(A, B)).toEqual({ closest: true, parts: false });
    const spy = vi.spyOn(c.v, 'closestPointsAsync');
    const E = new EntClosest();
    const later = vi.fn();
    const key = {};
    expect(E.get(key, A, B, c.v, c.meshOf, later)).toBeNull();
    await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
    const got = E.get(key, A, B, c.v, c.meshOf, later)!;
    expect('parts' in got).toBe(false);
    const want = closestBetween(pickedShape(A, pin)!, pickedShape(B, pin)!, { indices: true });
    expect(got.closest!(A, B)).toEqual(want);
    expect(spy).not.toHaveBeenCalled();
    // 점 – 면(다른 부품): 고른 개체는 순수, 부품 사이는 뷰어
    const plate = c.named('받침판');
    const P = loose(pickedPoint(plate.id, [0, 0, 0]));
    const later2 = vi.fn();
    const key2 = {};
    expect(E.get(key2, A, P, c.v, c.meshOf, later2)).toBeNull();
    await vi.waitFor(() => expect(later2).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
    expect(spy.mock.calls.map(([, , o]) => !!o?.rangeA)).toEqual([false]);
    // 해석적으로 재는 짝: 곧바로 빈 선택(코어를 부르지 않는다)
    const fb = c.faces(pin).find((f) => f.kind === 'plane')!;
    const later3 = vi.fn();
    expect(E.get({}, pickedFace(fa, fa.center), pickedFace(fb, fb.center), c.v, c.meshOf, later3)).toEqual({});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(later3).not.toHaveBeenCalled();
  });

  it('짝이 바뀌거나 cancel()이면 멈춘다(앞 짝 later 없음), 작은 조각 시간으로 여러 조각에 나뉘어도 같은 답', async () => {
    const c = open(
      assemblyBytes([
        ['pin', (w) => cylinder(w, 1.9, 8), [0, 0, 0]],
        ['tube', (w) => cylinder(w, 2, 8), [0, 0, 0.5]],
      ]),
    );
    const [ma, mb] = c.scene.meshes.filter((m) => m.positions.length >= 9);
    const fa = c.faces(ma!).find((f) => f.kind === 'cylinder')!;
    const fb = c.faces(mb!).find((f) => f.kind === 'cylinder')!;
    const A = loose(pickedFace(fa, fa.center));
    const B = loose(pickedFace(fb, fb.center));
    const E = new EntClosest();
    const spy = vi.spyOn(c.v, 'closestPointsAsync');
    const first = vi.fn();
    E.get({}, A, B, c.v, c.meshOf, first, 0.01);
    const sig = spy.mock.calls[0]![2]!.signal!;
    // 새 짝: 앞 것은 멈춘다
    const key = {};
    const second = vi.fn();
    expect(E.get(key, A, B, c.v, c.meshOf, second, 0.01)).toBeNull();
    expect(sig.aborted).toBe(true);
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1), { timeout: 10_000, interval: 5 });
    expect(first).not.toHaveBeenCalled();
    const got = E.get(key, A, B, c.v, c.meshOf, second, 0.01)!;
    expect(got.closest!(A, B)).toEqual(c.v.closestPoints(ma!.id, mb!.id, { rangeA: { start: fa.triStart, count: fa.triangles }, rangeB: { start: fb.triStart, count: fb.triangles }, indices: true }));
    expect(got.parts!(ma!.id, mb!.id)).toEqual(c.v.closestPoints(ma!.id, mb!.id, { indices: true }));
    expect(E.stats.slices).toBeGreaterThan(2);
    // cancel(): 멈추고 later 없음
    const third = vi.fn();
    E.get({}, A, B, c.v, c.meshOf, third, 0.01);
    const sig3 = spy.mock.calls.at(-1)![2]!.signal!;
    E.cancel();
    expect(sig3.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(third).not.toHaveBeenCalled();
  });

  it('앱 흐름: EntClosest → measurePicked → 46차 partsLater — 핀–받침판 부품 사이가 "≈" 뒤 받혀 0.4', { timeout: 30_000 }, async () => {
    const c = open(sampleStepBytes());
    const pin = c.named('핀');
    const plate = c.named('받침판');
    const app = { ent: {} as object, scene: c.scene, faces: c.d.faces, edges: c.d.edges };
    const A = pickedPoint(pin.id, [0, 0, 0]);
    const B = { ...pickedPoint(plate.id, [0, 0, 0]), entity: null };
    const E = new EntClosest();
    const results: ReturnType<typeof measurePicked>[] = [];
    let calls = 0;
    const again = (): void => {
      calls++;
      const near = E.get(app.ent, A, B, c.v, c.meshOf, again);
      if (!near) return;
      results.push(measurePicked(A, B, { size: 30, ...near, ...entRefine(app, 30, null, again) }));
    };
    again();
    expect(results).toHaveLength(0);
    await vi.waitFor(() => expect(results.at(-1)?.lines.at(-1)?.approx).toBe(false), { timeout: 20_000, interval: 10 });
    const first = results[0]!.lines.find((l) => l.label === '부품 사이 최소 거리')!;
    expect(first.approx).toBe(true);
    expect(first.value).toBeLessThan(0.4);
    const last = results.at(-1)!.lines.find((l) => l.label === '부품 사이 최소 거리')!;
    expect(Math.abs(last.value - 0.4)).toBeLessThan(1e-9);
    // 처음(구하는 중) · 최소 거리를 다 구함 · 받기를 마침 — 세 번
    expect(calls).toBe(3);
  });
});
