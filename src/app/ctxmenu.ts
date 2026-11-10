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
 *
 * 64차: 3D 보기 화면 점에서 여는 길(contextAt — 오른쪽 누르기·길게 누르기·가상 커서 Shift+F10)을 app.ts에서 옮겼고, 그 자리에 겹친 것이 있으면 맨 위에
 * "겹친 것 고르기…"(같은 자리 목록 — picklist.ts)를 둔다. 오른쪽 누르기·길게 누르기는 52·53차부터 작업 메뉴라 목록으로 바꾸지 않고 그 한 항목 아래에 두었다
 * (SolidWorks 바로 가기 메뉴의 "다른 것 고르기", Creo "목록에서 고르기"와 같은 자리 — 작업 항목 자리·손가락 기기 여섯 줄은 그대로).
 */
import type { StepApp } from './app';
import { selectionItemIds, unitItemIds } from './doc';
import type { FacePick } from './faces';
import { OPACITY_STEPS } from './looks';
import { openMenuAt, type MenuItem } from './menu';
import { PICK_LIST_MAX, pickItems, pickRows, rowEvent, type PickRow } from './picklist';

/** 작업 메뉴가 부르는 앱 */
export type CtxHost = Pick<
  StepApp,
  | 'doc' | 'touch' | 'faceMode' | 'multiPick' | 'explodeOpen' | 'explodeAxis' | 'tweakTool' | 'groups'
  | 'fit' | 'fitSelection' | 'hideSelection' | 'isolateSelection' | 'unisolate' | 'showProps' | 'lookAtFace' | 'sectionByFace'
  | 'toggleMultiPick' | 'showAll' | 'resetOpacity' | 'clearSelection' | 'setSelectionOpacity'
>;

/** 3D 보기 화면 점의 작업 메뉴(contextAt)가 더 부르는 앱 */
export type CtxPointHost = CtxHost &
  Pick<StepApp, 'viewer' | 'loading' | 'measuring' | 'pickThrough' | 'pickUnit' | 'pickCb' | 'onPick' | 'toggleInSelection' | 'findFace'> & { ctxFace: FacePick | null };

/** 겹친 것 고르기 목록(작업 메뉴의 "겹친 것 고르기…" → 같은 자리) */
export interface OverlapList {
  rows: readonly PickRow[];
  /** 여러 개 고르기(줄이 켜고 끄기) */
  multi: boolean;
  /** 고른 줄 → 앱 */
  choose: (r: PickRow) => void;
}

/**
 * 3D 보기 화면 점(client 좌표)의 작업 메뉴(64차 — app.ts contextMenuAt에서 옮김): 오른쪽 누르기(끌지 않음)·손가락 길게 누르기(측정·면 고르기 밖)·
 * 가상 커서를 켠 동안 Shift+F10·메뉴 키(커서 자리 — keysnap.ts). 측정 중이거나 문서를 여는 중이면 열지 않는다(false).
 * - 그 자리의 겹친 후보(코어 pickCandidates — 누르기 알림과 같은 반투명 너머 고르기, pointerType 허용 거리. 첫째는 같은 선택의 pick과 같다)를 앱 고르기로 묶는다(picklist.ts)
 * - 지금 고른 것이 그 후보 가운데 하나면(목록에서 뒤의 것을 골랐으면) 그대로 두고 그것에 대해 연다. 아니면 앞의 것을 고른다(여러 개 고르기는 앞의 것을 더한다 —
 *   전처럼 앞의 것만 본다). 누른 자리 B-rep 면(정면으로 보기·면으로 자르기)도 그 고른 것의 면
 * - 묶은 줄이 둘 이상이면 메뉴 맨 위에 "겹친 것 고르기…"(contextItems)
 */
export function contextAt(H: CtxPointHost, clientX: number, clientY: number, pointerType = 'touch'): boolean {
  const v = H.viewer;
  const d = H.doc;
  if (!v || !d || H.loading || H.measuring) return false;
  const r = v.canvas.getBoundingClientRect();
  const picks = v.pickCandidates(clientX - r.left, clientY - r.top, { pointerType, throughTranslucent: H.pickThrough, max: PICK_LIST_MAX });
  const multi = H.multiPick && !H.faceMode;
  const rows = pickRows(d, picks, H);
  const kept = multi ? undefined : rows.find((x) => x.checked);
  const p = kept?.pick ?? picks[0] ?? null;
  if (!kept && p && !selectionItemIds(d).includes(p.id)) {
    if (multi) H.toggleInSelection(unitItemIds(d.products, p.id, H.pickUnit));
    else H.onPick(p, H.faceMode);
  }
  H.ctxFace = p && p.kind === 'mesh' && !p.section ? H.findFace(d, p) : null;
  // 앞의 것을 골랐으면 줄 표시도 새 고른 것으로. 고른 줄은 앱 누르기 알림에(둘째 이후 후보는 cycle — 가상 커서 Tab·Enter와 같은 선택)
  const list: OverlapList = { rows: kept ? rows : pickRows(d, picks, H), multi, choose: (x) => H.pickCb?.(x.pick, rowEvent(x, picks.length, pointerType)) };
  const items = contextItems(H, H.ctxFace, { x: clientX, y: clientY }, list);
  if (items.length) openMenuAt(clientX, clientY, items, '작업 메뉴');
  return true;
}

/**
 * more 항목을 빼고 끝에 "그 밖의 작업…" 하나를 둔다 — 고르면 open(뺀 항목, 차례·구분선 그대로)으로 같은 자리에 다시 연다. 뺄 것이 없으면 그대로
 */
export function foldMenu(items: MenuItem[], open: (rest: MenuItem[]) => void): MenuItem[] {
  const rest = items.filter((it) => it.more);
  return rest.length ? [...items.filter((it) => !it.more), { label: '그 밖의 작업…', sep: true, run: () => open(rest) }] : items;
}

/**
 * 작업 메뉴 항목(고른 것이 있으면 그것에 대해). face는 누른 자리의 B-rep 면(없으면 고른 면), at은 메뉴를 연 화면 점(하위 메뉴를 같은 자리에).
 * list(3D 보기 화면 점에서 연 메뉴 — contextAt)의 줄이 둘 이상이면 맨 위에 "겹친 것 고르기…": 고르면 같은 자리에 목록(role=menu — ↑↓·Home·End·Enter·Space,
 * Esc는 닫고 연 곳으로 초점, menu.ts). 손가락 기기에서도 접지 않는다
 */
export function contextItems(H: CtxHost, face: FacePick | null, at: { x: number; y: number }, list?: OverlapList): MenuItem[] {
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
  if (list && list.rows.length > 1) {
    if (items[0]) items[0].sep = true;
    items.unshift({ label: '겹친 것 고르기…', run: () => openMenuAt(at.x, at.y, pickItems(list.rows, list.multi, list.choose), '겹친 것 고르기') });
  }
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
