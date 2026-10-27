/**
 * 물리 속성(순수, DOM 없음): 그물마다 부피·무게중심·겉넓이를 구하고 자리 변환(Mesh3d.matrix·origin)을 반영해 고른 것끼리 더한다.
 *
 * - 부피·1차·2차 모멘트는 해석 워커가 면 표에 남긴 B-rep 질량 속성(FaceTableData.props — massprops.ts, 곡면과 모서리 곡선의 경계 적분)을
 *   먼저 쓴다. 평면·원기둥·원뿔·구·원환과 직선·원·타원 모서리로 된 입체는 반올림 수준으로 정확하고, B-스플라인 같은 면이 섞이면
 *   그 면만 화면용 삼각형으로 재고 부피 어림 오차(bound)를 함께 준다 — 화면은 "정확" 또는 "근삿값(±…%)"으로 보인다.
 * - 면 표 질량 속성이 없으면(옛 결과·면 표를 끈 해석) 닫힌 그물(Mesh3d.closed)의 삼각형으로 사면체를 더해 구한다(발산 정리).
 *   화면용 삼각형이라 곡면은 조금 작게 나오고 어림 오차를 모른다("≈"). 열린 그물은 부피에서 뺀다.
 * - 겉넓이는 면 표에 B-rep 넓이(area)가 모든 면에 있으면 그 합(정확), 아니면 삼각형 넓이(≈).
 * - 같은 형상을 여러 자리에 놓으면(같은 positions) 형상 좌표 값은 한 번만 구한다(WeakMap).
 * - 질량 = 밀도(kg/m³) × 부피(m³). 밀도는 그 그물이 든 제품의 파일 밀도, 없으면 고른 재질 밀도.
 */
import type { Box3, Mesh3d } from 'opencad-viewer3d/types';
import { PROPS_TIMEOUT } from '../massprops';
import type { FaceIndex, ProductNode } from './doc';

type V3 = [number, number, number];

/** 형상 좌표(origin 포함, matrix 전)에서 구한 값 */
interface LocalProps {
  volume: number;
  /** 1차 모멘트(부피 × (무게중심 − ref)) */
  moment: V3;
  /** ref 기준 2차 모멘트 ∫y_i y_j dV(y = x − ref): [xx, yy, zz, xy, yz, zx] */
  second: [number, number, number, number, number, number];
  /** 모멘트 기준점(형상 좌표) */
  ref: V3;
  /** 삼각형 넓이 */
  facetArea: number;
  /** 부피 어림 오차(형상 단위³, 0이면 정확) — 모르면 NaN(삼각형으로만 잰 값) */
  bound: number;
  /** 시간 한도 때문에 곡면 적분 대신 삼각형으로 구했는지 */
  timedOut: boolean;
}

/** 정확으로 볼 상대 어림 오차(부피 대비) */
export const EXACT_REL = 1e-9;

const cache = new WeakMap<ArrayLike<number>, Map<ArrayLike<number> | null, LocalProps>>();

/**
 * 그물 하나의 형상 좌표 부피·모멘트·삼각형 넓이(positions + origin — 모멘트는 묶음 원점 기준이라 큰 좌표에서도 자릿수를 잃지 않는다).
 * faces를 주면 면 표의 B-rep 질량 속성(있으면)을 쓴다
 */
export function localProps(mesh: Pick<Mesh3d, 'id' | 'positions' | 'indices' | 'origin'>, faces?: FaceIndex | null): LocalProps {
  const tri = triangleProps(mesh);
  const ti = faces?.tableOf.get(mesh.id);
  const p = ti === undefined ? undefined : faces!.tables[ti]?.props;
  if (!p || !(p[0]! > 0)) return tri;
  return {
    volume: p[0]!,
    moment: [p[1]!, p[2]!, p[3]!],
    second: [p[4]!, p[5]!, p[6]!, p[7]!, p[8]!, p[9]!],
    ref: [p[10]!, p[11]!, p[12]!],
    facetArea: tri.facetArea,
    bound: p[13]!,
    timedOut: p[14] === PROPS_TIMEOUT,
  };
}

/** 삼각형으로 잰 값(같은 positions·indices는 한 번만) */
function triangleProps(mesh: Pick<Mesh3d, 'positions' | 'indices' | 'origin'>): LocalProps {
  const key = mesh.indices ?? null;
  let byIdx = cache.get(mesh.positions);
  const hit = byIdx?.get(key);
  const o: V3 = mesh.origin ? [mesh.origin[0], mesh.origin[1], mesh.origin[2]] : [0, 0, 0];
  if (hit) return { ...hit, ref: o };
  const P = mesh.positions;
  const I = mesh.indices;
  const n = I ? I.length : P.length / 3;
  let vol = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let sxx = 0, syy = 0, szz = 0, sxy = 0, syz = 0, szx = 0;
  let area = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = (I ? I[t]! : t) * 3;
    const b = (I ? I[t + 1]! : t + 1) * 3;
    const c = (I ? I[t + 2]! : t + 2) * 3;
    const ax = P[a]!, ay = P[a + 1]!, az = P[a + 2]!;
    const bx = P[b]!, by = P[b + 1]!, bz = P[b + 2]!;
    const cx = P[c]!, cy = P[c + 1]!, cz = P[c + 2]!;
    // 원점 사면체 부피(부호 있음)
    const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    vol += v;
    mx += (v * (ax + bx + cx)) / 4;
    my += (v * (ay + by + cy)) / 4;
    mz += (v * (az + bz + cz)) / 4;
    // 원점 사면체의 ∫x xᵀ dV = v/20 · (Σ p pᵀ + s sᵀ), p = 세 꼭짓점(원점은 0), s = 그 합
    const sx = ax + bx + cx, sy = ay + by + cy, sz = az + bz + cz;
    const k = v / 20;
    sxx += k * (ax * ax + bx * bx + cx * cx + sx * sx);
    syy += k * (ay * ay + by * by + cy * cy + sy * sy);
    szz += k * (az * az + bz * bz + cz * cz + sz * sz);
    sxy += k * (ax * ay + bx * by + cx * cy + sx * sy);
    syz += k * (ay * az + by * bz + cy * cz + sy * sz);
    szx += k * (az * ax + bz * bx + cz * cx + sz * sx);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  const out: LocalProps = { volume: vol, moment: [mx, my, mz], second: [sxx, syy, szz, sxy, syz, szx], ref: o, facetArea: area, bound: NaN, timedOut: false };
  if (!byIdx) cache.set(mesh.positions, (byIdx = new Map()));
  byIdx.set(key, out);
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
  /**
   * 무게중심 기준 관성(질량을 알 때만, kg·m²): 텐서 대각 Ixx·Iyy·Izz(장면 축), 주 관성 모멘트(작은 것부터)와 그 축(세계, 단위).
   * 정확도는 부피와 같은 길(volumeBound)
   */
  inertia: Inertia | null;
  /**
   * 부피 어림 오차 합(장면 단위³): 닫힌 그물이 모두 B-rep 질량 속성을 가졌을 때만, 하나라도 삼각형으로만 쟀으면 null(모름).
   * 0에 가까우면(부피의 EXACT_REL 이하) 부피·질량·무게중심·관성이 정확하다(exact)
   */
  volumeBound: number | null;
  /** 부피·질량·무게중심·관성이 정확한지(B-rep 적분, 어림 오차가 반올림 수준) */
  exact: boolean;
  /** 시간 한도 때문에 곡면 적분 대신 삼각형으로 구한 닫힌 그물 수 */
  timedOut: number;
}

export interface Inertia {
  /** 텐서 [Ixx, Iyy, Izz, Ixy, Iyz, Izx](kg·m², 곱 관성은 텐서 원소 −∫xy dm) */
  tensor: [number, number, number, number, number, number];
  /** 주 관성 모멘트(작은 것부터, kg·m²) */
  principal: [number, number, number];
  /** 주축(principal과 같은 차례, 세계 방향 단위 벡터) */
  axes: [V3, V3, V3];
}

/** 대칭 3×3 행렬(행 우선 9개)의 고윳값·고유 벡터(야코비 회전). 고윳값 작은 것부터 */
export function symEigen3(m: readonly number[]): { values: [number, number, number]; vectors: [V3, V3, V3] } {
  const a = [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!, m[8]!];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[1]!) + Math.abs(a[2]!) + Math.abs(a[5]!);
    if (off <= 1e-15 * (Math.abs(a[0]!) + Math.abs(a[4]!) + Math.abs(a[8]!) + 1e-300)) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = a[p * 3 + q]!;
      if (apq === 0) continue;
      const app = a[p * 4]!;
      const aqq = a[q * 4]!;
      const theta = (aqq - app) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const sn = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p]!;
        const akq = a[k * 3 + q]!;
        a[k * 3 + p] = c * akp - sn * akq;
        a[k * 3 + q] = sn * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k]!;
        const aqk = a[q * 3 + k]!;
        a[p * 3 + k] = c * apk - sn * aqk;
        a[q * 3 + k] = sn * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p]!;
        const vkq = v[k * 3 + q]!;
        v[k * 3 + p] = c * vkp - sn * vkq;
        v[k * 3 + q] = sn * vkp + c * vkq;
      }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i * 4]! - a[j * 4]!);
  const col = (i: number): V3 => [v[i]!, v[3 + i]!, v[6 + i]!];
  return { values: [a[idx[0]! * 4]!, a[idx[1]! * 4]!, a[idx[2]! * 4]!], vectors: [col(idx[0]!), col(idx[1]!), col(idx[2]!)] };
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
  const m2 = Number.isFinite(opts.sceneMm) ? (opts.sceneMm / 1000) ** 2 : NaN;
  /** 질량 가중 원점 기준 2차 모멘트 Σρ∫x xᵀ dV(kg·장면 단위²) — 행 우선 9개 */
  const J = new Array<number>(9).fill(0);
  let bound = 0;
  let boundKnown = true;
  let timedOut = 0;
  for (const mesh of meshes) {
    if (ids && !ids.has(mesh.id)) continue;
    const lp = mesh.closed ? localProps(mesh, opts.faces) : triangleProps(mesh);
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
    if (Number.isFinite(lp.bound)) bound += lp.bound * Math.abs(det);
    else boundKnown = false;
    if (lp.timedOut) timedOut++;
    const r = lp.ref;
    const c0: V3 = [r[0] + lp.moment[0] / lp.volume, r[1] + lp.moment[1] / lp.volume, r[2] + lp.moment[2] / lp.volume];
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
      // 세계 2차 모멘트: x' = A x + t 이면 ∫x'x'ᵀ = |det|(A C Aᵀ + A m tᵀ + t (A m)ᵀ + V t tᵀ) — 거울 자리(부피 음수)는 부호를 맞춘다
      const sg = Math.sign(lp.volume);
      const S = lp.second;
      const C = [S[0], S[3], S[5], S[3], S[1], S[4], S[5], S[4], S[2]].map((x) => x * sg);
      const mv = lp.moment.map((x) => x * sg) as V3;
      const V0 = lp.volume * sg;
      const A = M ? [M[0]!, M[4]!, M[8]!, M[1]!, M[5]!, M[9]!, M[2]!, M[6]!, M[10]!] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      // 모멘트는 ref 기준: x = ref + y → x' = A y + (A ref + t)
      const t0: V3 = M ? [M[12]!, M[13]!, M[14]!] : [0, 0, 0];
      const t: V3 = [0, 1, 2].map((i) => A[i * 3]! * r[0] + A[i * 3 + 1]! * r[1] + A[i * 3 + 2]! * r[2] + t0[i]!) as V3;
      const Am: V3 = [0, 1, 2].map((i) => A[i * 3]! * mv[0] + A[i * 3 + 1]! * mv[1] + A[i * 3 + 2]! * mv[2]) as V3;
      const ad = Math.abs(det);
      const kk = rho * m3; // kg / 장면 단위³
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          let acc = 0;
          for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) acc += A[i * 3 + p]! * C[p * 3 + q]! * A[j * 3 + q]!;
          acc += Am[i]! * t[j]! + t[i]! * Am[j]! + V0 * t[i]! * t[j]!;
          J[i * 3 + j] = J[i * 3 + j]! + kk * ad * acc;
        }
    } else noDensity++;
  }
  const useMass = massKnown > 0 && noDensity === 0 && mass > 0;
  const centroid: V3 | null = useMass ? [wm[0] / mass, wm[1] / mass, wm[2] / mass] : volume > 0 ? [wv[0] / volume, wv[1] / volume, wv[2] / volume] : null;
  // 무게중심 기준으로 옮기고(평행축) 관성 텐서 I = tr(K)·E − K, 단위 kg·m²
  let inertia: Inertia | null = null;
  if (useMass && centroid && Number.isFinite(m2)) {
    const K = J.map((x, n) => (x - mass * centroid[Math.floor(n / 3)]! * centroid[n % 3]!) * m2);
    const tr = K[0]! + K[4]! + K[8]!;
    const I = K.map((x, n) => (n % 4 === 0 ? tr - x : -x));
    const e = symEigen3(I);
    inertia = { tensor: [I[0]!, I[4]!, I[8]!, I[1]!, I[5]!, I[2]!], principal: e.values, axes: e.vectors };
  }
  const volumeBound = closed && boundKnown ? bound : null;
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
    inertia,
    volumeBound,
    exact: volumeBound !== null && volume > 0 && volumeBound <= EXACT_REL * volume,
    timedOut,
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

/**
 * 부피·질량·관성의 정확도 글: 정확(B-rep 곡면 적분) · 근삿값(±x%, 부피 어림 오차) · 근삿값(화면용 삼각형 — 어림 오차를 모를 때)
 */
export function accuracyText(p: Pick<PhysProps, 'exact' | 'volumeBound' | 'volume'>, num: (v: number, digits: number) => string = (v, d) => String(Number(v.toFixed(d)))): { text: string; title: string } {
  if (p.exact) return { text: '정확(B-rep 곡면 적분)', title: '곡면과 모서리 곡선을 적분해 반올림 오차 수준으로 맞는 값입니다.' };
  if (p.volumeBound === null || !(p.volume > 0)) return { text: '근삿값(화면용 삼각형)', title: '화면에 그리는 삼각형으로 잰 값이라 곡면이 있으면 조금 작게 나옵니다.' };
  const pct = (p.volumeBound / p.volume) * 100;
  const title = '곡면 적분을 못 한 면(B-스플라인 등)만 화면용 삼각형으로 잰 어림 오차입니다(부피 기준).';
  if (pct < 0.001) return { text: '근삿값(±0.001% 미만)', title };
  // 유효 숫자 두 자리(지수 표기 없이)
  const d = Math.max(0, Math.min(6, 1 - Math.floor(Math.log10(pct))));
  return { text: `근삿값(±${num(Number(pct.toFixed(d)), d)}%)`, title };
}

/** 질량(kg) → "12.3 g" / "1.23 kg" */
export function massText(kg: number, num: (v: number, digits?: number) => string): string {
  return kg < 1 ? `${num(kg * 1000)} g` : `${num(kg)} kg`;
}

/** 관성 모멘트(kg·m²) → 크기에 맞는 단위 글: "1.23 kg·m²" / "12.3 kg·mm²" / "123 g·mm²" */
export function inertiaText(kgm2: number, num: (v: number, digits?: number) => string): string {
  const a = Math.abs(kgm2);
  if (a >= 1) return `${num(kgm2)} kg·m²`;
  if (a >= 1e-6) return `${num(kgm2 * 1e6)} kg·mm²`;
  return `${num(kgm2 * 1e9)} g·mm²`;
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
