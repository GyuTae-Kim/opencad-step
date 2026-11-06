/**
 * 시험용 작은 장면(47차 — 분해 끌기 붙잡기): 축에 나란한 상자 그물과 그 면 표(면마다 평면 — 바깥 법선·평면 위 점), 가운데가 빈 네모 고리 판(구멍 둘레 삼각형만).
 * 면 표 꼴은 해석기가 주는 것과 같다(meta.faceTables — triStart·kinds·params·stepIds, 매개변수 [r1, r2, 법선, 원점]).
 */
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { FaceIndex } from '../../src/app/doc';
import type { StepFaceTable } from '../../src/scene';

type V3 = [number, number, number];

/** 상자 그물(lo~hi)과 면 표: 면 차례 −X·+X·−Y·+Y·−Z·+Z, 면마다 삼각형 둘. origin을 주면 positions는 그 점 기준(큰 좌표) */
export function boxMesh(id: string, lo: V3, hi: V3, origin?: V3): { mesh: Mesh3d; table: StepFaceTable } {
  const o = origin ?? [0, 0, 0];
  const c = (x: number, y: number, z: number): V3 => [x ? hi[0] : lo[0], y ? hi[1] : lo[1], z ? hi[2] : lo[2]];
  // 면마다 네 모서리(바깥에서 보아 반시계)
  const quads: [V3, V3, V3, V3, V3][] = [
    [[-1, 0, 0], c(0, 0, 0), c(0, 0, 1), c(0, 1, 1), c(0, 1, 0)],
    [[1, 0, 0], c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)],
    [[0, -1, 0], c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)],
    [[0, 1, 0], c(0, 1, 0), c(0, 1, 1), c(1, 1, 1), c(1, 1, 0)],
    [[0, 0, -1], c(0, 0, 0), c(0, 1, 0), c(1, 1, 0), c(1, 0, 0)],
    [[0, 0, 1], c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)],
  ];
  const pos: number[] = [];
  const params: number[] = [];
  for (const [n, a, b, cc, d] of quads) {
    for (const p of [a, b, cc, a, cc, d]) pos.push(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
    // 원점은 묶음 원점 기준(해석기와 같다)
    params.push(0, 0, ...n, a[0] - o[0], a[1] - o[1], a[2] - o[2]);
  }
  const mesh: Mesh3d = { id, positions: Float32Array.from(pos), color: [0.7, 0.7, 0.7, 1], ...(origin ? { origin } : {}) };
  const table: StepFaceTable = {
    triStart: Uint32Array.from([0, 2, 4, 6, 8, 10, 12]),
    stepIds: Uint32Array.from([1, 2, 3, 4, 5, 6]),
    kinds: new Uint8Array(6),
    params: Float64Array.from(params),
  };
  return { mesh, table };
}

/**
 * 네모 고리 판(z = 0 평면 하나, 바깥 법선 −Z): 바깥 ±R, 구멍 ±r — 구멍 둘레 삼각형 여덟 개만(구멍 안에는 삼각형이 없다).
 * 면 하나(평면), 사각형 범위는 구멍까지 덮는다
 */
export function ringMesh(id: string, R: number, r: number, z = 0): { mesh: Mesh3d; table: StepFaceTable } {
  const O: [number, number][] = [
    [-R, -R],
    [R, -R],
    [R, R],
    [-R, R],
  ];
  const I: [number, number][] = [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ];
  const pos: number[] = [];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    for (const p of [O[k]!, I[k1]!, O[k1]!, O[k]!, I[k]!, I[k1]!]) pos.push(p[0], p[1], z);
  }
  const mesh: Mesh3d = { id, positions: Float32Array.from(pos), color: [0.7, 0.7, 0.7, 1] };
  const table: StepFaceTable = { triStart: Uint32Array.from([0, 8]), stepIds: Uint32Array.from([9]), kinds: new Uint8Array(1), params: Float64Array.from([0, 0, 0, 0, -1, 0, 0, z]) };
  return { mesh, table };
}

/** 그물·면 표 목록 → 면 고르기 표(문서 d.faces 꼴) */
export function faceIndexOf(parts: readonly { mesh: Mesh3d; table: StepFaceTable }[]): FaceIndex {
  return { kinds: ['plane', 'cylinder'], tables: parts.map((p) => p.table), tableOf: new Map(parts.map((p, i) => [p.mesh.id, i])) };
}
