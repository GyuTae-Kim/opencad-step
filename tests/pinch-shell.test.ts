/**
 * 모서리에서 스스로 맞닿은 닫힌 껍질(72차 — brep.ts 입체 판정, analysis.ts isBalancedMesh).
 * 합성: 정육면체 둘이 모서리 하나로만 붙은 입체를 닫힌 껍질 하나로 — 붙은 모서리(직선)를 네 면이 쓴다(둘은 이쪽, 둘은 저쪽 방향).
 * 모서리마다 두 면이라는 위상 검사와 같은 방향 삼각형 변을 두 번 쓰면 거짓인 isClosedMesh를 모두 통과하지 못해 입체가 아니었다 —
 * 앱은 물리 속성(부피·질량·무게중심)을 구하지 못하고 단면을 채우지 않았다(로컬 표본 2개 파일과 같은 꼴: 직선 모서리 하나를 평면·원기둥 면 넷이 씀)
 */
import { describe, expect, it } from 'vitest';
import { BrepMesher } from '../src/brep';
import { Geometry } from '../src/geometry';
import { StepFile } from '../src/part21';
import { isBalancedMesh, isClosedMesh, meshVolume } from '../src/analysis';
import { stepToScene, type StepMeta } from '../src/scene';
import { PROPS_BREP } from '../src/massprops';
import { createDoc } from '../src/app/doc';
import { physProps } from '../src/app/physics';
import { StepText, type P3 } from './stepText';

/** 상자들(a변 정육면체, 원점들)을 한 닫힌 껍질에 — 같은 자리 꼭짓점·모서리는 한 개체를 함께 쓴다. split이면 상자마다 따로 입체 */
function boxes(origins: P3[], a = 1, split = false): Uint8Array {
  const w = new StepText();
  const vs = new Map<string, number>();
  const es = new Map<string, number>();
  const key = (p: P3) => p.join(',');
  const vertex = (p: P3) => {
    let v = vs.get(key(p));
    if (v === undefined) vs.set(key(p), (v = w.vertex(p)));
    return v;
  };
  const oe = (p: P3, q: P3) => {
    const [s, t, fwd] = key(p) < key(q) ? [p, q, true] : [q, p, false];
    const k = `${key(s)}|${key(t)}`;
    let e = es.get(k);
    if (e === undefined) es.set(k, (e = w.edge(vertex(s), vertex(t), w.line(s, t))));
    return w.oe(e, fwd);
  };
  const shells: number[][] = [];
  for (const o of origins) {
    const P = (i: number): P3 => [o[0] + (i & 1 ? a : 0), o[1] + (i & 2 ? a : 0), o[2] + (i & 4 ? a : 0)];
    const quads: [number[], P3][] = [
      [[0, 2, 3, 1], [0, 0, -1]],
      [[4, 5, 7, 6], [0, 0, 1]],
      [[0, 1, 5, 4], [0, -1, 0]],
      [[2, 6, 7, 3], [0, 1, 0]],
      [[0, 4, 6, 2], [-1, 0, 0]],
      [[1, 3, 7, 5], [1, 0, 0]],
    ];
    shells.push(
      quads.map(([q, n]) => {
        const lp = w.loop(q.map((i, k) => oe(P(i), P(q[(k + 1) % 4]!))));
        const x: P3 = Math.abs(n[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0];
        return w.face([w.bound(lp)], w.plane(P(q[0]!), n, x));
      }),
    );
  }
  const solids = split ? shells.map((f, i) => w.solid(f, `b${i}`)) : [w.solid(shells.flat(), 'pinched')];
  w.product('pinch', solids, w.context());
  return w.bytes();
}

function meshAll(bytes: Uint8Array) {
  const f = new StepFile(bytes);
  const g = new Geometry(f);
  const mesher = new BrepMesher(f, g, () => undefined, { relTol: 1e-3, angle: (20 * Math.PI) / 180, faceTable: true });
  return f.idsOfType('MANIFOLD_SOLID_BREP').map((id) => mesher.meshItem(id)!);
}

describe('모서리에서 맞닿은 닫힌 껍질(72차)', () => {
  it('정육면체 둘이 모서리 하나로 붙은 닫힌 껍질은 입체 — 부피는 곡면 적분으로 2', () => {
    const [m] = meshAll(boxes([[0, 0, 0], [1, 1, 0]]));
    expect(m!.closed).toBe(true);
    expect(m!.faces).toBe(12);
    // 같은 방향 삼각형 변이 둘(붙은 모서리)이라 예전 판정은 거짓
    expect(isClosedMesh(m!.positions, m!.indices)).toBe(false);
    expect(isBalancedMesh(m!.positions, m!.indices)).toBe(true);
    expect(m!.solid).toBe(true);
    expect(m!.propsJob).toBeDefined();
    expect(meshVolume(m!.positions, m!.indices)).toBeCloseTo(2, 9);
  });

  it('장면: 닫힌 그물(단면 채우기)이고 면 표 질량 속성이 곡면 적분 값', () => {
    const s = stepToScene(boxes([[0, 0, 0], [1, 1, 0]]));
    expect(s.meshes.length).toBe(1);
    expect(s.meshes[0]!.closed).toBe(true);
    expect(s.meshes[0]!.doubleSided).toBe(false);
    const t = (s.meta as unknown as StepMeta).faceTables![0]!;
    expect(t.props![14]).toBe(PROPS_BREP);
    expect(t.props![0]).toBeCloseTo(2, 9);
  });

  it('앱 물리 속성: 닫힌 입체 하나로 부피·무게중심을 구한다(그전에는 "닫힌 입체가 없어 …" — closed 0)', () => {
    const s = stepToScene(boxes([[0, 0, 0], [1, 1, 0]]));
    const doc = createDoc('pinch.stp', 1, { scene: s, ms: 0 });
    const p = physProps(s.meshes, null, { faces: doc.faces, sceneMm: 1 });
    expect(p.closed).toBe(1);
    expect(p.open).toBe(0);
    expect(p.volume).toBeCloseTo(2, 9);
    expect(p.exact).toBe(true);
    expect(p.centroid![0]).toBeCloseTo(1, 9);
    expect(p.centroid![1]).toBeCloseTo(1, 9);
    expect(p.centroid![2]).toBeCloseTo(0.5, 9);
  });

  it('꼭짓점 하나로만 붙은 두 정육면체(모서리는 모두 두 면)는 예전 판정 그대로 입체', () => {
    const [m] = meshAll(boxes([[0, 0, 0], [1, 1, 1]]));
    expect(m!.solid).toBe(true);
    expect(isClosedMesh(m!.positions, m!.indices)).toBe(true);
    expect(meshVolume(m!.positions, m!.indices)).toBeCloseTo(2, 9);
  });

  it('따로 둔 두 입체는 예전처럼 각각 입체(판정 길이 바뀌지 않음)', () => {
    const ms = meshAll(boxes([[0, 0, 0], [1, 1, 0]], 1, true));
    expect(ms.map((m) => m.solid)).toEqual([true, true]);
    expect(ms.map((m) => isClosedMesh(m.positions, m.indices))).toEqual([true, true]);
  });
});

describe('isBalancedMesh', () => {
  // 사면체 둘이 모서리 (0,0,0)–(0,0,1) 하나로 붙은 그물
  const tet = (o: P3, flip = false): number[] => {
    const [x, y] = [o[0], o[1]];
    const p: P3[] = [[0, 0, 0], [0, 0, 1], [x, 0, 0.5], [0, y, 0.5]];
    const tris = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
    const out: number[] = [];
    for (const t of tris) for (const i of flip ? [t[0]!, t[2]!, t[1]!] : t) out.push(...p[i]!);
    return out;
  };
  const vol = (pos: number[]) => meshVolume(pos);

  it('방향 있는 변마다 반대로 쓴 수가 같으면 참(같은 방향 변이 둘이어도)', () => {
    const a = tet([1, 1, 0]);
    const b = tet([-1, -1, 0]);
    // 둘 다 바깥 법선이 되게
    const A = vol(a) > 0 ? a : tet([1, 1, 0], true);
    const B = vol(b) > 0 ? b : tet([-1, -1, 0], true);
    const pos = new Float32Array([...A, ...B]);
    expect(isClosedMesh(pos)).toBe(false);
    expect(isBalancedMesh(pos)).toBe(true);
  });

  it('삼각형 하나가 빠지거나 한 면만 뒤집혀 짝이 어긋나면 거짓', () => {
    const a = tet([1, 1, 0]);
    const A = vol(a) > 0 ? a : tet([1, 1, 0], true);
    const B0 = tet([-1, -1, 0]);
    const B = vol(B0) > 0 ? B0 : tet([-1, -1, 0], true);
    expect(isBalancedMesh(new Float32Array([...A, ...B.slice(0, 27)]))).toBe(false);
    const one = [...B.slice(0, 9), ...B.slice(9, 18).slice(0, 3), ...B.slice(15, 18), ...B.slice(12, 15), ...B.slice(18)];
    expect(isBalancedMesh(new Float32Array([...A, ...one]))).toBe(false);
    expect(isBalancedMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))).toBe(false);
  });
});
