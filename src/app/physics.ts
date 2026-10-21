/**
 * 물리 속성(순수, DOM 없음): 그물마다 부피·무게중심·겉넓이를 구하고 자리 변환(Mesh3d.matrix·origin)을 반영해 고른 것끼리 더한다.
 *
 * - 부피와 1차 모멘트는 닫힌 그물(Mesh3d.closed)의 삼각형으로 원점 사면체를 더해 구한다(발산 정리). 화면용 삼각형이라
 *   곡면은 조금 작게 나온다(기본 허용 오차에서 0.01~0.2%) — 화면은 "≈"로 보인다. 열린 그물은 부피에서 뺀다.
 * - 겉넓이는 면 표에 B-rep 넓이(area)가 모든 면에 있으면 그 합(정확), 아니면 삼각형 넓이(≈).
 * - 같은 형상을 여러 자리에 놓으면(같은 positions) 형상 좌표 값은 한 번만 구한다(WeakMap).
 * - 질량 = 밀도(kg/m³) × 부피(m³). 밀도는 그 그물이 든 제품의 파일 밀도, 없으면 고른 재질 밀도.
 */
import type { Box3, Mesh3d } from 'opencad-viewer3d/types';
import type { FaceIndex, ProductNode } from './doc';

type V3 = [number, number, number];

/** 형상 좌표(origin 포함, matrix 전)에서 구한 값 */
interface LocalProps {
  volume: number;
  /** 1차 모멘트(부피 × 무게중심) */
  moment: V3;
  /** 삼각형 넓이 */
  facetArea: number;
}

const cache = new WeakMap<ArrayLike<number>, Map<ArrayLike<number> | null, LocalProps>>();

/** 그물 하나의 형상 좌표 부피·모멘트·삼각형 넓이(positions + origin) */
export function localProps(mesh: Pick<Mesh3d, 'positions' | 'indices' | 'origin'>): LocalProps {
  const key = mesh.indices ?? null;
  let byIdx = cache.get(mesh.positions);
  const hit = byIdx?.get(key);
  if (hit && !mesh.origin) return hit;
  const P = mesh.positions;
  const I = mesh.indices;
  const o = mesh.origin ?? [0, 0, 0];
  const n = I ? I.length : P.length / 3;
  let vol = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let area = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = (I ? I[t]! : t) * 3;
    const b = (I ? I[t + 1]! : t + 1) * 3;
    const c = (I ? I[t + 2]! : t + 2) * 3;
    const ax = P[a]! + o[0], ay = P[a + 1]! + o[1], az = P[a + 2]! + o[2];
    const bx = P[b]! + o[0], by = P[b + 1]! + o[1], bz = P[b + 2]! + o[2];
    const cx = P[c]! + o[0], cy = P[c + 1]! + o[1], cz = P[c + 2]! + o[2];
    // 원점 사면체 부피(부호 있음)
    const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    vol += v;
    mx += (v * (ax + bx + cx)) / 4;
    my += (v * (ay + by + cy)) / 4;
    mz += (v * (az + bz + cz)) / 4;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  const out: LocalProps = { volume: vol, moment: [mx, my, mz], facetArea: area };
  if (!mesh.origin) {
    if (!byIdx) cache.set(mesh.positions, (byIdx = new Map()));
    byIdx.set(key, out);
  }
  return out;
}

/** B-rep 겉넓이(형상 좌표 단위²): 면 표의 모든 면에 넓이가 있으면 합과 정확 여부, 아니면 null */
export function brepArea(faces: FaceIndex | null, meshId: string): { area: number; exact: boolean } | null {
  const ti = faces?.tableOf.get(meshId);
  const t = ti === undefined ? undefined : faces!.tables[ti];
  if (!t?.area) return null;
  let s = 0;
  let exact = true;
  for (let i = 0; i < t.area.length; i++) {
    const a = t.area[i]!;
    if (!Number.isFinite(a)) return null;
    s += a;
    if (!t.exact?.[i]) exact = false;
  }
  return { area: s, exact };
}

function det3(m: ArrayLike<number>): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}

export interface PhysProps {
  /** 닫힌 그물 부피 합(장면 단위³) */
  volume: number;
  /** 겉넓이 합(장면 단위²) */
  area: number;
  /** 겉넓이가 모두 B-rep 정확 값인지 */
  areaExact: boolean;
  /** 무게중심(질량이 있으면 질량, 아니면 부피 가중 — 장면 좌표), 닫힌 그물이 없으면 null */
  centroid: V3 | null;
  /** 질량(kg) — 밀도를 아는 닫힌 그물이 하나도 없으면 null */
  mass: number | null;
  /** 밀도를 몰라 질량에서 빠진 닫힌 그물 수 */
  noDensity: number;
  /** 닫힌·열린 그물 수 */
  closed: number;
  open: number;
  /** 밀도 출처: 파일·고른 재질이 섞였는지 */
  densityFrom: { file: number; picked: number };
  bounds: Box3 | null;
}

/**
 * 고른 그물들의 물리 속성 합. sceneMm는 장면 단위 1이 몇 mm인지(질량 계산용, 모르면 NaN → 질량 없음).
 * densityOf(meshId)는 파일 밀도(kg/m³), 없으면 picked(고른 재질 밀도)를 쓴다.
 */
export function physProps(
  meshes: readonly Mesh3d[],
  ids: ReadonlySet<string> | null,
  opts: { faces?: FaceIndex | null; sceneMm: number; densityOf?: (meshId: string) => number | undefined; picked?: number | null },
): PhysProps {
  let volume = 0;
  let area = 0;
  let areaExact = true;
  let mass = 0;
  let massKnown = 0;
  let noDensity = 0;
  let closed = 0;
  let open = 0;
  const wv: V3 = [0, 0, 0];
  const wm: V3 = [0, 0, 0];
  let lo: V3 = [Infinity, Infinity, Infinity];
  let hi: V3 = [-Infinity, -Infinity, -Infinity];
  const from = { file: 0, picked: 0 };
  const m3 = Number.isFinite(opts.sceneMm) ? (opts.sceneMm / 1000) ** 3 : NaN;
  for (const mesh of meshes) {
    if (ids && !ids.has(mesh.id)) continue;
    const lp = localProps(mesh);
    const M = mesh.matrix;
    const det = M ? det3(M) : 1;
    const s2 = Math.cbrt(Math.abs(det)) ** 2;
    const ba = brepArea(opts.faces ?? null, mesh.id);
    area += (ba ? ba.area : lp.facetArea) * s2;
    if (!ba?.exact) areaExact = false;
    // 범위(세계)
    const P = mesh.positions;
    const o = mesh.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < P.length; i += 3) {
      const x = P[i]! + o[0], y = P[i + 1]! + o[1], z = P[i + 2]! + o[2];
      const w: V3 = M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
      for (let k = 0; k < 3; k++) {
        if (w[k]! < lo[k]!) lo[k] = w[k]!;
        if (w[k]! > hi[k]!) hi[k] = w[k]!;
      }
    }
    if (!mesh.closed || !(Math.abs(lp.volume) > 0)) {
      open++;
      continue;
    }
    closed++;
    const v = Math.abs(lp.volume * det);
    const c0: V3 = [lp.moment[0] / lp.volume, lp.moment[1] / lp.volume, lp.moment[2] / lp.volume];
    const c: V3 = M ? [M[0]! * c0[0] + M[4]! * c0[1] + M[8]! * c0[2] + M[12]!, M[1]! * c0[0] + M[5]! * c0[1] + M[9]! * c0[2] + M[13]!, M[2]! * c0[0] + M[6]! * c0[1] + M[10]! * c0[2] + M[14]!] : c0;
    volume += v;
    for (let k = 0; k < 3; k++) wv[k] = wv[k]! + c[k]! * v;
    const file = opts.densityOf?.(mesh.id);
    const rho = file ?? opts.picked ?? undefined;
    if (rho && Number.isFinite(m3)) {
      if (file) from.file++;
      else from.picked++;
      const mm = rho * v * m3;
      mass += mm;
      massKnown++;
      for (let k = 0; k < 3; k++) wm[k] = wm[k]! + c[k]! * mm;
    } else noDensity++;
  }
  const useMass = massKnown > 0 && noDensity === 0 && mass > 0;
  const centroid: V3 | null = useMass ? [wm[0] / mass, wm[1] / mass, wm[2] / mass] : volume > 0 ? [wv[0] / volume, wv[1] / volume, wv[2] / volume] : null;
  return {
    volume,
    area,
    areaExact: areaExact && meshes.length > 0,
    centroid,
    mass: massKnown ? mass : null,
    noDensity,
    closed,
    open,
    densityFrom: from,
    bounds: Number.isFinite(lo[0]) ? { min: lo, max: hi } : null,
  };
}

/** 그물 id → 그것이 바로 놓인 나무 마디 */
export function meshNodes(roots: readonly ProductNode[]): Map<string, ProductNode> {
  const out = new Map<string, ProductNode>();
  const walk = (l: readonly ProductNode[]) => {
    for (const n of l) {
      for (const id of n.meshIds) out.set(id, n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** 질량(kg) → "12.3 g" / "1.23 kg" */
export function massText(kg: number, num: (v: number, digits?: number) => string): string {
  return kg < 1 ? `${num(kg * 1000)} g` : `${num(kg)} kg`;
}

/** 고를 재질(밀도 kg/m³) */
export const MATERIALS: [string, number][] = [
  ['강철', 7850],
  ['스테인리스강', 7930],
  ['주철', 7200],
  ['알루미늄', 2700],
  ['황동', 8500],
  ['구리', 8960],
  ['티타늄', 4430],
  ['ABS', 1040],
  ['PLA', 1240],
  ['나일론(PA)', 1140],
  ['아크릴(PMMA)', 1180],
];
