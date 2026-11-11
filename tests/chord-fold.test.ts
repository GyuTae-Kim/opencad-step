/**
 * 경계 현 둘레의 접힌 삼각형 풀기(69차 — tessellateFace chords, BrepMesher가 경계를 더 나눠도 접힘이 남은 면을 다시 삼각화할 때).
 * 합성: 평면을 극좌표로 매개변수화한 면(원호 호 — 등매개선이 3D에서 휜다). 바깥 호 v = 0을 성긴 현으로 나누면 곡면(호)이 3D 현 바깥으로 불룩해, 다듬기가 현의 매개변수 직선 가까이에 넣은
 * 안쪽 점과 만든 (현의 두 끝, 안쪽 점) 삼각형이 뒤집힌다 — 표본 아주 세밀 B-스플라인 면(11개 파일 22면)과 같은 꼴
 */
import { describe, expect, it } from 'vitest';
import type { V3 } from '../src/math';
import { Surface } from '../src/surfaces';
import { type MeshOut, tessellateFace } from '../src/tessellate';

class PolarSheet extends Surface {
  readonly kind = 'bspline';
  constructor(readonly R: number) {
    super();
    this.u0 = -2;
    this.u1 = 2;
    this.v0 = 0;
    this.v1 = 4;
    this.maxStepU = 0.5;
    this.maxStepV = 0.5;
  }
  point(u: number, v: number): V3 {
    const r = this.R - v;
    return [r * Math.cos(u), r * Math.sin(u), 0];
  }
  project(p: V3): [number, number] {
    return [Math.atan2(p[1], p[0]), this.R - Math.hypot(p[0], p[1])];
  }
}

/** 부채꼴 띠: 바깥 호 v = 0을 nOuter 토막, 옆변·안쪽 호는 잘게 */
function sector(R: number, half: number, nOuter: number, depth: number): { s: PolarSheet; ring: V3[]; outer: V3[] } {
  const s = new PolarSheet(R);
  const ring: V3[] = [];
  const outer: V3[] = [];
  for (let i = 0; i <= nOuter; i++) {
    const p = s.point(-half + (2 * half * i) / nOuter, 0);
    ring.push(p);
    outer.push(p);
  }
  for (let i = 1; i < 12; i++) ring.push(s.point(half, (depth * i) / 12));
  for (let i = 0; i <= 40; i++) ring.push(s.point(half - (2 * half * i) / 40, depth));
  for (let i = 11; i > 0; i--) ring.push(s.point(-half, (depth * i) / 12));
  return { s, ring, outer };
}

function mesh(s: Surface, ring: V3[], chord: number, chords: boolean): MeshOut {
  const out: MeshOut = { positions: [], normals: [], indices: [] };
  tessellateFace(s, [ring], true, { chord, angle: (20 * Math.PI) / 180 }, chord * 1e-3, out, undefined, undefined, chords);
  return out;
}

/** 삼각형 법선이 세 정점 법선 합과 반대인 삼각형 수 */
function folds(m: MeshOut): number {
  const P = m.positions, N = m.normals, I = m.indices;
  let n = 0;
  for (let t = 0; t < I.length / 3; t++) {
    const [a, b, c] = [I[t * 3]! * 3, I[t * 3 + 1]! * 3, I[t * 3 + 2]! * 3];
    const u = [P[b]! - P[a]!, P[b + 1]! - P[a + 1]!, P[b + 2]! - P[a + 2]!];
    const w = [P[c]! - P[a]!, P[c + 1]! - P[a + 1]!, P[c + 2]! - P[a + 2]!];
    const nz = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    if (nz[0]! * (N[a]! + N[b]! + N[c]!) + nz[1]! * (N[a + 1]! + N[b + 1]! + N[c + 1]!) + nz[2]! * (N[a + 2]! + N[b + 2]! + N[c + 2]!) < 0) n++;
  }
  return n;
}

/** xy 평면 그물의 삼각형 넓이 합(절댓값 — 접히거나 겹치면 다각형 넓이보다 커진다) */
function area(m: MeshOut): number {
  const P = m.positions, I = m.indices;
  let s = 0;
  for (let t = 0; t < I.length / 3; t++) {
    const [a, b, c] = [I[t * 3]! * 3, I[t * 3 + 1]! * 3, I[t * 3 + 2]! * 3];
    s += Math.abs((P[b]! - P[a]!) * (P[c + 1]! - P[a + 1]!) - (P[b + 1]! - P[a + 1]!) * (P[c]! - P[a]!)) / 2;
  }
  return s;
}

/** 고리 다각형 넓이(신발끈) */
function polyArea(r: V3[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!, q = r[(i + 1) % r.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

describe('경계 현 둘레의 접힌 삼각형 풀기(69차)', () => {
  it('성긴 경계 현 — chords를 켜면 뒤집힌 삼각형이 사라지고 고리 점은 모두 남으며 넓이가 고리 다각형과 같다(평면이라 정확히)', () => {
    const { s, ring, outer } = sector(3, 1.2, 3, 2);
    const before = mesh(s, ring, 0.3, false);
    expect(folds(before)).toBeGreaterThan(0);
    const after = mesh(s, ring, 0.3, true);
    expect(folds(after)).toBe(0);
    expect(area(after)).toBeCloseTo(polyArea(ring), 9);
    // 고리 점(경계 다각선 — 이웃 면과 함께 쓴다)은 그대로
    const pts = new Set<string>();
    for (let i = 0; i < after.positions.length; i += 3) pts.add(after.positions.slice(i, i + 3).join(','));
    for (const p of outer) expect(pts.has(p.join(','))).toBe(true);
  });

  it('접힌 경계 삼각형이 없는 면은 chords를 켜도 결과가 같다', () => {
    const { s, ring } = sector(10, 0.3, 20, 0.5);
    const a = mesh(s, ring, 0.05, false);
    expect(folds(a)).toBe(0);
    expect(mesh(s, ring, 0.05, true)).toEqual(a);
  });
});
