/**
 * 두 점 측정의 붙잡기 점(순수, DOM 없음 — 코어 0.8.0 Viewer3d.setMeasureSnap에 준다).
 *
 * - 원·원호·타원 중심: 모서리 표(meta.edgeTables)가 아는 모든 원 모서리의 중심을 세계 좌표(묶음 origin·자리 matrix 반영)로.
 *   중심은 커서가 그 자리(구멍 가운데 빈 곳 포함)에 와야 붙으므로 늘 후보(points)로 준다. 같은 그물 안 같은 자리 중심은 하나로.
 * - 고른 모서리의 곡선 가운데 점·끝점·중심(pointsFor): 윤곽선은 곡선을 꺾은선으로 그린 것이라 코어의 선분 가운데 점은
 *   곡선 모서리에서 현의 가운데일 뿐이다 — B-rep 모서리의 곡선 길이 가운데 점을 모서리 표로 준다.
 * - 추론 붙잡기(코어 0.9.0 inference): 교차점·수직 발·축 방향은 코어가 찾고, 여기서는 종류 이름(상태 막대·측정 띠·결과)만 만든다.
 * - 추론 잠금과 모서리와 나란히(코어 0.10.0, SketchUp의 추론 잠금): Shift를 누르는 동안 지금 방향 추론(축·모서리와 나란히·수직)을 잠그고,
 *   화살표 →·←·↑는 X·Y·Z축, ↓는 지금 방향을 잠근다(같은 키로 풀기). 손가락 기기는 측정 띠의 잠금 단추. 여기서는 잠금 이름·안내·키 판단만 한다.
 */
import type { Mesh3d, Pick3d, SnapKind, SnapPoint } from 'opencad-viewer3d/types';
import type { MeasureInferenceLock, MeasureSnapOptions, SnapAxis, Viewer3d } from 'opencad-viewer3d';
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
 * 추론 붙잡기(교차점·수직 발·축 방향 — 코어 0.9.0, 모서리와 나란히·Shift 잠금 — 0.10.0)를 모두 켠다.
 * 코어의 선분 가운데 점(midpoints)은 곡선 모서리에서 현의 가운데라 쓰지 않는다
 */
export function measureSnapOptions(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null, centers: readonly SnapPoint[]): MeasureSnapOptions {
  const byId = new Map(meshes.map((m) => [m.id, m] as const));
  let lastKey = '';
  let last: SnapPoint[] | null = null;
  return {
    edges: true,
    inference: MEASURE_INFERENCE,
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

/** 두 점 측정의 추론 붙잡기: 교차점·수직 발·축 방향과 모서리와 나란히, Shift 잠금 */
export const MEASURE_INFERENCE = Object.freeze({ intersections: true, perpendicular: true, axes: true, parallel: true, lock: true });

/** 축 붙잡기의 축 이름(번역층이 옮긴다) */
const AXIS_LABEL: Record<SnapAxis, string> = { x: 'X축 방향', y: 'Y축 방향', z: 'Z축 방향' };

/**
 * 붙잡은 종류 → 한국어 이름(번역층이 옮긴다). 붙잡지 않았으면(면 위 자유 점) '면 위 점'.
 * 축 붙잡기(코어 0.9.0)는 축을 알면 "X축 방향"처럼(커서 아래는 measureHoverSnap.axis, 찍은 결과는 0.9.1 MeasureResult.axisA·axisB)
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
    case 'parallel':
      return '모서리와 나란히';
    default:
      return '면 위 점';
  }
}

/** 잠근 선 위 점 이름 뒤에 붙는 글(" · "로 이어 조각마다 번역된다) */
export const LOCKED_LABEL = '잠금';

/**
 * 측정 결과의 두 점 붙잡기 이름(붙잡기를 켠 결과 — snapA·snapB가 있을 때만, 둘 다 자유 점이면 null).
 * 축 붙잡기는 코어 0.9.1부터 결과에 실린 축(axisA·axisB)으로 "Y축 방향"처럼 쓴다
 */
export function snapPair(m: { snapA?: SnapKind | null; snapB?: SnapKind | null; axisA?: SnapAxis; axisB?: SnapAxis; lockedB?: boolean }): [string, string] | null {
  if (m.snapA === undefined && m.snapB === undefined) return null;
  if (!m.snapA && !m.snapB) return null;
  const b = snapLabel(m.snapB, m.axisB);
  return [snapLabel(m.snapA, m.axisA), m.lockedB ? `${b} · ${LOCKED_LABEL}` : b];
}

/**
 * 측정 중 커서 아래 붙잡을 점(코어 measureHoverSnap)의 이름: 상태 막대·측정 띠에 보인다. 커서 아래에 아무것도 없으면 null,
 * 모형 위지만 붙잡지 않으면 '면 위 점'
 */
export function hoverSnapLabel(h: { snap: SnapKind | null; axis?: SnapAxis; locked?: boolean } | null | undefined): string | null {
  if (!h) return null;
  const name = snapLabel(h.snap, h.axis);
  return h.locked ? `${name} · ${LOCKED_LABEL}` : name;
}

/** 잠근 방향 이름(잠금 안내·자동 확인): 축 · 모서리와 나란히 · 수직(첫 점에서 수직 발 쪽) */
export type LockName = SnapAxis | 'parallel' | 'perpendicular';

/** 코어 추론 잠금(measureInferenceLock) → 이름(없으면 null) */
export function lockName(l: Pick<MeasureInferenceLock, 'kind' | 'axis'> | null | undefined): LockName | null {
  if (!l) return null;
  if (l.kind === 'axis') return l.axis ?? null;
  return l.kind === 'parallel' ? 'parallel' : 'perpendicular';
}

/** 잠근 방향 안내(상태 막대·측정 띠 — 안내 글과 따로 두어 조각마다 번역된다) */
export const LOCK_HINTS: Readonly<Record<LockName, string>> = Object.freeze({
  x: 'X축으로 잠금',
  y: 'Y축으로 잠금',
  z: 'Z축으로 잠금',
  parallel: '모서리와 나란히 잠금',
  perpendicular: '모서리에 수직으로 잠금',
});

/** 키보드 기기에서 끝점을 잡는 동안 잠그는 법 */
export const LOCK_KEYS_HINT = 'Shift·화살표로 방향 잠금';

/**
 * 잠금 안내: 잠갔으면 잠근 방향(첫 점을 찍기 전 화살표 축 잠금 포함), 아니면 끝점을 잡는 동안(첫 점을 찍은 뒤) 키보드 기기에만
 * Shift·화살표 안내(손가락 기기는 측정 띠의 잠금 단추). 그 밖에는 null
 */
export function lockHint(points: number, lock: LockName | null, touch = false): string | null {
  if (lock) return LOCK_HINTS[lock];
  return points === 1 && !touch ? LOCK_KEYS_HINT : null;
}

/** 화살표 → 축(SketchUp과 같이 → X, ← Y, ↑ Z — ↓는 지금 방향) */
const ARROW_AXES: Readonly<Record<string, SnapAxis>> = Object.freeze({ ArrowRight: 'x', ArrowLeft: 'y', ArrowUp: 'z' });

/**
 * 두 점 측정 중 화살표 키의 잠금(코어 setMeasureInferenceLock에 줄 값): →·←·↑는 그 축(이미 그 축이면 false = 풀기, 첫 점 전에도 된다),
 * ↓는 끝점을 잡는 동안(첫 점 뒤) 지금 방향 추론(true — 이미 잠갔으면 false). 할 일이 없으면 null(키를 다른 데 넘긴다)
 */
export function arrowLock(key: string, points: number, cur: Pick<MeasureInferenceLock, 'kind' | 'axis'> | null): SnapAxis | boolean | null {
  if (points >= 2) return null;
  const axis = Object.prototype.hasOwnProperty.call(ARROW_AXES, key) ? ARROW_AXES[key]! : null;
  if (axis) return cur?.kind === 'axis' && cur.axis === axis ? false : axis;
  if (key !== 'ArrowDown' || points !== 1) return null;
  return cur ? false : true;
}

/** 측정 잠금이 쓰는 코어 뷰어 기능(0.10.0 — 시험은 가짜로) */
export type LockViewer = Pick<Viewer3d, 'measureHoverSnap' | 'measureInferenceLock' | 'measurePointCount' | 'setMeasureInferenceLock'>;

/**
 * 측정 방향 잠그기(코어 setMeasureInferenceLock): 축은 그대로, true는 지금 미리 보기의 방향 추론(축·모서리와 나란히·수직).
 * 커서가 방향 추론이 아닌 점 붙잡기(첫 점에서 따라온 모서리의 가운데 점·끝점 등) 위면 코어는 첫 점 뒤 마지막으로 본 방향 추론을 잠근다.
 * 그 방향은 그 점을 지날 때만 맞다(첫 점을 지나는 그 모서리 방향) — 코어는 다음 그림에서 잠근 선으로 미리 보기를 다시 구하므로
 * 그때 lockStillValid로 확인한다(그 점이 선 밖이면 코어가 선으로 옮겨 찍는다 — from). 돌려주는 값: 잠갔으면 true, 그 점에서 확인할 것이 있으면
 * 그 점(세계 좌표), 못 잠갔으면 false
 */
export function lockMeasure(v: LockViewer, want: true | SnapAxis): boolean | readonly number[] {
  const before = v.measureHoverSnap;
  if (!v.setMeasureInferenceLock(want)) return false;
  if (want !== true || !before || before.direction || !before.snap) return true;
  return before.point;
}

/**
 * lockMeasure가 점 붙잡기에서 건 잠금이 맞는지(코어가 미리 보기를 다시 구한 뒤): 커서가 아직 그 점 위인데 코어가 그 점을 잠근 선으로
 * 옮겨 찍으면(from이 그 점) 앞서 본 방향이 그 점을 지나지 않는다 — 풀고 false. 커서가 다른 곳으로 갔으면 그대로 둔다
 */
export function lockStillValid(v: LockViewer, at: readonly number[]): boolean {
  const h = v.measureHoverSnap;
  if (!v.measureInferenceLock || !h?.locked || !h.from) return true;
  const f = h.from;
  const tol = 1e-9 * (1 + Math.hypot(at[0]!, at[1]!, at[2]!));
  if (Math.hypot(f[0]! - at[0]!, f[1]! - at[1]!, f[2]! - at[2]!) > tol) return true;
  v.setMeasureInferenceLock(false);
  return false;
}

/**
 * Shift를 눌렀는데 코어가 잠그지 못했을 때(커서가 방향 추론이 아닌 점 붙잡기 위): 끝점을 잡는 중이면 lockMeasure(true)로 잠근다.
 * 앱이 잠갔으면 lockMeasure 값(true 또는 확인할 점), 아니면 false. Shift를 떼면 앱이 푼다(코어는 자기가 Shift로 건 잠금만 푼다)
 */
export function shiftFallbackLock(v: LockViewer): boolean | readonly number[] {
  if (v.measurePointCount !== 1 || v.measureInferenceLock) return false;
  const h = v.measureHoverSnap;
  if (!h?.snap || h.direction) return false;
  return lockMeasure(v, true);
}
