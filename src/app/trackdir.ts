/**
 * 끌어온 점 나란함·수직의 기준 선분 거르기(순수, DOM 없음 — 코어 0.28.0 inference.trackDirs { edge }에 준다).
 * 측정 붙잡기 계산이라 뷰어 조각(viewerkit.ts — 첫 화면 JS 밖)에 들어 있고, 앱은 뷰어를 만들 때 이 함수를 쥐어
 * 측정 붙잡기 선택(snap.ts measureSnapOptions)에 넘긴다.
 */
import type { SnapSegment } from 'opencad-viewer3d';
import { edgeAt } from './edges';
import type { SnapEdgeIndex } from './snap';

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
