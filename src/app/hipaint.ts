/**
 * 3D 강조 그리기(65차 — 뷰어 조각). 고른 것의 강조는 코어 세 길로 그린다: 항목 강조(highlight — 부품·몸체·묶음), 구간 강조(highlightRanges — B-rep 면의 삼각형·
 * 모서리의 윤곽선 구간, PMI에 이은 면·간섭 삼각형·개체 측정), 강조 선(setHighlightSegments — 고른 면 경계·모서리 선).
 * 앱(app.ts paint)은 고른 것이 바뀔 때마다 그릴 것(Hi)을 여기로 넘기고 기억한다 — 코어에는 강조를 읽는 길이 없어, 겹친 것 고르기 목록 줄을 미리 강조한 뒤
 * 목록을 닫으면 그 기억으로 되돌린다(ctxmenu.ts). 세 길을 늘 함께 정한다(전에는 앱 곳곳에서 하나씩 불렀다 — 모두 셋을 정하는 것과 같은 그림).
 */
import type { RangeSelection, Viewer3d } from 'opencad-viewer3d';
import type { EdgePick } from './edges';
import type { FacePick } from './faces';

/** 고른 면 경계 색(청록 — 부품 강조색과 다르게) */
const FACE_EDGE = [0.05, 0.8, 0.95, 1] as const;

/** 3D에 그릴 강조: 면·모서리가 있으면 그것만(구간 + 선), 아니면 항목 강조 ids와 구간 ranges */
export interface Hi {
  ids?: readonly string[] | null;
  face?: FacePick | null;
  edge?: EdgePick | null;
  ranges?: ReadonlyMap<string, RangeSelection> | Readonly<Record<string, RangeSelection>> | null;
}

/** 강조를 그린다(세 길 모두 — 없는 것은 푼다) */
export function paintHi(v: Pick<Viewer3d, 'highlight' | 'highlightRanges' | 'setHighlightSegments'>, h: Hi): void {
  const f = h.face;
  const e = f ? null : h.edge;
  v.highlight(!f && !e && h.ids?.length ? h.ids : null);
  v.highlightRanges(f ? { [f.meshId]: [{ start: f.triStart, count: f.triangles }] } : e ? { [e.meshId]: { edges: [{ start: e.segStart, count: e.segCount }] } } : (h.ranges ?? null));
  if (f) v.setHighlightSegments(f.boundary, { width: 3.5, hidden: 0.3, color: FACE_EDGE, ...(f.boundaryOrigin ? { origin: f.boundaryOrigin } : {}) });
  else if (e) v.setHighlightSegments(e.segs, { width: 4, hidden: 0.3, color: FACE_EDGE, origin: e.segOrigin });
  else v.setHighlightSegments(null);
}
