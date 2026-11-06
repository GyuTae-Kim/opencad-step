/**
 * 작업 메뉴(3D 오른쪽 누르기·손가락 길게 누르기·나무 줄·여러 개 고르기 띠의 "작업")의 항목과 불투명도 메뉴.
 * 작업 메뉴는 뷰어가 있어야 열리므로 뷰어 조각(viewerkit.ts)에 둔다(52차 — 첫 화면 JS 밖, 앱은 openContextMenu에서 조각의 것을 부른다).
 *
 * 52차: 손가락 기기(pointer: coarse)에서 고른 것이 있으면 숨기기·이것만 보기(격리 풀기)·불투명도…와 누른 면의 정면으로 보기·자르기만 바로 두고,
 * 덜 쓰는 것(맞춰 보기·나머지 흐리게·속성·여러 개 고르기·모두 보이기·불투명도 모두 되돌리기·고르기 풀기)은 끝의 "그 밖의 작업…"을 고르면 같은 자리에 연다
 * (불투명도…와 같은 꼴, 차례·구분선은 마우스 메뉴와 같다). 면을 고른 채 연 메뉴가 열한 항목·네 묶음이라 44px 줄로는 320×568에서 여섯만 보였다.
 * 근거: Apple HIG 작업 메뉴 — 항목은 적게, 자주 쓰는 것을 먼저, 묶음은 셋쯤, 하위 메뉴는 한 단계·내용을 짐작할 수 있는 이름.
 * 맞춰 보기는 두 번 누르기와 고른 부품 카드에도, 속성·여러 개 고르기도 고른 부품 카드에 있다. 마우스(손가락 기기가 아님)는 그대로 열한 항목이다
 * (다 들어가고 단축키 글도 보인다). 고른 것이 없으면 메뉴가 짧아(다섯 항목 이하) 접지 않는다.
 */
import type { StepApp } from './app';
import { selectionItemIds } from './doc';
import type { FacePick } from './faces';
import { OPACITY_STEPS } from './looks';
import { openMenuAt, type MenuItem } from './menu';

/** 작업 메뉴가 부르는 앱 */
export type CtxHost = Pick<
  StepApp,
  | 'doc' | 'touch' | 'faceMode' | 'multiPick' | 'explodeOpen' | 'explodeAxis' | 'tweakTool' | 'groups'
  | 'fit' | 'fitSelection' | 'hideSelection' | 'isolateSelection' | 'unisolate' | 'showProps' | 'lookAtFace' | 'sectionByFace'
  | 'toggleMultiPick' | 'showAll' | 'resetOpacity' | 'clearSelection' | 'setSelectionOpacity'
>;

/**
 * more 항목을 빼고 끝에 "그 밖의 작업…" 하나를 둔다 — 고르면 open(뺀 항목, 차례·구분선 그대로)으로 같은 자리에 다시 연다. 뺄 것이 없으면 그대로
 */
export function foldMenu(items: MenuItem[], open: (rest: MenuItem[]) => void): MenuItem[] {
  const rest = items.filter((it) => it.more);
  return rest.length ? [...items.filter((it) => !it.more), { label: '그 밖의 작업…', sep: true, run: () => open(rest) }] : items;
}

/** 작업 메뉴 항목(고른 것이 있으면 그것에 대해). face는 누른 자리의 B-rep 면(없으면 고른 면), at은 메뉴를 연 화면 점(하위 메뉴를 같은 자리에) */
export function contextItems(H: CtxHost, face: FacePick | null, at: { x: number; y: number }): MenuItem[] {
  const d = H.doc;
  if (!d) return [];
  const has = selectionItemIds(d).length > 0;
  const iso = !!d.vis.isolated || !!d.dim;
  let items: MenuItem[] = [];
  if (has) {
    items.push({ label: '맞춰 보기', more: true, run: () => H.fitSelection() });
    items.push({ label: '숨기기', hint: 'H', run: () => H.hideSelection() });
    if (iso) items.push({ label: '격리 풀기', hint: 'I', run: () => H.unisolate() });
    else {
      items.push({ label: '이것만 보기', hint: 'I', run: () => H.isolateSelection('hide') });
      items.push({ label: '나머지 흐리게', more: true, run: () => H.isolateSelection('dim') });
    }
    items.push({ label: '불투명도…', run: () => opacityMenu(H, at) });
    items.push({ label: '속성', more: true, run: () => H.showProps() });
    const f = face ?? d.face;
    if (f && (f.normal || f.axis)) {
      items.push({ label: '정면으로 보기', sep: true, run: () => H.lookAtFace(f) });
      items.push({ label: f.normal ? '이 면으로 자르기' : '축을 지나게 자르기', run: () => H.sectionByFace(f) });
    }
  } else {
    items.push({ label: '전체 보기', hint: 'F', run: () => H.fit() });
    if (iso) items.push({ label: '격리 풀기', hint: 'I', run: () => H.unisolate() });
  }
  // 손가락 기기에서 여러 개 고르기를 켜는 길(길게 누르기 → 메뉴). 켜 있으면 끄기
  if (!H.faceMode) items.push({ label: '여러 개 고르기', checked: H.multiPick, toggle: true, sep: true, more: true, run: () => H.toggleMultiPick() });
  items.push({ label: '모두 보이기', sep: true, more: true, disabled: !iso && !d.vis.userHidden.size && !H.groups().some((g) => !g.visible), run: () => H.showAll() });
  if (d.opacity.size) items.push({ label: '불투명도 모두 되돌리기', more: true, run: () => H.resetOpacity() });
  if (has) items.push({ label: '고르기 풀기', more: true, run: () => void H.clearSelection() });
  if (has && H.touch) items = foldMenu(items, (rest) => openMenuAt(at.x, at.y, rest, '그 밖의 작업'));
  // 분해 막대가 열렸으면 손질 항목(분해 조각이 만든다 — 손가락 기기에서도 길게 누르기 → 메뉴): 되돌리기·다시 하기는 끝에, 고른 것을 거리로 옮기기는 맨 위에
  const tw = H.explodeOpen ? H.tweakTool : null;
  const mv = tw?.moveItem(d);
  if (tw) items.push(...tw.menuItems(d, H.explodeAxis));
  if (mv) {
    if (items[0]) items[0].sep = true;
    items.unshift(mv);
  }
  return items;
}

/** 고른 것의 불투명도 메뉴(작업 메뉴를 연 자리에 다시 연다) */
function opacityMenu(H: CtxHost, at: { x: number; y: number }): void {
  const d = H.doc;
  if (!d) return;
  const vals = new Set(selectionItemIds(d).map((id) => d.opacity.get(id) ?? 1));
  const cur = vals.size === 1 ? [...vals][0]! : NaN;
  openMenuAt(
    at.x,
    at.y,
    OPACITY_STEPS.map((a, i): MenuItem => ({ label: i === 0 ? '100% (불투명)' : `${Math.round(a * 100)}%`, checked: Math.abs(cur - a) < 1e-6, run: () => H.setSelectionOpacity(a) })),
    '불투명도',
  );
}
