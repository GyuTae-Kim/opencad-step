/**
 * 끌어온 점 나란함·수직의 기준 선분 거르기와 그 선이 만나는 점의 이름(순수, DOM 없음).
 * - 기준 선분 거르기(코어 0.28.0 inference.trackDirs { edge }, 0.29.0 첫 점 나란함 parallelEdge에도 같은 함수)
 * - 끌어온 점의 나란함·수직 선이 만나는 점(코어 0.29.0 trackDirs { meets })의 이름: 상태 막대·측정 띠·결과에 "끌어온 점에서 모서리와 나란히 · X축 위"처럼
 * 측정 붙잡기 계산이라 뷰어 조각(viewerkit.ts — 첫 화면 JS 밖)에 들어 있고, 앱은 뷰어를 만들 때 이 함수들을 쥐어
 * 측정 붙잡기 선택(snap.ts measureSnapOptions)에 넘기고 붙잡을 점·찍은 점의 이름을 고른다.
 */
import type { SnapAxis, SnapSegment } from 'opencad-viewer3d';
import type { SnapKind } from 'opencad-viewer3d/types';
import { edgeAt } from './edges';
import { isTrackDir, type SnapEdgeIndex, TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL } from './snap';

/**
 * 곧은 B-rep 모서리(모서리 표 종류 'line')의 윤곽선 선분만 받는다. 원·타원·B-스플라인과 종류를 모르는 꺾은선 모서리('other')를 나눈 현,
 * 모서리 표가 없는 그물의 윤곽선, 선 묶음(와이어프레임 곡선·PMI 선 — 선분이 곧은 모서리인지 아는 표가 없다)은 받지 않는다.
 * 받지 않으면 코어는 앞서 받은 기준을 그대로 쓴다. 커서가 새 선분을 지날 때마다 불리므로(바로 앞 선분은 코어가 기억한다)
 * 그물 id → 표(Map), 선분 → 모서리(이분 탐색), 종류 번호 비교만 한다
 */
export function straightEdgeFilter(ex: SnapEdgeIndex): (seg: SnapSegment) => boolean {
  const line = ex.kinds.indexOf('line');
  return (seg) => {
    if (seg.kind !== 'edge' || line < 0) return false;
    const ti = ex.tableOf.get(seg.id);
    const t = ti === undefined ? undefined : ex.tables[ti];
    if (!t) return false;
    const e = edgeAt(t, seg.raw ?? seg.index);
    return e >= 0 && t.kinds[e] === line;
  };
}

/**
 * 끌어온 점의 나란함·수직 선이 만난 것(코어 0.29.0 trackDirs { meets } — 코어 README의 가르는 법): 'x'·'y'·'z' = 첫 점을 지나는 그 축(axis·direction),
 * 'parallel' = 첫 점의 "모서리와 나란히" 선(direction만), 'track-x'… = 다른 끌어온 점의 그 축(trackOther), 'edge' = 선분·윤곽선(segment), 'face' = 그물 면(face).
 * 끌어온 점 안내(isTrackDir — trackFrom이 있고 잠그지 않은 나란함·수직)가 아니거나 만난 것이 없으면(그 선 위 점 — 0.27.0) null
 */
export type TrackDirMeet = SnapAxis | 'parallel' | 'edge' | 'face' | `track-${SnapAxis}`;

/** 붙잡을 점·찍은 점(measureHoverSnap·measurePoints)에서 읽는 것 */
export interface TrackDirMeetInput {
  snap?: SnapKind | null;
  trackFrom?: readonly number[];
  locked?: boolean;
  axis?: SnapAxis;
  direction?: readonly number[];
  trackOther?: { axis: SnapAxis };
  segment?: unknown;
  face?: unknown;
}

export function trackDirMeet(p: TrackDirMeetInput | null | undefined): TrackDirMeet | null {
  if (!p || !isTrackDir(p)) return null;
  if (p.axis) return p.axis;
  if (p.direction) return 'parallel';
  if (p.trackOther) return `track-${p.trackOther.axis}`;
  if (p.segment) return 'edge';
  return p.face ? 'face' : null;
}

/** 만난 것의 이름(" · " 뒤 조각 — 사전에 따로 있다): "X축 위"(첫 점의 축), "시작점에서 나란한 선 위", "끌어온 점 Y축 위", "모서리 위", "면 위" */
export function trackDirMeetPlace(m: TrackDirMeet): string {
  if (m === 'parallel') return '시작점에서 나란한 선 위';
  if (m === 'edge') return '모서리 위';
  if (m === 'face') return '면 위';
  if (m.startsWith('track-')) return `끌어온 점 ${m.slice(6).toUpperCase()}축 위`;
  return `${m.toUpperCase()}축 위`;
}

/**
 * 끌어온 점 안내 선이 만나는 점의 이름: "끌어온 점에서 모서리와 나란히 · X축 위"·"끌어온 점에서 모서리에 수직 · 모서리 위"처럼 안내 이름(snap.ts — 0.27.0)에
 * 만난 것을 덧붙인다. 만나는 점이 아니면 null(앱은 그때 snap.ts hoverSnapLabel·snapLabel 그대로)
 */
export function trackDirMeetLabel(p: TrackDirMeetInput | null | undefined): string | null {
  const m = trackDirMeet(p);
  if (!m) return null;
  return `${p!.snap === 'parallel' ? TRACK_PARALLEL_LABEL : TRACK_PERPENDICULAR_LABEL} · ${trackDirMeetPlace(m)}`;
}
