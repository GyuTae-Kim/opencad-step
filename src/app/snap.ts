/**
 * 두 점 측정의 붙잡기 점(순수, DOM 없음 — 코어 0.8.0 Viewer3d.setMeasureSnap에 준다).
 *
 * - 원·원호·타원 중심: 모서리 표(meta.edgeTables)가 아는 모든 원 모서리의 중심을 세계 좌표(묶음 origin·자리 matrix 반영)로.
 *   중심은 커서가 그 자리(구멍 가운데 빈 곳 포함)에 와야 붙으므로 늘 후보(points)로 준다. 같은 그물 안 같은 자리 중심은 하나로.
 * - 고른 모서리의 곡선 가운데 점·끝점·중심(pointsFor): 윤곽선은 곡선을 꺾은선으로 그린 것이라 코어의 선분 가운데 점은
 *   곡선 모서리에서 현의 가운데일 뿐이다 — B-rep 모서리의 곡선 길이 가운데 점을 모서리 표로 준다.
 * - 추론 붙잡기(코어 0.9.0 inference): 교차점·수직 발·축 방향은 코어가 찾고, 여기서는 종류 이름(상태 막대·측정 띠·결과)만 만든다.
 */
import type { Mesh3d, Pick3d, SnapKind, SnapPoint } from 'opencad-viewer3d/types';
import type { MeasureSnapOptions, SnapAxis } from 'opencad-viewer3d';
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

/**
 * 코어 setMeasureSnap에 줄 선택: 측정 중에만 윤곽선도 고르고(edges — 면 고르기 밖에서는 pickEdges가 꺼져 있다), 원·원호 중심(centers)을
 * 늘 후보로, 누른 모서리마다 곡선 가운데 점·끝점·중심(pointsFor — 같은 모서리를 이어 가리키는 동안은 한 번만 구한다),
 * 코어 0.9.0 추론 붙잡기(교차점·수직 발·축 방향)를 모두 켠다. 코어의 선분 가운데 점(midpoints)은 곡선 모서리에서 현의 가운데라 쓰지 않는다
 */
export function measureSnapOptions(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null, centers: readonly SnapPoint[]): MeasureSnapOptions {
  const byId = new Map(meshes.map((m) => [m.id, m] as const));
  let lastKey = '';
  let last: SnapPoint[] | null = null;
  return {
    edges: true,
    inference: true,
    points: centers,
    pointsFor: (p) => {
      if (p.kind !== 'edge') return null;
      const key = `${p.id}:${p.raw ?? p.index}`;
      if (key !== lastKey) {
        lastKey = key;
        last = edgeSnapPoints(p, byId, ex);
      }
      return last;
    },
  };
}

/** 축 붙잡기의 축 이름(번역층이 옮긴다) */
const AXIS_LABEL: Record<SnapAxis, string> = { x: 'X축 방향', y: 'Y축 방향', z: 'Z축 방향' };

/**
 * 붙잡은 종류 → 한국어 이름(번역층이 옮긴다). 붙잡지 않았으면(면 위 자유 점) '면 위 점'.
 * 축 붙잡기(코어 0.9.0)는 축을 알면 "X축 방향"처럼
 */
export function snapLabel(kind: SnapKind | null | undefined, axis?: SnapAxis | null): string {
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
    case 'intersection':
      return '교차점';
    case 'perpendicular':
      return '수직 발';
    case 'axis':
      return axis ? AXIS_LABEL[axis] : '축 방향';
    default:
      return '면 위 점';
  }
}

/**
 * 두 점 측정 결과의 축(축 붙잡기 결과는 첫 점에서 한 축 방향으로만 떨어져 있다 — dx·dy·dz 가운데 가장 큰 것).
 * 결과에는 축이 실리지 않아(MeasureResult.snapB = 'axis'뿐) 성분으로 정한다
 */
export function resultAxis(m: { dx: number; dy: number; dz: number }): SnapAxis {
  const x = Math.abs(m.dx);
  const y = Math.abs(m.dy);
  const z = Math.abs(m.dz);
  return x >= y && x >= z ? 'x' : y >= z ? 'y' : 'z';
}

/** 측정 결과의 두 점 붙잡기 이름(붙잡기를 켠 결과 — snapA·snapB가 있을 때만, 둘 다 자유 점이면 null) */
export function snapPair(m: { snapA?: SnapKind | null; snapB?: SnapKind | null; dx?: number; dy?: number; dz?: number }): [string, string] | null {
  if (m.snapA === undefined && m.snapB === undefined) return null;
  if (!m.snapA && !m.snapB) return null;
  const axisOf = (k: SnapKind | null | undefined) => (k === 'axis' && m.dx !== undefined && m.dy !== undefined && m.dz !== undefined ? resultAxis({ dx: m.dx, dy: m.dy, dz: m.dz }) : null);
  return [snapLabel(m.snapA, axisOf(m.snapA)), snapLabel(m.snapB, axisOf(m.snapB))];
}

/**
 * 측정 중 커서 아래 붙잡을 점(코어 measureHoverSnap)의 이름: 상태 막대·측정 띠에 보인다. 커서 아래에 아무것도 없으면 null,
 * 모형 위지만 붙잡지 않으면 '면 위 점'
 */
export function hoverSnapLabel(h: { snap: SnapKind | null; axis?: SnapAxis } | null | undefined): string | null {
  return h ? snapLabel(h.snap, h.axis) : null;
}
