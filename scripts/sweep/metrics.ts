/**
 * 훑기 품질 지표(순수 함수): 해석 결과 장면(Scene3d)의 그물마다 감기·부피·접힘·넓이를 잰다.
 * 같은 형상 항목을 여러 자리에 놓으면 그물 배열을 함께 쓰므로 positions 배열 하나를 형상 항목 하나로 센다.
 *
 * - 감기가 어긋난 입체: 닫힌 입체(Mesh3d.closed — 해석기가 위상으로 틈이 없다고 본 것)인데 정점을 위치로 용접해 보면
 *   한 삼각형만 쓰거나 같은 방향으로 두 번 쓰는 모서리가 있는 것(`watertightness`의 open + bad)
 * - 부피가 음수인 입체: 닫힌 입체인데 부호 있는 부피가 음수(안쪽을 향한 법선)
 * - 접힌 삼각형: 넓이가 있는 삼각형 가운데 정점 법선 합이 삼각형 감기 법선과 반대인 것. 형상 항목마다 개수 비율·넓이 비율을 재고
 *   파일에서는 가장 큰 값을 남긴다(요약의 파일 수 기준은 summary.mjs FOLDED_FILE_RATIO)
 * - 넓이가 다른 면: 면 표의 B-rep 넓이와 그 면 삼각형 넓이가 정확 표시면 3%, 근삿값이면 10% 넘게 다른 면
 */
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import { watertightness } from '../../src/analysis';
import { collectTransfers } from '../../src/app/protocol';
import { edgeCurve } from '../../src/edgecurve';
import { PROPS_BREP, PROPS_TIMEOUT } from '../../src/massprops';

export interface ItemQuality {
  triangles: number;
  /** 닫힌 껍질에서 왔는지(Mesh3d.doubleSided가 아님) */
  closedShell: boolean;
  /** 닫힌 입체(Mesh3d.closed) */
  solid: boolean;
  /** 닫힌 입체의 어긋난 모서리 수(open + bad), 입체가 아니면 0 */
  windingEdges: number;
  /** 부호 있는 부피(닫힌 입체만, 아니면 0) */
  volume: number;
  folded: number;
  foldedRatio: number;
  foldedAreaRatio: number;
  nonFinite: number;
}

export interface SceneQuality {
  /** 서로 다른 형상 항목(그물 배열) 수 */
  items: number;
  closedShells: number;
  solids: number;
  /** 닫힌 껍질인데 닫힌 입체가 못 된 것(실패 면이 있거나 삼각형이 맞물리지 않음) */
  openShells: number;
  windingSolids: number;
  windingEdges: number;
  negativeVolumeSolids: number;
  foldedTriangles: number;
  foldedMaxRatio: number;
  foldedMaxAreaRatio: number;
  areaMismatchFaces: number;
  areaMismatchMax: number;
  /** 유한하지 않은 좌표 값 수 */
  nonFinite: number;
}

/** 삼각형 감기 법선(외적)과 정점 법선 합으로 접힘·넓이를 센다 */
function foldStats(P: ArrayLike<number>, N: ArrayLike<number> | undefined, I: ArrayLike<number>) {
  let n = 0;
  let folded = 0;
  let area = 0;
  let foldedArea = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!;
    const wx = P[c]! - P[a]!, wy = P[c + 1]! - P[a + 1]!, wz = P[c + 2]! - P[a + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 0)) continue;
    n++;
    area += l / 2;
    if (!N) continue;
    const vn = (N[a]! + N[b]! + N[c]!) * nx + (N[a + 1]! + N[b + 1]! + N[c + 1]!) * ny + (N[a + 2]! + N[b + 2]! + N[c + 2]!) * nz;
    if (vn < 0) {
      folded++;
      foldedArea += l / 2;
    }
  }
  return { folded, ratio: n ? folded / n : 0, areaRatio: area > 0 ? foldedArea / area : 0 };
}

/** 부호 있는 부피(원점 사면체 합) */
export function signedVolume(P: ArrayLike<number>, I: ArrayLike<number>): number {
  let v = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
    v += P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!);
  }
  return v / 6;
}

function sequential(n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** 그물 하나(형상 항목 하나)의 지표 */
export function itemQuality(m: Pick<Mesh3d, 'positions' | 'normals' | 'indices' | 'closed' | 'doubleSided'>): ItemQuality {
  const P = m.positions;
  const I = m.indices ?? sequential(P.length / 3);
  let nonFinite = 0;
  for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i]!)) nonFinite++;
  const solid = m.closed === true;
  let windingEdges = 0;
  let volume = 0;
  if (solid) {
    const w = watertightness(P, I);
    windingEdges = w.open + w.bad;
    volume = signedVolume(P, I);
  }
  const f = foldStats(P, m.normals, I);
  return {
    triangles: Math.floor(I.length / 3),
    closedShell: m.doubleSided !== true,
    solid,
    windingEdges,
    volume,
    folded: f.folded,
    foldedRatio: f.ratio,
    foldedAreaRatio: f.areaRatio,
    nonFinite,
  };
}

interface FaceTableLike {
  triStart: ArrayLike<number>;
  area?: ArrayLike<number>;
  exact?: ArrayLike<number>;
  props?: ArrayLike<number>;
}

/**
 * 닫힌 입체의 질량 속성(면 표 props — massprops.ts) 지표: 입체마다 한 번(같은 면 표를 여러 자리에 놓아도).
 * - exact: 곡면 적분이고 어림 오차가 부피의 1e-9 이하, approx: 곡면 적분이지만 근삿값 면이 섞임, triangles: 삼각형으로 되돌아감,
 *   timeout: 시간 한도로 삼각형
 * - maxRelBound: 근삿값의 상대 어림 오차 최댓값, maxRelChange: 화면용 삼각형 부피와 견준 상대 차 최댓값(곡면 적분일 때 — 바뀐 크기)
 * - sig: 모든 입체의 질량 속성 값(PROPS_LEN칸, float64 비트 그대로)을 면 표가 처음 나온 차례로 이은 지문(FNV-1a 64비트 16진).
 *   해석기를 고친 전·후로 값이 한 비트라도 바뀌었는지 본다(sweep:compare)
 */
export interface MassPropsStats {
  solids: number;
  exact: number;
  approx: number;
  triangles: number;
  timeout: number;
  maxRelBound: number;
  maxRelChange: number;
  sig: string;
}

/** float64 값들의 FNV-1a 64비트 지문(BigInt 없이 32비트 둘로) */
export function propsSignature(list: readonly ArrayLike<number>[]): string {
  // FNV-1a 64: offset 0xcbf29ce484222325, prime 0x100000001b3 — 위·아래 32비트로 나눠 곱한다
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  const buf = new DataView(new ArrayBuffer(8));
  const eat = (byte: number) => {
    lo = (lo ^ byte) >>> 0;
    // (hi, lo) × 0x100_000001b3 mod 2⁶⁴: 아래 = lo × 0x1b3, 위 = hi × 0x1b3 + lo × 0x100 + 올림
    const a = lo * 0x1b3;
    const loNew = a >>> 0;
    const carry = Math.floor(a / 0x100000000);
    hi = (Math.imul(hi, 0x1b3) + Math.imul(lo, 0x100) + carry) >>> 0;
    lo = loNew;
  };
  for (const p of list) {
    for (let i = 0; i < p.length; i++) {
      buf.setFloat64(0, p[i]!, true);
      for (let k = 0; k < 8; k++) eat(buf.getUint8(k));
    }
    // 입체 사이 구분
    eat(0x7c);
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

export function massPropsStats(scene: Pick<Scene3d, 'meshes' | 'meta'>): MassPropsStats {
  const out: MassPropsStats = { solids: 0, exact: 0, approx: 0, triangles: 0, timeout: 0, maxRelBound: 0, maxRelChange: 0, sig: '' };
  const meta = scene.meta as { faceTables?: FaceTableLike[]; meshFaceTable?: ArrayLike<number> } | undefined;
  const done = new Set<number>();
  const values: ArrayLike<number>[] = [];
  scene.meshes.forEach((m, i) => {
    const ti = meta?.meshFaceTable?.[i] ?? -1;
    const p = ti >= 0 ? meta?.faceTables?.[ti]?.props : undefined;
    if (!p || done.has(ti)) return;
    done.add(ti);
    values.push(p);
    out.solids++;
    const V = p[0]!;
    const rel = V > 0 ? p[13]! / V : Infinity;
    if (p[14] === PROPS_TIMEOUT) out.timeout++;
    else if (p[14] !== PROPS_BREP) out.triangles++;
    else if (rel <= 1e-9) out.exact++;
    else out.approx++;
    if (p[14] === PROPS_BREP) {
      if (rel > 1e-9) out.maxRelBound = Math.max(out.maxRelBound, rel);
      const tv = signedVolume(m.positions, m.indices ?? sequential(m.positions.length / 3));
      if (tv > 0) out.maxRelChange = Math.max(out.maxRelChange, Math.abs(V - tv) / tv);
    }
  });
  out.sig = propsSignature(values);
  return out;
}

function triArea(P: ArrayLike<number>, I: ArrayLike<number>, t0: number, t1: number): number {
  let a = 0;
  for (let t = t0; t < t1; t++) {
    const i = I[t * 3]! * 3, j = I[t * 3 + 1]! * 3, k = I[t * 3 + 2]! * 3;
    const ux = P[j]! - P[i]!, uy = P[j + 1]! - P[i + 1]!, uz = P[j + 2]! - P[i + 2]!;
    const wx = P[k]! - P[i]!, wy = P[k + 1]! - P[i + 1]!, wz = P[k + 2]! - P[i + 2]!;
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a;
}

/** 면 표 넓이와 삼각형 넓이가 크게 다른 면 수와 가장 큰 상대 차 */
export function areaMismatch(m: Pick<Mesh3d, 'positions' | 'indices'>, table: FaceTableLike): { faces: number; max: number } {
  const P = m.positions;
  const I = m.indices ?? sequential(P.length / 3);
  let faces = 0;
  let max = 0;
  if (!table.area) return { faces, max };
  for (let fi = 0; fi + 1 < table.triStart.length; fi++) {
    const A = table.area[fi]!;
    if (!Number.isFinite(A) || A <= 0) continue;
    const a = triArea(P, I, table.triStart[fi]!, table.triStart[fi + 1]!);
    const rel = Math.abs(a - A) / A;
    // 곡면 삼각형은 조금 작다: 정확 표시면 3%, 근삿값이면 10% 넘게 다르면 의심
    if (rel > (table.exact?.[fi] ? 0.03 : 0.1)) {
      faces++;
      max = Math.max(max, rel);
    }
  }
  return { faces, max };
}

/** 장면 전체 지표(형상 항목 단위로 한 번씩) */
export function sceneQuality(scene: Pick<Scene3d, 'meshes' | 'meta'>): SceneQuality {
  const q: SceneQuality = {
    items: 0,
    closedShells: 0,
    solids: 0,
    openShells: 0,
    windingSolids: 0,
    windingEdges: 0,
    negativeVolumeSolids: 0,
    foldedTriangles: 0,
    foldedMaxRatio: 0,
    foldedMaxAreaRatio: 0,
    areaMismatchFaces: 0,
    areaMismatchMax: 0,
    nonFinite: 0,
  };
  const seen = new Set<ArrayLike<number>>();
  const meta = scene.meta as { faceTables?: FaceTableLike[]; meshFaceTable?: ArrayLike<number> } | undefined;
  const tablesDone = new Set<number>();
  scene.meshes.forEach((m, i) => {
    if (!seen.has(m.positions)) {
      seen.add(m.positions);
      const it = itemQuality(m);
      q.items++;
      if (it.closedShell) q.closedShells++;
      if (it.solid) q.solids++;
      if (it.closedShell && !it.solid) q.openShells++;
      if (it.windingEdges > 0) {
        q.windingSolids++;
        q.windingEdges += it.windingEdges;
      }
      if (it.solid && it.volume < 0) q.negativeVolumeSolids++;
      q.foldedTriangles += it.folded;
      q.foldedMaxRatio = Math.max(q.foldedMaxRatio, it.foldedRatio);
      q.foldedMaxAreaRatio = Math.max(q.foldedMaxAreaRatio, it.foldedAreaRatio);
      q.nonFinite += it.nonFinite;
    }
    const ti = meta?.meshFaceTable?.[i] ?? -1;
    const table = ti >= 0 ? meta?.faceTables?.[ti] : undefined;
    if (table && !tablesDone.has(ti)) {
      tablesDone.add(ti);
      const a = areaMismatch(m, table);
      q.areaMismatchFaces += a.faces;
      q.areaMismatchMax = Math.max(q.areaMismatchMax, a.max);
    }
  });
  return q;
}

/** 워커 → 화면 전송량(해석 결과를 보낼 때 넘기는 버퍼)과 모서리 표, 곡선 모서리 접선을 구하는 길 */
export interface TransferStats {
  /** 해석 결과(질량 속성 전)의 이전 가능한 버퍼 바이트 합 */
  xfer: number;
  /** 모서리 표(meta.edgeTables) 형식 배열 바이트 합(곡선 정의 포함) */
  edges: number;
  /** 그 가운데 곡선 정의(curveStart·curves) */
  curves: number;
  /** 끝 접선을 아는 곡선 모서리 수(표마다 한 번) */
  curved: number;
  /** 그 가운데 곡선 위 아무 점의 접선을 곡선 정의로 구하는 것(원·기록이 있는 타원·B-스플라인 — 나머지는 꺾은선 어림) */
  exact: number;
}

/** 해석 결과 하나의 전송량(질량 속성을 적분해 면 표에 넣기 전에 잰다 — 앱 워커가 'done'으로 보내는 것과 같다) */
export function transferStats(result: { scene: Pick<Scene3d, 'meta'> }): TransferStats {
  const xfer = collectTransfers(result).reduce((s, b) => s + b.byteLength, 0);
  const meta = (result.scene.meta ?? {}) as { edgeKinds?: string[]; edgeTables?: Record<string, unknown>[] };
  const kinds = meta.edgeKinds ?? [];
  let edges = 0;
  let curves = 0;
  let curved = 0;
  let exact = 0;
  for (const t of meta.edgeTables ?? []) {
    for (const v of Object.values(t)) if (ArrayBuffer.isView(v)) edges += v.byteLength;
    for (const k of ['curveStart', 'curves']) if (ArrayBuffer.isView(t[k])) curves += (t[k] as ArrayBufferView).byteLength;
    const T = t.tangents as Float32Array | undefined;
    const K = t.kinds as Uint8Array;
    if (!T || !K) continue;
    for (let e = 0; e < K.length; e++) {
      if (!Number.isFinite(T[e * 6]!) || !Number.isFinite(T[e * 6 + 3]!)) continue;
      curved++;
      if (edgeCurve(t as never, e, kinds)) exact++;
    }
  }
  return { xfer, edges, curves, curved, exact };
}
