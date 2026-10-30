import { describe, expect, it } from 'vitest';
import { normalFormat, unpackValue } from 'opencad-viewer3d/attribs';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { createDoc, stepFaceIndex } from '../../src/app/doc';
import { meshesToObj, meshesToStl } from '../../src/app/export';
import { findInterference } from '../../src/app/interference';
import { packSceneNormals } from '../../src/app/normals';
import { localProps, physProps } from '../../src/app/physics';
import { collectTransfers } from '../../src/app/protocol';
import { sampleStepBytes } from '../../src/app/sample';
import { cylinder, sphere, StepText } from '../stepText';

/** 예제 조립(같은 블록 두 자리 — 법선 배열을 함께 씀)과 겹친 원기둥 둘·구(곡면 법선) */
function scenes(): Scene3d[] {
  const w = new StepText();
  const ctx = w.context();
  const cyl = w.product('cyl', [cylinder(w, 4, 10)], ctx);
  const ball = w.product('ball', [sphere(w, 3)], ctx);
  const a1 = w.ax2([0, 0, 0]);
  const a2 = w.ax2([3, 0, 2], [1, 0, 0], [0, 1, 0]);
  const a3 = w.ax2([20, 0, 0]);
  const root = w.product('asm', [a1, a2, a3], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, a1, 'cyl-1');
  w.place(root, cyl, a2, 'cyl-2');
  w.place(root, ball, a3, 'ball-1');
  return [stepToScene(sampleStepBytes()), stepToScene(w.bytes())];
}

/** 그물 배열은 함께 쓰는 꼴 그대로 두고 법선만 새 배열로(같은 Float32 배열은 같은 사본) */
function cloneNormals(s: Scene3d): Scene3d {
  const copies = new Map<unknown, Float32Array>();
  const meshes = s.meshes.map((m): Mesh3d => {
    if (!(m.normals instanceof Float32Array)) return { ...m };
    let c = copies.get(m.normals);
    if (!c) copies.set(m.normals, (c = m.normals.slice()));
    return { ...m, normals: c };
  });
  return { ...s, meshes };
}

/** 정수 법선을 단위 벡터로 */
function unpacked(a: Int8Array, i: number): [number, number, number] {
  const x = unpackValue(a[i * 4]!, 'byte'), y = unpackValue(a[i * 4 + 1]!, 'byte'), z = unpackValue(a[i * 4 + 2]!, 'byte');
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

describe('워커가 넘기기 전 법선 줄이기(Int8 정점 4값)', () => {
  it('Float32 법선을 Int8 정점 4값으로 바꾸고, 같은 부품 자리끼리 함께 쓰던 배열은 한 번만 줄여 함께 쓴다', () => {
    for (const s of scenes()) {
      const before = new Map(s.meshes.map((m) => [m.id, m.normals]));
      const shared = new Set(s.meshes.map((m) => m.normals)).size;
      expect(shared).toBeLessThan(s.meshes.length); // 같은 부품 두 자리
      const nv = new Map(s.meshes.map((m) => [m.id, m.positions.length / 3]));
      const r = packSceneNormals(s);
      expect(r.arrays).toBe(shared);
      expect(r.after * 3).toBe(r.before); // 12바이트 → 4바이트
      for (const m of s.meshes) {
        expect(m.normals).toBeInstanceOf(Int8Array);
        expect(m.normals!.length).toBe(nv.get(m.id)! * 4);
        expect(normalFormat(m.normals, nv.get(m.id)!)).toEqual({ type: 'byte', normalized: true, size: 3, per: 4, stride: 4 });
      }
      // 함께 쓰던 자리는 줄인 뒤에도 같은 배열
      for (const a of s.meshes)
        for (const b of s.meshes) if (before.get(a.id) === before.get(b.id)) expect(a.normals).toBe(b.normals);
      expect(new Set(s.meshes.map((m) => m.normals)).size).toBe(shared);
    }
  });

  it('방향 오차는 0.4° 안이고 넷째 값은 0', () => {
    for (const s of scenes()) {
      const orig = new Map(s.meshes.map((m) => [m.id, m.normals as Float32Array]));
      packSceneNormals(s);
      let worst = 0;
      for (const m of s.meshes) {
        const F = orig.get(m.id)!;
        const P = m.normals as Int8Array;
        for (let i = 0; i < F.length / 3; i++) {
          const l = Math.hypot(F[i * 3]!, F[i * 3 + 1]!, F[i * 3 + 2]!);
          const u = unpacked(P, i);
          const c = (F[i * 3]! * u[0] + F[i * 3 + 1]! * u[1] + F[i * 3 + 2]! * u[2]) / l;
          worst = Math.max(worst, (Math.acos(Math.min(1, c)) * 180) / Math.PI);
          expect(P[i * 4 + 3]).toBe(0);
        }
      }
      expect(worst).toBeGreaterThan(0); // 곡면 법선은 반올림된다
      expect(worst).toBeLessThan(0.4);
    }
  });

  it('위치·색인·윤곽선·색은 그대로 두고, 옮기는 버퍼는 법선 몫만 준다', () => {
    for (const s of scenes()) {
      const keep = s.meshes.map((m) => [m.positions, m.indices, m.edges, m.colors]);
      const bytes = (x: unknown) => collectTransfers(x).reduce((n, b) => n + b.byteLength, 0);
      const t0 = bytes(s);
      const r = packSceneNormals(s);
      s.meshes.forEach((m, i) => expect([m.positions, m.indices, m.edges, m.colors]).toEqual(keep[i]));
      s.meshes.forEach((m, i) => expect(m.positions).toBe(keep[i]![0]));
      expect(bytes(s)).toBe(t0 - (r.before - r.after));
      expect(collectTransfers(s).some((b) => s.meshes.some((m) => m.normals!.buffer === b))).toBe(true);
    }
  });

  it('법선을 읽지 않는 계산(STL·OBJ 내보내기, 물리 속성, 간섭, 그물 속성)은 줄이기 전과 같다', () => {
    for (const s of scenes()) {
      const p = cloneNormals(s);
      packSceneNormals(p);
      expect(p.meshes[0]!.normals).toBeInstanceOf(Int8Array);
      expect(new Uint8Array(meshesToStl(p.meshes))).toEqual(new Uint8Array(meshesToStl(s.meshes)));
      expect(meshesToObj(p.meshes)).toBe(meshesToObj(s.meshes));
      const faces = stepFaceIndex(s);
      expect(physProps(p.meshes, null, { faces, sceneMm: 1 })).toEqual(physProps(s.meshes, null, { faces, sceneMm: 1 }));
      for (let i = 0; i < s.meshes.length; i++) expect(localProps(p.meshes[i]!, faces)).toEqual(localProps(s.meshes[i]!, faces));
      const strip = (r: ReturnType<typeof findInterference>) => ({ ...r, ms: 0 });
      const ia = findInterference(s.meshes.map((m) => ({ id: m.id, positions: m.positions, indices: m.indices, matrix: m.matrix, origin: m.origin, closed: m.closed })));
      const ib = findInterference(p.meshes.map((m) => ({ id: m.id, positions: m.positions, indices: m.indices, matrix: m.matrix, origin: m.origin, closed: m.closed })));
      expect(strip(ib)).toEqual(strip(ia));
    }
    // 겹친 원기둥 둘은 간섭으로 찾는다(위 비교가 빈 결과끼리만 견준 것이 아니게)
    const s = scenes()[1]!;
    const r = findInterference(s.meshes.map((m) => ({ id: m.id, positions: m.positions, indices: m.indices, matrix: m.matrix, origin: m.origin, closed: m.closed })));
    expect(r.pairs.length).toBeGreaterThan(0);
  });

  it('정점 수와 길이가 맞지 않는 법선·이미 줄인 법선·법선 없는 그물은 그대로 둔다', () => {
    const P = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const short = Float32Array.from([0, 0, 1, 0, 0, 1]);
    const small = new Int8Array([0, 0, 127, 0, 0, 0, 127, 0, 0, 0, 127, 0]);
    const s = { meshes: [{ id: 'a', positions: P, normals: short }, { id: 'b', positions: P, normals: small }, { id: 'c', positions: P }] as Mesh3d[] };
    expect(packSceneNormals(s)).toEqual({ arrays: 0, vertices: 0, before: 0, after: 0 });
    expect(s.meshes[0]!.normals).toBe(short);
    expect(s.meshes[1]!.normals).toBe(small);
    expect('normals' in s.meshes[2]!).toBe(false);
    // 길이 0인 법선은 0으로(코어가 Float32 0 법선과 같게 그린다)
    const z = { meshes: [{ id: 'z', positions: P, normals: new Float32Array(9) }] as Mesh3d[] };
    packSceneNormals(z);
    expect([...z.meshes[0]!.normals!]).toEqual(new Array(12).fill(0));
  });

  it('문서 상태(createDoc)는 줄인 법선으로도 같은 면 표·나무를 만든다', () => {
    const s = scenes()[0]!;
    const p = cloneNormals(s);
    packSceneNormals(p);
    const a = createDoc('a.stp', 1, { scene: s, ms: 0 });
    const b = createDoc('a.stp', 1, { scene: p, ms: 0 });
    expect(b.products).toEqual(a.products);
    expect(b.faces).toEqual(a.faces);
  });
});
