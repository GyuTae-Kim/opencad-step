/**
 * 두 점 측정의 붙잡기 점(순수, DOM 없음 — 코어 0.8.0 Viewer3d.setMeasureSnap에 준다).
 *
 * - 원·원호·타원 중심: 모서리 표(meta.edgeTables)가 아는 모든 원 모서리의 중심을 세계 좌표(묶음 origin·자리 matrix 반영)로.
 *   중심은 커서가 그 자리(구멍 가운데 빈 곳 포함)에 와야 붙으므로 늘 후보(points)로 준다. 같은 그물 안 같은 자리 중심은 하나로.
 * - 고른 모서리의 곡선 가운데 점·끝점·중심(pointsFor): 윤곽선은 곡선을 꺾은선으로 그린 것이라 코어의 선분 가운데 점은
 *   곡선 모서리에서 현의 가운데일 뿐이다 — B-rep 모서리의 곡선 길이 가운데 점을 모서리 표로 준다. 곡선 계산 조각(curvesnap.ts — 문서를 열 때 받는다)을
 *   받기 전에는 꺾은선 길이로 잰 점, 받은 뒤에는 곡선 정의로 잰 곡선 위 점(curve.mid).
 * - 곡선 위로 다듬기(코어 0.14.0 refine — curve.refine): 곡선 모서리 토막 위의 수직 발·모서리 위 점을 정확한 곡선 위로 옮긴다(받기 전에는 주지 않는다).
 *   0.15.0부터 코어가 열린 후보(첫 점에서 꺾은선 토막에 내린 발이 토막 밖인 수직 발, 조금 비켜 지나가는 두 토막의 교차점)와 교차점도 넘기면
 *   멀리서 내린 곡선 위 발과 두 모서리 곡선의 3D 교차점을 준다.
 * - 추론 붙잡기(코어 0.9.0 inference): 교차점·수직 발·축 방향은 코어가 찾고, 여기서는 종류 이름(상태 막대·측정 띠·결과)만 만든다.
 * - 추론 잠금과 모서리와 나란히(코어 0.10.0, SketchUp의 추론 잠금): Shift를 누르는 동안 지금 방향 추론(축·모서리와 나란히·수직)을 잠그고,
 *   화살표 →·←·↑는 X·Y·Z축, ↓는 지금 방향을 잠근다(같은 키로 풀기). 손가락 기기는 측정 띠의 잠금 단추. 여기서는 잠금 이름·안내·키 판단만 한다.
 *   첫 점(모서리 끝)에서 그 모서리의 다른 끝·가운데 점을 가리킬 때 그 모서리 방향으로 잠그는 것은 코어 0.12.0이 판정한다(measureHoverLock).
 * - 끌어온 점에서 모서리와 나란히·수직(코어 0.27.0 trackDirs, 0.28.0 기준 선분 거르기): 커서가 앞서 지나간 곧은 B-rep 모서리만 기준으로 받는다
 *   (trackdir.ts straightEdgeFilter — 원·타원·B-스플라인을 나눈 현은 기준이 되지 않는다). 여기서는 이름만 가른다(isTrackDir).
 *   첫 점의 "모서리와 나란히"(0.10.0)도 같은 거르기로 곧은 모서리만 기준이다(0.29.0 parallelEdge). 그 선이 다른 것과 만나는 점(0.29.0 meets —
 *   0.30.0 { guides: true }로 두 끌어온 점의 안내 선끼리 만나는 점도)의 이름은 뷰어 조각(trackdir.ts trackDirMeetLabel)이 고르고
 *   결과에는 그 글을 받아 쓴다(snapPair의 trackMeetA·trackMeetB).
 */
import type { Mesh3d, Pick3d, SnapKind, SnapPoint } from 'opencad-viewer3d/types';
import type { MeasureInferenceLock, MeasureSnapOptions, SnapAxis, SnapRefineFaceInput, SnapRefineInput, SnapSegment, Viewer3d } from 'opencad-viewer3d';
import type { StepEdgeTable } from '../scene';
import { edgeAt, edgeDetails, isFullCircle } from './edges';

/** 모서리 표 매개변수 개수(brep.ts EDGE_PARAMS) */
const NP = 8;

export interface SnapEdgeIndex {
  kinds: readonly string[];
  tables: readonly StepEdgeTable[];
  tableOf: ReadonlyMap<string, number>;
}

/** 곡선 정의로 붙잡기 점을 곡선 위로(curvesnap.ts curveSnap — 문서를 열 때 받는다) */
export interface CurveSnap {
  /**
   * 코어 setMeasureSnap의 refine: 곡선 모서리 토막의 수직 발(0.15.0 열린 수직 발 포함)·모서리 위 점·코어 가운데 점 → 곡선 위 세계 점,
   * 교차점(0.15.0 — 코어 교차점과 넓힌 교차) → 두 모서리 곡선의 교차점, 축과 선분의 교차(0.18.0 'axisEdge') → 축 직선과 모서리 곡선의 교차(아니면 null)
   */
  refine(c: SnapRefineInput): readonly number[] | null;
  /** 모서리 e의 곡선 길이 가운데 점(세계, 곡선 정의가 없으면 null — 그때는 꺾은선 길이 가운데 점) */
  mid(mesh: Mesh3d, table: StepEdgeTable, e: number): [number, number, number] | null;
  /** 코어 0.19.0 refineFace: 축이 면을 뚫는 점 → 축 직선과 그 B-rep 곡면의 교점(facesnap.ts — 면 표가 있을 때만, 평면·모르면 null) */
  refineFace?(c: SnapRefineFaceInput): readonly number[] | null;
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
 * 한 바퀴 원은 끝점·가운데 점이 따로 없어(이음 꼭짓점 하나) 중심만. 윤곽선이 아니거나 표가 없으면 null.
 * curve가 있으면 곡선 모서리의 가운데 점은 곡선 정의로 잰 곡선 위 점(없거나 못 구하면 꺾은선 길이로 잰 점)
 */
export function edgeSnapPoints(pick: Pick3d, meshes: ReadonlyMap<string, Mesh3d> | readonly Mesh3d[], ex: SnapEdgeIndex | null, curve: CurveSnap | null = null): SnapPoint[] | null {
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
    out.push({ point: (d.kind !== 'line' && curve?.mid(mesh, table, e)) || d.mid, kind: 'midpoint', id: mesh.id });
  }
  if (d.center) out.push({ point: d.center, kind: 'center', id: mesh.id });
  return out;
}

/**
 * 코어 setMeasureSnap에 줄 선택: 측정 중에만 윤곽선도 고르고(edges — 면 고르기 밖에서는 pickEdges가 꺼져 있다), 원·원호 중심(centers)을
 * 늘 후보로, 누른 모서리마다 곡선 가운데 점·끝점·중심(pointsFor — 같은 모서리를 이어 가리키는 동안은 한 번만 구한다),
 * 추론 붙잡기(교차점·수직 발·축 방향 — 코어 0.9.0, 모서리와 나란히·Shift 잠금 — 0.10.0)를 모두 켠다.
 * 코어의 선분 가운데 점(midpoints)은 곡선 모서리에서 현의 가운데라 쓰지 않는다.
 * curve(곡선 계산 조각)가 있으면 곡선 모서리의 수직 발·모서리 위 점을 곡선 위로, 교차점을 두 곡선의 교차점으로 다듬고(코어 0.14.0·0.15.0 refine),
 * 곡선 가운데 점도 곡선 위 점으로 준다. 면 표가 있으면 축이 곡면을 뚫는 점과 붙잡지 않은 곡면 위 점도 그 곡면 위로(0.19.0·0.21.0 refineFace).
 * through(반투명 보기 — 부품 불투명도를 낮췄거나 나머지 흐리게 중)면 반투명 그물의 면을 지나 그 뒤 불투명 면에 붙는다(코어 0.23.0 throughTranslucent).
 * trackDirEdge(기준 선분 거르기 — 뷰어 조각의 trackdir.ts straightEdgeFilter, 모서리 표가 있을 때만)가 있으면 끌어온 점에서 곧은 모서리와 나란히·수직도 켠다
 * (코어 0.27.0 trackDirs, 0.28.0 { edge } — 원·B-스플라인을 나눈 현은 기준이 되지 않는다). 같은 함수를 첫 점 나란함(0.10.0 "모서리와 나란히")의
 * 기준 거르기에도 준다(0.29.0 parallelEdge — 곡선을 나눈 현을 지나도 앞서 지나간 곧은 모서리가 기준으로 남는다. 같은 선분은 코어가 한 번만 묻는다).
 * 그 선이 첫 점 축·첫 점의 나란함·다른 끌어온 점의 축·모서리·면과 만나는 점에도 붙는다(0.29.0 trackDirs { meets } — 곡선 모서리·곡면과 만나는 점은
 * 앱 refine 'axisEdge'·refineFace 'axisFace'가 축 이름 없는 안내 선으로 곡선·곡면 위로 다듬는다. 이름은 뷰어 조각의 trackdir.ts trackDirMeetLabel),
 * 두 끌어온 점의 안내 선끼리 만나는 점(같은 기준 모서리에 대해 한 점의 나란한 선과 다른 점의 수직인 선이 만나는 기운 사각형의 구석 —
 * 0.30.0 meets { guides: true }, 정확한 직선끼리라 다듬지 않는다)에도 붙는다
 */
export function measureSnapOptions(
  meshes: readonly Mesh3d[],
  ex: SnapEdgeIndex | null,
  centers: readonly SnapPoint[],
  curve: CurveSnap | null = null,
  through = false,
  trackDirEdge: ((seg: SnapSegment) => boolean) | null = null,
): MeasureSnapOptions {
  const byId = new Map(meshes.map((m) => [m.id, m] as const));
  let lastKey = '';
  let last: SnapPoint[] | null = null;
  return {
    edges: true,
    inference: trackDirEdge ? { ...MEASURE_INFERENCE, parallelEdge: trackDirEdge, trackDirs: { edge: trackDirEdge, meets: { guides: true } } } : MEASURE_INFERENCE,
    ...(through ? { throughTranslucent: true } : {}),
    points: centers,
    pointsFor: (p) => {
      if (p.kind !== 'edge') return null;
      const key = `${p.id}:${p.raw ?? p.index}`;
      if (key !== lastKey) {
        lastKey = key;
        last = edgeSnapPoints(p, byId, ex, curve);
      }
      return last;
    },
    ...(curve ? { refine: (c: SnapRefineInput) => curve.refine(c) } : {}),
    ...(curve?.refineFace ? { refineFace: (c: SnapRefineFaceInput) => curve.refineFace!(c) } : {}),
  };
}

/**
 * 끌어온 점에서 모서리와 나란히·수직인 선 위 점인지(코어 0.27.0 trackDirs — 코어 0.28.0 README의 가르는 법): snap이 'parallel'·'perpendicular'이고
 * 끌어온 점(trackFrom)이 있으며 잠그지 않았다. 첫 점의 나란함(0.10.0)과 첫 점에서 내린 수직 발에는 trackFrom이 없다
 */
export function isTrackDir(p: { snap?: SnapKind | null; trackFrom?: readonly number[]; locked?: boolean } | null | undefined): boolean {
  return !!p?.trackFrom && !p.locked && (p.snap === 'parallel' || p.snap === 'perpendicular');
}

/**
 * 반투명 보기를 켜고 끌 때 측정 붙잡기의 반투명 너머 고르기만 바꾼다(코어 0.24.0 setMeasurePickThrough — measureSnapOptions의 through와 같은 값).
 * 찍은 점, Shift·화살표·잠금 단추 잠금, 끌어온 점, 다듬기 기억은 그대로다(붙잡기 선택을 다시 주면 잠금·끌어온 점이 풀린다).
 * 붙잡기가 꺼져 있으면(코어가 false) resnap으로 붙잡기 선택을 다시 준다. 다시 줬으면 true
 */
export function syncMeasurePickThrough(v: Pick<Viewer3d, 'setMeasurePickThrough'>, on: boolean, resnap: () => void): boolean {
  if (v.setMeasurePickThrough(on)) return false;
  resnap();
  return true;
}

/**
 * 두 점 측정의 추론 붙잡기: 교차점·수직 발·축 방향과 모서리와 나란히, Shift 잠금, 끌어온 축(코어 0.16.0 track — 마우스·펜 커서가
 * 점 붙잡기 위에 0.5초 머물면 그 점을 기억하고 그 점을 지나는 X·Y·Z 축에 붙는다). 터치는 머무르지 않는다: 손가락 길게 누르기는
 * 정밀 조준(aim.ts)이 쓰므로 끌어올 점을 따로 주지 않는다.
 * 코어 0.18.0: 첫 점 축이 모서리(윤곽선)와 만나는 점(axisEdges), 첫 점 축·끌어온 축이 면을 뚫는 점(axisFaces).
 * 0.19.0: 잠근 동안 잠근 선이 모서리와 만나는 점(lockEdges)·면을 뚫는 점(lockFaces).
 * 0.21.0: 잠근 동안 잠근 선이 끌어온 점의 X·Y·Z 축과 만나는 점(lockTracks — 축으로 잠갔으면 끌어온 점과 나란한 자리도)
 */
export const MEASURE_INFERENCE = Object.freeze({
  intersections: true,
  perpendicular: true,
  axes: true,
  parallel: true,
  lock: true,
  track: true,
  axisEdges: true,
  axisFaces: true,
  lockEdges: true,
  lockFaces: true,
  lockTracks: true,
});

/**
 * 잠근 선 위 점이 무엇과 만나는지: 'edge' = 모서리와 만나는 점, 'face' = 면을 뚫는 점(코어 0.19.0 — 잠근 점에 segment·face가 실린다),
 * 'x'·'y'·'z' = 끌어온 점의 그 축과 만나는 점, 'track' = 잠근 축 위 끌어온 점과 나란한 자리(0.21.0 lockTracks — 잠근 점에 trackOther·trackFrom이 실린다).
 * 코어 README의 가르는 법대로 넷은 함께 오지 않는다. 잠그지 않았거나 아무것과도 만나지 않으면 null
 */
export type LockMeet = 'edge' | 'face' | 'track' | SnapAxis;

export function lockMeet(
  p: { locked?: boolean; trackFrom?: unknown; trackOther?: { axis: SnapAxis }; segment?: unknown; face?: unknown } | null | undefined,
): LockMeet | null {
  if (!p?.locked) return null;
  if (p.trackOther) return p.trackOther.axis;
  if (p.trackFrom) return 'track';
  return p.segment ? 'edge' : p.face ? 'face' : null;
}

/**
 * 잠근 선이 만나는 점의 이름: "잠근 X축 · 모서리 위", 축이 아니면 "잠근 방향 · 면 위", 곡선 접선 잠금이면 "잠근 접선 · 모서리 위",
 * 끌어온 점의 축과 만나면 "잠근 X축 · 끌어온 점 Y축 위", 잠근 축 위 끌어온 점과 나란한 자리면 "잠근 X축 · 끌어온 점과 나란히"
 * (" · " 앞뒤 조각이 사전에 따로 있다)
 */
function lockMeetLabel(axis: SnapAxis | null | undefined, meet: LockMeet, tangent: boolean): string {
  const what = axis ? `${axis.toUpperCase()}축` : tangent ? '접선' : '방향';
  const where = meet === 'edge' ? '모서리 위' : meet === 'face' ? '면 위' : meet === 'track' ? '끌어온 점과 나란히' : `끌어온 점 ${meet.toUpperCase()}축 위`;
  return `잠근 ${what} · ${where}`;
}

/** 축 붙잡기의 축 이름(번역층이 옮긴다) */
const AXIS_LABEL: Record<SnapAxis, string> = { x: 'X축 방향', y: 'Y축 방향', z: 'Z축 방향' };

/**
 * 축 위 점의 종류(코어는 모두 'axis'·axis로 준다). 끌어온 축(trackFrom): true = 끌어온 축(0.16.0), 'edge' = 끌어온 축이 선분·윤곽선과
 * 만나는 점(0.17.0 — segment가 그 선분), 'face' = 끌어온 축이 면을 뚫는 점(0.18.0 — face가 그 면), 'x'·'y'·'z' = 끌어온 축끼리의 교차
 * (0.17.0 — 둘째 끌어온 축 trackOther의 축). 첫 점 축(trackFrom 없음 — 0.18.0): 'axisEdge' = 선분·윤곽선과 만나는 점, 'axisFace' = 면을 뚫는 점
 */
export type TrackMark = true | 'edge' | 'face' | 'axisEdge' | 'axisFace' | SnapAxis;

/**
 * 찍은 점·커서 아래 점(measurePoints·measureHoverSnap)의 축 위 점 종류 — 코어 0.17.0·0.18.0 README의 가르는 법: trackOther가 있으면 축끼리의 교차,
 * face면 면 위, segment면 모서리 위(trackFrom이 있으면 끌어온 축, 없으면 첫 점 축), trackFrom과 direction뿐이면 첫 점 축 위 나란한 자리
 * (첫 점에서 그 축 방향 — false), 그 밖의 trackFrom은 끌어온 축. 첫 점 축 그대로는 false
 */
export function trackMark(
  p: { trackFrom?: readonly number[]; trackOther?: { axis: SnapAxis }; segment?: unknown; face?: unknown; direction?: readonly number[] } | null | undefined,
): TrackMark | false {
  if (!p) return false;
  if (!p.trackFrom) return p.face ? 'axisFace' : p.segment ? 'axisEdge' : false;
  if (p.trackOther) return p.trackOther.axis;
  if (p.face) return 'face';
  if (p.segment) return 'edge';
  return !p.direction;
}

/**
 * 축 위 점의 이름: "끌어온 점에서 X축", 모서리·면과 만나면 "끌어온 점에서 X축 · 모서리 위"·"… · 면 위", 첫 점 축이면 "X축 · 모서리 위"·"X축 · 면 위",
 * 축끼리의 교차면 "끌어온 X축과 Y축의 교차"(사전에 모두 있다)
 */
function trackLabel(axis: SnapAxis, track: TrackMark): string {
  const a = `${axis.toUpperCase()}축`;
  if (track === 'axisEdge') return `${a} · 모서리 위`;
  if (track === 'axisFace') return `${a} · 면 위`;
  if (track === true) return `끌어온 점에서 ${a}`;
  if (track === 'edge') return `끌어온 점에서 ${a} · 모서리 위`;
  if (track === 'face') return `끌어온 점에서 ${a} · 면 위`;
  return `끌어온 ${a}과 ${track.toUpperCase()}축의 교차`;
}

/**
 * 붙잡은 종류 → 한국어 이름(번역층이 옮긴다). 붙잡지 않았으면(면 위 자유 점) '면 위 점', 그 점을 앱이 곡선 위로 다듬었으면(refined —
 * 곡선 모서리 위 점, 코어 0.14.0) '곡선 위 점'.
 * 축 붙잡기(코어 0.9.0)는 축을 알면 "X축 방향"처럼(커서 아래는 measureHoverSnap.axis, 찍은 결과는 0.9.1 MeasureResult.axisA·axisB),
 * 끌어온 축(track — trackMark, 코어 0.16.0·0.17.0: 기억한 점을 지나는 축이라 첫 점에서 그 방향이 아니다)이면 "끌어온 점에서 X축"·
 * "끌어온 점에서 X축 · 모서리 위"·"끌어온 X축과 Y축의 교차", 첫 점 축이 모서리·면과 만나는 점(0.18.0)이면 "X축 · 모서리 위"·"X축 · 면 위".
 * 나란함·수직에 track(isTrackDir — 코어 0.27.0 trackDirs: 첫 점이 아니라 끌어온 점에서 그은 선)이면 "끌어온 점에서 모서리와 나란히"·"끌어온 점에서 모서리에 수직"
 */
export function snapLabel(kind: SnapKind | null | undefined, axis?: SnapAxis | null, refined: Refined = false, track: TrackMark | boolean = false): string {
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
      return track ? TRACK_PERPENDICULAR_LABEL : '수직 발';
    case 'axis':
      return axis ? (track ? trackLabel(axis, track) : AXIS_LABEL[axis]) : '축 방향';
    case 'parallel':
      return track ? TRACK_PARALLEL_LABEL : '모서리와 나란히';
    default:
      return refined === 'face' ? SURFACE_POINT_LABEL : refined ? CURVE_POINT_LABEL : '면 위 점';
  }
}

/** 끌어온 점에서 기준 모서리와 나란한 선 위 점(코어 0.27.0 trackDirs 'parallel')의 이름 */
export const TRACK_PARALLEL_LABEL = '끌어온 점에서 모서리와 나란히';

/** 끌어온 점에서 기준 모서리에 수직인 선 위 점(코어 0.27.0 trackDirs 'perpendicular')의 이름 */
export const TRACK_PERPENDICULAR_LABEL = '끌어온 점에서 모서리에 수직';

/** 붙잡지 않은 점을 앱이 곡선 모서리 위로 다듬은 것(코어 0.14.0 refined)의 이름 */
export const CURVE_POINT_LABEL = '곡선 위 점';

/** 붙잡지 않은 면 위 점을 앱이 B-rep 곡면 위로 다듬은 것(코어 0.21.0 'onFace' — refined인데 선분이 없다)의 이름 */
export const SURFACE_POINT_LABEL = '곡면 위 점';

/** 다듬은 점의 종류: false = 다듬지 않음, true = 곡선 위(선분 위 점을 다듬었다 — 0.14.0), 'face' = 곡면 위(0.21.0 'onFace') */
export type Refined = boolean | 'face';

/**
 * 찍은 점·커서 아래 점의 다듬은 종류: 붙잡지 않은 점(snap null)을 다듬었는데 선분 식별자(segment — 0.16.0, 선분 위 점과 그 다듬은 점에 실린다)가 없으면
 * 면 위 점을 곡면 위로 다듬은 것('face'), 아니면 refined 그대로
 */
export function refinedKind(p: { snap?: SnapKind | null; refined?: boolean; segment?: unknown } | null | undefined): Refined {
  if (!p?.refined) return false;
  return !p.snap && !p.segment ? 'face' : true;
}

/** 잠근 선 위 점 이름 뒤에 붙는 글(" · "로 이어 조각마다 번역된다) */
export const LOCKED_LABEL = '잠금';

/** 곡선 모서리 끝의 접선 방향으로 잠근 선 위 점 이름(tangent.ts — 코어 결과는 나란함이라 이름만 바꾼다) */
export const TANGENT_LABEL = '접선 방향';

/**
 * 측정 결과의 두 점 붙잡기 이름(붙잡기를 켠 결과 — snapA·snapB가 있을 때만, 둘 다 붙잡지 않고 다듬지도 않은 점이면 null).
 * 축 붙잡기는 코어 0.9.1부터 결과에 실린 축(axisA·axisB)으로 "Y축 방향"처럼 쓴다. 둘째 점을 곡선 접선 잠금으로 찍었으면(tangentB) "접선 방향".
 * 붙잡지 않은 점을 곡선 위로 다듬어 찍었으면(refinedA·refinedB — 코어 measurePoints의 refined) "곡선 위 점", 곡면 위로 다듬었으면('face' — refinedKind) "곡면 위 점".
 * 잠근 선이 모서리와 만나는 점·면을 뚫는 점·끌어온 점의 축과 만나는 점으로 찍었으면(lockMeetB — 찍은 점의 lockMeet, 코어 0.19.0·0.21.0) "잠근 X축 · 모서리 위"·
 * "잠근 X축 · 끌어온 점 Y축 위". 끌어온 점 안내 선이 만나는 점으로 찍었으면(trackMeetA·trackMeetB — 뷰어 조각이 고른 이름, 코어 0.29.0) 그 이름
 */
export function snapPair(m: {
  snapA?: SnapKind | null;
  snapB?: SnapKind | null;
  axisA?: SnapAxis;
  axisB?: SnapAxis;
  lockedB?: boolean;
  tangentB?: boolean;
  refinedA?: Refined;
  refinedB?: Refined;
  trackA?: TrackMark | boolean;
  trackB?: TrackMark | boolean;
  trackMeetA?: string;
  trackMeetB?: string;
  lockMeetB?: LockMeet;
}): [string, string] | null {
  if (m.snapA === undefined && m.snapB === undefined) return null;
  if (!m.snapA && !m.snapB && !m.refinedA && !m.refinedB) return null;
  const a = m.trackMeetA ?? snapLabel(m.snapA, m.axisA, m.refinedA ?? false, m.trackA ?? false);
  if (m.lockedB && m.lockMeetB) return [a, lockMeetLabel(m.snapB === 'axis' ? m.axisB : null, m.lockMeetB, !!m.tangentB)];
  const b = m.tangentB ? TANGENT_LABEL : (m.trackMeetB ?? snapLabel(m.snapB, m.axisB, m.refinedB ?? false, m.trackB ?? false));
  return [a, m.lockedB ? `${b} · ${LOCKED_LABEL}` : b];
}

/**
 * 측정 중 커서 아래 붙잡을 점(코어 measureHoverSnap)의 이름: 상태 막대·측정 띠에 보인다. 커서 아래에 아무것도 없으면 null,
 * 모형 위지만 붙잡지 않으면 '면 위 점'(곡선 모서리 위로 다듬은 점이면 '곡선 위 점', B-rep 곡면 위로 다듬은 점이면 '곡면 위 점').
 * 곡선 접선으로 잠근 선 위 점이면(tangent) "접선 방향 · 잠금".
 * 잠근 선이 모서리와 만나는 점·면을 뚫는 점(코어 0.19.0 lockEdges·lockFaces — lockMeet)이면 "잠근 X축 · 모서리 위"·"잠근 방향 · 면 위",
 * 끌어온 점의 축과 만나는 점·끌어온 점과 나란한 자리(0.21.0 lockTracks)면 "잠근 X축 · 끌어온 점 Y축 위"·"잠근 X축 · 끌어온 점과 나란히"
 */
export function hoverSnapLabel(
  h:
    | {
        snap: SnapKind | null;
        axis?: SnapAxis;
        locked?: boolean;
        refined?: boolean;
        trackFrom?: readonly number[];
        trackOther?: { axis: SnapAxis };
        segment?: unknown;
        face?: unknown;
        direction?: readonly number[];
      }
    | null
    | undefined,
  tangent = false,
): string | null {
  if (!h) return null;
  const meet = lockMeet(h);
  if (meet) return lockMeetLabel(h.snap === 'axis' ? h.axis : null, meet, tangent);
  // 축 위 점(trackMark): 끌어온 축·모서리 위·면 위·축끼리의 교차(첫 점 축 위 나란한 자리는 그 축 방향 그대로).
  // 나란함·수직은 끌어온 점에서 그은 선이면(isTrackDir — 코어 0.27.0 trackDirs) "끌어온 점에서 모서리와 나란히·수직"
  const name = tangent && h.locked ? TANGENT_LABEL : snapLabel(h.snap, h.axis, refinedKind(h), h.snap === 'axis' ? trackMark(h) : isTrackDir(h));
  return h.locked ? `${name} · ${LOCKED_LABEL}` : name;
}

/** 잠근 방향 이름(잠금 안내·자동 확인): 축 · 모서리와 나란히 · 수직(첫 점에서 수직 발 쪽) · 곡선 모서리 끝의 접선 */
export type LockName = SnapAxis | 'parallel' | 'perpendicular' | 'tangent';

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
  tangent: '접선 방향으로 잠금',
});

/** 키보드 기기에서 끝점을 잡는 동안 잠그는 법(커서 아래에 Shift로 잠글 방향이 있을 때) */
export const LOCK_KEYS_HINT = 'Shift·화살표로 방향 잠금';

/** 키보드 기기에서 끝점을 잡는 동안 잠그는 법(커서 아래에 잠글 방향이 없을 때 — 화살표 축 잠금은 늘 된다) */
export const LOCK_ARROWS_HINT = '화살표로 축 잠금';

/**
 * 잠금 안내: 잠갔으면 잠근 방향(첫 점을 찍기 전 화살표 축 잠금 포함), 아니면 끝점을 잡는 동안(첫 점을 찍은 뒤) 키보드 기기에만
 * 커서 아래에 Shift로 잠글 방향이 있으면(canLock — 코어 measureHoverLock) Shift·화살표 안내, 없으면 화살표 안내
 * (손가락 기기는 측정 띠의 잠금 단추). 그 밖에는 null
 */
export function lockHint(points: number, lock: LockName | null, touch = false, canLock = true): string | null {
  if (lock) return LOCK_HINTS[lock];
  if (points !== 1 || touch) return null;
  return canLock ? LOCK_KEYS_HINT : LOCK_ARROWS_HINT;
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

/** 측정 잠금 안내가 읽는 코어 뷰어 상태(0.12.0) */
export type LockViewer = Pick<Viewer3d, 'measureHoverLock' | 'measureInferenceLock' | 'measurePointCount'>;

/** 곡선 접선 잠금(tangent.ts TangentLock — 문서를 열 때 받는다)에서 안내가 읽는 것 */
export interface TangentHint {
  /** 코어 잠금이 앱이 건 접선 잠금인지 */
  locked(v: Pick<Viewer3d, 'measureInferenceLock'>): boolean;
  /** 커서 아래에서 Shift로 잠글 접선(없으면 null) */
  now(v: LockViewer): unknown;
}

/** 지금 잠근 방향 이름: 앱이 건 곡선 접선 잠금이면 'tangent', 아니면 코어 잠금 이름 */
export function viewerLockName(v: Pick<Viewer3d, 'measureInferenceLock'>, tangent: TangentHint | null = null): LockName | null {
  return tangent?.locked(v) ? 'tangent' : lockName(v.measureInferenceLock);
}

/**
 * 지금 측정 잠금 안내(상태 막대·측정 띠): 무엇을 잠글지는 코어가 정한다 — Shift·↓·잠금 단추는 커서 아래 방향 추론(축·모서리와 나란히·수직)이나,
 * 첫 점을 지나는 모서리 위의 점 붙잡기(모서리 끝에서 그 모서리의 다른 끝·가운데 점을 가리킬 때 — 코어 0.12.0)면 그 모서리 방향을 잠근다.
 * 첫 점이 곡선 모서리 끝이고 커서가 그 곡선 위면 앱이 접선 방향으로 잠근다(tangent — 받기 전이면 null).
 * 그 방향이 있는지(measureHoverLock, 접선)로 Shift 안내를 보일지 고른다
 */
export function viewerLockHint(v: LockViewer, touch = false, tangent: TangentHint | null = null): string | null {
  const lock = viewerLockName(v, tangent);
  return lockHint(v.measurePointCount, lock, touch, !!v.measureHoverLock || (!lock && !!tangent?.now(v)));
}
