/**
 * 경계 현 처짐보다 좁은 띠 면의 경계 맞춤 나눔(70차 — brep.ts bandSplits).
 * 합성: 거의 평평한 원뿔 위에서 원호 모서리와 B-스플라인(차수 1) 모서리가 한 점으로 모이는 가는 띠. 띠 폭이 원호 현의 처짐보다 좁으면 매개변수에서 맞는
 * 삼각형(원호 현의 두 끝 + 건너편 B-스플라인 점)이 3D에서 현 너머로 뒤집힌다. 세 정점이 모두 경계 점이라 안쪽 점을 건드려서는 풀리지 않고, 접힌 넓이가 접힘 문턱보다
 * 작아 모서리를 더 나누는 재시도(현 높이 ¼)도 걸리지 않았다 — 표본 1개 파일의 가는 띠 원뿔 면과 같은 꼴
 */
import { describe, expect, it } from 'vitest';
import { BrepMesher, type ItemMesh } from '../src/brep';
import { Geometry } from '../src/geometry';
import { StepFile } from '../src/part21';
import { r, StepText, type P3 } from './stepText';

const R0 = 0.2125;
const TAN = 19.08;
const V1 = 0.01114;
const R1 = R0 + V1 * TAN;
const onCone = (u: number, v: number): P3 => [(R0 + v * TAN) * Math.cos(u), (R0 + v * TAN) * Math.sin(u), v];

/** 띠 면(원호 V0→끝, B-스플라인 끝→Vb, 직선 Vb→V0)과, 같은 원호를 쓰는 평면 활꼴 면의 열린 껍질. B-스플라인 점은 원뿔 위 n개 */
function band(tip: number, delta: number, n: number): Uint8Array {
  const w = new StepText();
  const V0 = w.vertex(onCone(0, V1));
  const Vt = w.vertex(onCone(tip, V1));
  const Vb = w.vertex(onCone(0, V1 - delta));
  const arc = w.edge(V0, Vt, w.circle([0, 0, V1], R1));
  const pts: number[] = [];
  const knots: string[] = [];
  const mult: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = tip * (1 - i / n);
    pts.push(w.pt(onCone(u, V1 - delta * (1 - u / tip))));
    knots.push(r(i));
    mult.push(i === 0 || i === n ? 2 : 1);
  }
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',1,(${pts.map((x) => `#${x}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(${mult.join(',')}),(${knots.join(',')}),.UNSPECIFIED.`);
  const bsEdge = w.edge(Vt, Vb, bs);
  const gen = w.edge(Vb, V0, w.line(onCone(0, V1 - delta), onCone(0, V1)));
  const surf = w.add('CONICAL_SURFACE', `'',#${w.ax2([0, 0, 0])},${r(R0)},${r(Math.atan(TAN))}`);
  const bandFace = w.face([w.bound(w.loop([w.oe(bsEdge, false), w.oe(arc, false), w.oe(gen, false)]))], surf);
  // 같은 원호를 쓰는 평면 활꼴(현 Vt→V0)
  const chord = w.edge(Vt, V0, w.line(onCone(tip, V1), onCone(0, V1)));
  const cap = w.face([w.bound(w.loop([w.oe(arc, true), w.oe(chord, true)]))], w.plane([0, 0, V1]));
  const shell = w.add('OPEN_SHELL', `'',(#${bandFace},#${cap})`);
  w.product('band', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], w.context());
  return w.bytes();
}

function mesh(bytes: Uint8Array, chord: number, angleDeg: number): { m: ItemMesh; bandFace: number } {
  const f = new StepFile(bytes);
  const g = new Geometry(f);
  const mesher = new BrepMesher(f, g, () => undefined, { relTol: 1e-3, absTol: chord, angle: (angleDeg * Math.PI) / 180, faceTable: true, props: false });
  const item = f.idsOfType('SHELL_BASED_SURFACE_MODEL')[0]!;
  const m = mesher.meshItem(item)!;
  return { m, bandFace: f.idsOfType('ADVANCED_FACE')[0]! };
}

/** 면 표의 fi번 면에서 삼각형 법선이 세 정점 법선 합과 반대인 삼각형 수 */
function folds(m: ItemMesh, fi: number): number {
  const { positions: P, normals: N, indices: I } = m;
  const tb = m.faceTable!;
  let n = 0;
  for (let t = tb.triStart[fi]!; t < tb.triStart[fi + 1]!; t++) {
    const [a, b, c] = [I[t * 3]! * 3, I[t * 3 + 1]! * 3, I[t * 3 + 2]! * 3];
    const u = [P[b]! - P[a]!, P[b + 1]! - P[a + 1]!, P[b + 2]! - P[a + 2]!];
    const w = [P[c]! - P[a]!, P[c + 1]! - P[a + 1]!, P[c + 2]! - P[a + 2]!];
    const nz = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    if (nz[0]! * (N[a]! + N[b]! + N[c]!) + nz[1]! * (N[a + 1]! + N[b + 1]! + N[c + 1]!) + nz[2]! * (N[a + 2]! + N[b + 2]! + N[c + 2]!) < 0) n++;
  }
  return n;
}

/** 원 z = V1, 반지름 R1 위의 정점들(면 fi — 좌표를 문자열로) */
function arcPoints(m: ItemMesh, fi: number): Set<string> {
  const { positions: P, indices: I } = m;
  const tb = m.faceTable!;
  const out = new Set<string>();
  for (let t = tb.triStart[fi]! * 3; t < tb.triStart[fi + 1]! * 3; t++) {
    const v = I[t]! * 3;
    if (Math.abs(P[v + 2]! - V1) < 1e-6 && Math.abs(Math.hypot(P[v]!, P[v + 1]!) - R1) < 1e-5) out.add(`${P[v]},${P[v + 1]},${P[v + 2]}`);
  }
  return out;
}

const cases: [string, number, number, number, number, number][] = [
  // 이름, 끝 각, 띠 폭(v), B-스플라인 토막, 현 높이, 각(도)
  ['보통 품질(표본 면 꼴)', 0.8125, 0.00025, 12, 0.0182, 20],
  ['보통 품질 더 좁은 띠', 0.8125, 0.0001, 8, 0.0182, 20],
  ['아주 세밀(표본 면 꼴)', 0.8125, 0.00025, 12, 0.00182, 5],
  ['아주 세밀 더 좁은 띠', 0.8125, 0.0001, 24, 0.00182, 5],
];

describe('현 처짐보다 좁은 띠 면(70차)', () => {
  for (const [name, tip, delta, n, chord, ang] of cases)
    it(`${name}: 띠 면에 접힌 삼각형이 없다`, () => {
      const { m } = mesh(band(tip, delta, n), chord, ang);
      expect(m.failedFaces).toBe(0);
      expect(folds(m, 0)).toBe(0);
    });

  it('경계를 더 나눠도 이웃 면과 같은 다각선을 쓴다 — 원호 위 정점이 두 면에서 같다', () => {
    for (const [, tip, delta, n, chord, ang] of cases) {
      const { m } = mesh(band(tip, delta, n), chord, ang);
      expect([...arcPoints(m, 0)].sort()).toEqual([...arcPoints(m, 1)].sort());
    }
  });

  it('접힌 삼각형이 없는 넓은 띠는 경계를 더 나누지 않는다', () => {
    // 띠 폭 0.005(v — 3D로 약 0.095)는 현 처짐(약 0.004)보다 넓다: 원호 나눔은 각·현 높이가 정한 그대로
    const wide = mesh(band(0.8125, 0.005, 12), 0.0182, 20).m;
    expect(folds(wide, 0)).toBe(0);
    // 원호 0.8125 rad를 20°(0.349 rad)로 — 3토막(점 4개)
    expect(arcPoints(wide, 1).size).toBe(4);
  });
});
