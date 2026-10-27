/**
 * B-rep 질량 속성(massprops.ts·brep.ts·physics.ts): 해석적 입체를 합성 STEP으로 만들어 부피·무게중심·무게중심 기준 2차 모멘트를
 * 닫힌 식과 견준다. 평면·원기둥·원뿔·구·원환과 직선·원 모서리로 된 입체는 곡면 적분이라 반올림 수준(여기서는 상대 1e-9)으로 맞아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { stepToScene } from '../src/index';
import { FLUX, PROPS_BREP, PROPS_LEN, PROPS_TIMEOUT, addSliverFlux, faceFlux, lineCurve, trianglesFlux } from '../src/massprops';
import type { StepFaceTable } from '../src/scene';
import { scaleProps } from '../src/scene';
import { localProps } from '../src/app/physics';
import { cone, cube, cylinder, plateWithHole, sphere, StepText, torus, type P3 } from './stepText';

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

/** z축 회전체(반지름 ρ(z), z ∈ [z0, z1]) */
function revolved(rho: (z: number) => number, z0: number, z1: number): Expect {
  const V = gauss((z) => Math.PI * rho(z) ** 2, z0, z1);
  const zc = gauss((z) => z * Math.PI * rho(z) ** 2, z0, z1) / V;
  const xx = gauss((z) => (Math.PI * rho(z) ** 4) / 4, z0, z1);
  const zz = gauss((z) => (z - zc) ** 2 * Math.PI * rho(z) ** 2, z0, z1);
  return { V, c: [0, 0, zc], S: [xx, xx, zz, 0, 0, 0] };
}

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

/** 옆면을 원 압출 곡면(SURFACE_OF_LINEAR_EXTRUSION — 적분하지 않는 곡면)으로 쓴 원기둥 */
function extrudedCylinder(w: StepText, rad: number, h: number): number {
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
  {
    name: '원환',
    build: (w) => torus(w, 10, 3),
    want: (() => {
      const V = 2 * Math.PI * Math.PI * 10 * 9;
      const xx = (V * (100 + (3 * 9) / 4)) / 2;
      return { V, c: [0, 0, 0] as P3, S: [xx, xx, (V * 9) / 4, 0, 0, 0] as Sym };
    })(),
    size: 26,
  },
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

  it('적분하지 않는 곡면(원 압출 옆면)이 섞이면 그 면만 삼각형 + 띠로, 어림 오차 안에 참값이 든다', () => {
    const { props } = open((w) => extrudedCylinder(w, 5, 20));
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
