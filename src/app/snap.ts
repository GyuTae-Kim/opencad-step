/**
 * 두 점 측정의 붙잡기 점(순수, DOM 없음 — 코어 0.8.0 Viewer3d.setMeasureSnap에 준다).
 *
 * - 원·원호·타원 중심: 모서리 표(meta.edgeTables)가 아는 모든 원 모서리의 중심을 세계 좌표(묶음 origin·자리 matrix 반영)로.
 *   중심은 커서가 그 자리(구멍 가운데 빈 곳 포함)에 와야 붙으므로 늘 후보(points)로 준다. 같은 그물 안 같은 자리 중심은 하나로.
 * - 고른 모서리의 곡선 가운데 점·끝점·중심(pointsFor): 윤곽선은 곡선을 꺾은선으로 그린 것이라 코어의 선분 가운데 점은
 *   곡선 모서리에서 현의 가운데일 뿐이다 — B-rep 모서리의 곡선 길이 가운데 점을 모서리 표로 준다.
 */
import type { Mesh3d, Pick3d, SnapKind, SnapPoint } from 'opencad-viewer3d/types';
import type { StepEdgeTable } from '../scene';
import { edgeAt, edgeDetails, isFullCircle } from './edges';

/** 모서리 표 매개변수 개수(brep.ts EDGE_PARAMS) */
const NP = 8;

export interface SnapEdgeIndex {
  kinds: readonly string[];
  tables: readonly StepEdgeTable[];
  tableOf: ReadonlyMap<string, number>;
}

/** 표 하나의 원·타원 중심(형상 좌표, origin 빼기 전 값 그대로 — 표 매개변수), 같은 자리는 하나로 */
function tableCenters(t: StepEdgeTable, kinds: readonly string[]): number[] {
  const want = new Set<number>();
  kinds.forEach((k, i) => {
    if (k === 'circle' || k === 'ellipse') want.add(i);
  });
  const out: number[] = [];
  const seen = new Set<string>();
  for (let e = 0; e < t.kinds.length; e++) {
    if (!want.has(t.kinds[e]!)) continue;
    const x = t.params[e * NP + 5]!;
    const y = t.params[e * NP + 6]!;
    const z = t.params[e * NP + 7]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    // 반지름의 1e-6 안이면 같은 중심(반으로 나뉜 원호 둘 등)
    const q = Math.max(Math.abs(t.params[e * NP]!) * 1e-6, 1e-9);
    const key = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x, y, z);
  }
  return out;
}

/**
 * 장면의 모든 원·원호·타원 중심 → 붙잡기 점(kind 'center', id = 그물 id — 숨김·단면·분해를 따른다).
 * limit을 넘으면 거기까지(아주 큰 조립에서 마우스 이동마다 훑는 양을 묶는다)
 */
export function circleCenters(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null, limit = 200_000): SnapPoint[] {
  if (!ex) return [];
  const local = new Map<number, number[]>();
  const out: SnapPoint[] = [];
  for (const mesh of meshes) {
    const ti = ex.tableOf.get(mesh.id);
    const t = ti === undefined ? undefined : ex.tables[ti];
    if (!t) continue;
    let c = local.get(ti!);
    if (!c) local.set(ti!, (c = tableCenters(t, ex.kinds)));
    const o = mesh.origin ?? [0, 0, 0];
    const m = mesh.matrix;
    for (let i = 0; i + 2 < c.length; i += 3) {
      const x = c[i]! + o[0]!;
      const y = c[i + 1]! + o[1]!;
      const z = c[i + 2]! + o[2]!;
      const point = m ? [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!] : [x, y, z];
      out.push({ point, kind: 'center', id: mesh.id });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * 고른 윤곽선(Pick3d kind 'edge')의 B-rep 모서리에서 붙잡을 점: 원호·곡선은 끝점·곡선 길이 가운데 점, 원·타원은 중심.
 * 한 바퀴 원은 끝점·가운데 점이 따로 없어(이음 꼭짓점 하나) 중심만. 윤곽선이 아니거나 표가 없으면 null
 */
export function edgeSnapPoints(pick: Pick3d, meshes: ReadonlyMap<string, Mesh3d> | readonly Mesh3d[], ex: SnapEdgeIndex | null): SnapPoint[] | null {
  if (pick.kind !== 'edge' || !ex) return null;
  const ti = ex.tableOf.get(pick.id);
  const table = ti === undefined ? undefined : ex.tables[ti];
  const mesh = meshes instanceof Map ? meshes.get(pick.id) : (meshes as readonly Mesh3d[]).find((m) => m.id === pick.id);
  if (!table || !mesh) return null;
  const e = edgeAt(table, pick.raw ?? pick.index);
  if (e < 0) return null;
  const d = edgeDetails(mesh, table, e, ex.kinds);
  if (!d) return null;
  const out: SnapPoint[] = [];
  if (!isFullCircle(d)) {
    out.push({ point: d.ends[0], kind: 'endpoint', id: mesh.id }, { point: d.ends[1], kind: 'endpoint', id: mesh.id });
    out.push({ point: d.mid, kind: 'midpoint', id: mesh.id });
  }
  if (d.center) out.push({ point: d.center, kind: 'center', id: mesh.id });
  return out;
}

/** 붙잡은 종류 → 한국어 이름(번역층이 옮긴다). 붙잡지 않았으면(면 위 자유 점) '면 위 점' */
export function snapLabel(kind: SnapKind | null | undefined): string {
  switch (kind) {
    case 'vertex':
      return '꼭짓점';
    case 'endpoint':
      return '끝점';
    case 'midpoint':
      return '가운데 점';
    case 'center':
      return '중심';
    case 'point':
      return '붙잡은 점';
    default:
      return '면 위 점';
  }
}

/** 측정 결과의 두 점 붙잡기 이름(붙잡기를 켠 결과 — snapA·snapB가 있을 때만, 둘 다 자유 점이면 null) */
export function snapPair(m: { snapA?: SnapKind | null; snapB?: SnapKind | null }): [string, string] | null {
  if (m.snapA === undefined && m.snapB === undefined) return null;
  if (!m.snapA && !m.snapB) return null;
  return [snapLabel(m.snapA), snapLabel(m.snapB)];
}
