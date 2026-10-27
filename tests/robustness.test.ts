/**
 * 실제 파일 훑기에서 찾은 삼각화 빈틈의 시험(구조만 흉내 낸 합성 STEP 글).
 * - 원환 필렛 고리: FACE_BOUND 방향이 어긋난 띠 고리가 구멍으로 읽혀 원환 전체를 덮던 것
 * - 곡면 법선 약속이 다른 면(압출 곡면의 same_sense가 거꾸로)이 섞인 닫힌 입체: 면 방향 맞추기
 * - 큰 부품의 작은 원환 필렛: 성긴 현 때문에 접힌 삼각형
 */
import { describe, expect, it } from 'vitest';
import { parseStepFile } from '../src/app/job';
import { IFC_MESSAGE, headSchemas } from '../src/app/protocol';
import { orientFaces, stepToScene, TRUNCATED_WARNING, watertightness, type StepMeta } from '../src/index';
import { cube, cylinder, r, StepText, type P3 } from './stepText';

type Mesh = { positions: ArrayLike<number>; indices?: ArrayLike<number>; normals?: ArrayLike<number> };

function triArea(m: Mesh): number {
  const P = m.positions;
  const I = m.indices!;
  let a = 0;
  for (let t = 0; t < I.length; t += 3) {
    const i = I[t]! * 3, j = I[t + 1]! * 3, k = I[t + 2]! * 3;
    const ux = P[j]! - P[i]!, uy = P[j + 1]! - P[i + 1]!, uz = P[j + 2]! - P[i + 2]!;
    const wx = P[k]! - P[i]!, wy = P[k + 1]! - P[i + 1]!, wz = P[k + 2]! - P[i + 2]!;
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a;
}

function signedVolume(m: Mesh): number {
  const P = m.positions;
  const I = m.indices!;
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    v += (P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!)) / 6;
  }
  return v;
}

/** 삼각형 법선이 세 정점 법선과 반대인(접힌) 삼각형 수 */
function folds(m: Mesh): number {
  const P = m.positions;
  const N = m.normals!;
  const I = m.indices!;
  let n = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!;
    const wx = P[c]! - P[a]!, wy = P[c + 1]! - P[a + 1]!, wz = P[c + 2]! - P[a + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if ((N[a]! + N[b]! + N[c]!) * nx + (N[a + 1]! + N[b + 1]! + N[c + 1]!) * ny + (N[a + 2]! + N[b + 2]! + N[c + 2]!) * nz < 0) n++;
  }
  return n;
}

const faceArea = (s: ReturnType<typeof stepToScene>): number => (s.meta as unknown as StepMeta).faceTables?.[0]?.area?.[0] ?? NaN;

describe('원환 필렛 고리(이음선을 갔다 오는 띠 고리)', () => {
  // 구멍 아래 모서리를 다듬은 필렛: 원환(R 56, r 1, 축 ±z)의 v ∈ [π/2, π] 띠 — 큰 원·작은 원·작은 원호 이음선 두 번
  function ring(axisDown: boolean, boundSense: boolean): Uint8Array {
    const w = new StepText();
    const ctx = w.context();
    const A = w.vertex([56, 0, 0]);
    const B = w.vertex([55, 0, 1]);
    const big = w.edge(A, A, w.circle([0, 0, 0], 56));
    const small = w.edge(B, B, w.circle([0, 0, 1], 55));
    const seam = w.edge(A, B, w.circle([56, 0, 1], 1, [0, 1, 0], [1, 0, 0]));
    const tor = w.add('TOROIDAL_SURFACE', `'',#${w.ax2([0, 0, 1], axisDown ? [0, 0, -1] : [0, 0, 1], [1, 0, 0])},${r(56)},${r(1)}`);
    const loop = w.loop([w.oe(seam, false), w.oe(big, false), w.oe(seam, true), w.oe(small, true)]);
    const face = w.face([w.bound(loop, false, boundSense)], tor);
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('ring', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    return w.bytes();
  }
  const exact = 2 * Math.PI * (56 * (Math.PI / 2) - 1); // 2πr·[R·v + r·sin v] (v: π/2 → π)

  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])('축 아래=%s, FACE_BOUND 방향=%s: 띠 하나만(넓이 = 원환의 ¼ 띠), 원환 전체를 덮지 않는다', (axisDown, sense) => {
    const s = stepToScene(ring(axisDown, sense), { chordTolerance: 0.05 });
    const st = (s.meta as unknown as StepMeta).stats;
    expect(st.failedFaces).toBe(0);
    expect(faceArea(s)).toBeCloseTo(exact, 1);
    const m = s.meshes[0]!;
    // 고치기 전에는 원환 전체(4π²Rr ≈ 2211)나 뒤엉킨 삼각형(≈ 12793)이었다
    expect(Math.abs(triArea(m) - exact) / exact).toBeLessThan(0.03);
    expect(st.triangles).toBeLessThan(20_000);
    expect(folds(m)).toBe(0);
  });
});

describe('닫힌 껍질의 면 방향 맞추기', () => {
  /**
   * 정육면체: 위·아래는 평면(바깥 법선), 옆 넷은 SURFACE_OF_LINEAR_EXTRUSION. 고리는 모두 바깥에서 볼 때 반시계(위상은 맞다)인데
   * 옆면의 same_sense를 거꾸로 적었다(압출 곡면의 u·v를 바꿔 법선을 반대로 쓰는 프로그램의 파일과 같은 꼴)
   */
  function box(flipSides: boolean, flipCaps = false): Uint8Array {
    const w = new StepText();
    const ctx = w.context();
    const a = 10;
    const P = (i: number): P3 => [i & 1 ? a : 0, i & 2 ? a : 0, i & 4 ? a : 0];
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
    const loop = (q: number[]) => w.loop(q.map((i, k) => oe(i, q[(k + 1) % 4]!)));
    // 압출: 밑 곡선(바닥 모서리 방향 d) × 위로(0,0,1) → 곡면 법선 d × z = 바깥 법선
    const extrusion = (o: P3, d: P3) => w.add('SURFACE_OF_LINEAR_EXTRUSION', `'',#${w.line(o, [o[0] + d[0], o[1] + d[1], o[2] + d[2]])},#${w.add('VECTOR', `'',#${w.dir([0, 0, 1])},${r(a)}`)}`);
    const faces = [
      w.face([w.bound(loop([0, 2, 3, 1]))], w.plane(P(0), [0, 0, -1], [1, 0, 0]), !flipCaps),
      w.face([w.bound(loop([4, 5, 7, 6]))], w.plane(P(4), [0, 0, 1], [1, 0, 0]), !flipCaps),
      w.face([w.bound(loop([0, 1, 5, 4]))], extrusion(P(0), [1, 0, 0]), !flipSides), // y = 0, 바깥 -y
      w.face([w.bound(loop([1, 3, 7, 5]))], extrusion(P(1), [0, 1, 0]), !flipSides), // x = a, 바깥 +x
      w.face([w.bound(loop([3, 2, 6, 7]))], extrusion(P(3), [-1, 0, 0]), !flipSides), // y = a, 바깥 +y
      w.face([w.bound(loop([2, 0, 4, 6]))], extrusion(P(2), [0, -1, 0]), !flipSides), // x = 0, 바깥 -x
    ];
    w.product('box', [w.solid(faces)], ctx);
    return w.bytes();
  }

  it('같은 약속으로 쓴 정육면체는 그대로 닫힌 입체(부피 +1000)', () => {
    const m = stepToScene(box(false)).meshes[0]!;
    expect(m.closed).toBe(true);
    expect(signedVolume(m)).toBeCloseTo(1000, 6);
  });

  it('옆면 넷의 법선이 거꾸로 적힌 파일도 이웃 면과 방향을 맞춰 바깥 법선·물샐틈없음·양의 부피', () => {
    const s = stepToScene(box(true));
    const m = s.meshes[0]!;
    const w = watertightness(m.positions, m.indices);
    expect(w.bad).toBe(0);
    expect(w.open).toBe(0);
    expect(m.closed).toBe(true);
    expect(signedVolume(m)).toBeCloseTo(1000, 6);
    expect(folds(m)).toBe(0);
    // 단일면으로 그리는 닫힌 입체 — 뒤집힌 면이 뒷면 걸러내기로 사라지지 않는다
    expect(m.doubleSided).toBe(false);
  });

  it('모든 면이 거꾸로(서로는 맞음)인 입체는 통째로 뒤집어 바깥 법선으로, 평면 면 표의 법선도 함께', () => {
    const s = stepToScene(box(true, true));
    const m = s.meshes[0]!;
    expect(signedVolume(m)).toBeCloseTo(1000, 6);
    expect(watertightness(m.positions, m.indices).bad).toBe(0);
    const t = (s.meta as unknown as StepMeta).faceTables![0]!;
    // 아래 평면(첫 면)의 바깥 법선은 -z
    expect(t.params[4]).toBeCloseTo(-1, 9);
  });

  it('orientFaces: 이웃끼리 같은 방향으로 쓴 선분을 찾아 한쪽 면 묶음만 뒤집는다, 고칠 것이 없으면 null', () => {
    // 사면체 네 면(면마다 삼각형 하나), 정점은 면마다 따로
    const p: P3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const tris = [
      [0, 2, 1],
      [0, 1, 3],
      [1, 2, 3],
      [0, 3, 2],
    ];
    const build = (flip: number[]) => {
      const pos: number[] = [];
      const idx: number[] = [];
      tris.forEach((t, f) => {
        const q = flip.includes(f) ? [t[0]!, t[2]!, t[1]!] : t;
        for (const i of q) {
          idx.push(pos.length / 3);
          pos.push(...p[i]!);
        }
      });
      return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
    };
    const ok = build([]);
    expect(orientFaces(ok.pos, ok.idx, [0, 1, 2, 3, 4])).toBeNull();
    const bad = build([2]);
    expect(Array.from(orientFaces(bad.pos, bad.idx, [0, 1, 2, 3, 4])!)).toEqual([0, 0, 1, 0]);
    // 모두 거꾸로: 의심 면을 주면 부피로 통째 뒤집기
    const inv = build([0, 1, 2, 3]);
    expect(orientFaces(inv.pos, inv.idx, [0, 1, 2, 3, 4])).toBeNull();
    expect(Array.from(orientFaces(inv.pos, inv.idx, [0, 1, 2, 3, 4], [0])!)).toEqual([1, 1, 1, 1]);
  });
});

describe('큰 부품의 작은 원환 필렛(성긴 현)', () => {
  // 반지름 17.36 고리 위 작은 반지름 0.3 필렛 조각(약 79°). 큰 조립의 현 허용 오차(0.13)는 작은 반지름의 절반 가까이다
  function fillet(): Uint8Array {
    const w = new StepText();
    const ctx = w.context();
    const R = 17.36;
    const rr = 0.3;
    const zc = -24.7;
    const u1 = 0.192;
    const at = (u: number, v: number): P3 => [-(R + rr * Math.cos(v)) * Math.cos(u), -(R + rr * Math.cos(v)) * Math.sin(u), zc + rr * Math.sin(v)];
    // 틀: 축 z, 기준 -x → 점(u, v) = 중심 + (R + r cos v)(cos u·(-x) + sin u·(-y)) + r sin v·z
    const A = w.vertex(at(Math.PI / 2, Math.PI));
    const B = w.vertex(at(Math.PI / 2, (3 * Math.PI) / 2));
    const C = w.vertex(at(u1, (3 * Math.PI) / 2));
    const D = w.vertex(at(u1, Math.PI));
    // 작은 원(필렛 단면): 축 ±(sin u, -cos u, 0) — 안쪽 적도 → 바닥(A→B)과 바닥 → 안쪽 적도(C→D)가 모두 짧은 ¼ 호가 되게
    const minor = (u: number, k: number) => w.circle([-R * Math.cos(u), -R * Math.sin(u), zc], rr, [k * Math.sin(u), -k * Math.cos(u), 0], [-Math.cos(u), -Math.sin(u), 0]);
    const e1 = w.edge(A, B, minor(Math.PI / 2, -1));
    const e2 = w.edge(C, B, w.circle([0, 0, zc - rr], R, [0, 0, 1], [-1, 0, 0]));
    const e3 = w.edge(C, D, minor(u1, 1));
    const e4 = w.edge(D, A, w.circle([0, 0, zc], R - rr, [0, 0, 1], [-1, 0, 0]));
    const tor = w.add('TOROIDAL_SURFACE', `'',#${w.ax2([0, 0, zc], [0, 0, 1], [-1, 0, 0])},${r(R)},${r(rr)}`);
    const face = w.face([w.bound(w.loop([w.oe(e1, true), w.oe(e2, false), w.oe(e3, true), w.oe(e4, true)]))], tor);
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('fillet', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    return w.bytes();
  }

  it('현 허용 오차가 커도 접힌 삼각형이 없고 넓이가 B-rep 넓이에 가깝다', () => {
    const s = stepToScene(fillet(), { chordTolerance: 0.13 });
    const st = (s.meta as unknown as StepMeta).stats;
    expect(st.failedFaces).toBe(0);
    const m = s.meshes[0]!;
    expect(folds(m)).toBe(0);
    const exact = faceArea(s);
    // 고치기 전: 접힌 삼각형이 겹쳐 넓이가 31% 컸다
    expect(Math.abs(triArea(m) - exact) / exact).toBeLessThan(0.1);
  });
});

describe('깨진 파일·다른 스키마 안내', () => {
  const full = (() => {
    const w = new StepText();
    const ctx = w.context();
    w.product('block', [cube(w, 10).solid], ctx);
    return w.toString();
  })();
  const enc = (t: string) => new TextEncoder().encode(t);

  it('끝까지 온전한 파일에는 끊김 경고가 없다', () => {
    expect(stepToScene(enc(full)).warnings ?? []).not.toContain(TRUNCATED_WARNING);
  });

  it('END-ISO-10303-21 없이 끝나거나 마지막 문장이 잘린 파일은 맨 앞에 끊김 경고', () => {
    const noEnd = full.replace('END-ISO-10303-21;', '');
    expect(stepToScene(enc(noEnd)).warnings?.[0]).toBe(TRUNCATED_WARNING);
    const cut = full.slice(0, Math.floor(full.length * 0.6));
    const s = stepToScene(enc(cut));
    expect(s.warnings?.[0]).toBe(TRUNCATED_WARNING);
  });

  it('가리키는 개체가 사라져 못 만든 곡면은 "지원하지 않는 곡면"이 아니라 읽지 못했다고 적는다', () => {
    // 원기둥 면의 곡면 자리(AXIS2_PLACEMENT_3D)를 지운 파일: 옆면은 평면으로 대신 그릴 수 없어 실패하지만 원기둥은 지원하는 곡면이다
    const w = new StepText();
    const ctx = w.context();
    w.product('pin', [cylinder(w, 5, 10)], ctx);
    const text = w.toString();
    const cyl = /#(\d+)=CYLINDRICAL_SURFACE\('',#(\d+),/.exec(text)!;
    const broken = text.replace(new RegExp(`#${cyl[2]}=AXIS2_PLACEMENT_3D[^;]*;\\n`), '');
    expect(broken.length).toBeLessThan(text.length);
    const s = stepToScene(enc(broken));
    const why = (s.warnings ?? []).find((x) => x.startsWith('삼각화하지 못한 면'));
    expect(why).toBeDefined();
    expect(why).toContain('곡면 CYLINDRICAL_SURFACE을(를) 읽지 못함');
    expect(why).not.toContain('지원하지 않는 곡면');
  });

  it('IFC(건축 BIM) Part 21 글은 다 읽기 전에 알기 쉬운 글로 거절한다', async () => {
    const ifc = full.replace(/FILE_SCHEMA\(\('[^']*'\)\);/, "FILE_SCHEMA(('IFC4'));");
    expect(headSchemas(enc(ifc))).toEqual(['IFC4']);
    await expect(parseStepFile('building.ifc', enc(ifc))).rejects.toThrow(IFC_MESSAGE);
    // 기계 CAD 스키마는 그대로 연다
    expect(headSchemas(enc(full))).toEqual(['AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }']);
    await expect(parseStepFile('block.stp', enc(full))).resolves.toBeDefined();
  });
});
