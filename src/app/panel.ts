/**
 * 오른쪽 패널(폭 760px 미만이면 아래 시트): 제품 탭(이름 거르기·제품 나무·부품별 보이기), 레이어 탭(있을 때),
 * PMI 탭(있을 때 — 표현 PMI 켜고 끄기, 의미 PMI 목록), 정보 탭(파일 머리·단위·통계·경고).
 * 아래 띠에는 고른 것(3D 고르기·나무 고르기·고른 면·레이어/PMI 고르기)과 측정 결과를 늘 보인다.
 * 패널 가장자리를 끌어 폭(시트는 높이)을 바꾼다(resize.ts).
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import { isolateText } from './ftext';
import type { StepSavedView } from '../scene';
import type { InterferencePair } from './interference';
import type { Fmt } from './display';
import { bodyName, itemById, meshById, nodeItems, type PanelTab, type StepDoc, TREE_LIMIT } from './doc';
import { fmtCount } from './format';
import { allExpandableKeys, filterRows, visibleRows } from './tree';
import type { TreeView, VList } from './treeview';
import type { PmiView } from './pmiview';
import type { PhysView } from './propsview';

/**
 * 나무 조각(treeview.ts — 제품 나무·부품별 보이기 표의 가상 목록, 뷰어 조각에 든다): 앱이 뷰어를 만들 때 넣는다.
 * 54차: PMI 탭 본문(pmiview.ts — 표현·의미 PMI 표도 가상 목록, 고르기·보이기는 줄 표시만 고침)도 이 조각에(앱은 늘 넣는다 — 없으면 PMI 탭을 비운다)
 * 59차: 정보 탭 본문(infoview.ts — 문서·파일 머리·단위·통계·경고)도 이 조각에(없으면 정보 탭을 비운다)
 * 223차: 레이어 탭 본문·제품 탭의 간섭 검사 묶음·아래 띠 줄(panelview.ts — 이 파일에서 옮김)도 이 조각에(없으면 그 칸을 비운다). 앱은 조각 전체를 넣으므로
 * 모두 있고, 칸마다 선택이라 시험은 쓰는 것만 넣는다(나무 없이 띠·레이어·간섭만 — 나무 줄을 새로 그리지 않게)
 */
export type TreeKit = Partial<
  Pick<typeof import('./treeview'), 'treeView' | 'groupGrid'> &
    Pick<typeof import('./pmiview'), 'pmiView'> &
    Pick<typeof import('./infoview'), 'infoView'> &
    Pick<typeof import('./panelview'), 'layersView' | 'interferenceView' | 'footView'>
>;

/**
 * 속성 탭 본문(propsview.ts — 부품 속성 줄과 물리 속성 묶음): 53차에 물리 속성 계산(physics.ts — 부피·질량·무게중심·관성, 재질 표)을, 222차에 본문 그리기
 * (renderProps·physSection과 부품 속성 줄 partinfo.ts)를 첫 화면 JS에서 뷰어 조각으로 옮겼다(속성 탭은 문서가 있어야 그린다). 앱이 뷰어를 만들 때 나무 조각과 함께 넣는다
 */
export type PhysKit = Pick<typeof import('./propsview'), 'propsView'>;

/** 패널이 부르는 앱 쪽 기능 */
export interface PanelHost {
  readonly measuring: boolean;
  /** 측정 종류(두 점 · 개체) */
  readonly measureKind: 'points' | 'entities';
  /** 손가락이 주인 기기인지(안내에서 키 설명을 뺀다) */
  readonly touch: boolean;
  /** 수 꼴(표시 단위·소수 자리·언어) */
  readonly fmt: Fmt;
  /** 나무 마디 고르기(null = 풀기) */
  selectKey(key: string | null): void;
  /** 나무 마디를 고르고 그 아래 형상으로 맞춰 보기 */
  fitKey(key: string): void;
  /** 나무 몸체 줄: 몸체 하나 고르기(null = 풀기), 고르고 맞춰 보기 */
  selectBody(id: string | null): void;
  fitBody(id: string): void;
  /** 여러 개 고르기: 항목들을 지금 고른 것에 더하거나(모두 들어 있으면) 뺀다 */
  toggleInSelection(ids: readonly string[]): void;
  /** 여러 개 고르기 모드(손가락 기기 — 나무 줄 누르기도 더하고 빼기) */
  readonly multiPick: boolean;
  /** 지금 고른 것으로 맞춰 보기 */
  fitSelection(): void;
  setItemsVisible(ids: readonly string[], on: boolean): void;
  setGroupVisible(group: string, on: boolean): void;
  showAll(): void;
  isVisible(id: string): boolean;
  groups(): GroupInfo[];
  togglePanel(on?: boolean): void;
  /** 레이어 켜고 끄기(NO_LAYER = 레이어 없음) */
  setLayerVisible(layer: number, on: boolean): void;
  setAllLayersVisible(on: boolean): void;
  /** PMI 하나(id) 또는 모두(null) 켜고 끄기 */
  setPmiVisible(id: string | null, on: boolean): void;
  /** 레이어·PMI 목록에서 항목 묶음 고르기(강조, null = 풀기) */
  selectItems(ids: readonly string[] | null, label: string, fit?: boolean): void;
  /** 파일에 밀도가 없는 부품에 쓸 재질 밀도(kg/m³, null = 안 씀) */
  setDensity(kgm3: number | null): void;
  /** 알림 칸(155차 — 밀도 칸이 받지 않는 값, 156차 — 보이지 않는 간섭 검사 오류) */
  toast?(msg: string | string[], kind: 'warn' | 'error', ms: number): void;
  /** 화면 점에 작업 메뉴(숨기기·이것만 보기 등) */
  openContextMenu(clientX: number, clientY: number): void;
  /** 의미 PMI가 가리키는 면 강조·맞춰 보기 */
  showPmiFaces(stepIds: readonly number[], label: string): boolean;
  /** 저장된 보기 적용 */
  applySavedView(view: StepSavedView): void;
  /** 간섭 검사(보이는 그물끼리) 돌리기·지우기, 한 쌍 보기 */
  runInterference(): void;
  clearInterference(): void;
  showInterference(p: InterferencePair): void;
}

// 226차: 표현·의미 PMI 종류 이름 표와 이름 함수(pmiTypeLabel·semanticLabel)는 PMI 탭 본문(pmiview.ts — 뷰어 조각)으로 옮겼다(문서가 있어야 쓴다 — 첫 화면 JS 밖)

/** 간섭 한 쌍의 이름표(고른 묶음 이름과 같다): "A ↔ B" — 안에 든 쌍은 앞이 안쪽 부품. 이름은 파일 글이라 방향을 가둔다(ftext.ts) */
export function interferenceLabel(d: StepDoc, p: InterferencePair): string {
  const name = (id: string) => isolateText(meshById(d.scene, id)?.name ?? id);
  return `${name(p.a)} ↔ ${name(p.b)}`;
}

/** 본문을 다시 그린 뒤 초점을 돌려줄 칸 */
const FOCUSABLE = 'button, input, select, a[href]';

const section = (title: string | (Node | string)[], ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, ...(typeof title === 'string' ? [title] : title)), ...children.filter((c): c is HTMLElement => !!c));

/**
 * 간섭 쌍 버튼 강조: 고른 묶음 이름표가 그 쌍 이름표(data-pair)이면 `.sel`과 `aria-current="true"`(184차 — 쌍 목록에서 지금 3D 보기에 강조한 쌍.
 * 누르면 늘 강조하는 버튼이라 토글 `aria-pressed`는 맞지 않고(182차), 목록(role=list)이라 `aria-selected`도 뜻이 없다). 그릴 때(panelview.ts — 223차)와 고르기만 바뀔 때 같은 자리
 */
export const markPair = (b: HTMLElement, label: string | undefined): void => {
  const on = b.dataset.pair === label;
  b.classList.toggle('sel', on);
  if (on) b.setAttribute('aria-current', 'true');
  else b.removeAttribute('aria-current');
};

export class Panel {
  readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly foot: HTMLElement;
  private doc: StepDoc | null = null;
  /** 나무 조각(문서를 보이기 전에 앱이 넣는다 — 없으면 나무 줄·부품별 보이기 표를 그리지 않는다) */
  kit: TreeKit | null = null;
  /** 속성 탭 본문(문서를 보이기 전에 앱이 넣는다 — 없으면 속성 탭을 비운다) */
  phys: PhysKit | null = null;
  /** 지금 그린 나무의 펼침(같으면 고르기만 바꿀 때 줄 표시만 고친다) */
  private drawnExpanded: Set<string> | null = null;
  /** 지금 그린 나무(가상 목록)와 부품별 보이기 표 */
  private tree: TreeView | null = null;
  private groupList: VList | null = null;
  /** 지금 그린 PMI 탭 본문(나무 조각 — 54차) */
  private pmi: PmiView | null = null;
  private filterTimer = 0;
  /** 제품 탭의 간섭 검사 묶음(진행률만 바뀌면 이것만 다시 그린다) */
  private interferenceEl: HTMLElement | null = null;
  /** 제품 탭 나무 도구 줄의 「간섭 검사」(결과 지우기로 묶음째 빠지면 그 안 초점을 받는다 — 142차) */
  private checkBtn: HTMLElement | null = null;
  /** 속성 탭의 물리 속성 묶음(질량 속성 적분 진행에 따라 그것만 고친다 — onProps). 고른 것·"계산 중"을 보였는지·다시 만들기는 묶음이 쥔다(propsview.ts) */
  private physView: PhysView | null = null;

  constructor(private readonly host: PanelHost) {
    this.tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '패널 탭' });
    const close = h('button', { type: 'button', class: 'icon-btn', title: '패널 닫기', 'aria-label': '패널 닫기' });
    close.append(icon('close', 16));
    close.addEventListener('click', () => this.host.togglePanel(false));
    this.body = h('div', { class: 'panel-body', role: 'tabpanel', id: 'panel-body' });
    this.foot = h('div', { class: 'panel-foot', 'aria-live': 'polite', hidden: true });
    // 187차: id는 크기 손잡이(resize.ts — 패널 첫 자식)가 aria-controls로 가리킨다(APG 창 가르개 — 손잡이는 주 패널을 가리킴)
    this.el = h('aside', { class: 'panel', 'aria-label': '제품·정보 패널', id: 'panel', hidden: true }, h('div', { class: 'panel-head' }, this.tabsEl, close), this.body, this.foot);
  }

  /** 문서 바꾸기(null이면 비움) */
  show(d: StepDoc | null): void {
    this.doc = d;
    this.body.scrollTop = 0;
    this.drawnExpanded = null;
    this.render();
  }

  /** 열고 닫기(문서가 없으면 늘 닫힘) */
  setOpen(on: boolean): void {
    this.el.hidden = !on || !this.doc;
    this.showTab();
  }

  /**
   * 고른 탭이 탭 줄 밖이면 줄을 굴려 보이게(52차). 탭을 누르면 줄을 새로 만들어 굴린 자리가 0으로 돌아가, 좁은 화면에서 넘치는 탭 줄의 끝 탭(정보)을 누르면
   * 그 탭이 줄 밖으로 사라졌다. 닫혀 있으면 아무것도 하지 않는다(열 때 다시)
   */
  private showTab(): void {
    const s = this.tabsEl;
    const t = s.querySelector<HTMLElement>('.active');
    if (t && !this.el.hidden) s.scrollLeft = Math.max(0, t.offsetLeft - s.offsetLeft + t.offsetWidth - s.clientWidth);
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** 고른 것이 바뀜: 나무(펼침이 그대로면 줄 표시만) 고치고 고른 줄을 보이게 */
  onSelection(reveal = false): void {
    const d = this.doc;
    if (!d) return;
    if (d.panelTab === 'tree') {
      // 184차: 줄 표시만 고치는 길은 간섭 쌍 묶음을 다시 그리지 않으므로 쌍 버튼 강조도 여기서 고친다(전에는 누른 쌍이 강조되지 않고 앞 강조가 남았다 — 초점·굴림은 그대로)
      if (!this.patchTreeSelection()) this.renderBody();
      else this.interferenceEl?.querySelectorAll<HTMLElement>('[data-pair]').forEach((b) => markPair(b, d.items?.label));
    } else if (d.panelTab === 'pmi' && this.pmi) this.pmi.patch();
    else if (d.panelTab === 'layers' || d.panelTab === 'pmi' || d.panelTab === 'props') this.renderBody();
    // 아래 띠를 먼저 고친다(처음 고르면 띠가 나타나 본문이 줄어든다 — 그 뒤에 재야 고른 줄이 띠 뒤에 숨지 않는다)
    this.renderFoot();
    // 고른 줄(몸체 줄이 있으면 그 줄 — 부품 줄의 일부 고름 표시보다 먼저)이 화면 밖이면 스크롤해 만든다
    if (reveal && d.panelTab === 'tree') this.tree?.reveal();
  }

  onMeasure(): void {
    this.renderFoot();
  }

  /** 간섭 검사 진행·결과가 바뀜: 제품 탭의 그 묶음만 다시 그린다(없으면 탭을 다시 그림) */
  onInterference(): void {
    const d = this.doc;
    const err = d?.interference?.error;
    // 오류 줄이 보이지 않으면(패널 닫힘 — 휴대폰은 시트, 다른 탭) 같은 글을 알림 상자 오류로(156차 — NC 144차 꼴, 쌍 수와 같은 알림 길). 숨은 줄은 role 없이(알림은 한 곳)
    if (err && !(this.open && d?.panelTab === 'tree')) this.host.toast?.(['검사하지 못했습니다:', err], 'error', 9000);
    if (!d || d.panelTab !== 'tree') return;
    // 223차: 묶음은 나무 조각(panelview.ts interferenceView)이 그린다 — 묶음이 그려져 있으면 조각이 있다
    const el = this.interferenceEl && d.interference ? this.kit?.interferenceView?.(d, this.host, this.open) : undefined;
    if (this.interferenceEl && el) {
      this.swap(this.interferenceEl, el);
      this.interferenceEl = el;
      // 아래 부품별 보이기 표의 자리가 바뀌었다 — 보이는 줄을 다시 센다
      this.groupList?.update();
    } else {
      // 「결과 지우기」·쌍 전 「멈추기」로 묶음째 빠질 때 그 안에 초점이 있었으면 같은 일을 다시 하는 나무 도구 「간섭 검사」로(142차 — SKP 137차 모두 고르기 ↔ ✕·
      // 128차 되돌리기 ↔ 다시 하기 꼴. 전에는 53차 차례 돌려주기가 빠진 묶음 뒤 다른 칸으로, 뒤에 칸이 없으면 문서로 빠졌다). 먼저 떼어 그 차례 돌려주기가 다른 칸에 잠깐 주지 않게
      const held = this.interferenceEl?.contains(document.activeElement);
      if (held) (document.activeElement as HTMLElement).blur();
      this.renderBody();
      if (held) this.checkBtn?.focus();
    }
  }

  /** 수 꼴(표시 단위·소수 자리·언어)이 바뀜: 본문과 아래 띠를 다시 그린다 */
  redraw(): void {
    if (!this.doc) return;
    this.renderBody();
    this.renderFoot();
  }

  /** 보이기/숨기기가 바뀜(PMI 탭은 만든 줄의 표시만 고친다 — 54차) */
  onVisibility(): void {
    const t = this.doc?.panelTab;
    if (t === 'pmi' && this.pmi) this.pmi.patch();
    else if (t === 'tree' || t === 'layers' || t === 'pmi') this.renderBody();
  }

  setTab(tab: PanelTab): void {
    if (!this.doc || this.doc.panelTab === tab) return;
    this.doc.panelTab = tab;
    this.body.scrollTop = 0;
    this.render();
  }

  // ───────────────────────── 그리기 ─────────────────────────

  private render(): void {
    const d = this.doc;
    // 탭에 초점이 있었으면(키보드로 탭을 고름 — Enter·Space, 화살표는 keynav.ts) 새로 만든 고른 탭으로 돌려준다(전에는 body로 날아가 Tab이 문서 처음부터 다시 돌았다)
    const refocus = this.tabsEl.contains(document.activeElement);
    this.tabsEl.innerHTML = '';
    if (!d) {
      this.dropLists();
      this.body.innerHTML = '';
      this.renderFoot();
      this.el.hidden = true;
      return;
    }
    const tabs: [PanelTab, string][] = [
      ['tree', '제품'],
      ['props', '속성'],
    ];
    if (d.layers.length) tabs.push(['layers', `레이어 ${d.layers.length}`]);
    if (d.pmi.presentations.length || d.pmi.semantic.length || d.pmi.views.length) tabs.push(['pmi', 'PMI']);
    tabs.push(['info', `정보${d.scene.warnings?.length ? ` (경고 ${d.scene.warnings.length})` : ''}`]);
    if (!tabs.some(([k]) => k === d.panelTab)) d.panelTab = 'tree';
    // APG Tabs: Tab 멈춤은 고른 탭 하나(나머지는 ←·→·Home·End — keynav.ts), 탭은 본문을 aria-controls로 가리킨다
    for (const [k, label] of tabs) {
      const on = k === d.panelTab;
      const b = h('button', { type: 'button', class: `tab${on ? ' active' : ''}`, role: 'tab', 'aria-selected': String(on), 'aria-controls': 'panel-body', tabindex: on ? '0' : '-1', id: `tab-${k}` }, label);
      b.addEventListener('click', () => this.setTab(k));
      this.tabsEl.append(b);
      if (on && refocus) b.focus({ preventScroll: true });
    }
    // 다른 언어 화면은 번역층(문서 변화 관찰 — 마이크로태스크, 붙일 때 이미 줄을 섰다)이 탭 글을 바꾼 뒤의 폭으로
    queueMicrotask(() => this.showTab());
    this.body.setAttribute('aria-labelledby', `tab-${d.panelTab}`);
    // 본문이 글로 시작하는 탭(속성·정보)은 본문 자체가 Tab 멈춤(APG Tabs — 탭 다음 Tab이 본문으로 와 화면 읽기 프로그램이 읽기 시작한다)
    if (d.panelTab === 'props' || d.panelTab === 'info') this.body.tabIndex = 0;
    else this.body.removeAttribute('tabindex');
    this.renderBody();
    this.renderFoot();
  }

  private renderBody(): void {
    const d = this.doc;
    if (!d) return;
    const scroll = this.body.scrollTop;
    // 거르기 칸·나무 줄(눈 단추)에 초점이 있으면 다시 그린 뒤 돌려준다(펼치기·고르기·보이기를 글쇠로 바꿔도 초점이 그 줄에 남게)
    const active = document.activeElement as HTMLInputElement | null;
    const refocus = active?.classList?.contains('tree-filter') ? { start: active.selectionStart, end: active.selectionEnd } : null;
    const rowKey = this.body.contains(active) ? active?.closest<HTMLElement>('.tree-row')?.dataset.key : undefined;
    // 그 밖의 칸(레이어·PMI 보이기 상자, 나무 도구 단추 등)은 같은 차례의 새 칸으로(53차 — 상자를 Space로 바꾸면 다시 그리며 초점이 body로 날아갔다)
    const at = !refocus && !rowKey && this.body.contains(active) ? [...this.body.querySelectorAll(FOCUSABLE)].indexOf(active!) : -1;
    this.dropLists();
    this.body.innerHTML = '';
    this.drawnExpanded = null;
    if (d.panelTab === 'tree') this.renderTree(d);
    else if (d.panelTab === 'layers') this.renderLayers(d);
    else if (d.panelTab === 'pmi') this.renderPmi(d);
    else if (d.panelTab === 'props') this.renderProps(d);
    else this.renderInfo(d);
    this.body.scrollTop = scroll;
    // 가상 목록은 자리가 정해진 뒤 보이는 줄을 만든다
    this.tree?.list.update();
    this.groupList?.update();
    this.pmi?.lists.forEach((l) => l.update());
    if (refocus) {
      const inp = this.body.querySelector<HTMLInputElement>('.tree-filter');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(refocus.start, refocus.end);
      }
    } else if (rowKey) this.tree?.focusKey(rowKey, !!active?.classList.contains('eye'));
    else if (at >= 0) this.body.querySelectorAll<HTMLElement>(FOCUSABLE)[at]?.focus({ preventScroll: true });
  }

  /** 아래 띠(고른 것·측정 결과)가 바뀐 글을 알릴지: 3D 보기 위 측정 띠가 보이는 동안은 띠가 알린다(앱이 맞춘다 — 53차) */
  footLive(on: boolean): void {
    this.foot.setAttribute('aria-live', on ? 'polite' : 'off');
  }

  /** 앞서 그린 가상 목록을 놓는다(스크롤 듣기를 뗀다) */
  private dropLists(): void {
    this.tree?.list.dispose();
    this.groupList?.dispose();
    this.pmi?.lists.forEach((l) => l.dispose());
    this.tree = this.groupList = this.pmi = null;
  }

  // ───────────────────────── 제품 탭 ─────────────────────────

  /**
   * 펼침이 그대로면 고른 줄 표시만 바꾼다(큰 나무에서 다시 그리지 않게 — 마디·몸체·여러 개 고르기 모두). 못 하면 false
   * (고른 마디·몸체 줄이 그려져 있지 않으면 다시 그린다)
   */
  private patchTreeSelection(): boolean {
    const d = this.doc;
    if (!d || !this.drawnExpanded || d.treeFilter.trim()) return false;
    if (this.drawnExpanded.size !== d.expanded.size) return false;
    for (const k of d.expanded) if (!this.drawnExpanded.has(k)) return false;
    return !!this.tree?.patch();
  }

  private renderTree(d: StepDoc): void {
    const roots = d.products;
    if (!roots.length) {
      this.body.append(h('p', { class: 'empty' }, '이 파일에는 제품 구조 정보가 없습니다.'));
      return;
    }
    const filtering = !!d.treeFilter.trim();
    const res = filtering ? filterRows(roots, d.treeFilter, d.expanded, d.treeLimit, (n, i) => bodyName(n, itemById(d.scene, nodeItems(n)[i]!)?.[0], i >= n.meshIds.length)) : { ...visibleRows(roots, d.expanded, d.treeLimit), matches: -1 };
    const { rows, truncated, total } = res;

    // 이름 거르기. 168차: 화면 읽기 이름은 보이는 자리 글과 같은 글(WCAG 2.5.3 — 감싼 label에는 아이콘뿐이라 보이는 글은 자리 글 하나. 전에는 「모델 트리 이름 거르기」라
    // 그 글을 품지 않아 보이는 글로 부를 수 없었다 — SKP 172차 꼴). 무엇을 거르는지는 바로 위 묶음 제목 「모델 트리」. 이름이 자리 글에만 기대지 않게 aria-label은 둔다
    const tip = '이름·자리 이름·제품 번호로 거르기';
    const input = h('input', {
      type: 'search',
      class: 'tree-filter',
      placeholder: tip,
      'aria-label': tip,
      spellcheck: 'false',
      autocomplete: 'off',
    });
    input.value = d.treeFilter;
    input.addEventListener('input', () => {
      clearTimeout(this.filterTimer);
      this.filterTimer = window.setTimeout(() => {
        d.treeFilter = input.value;
        d.treeLimit = TREE_LIMIT;
        this.renderBody();
      }, 160);
    });
    // Esc는 거르기를 지운다(↓로 첫 줄, Ctrl·⌘+F로 이 칸에 오기는 나무 조각 — treeview.ts)
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && input.value) {
        ev.preventDefault();
        ev.stopPropagation();
        input.value = '';
        d.treeFilter = '';
        this.renderBody();
      }
    });
    const search = h('label', { class: 'tree-search' }, icon('search', 15), input);
    const filterInfo = filtering ? h('p', { class: 'hint filter-info' }, res.matches ? `맞는 마디 ${fmtCount(res.matches)}개 (조상 마디와 함께 보입니다)` : '맞는 마디가 없습니다.') : null;

    const tools = h('div', { class: 'tree-tools' });
    const mk = (label: string, title: string, run: () => void) => {
      const b = h('button', { type: 'button', class: 'btn small', title }, label);
      b.addEventListener('click', run);
      tools.append(b);
      return b;
    };
    mk('모두 펼치기', '모델 트리를 모두 펼칩니다', () => {
      d.expanded = allExpandableKeys(roots);
      this.renderBody();
    });
    mk('모두 접기', '모델 트리를 모두 접습니다', () => {
      d.expanded = new Set();
      d.treeLimit = TREE_LIMIT;
      this.renderBody();
    });
    mk('모두 보이기', '숨긴 부품을 모두 다시 보입니다(레이어로 끈 것은 레이어 탭에서 켭니다)', () => this.host.showAll());
    this.checkBtn = d.scene.meshes.length > 1 ? mk('간섭 검사', '보이는 부품끼리 서로 뚫고 지나가거나 한 부품이 다른 부품 안에 든 곳을 찾습니다(맞닿음은 간섭이 아님)', () => this.host.runInterference()) : null;

    // 나무 줄은 나무 조각의 가상 목록이 보이는 것만 만든다(renderBody가 자리를 잡은 뒤 update)
    const kit = this.kit;
    this.tree = kit?.treeView
      ? kit.treeView({
          d,
          rows,
          host: this.host,
          scroller: this.body,
          redraw: () => this.renderBody(),
          filter: input,
          tools,
        })
      : null;
    let more: HTMLElement | null = null;
    if (truncated) {
      const btn = h('button', { type: 'button', class: 'btn small' }, `${fmtCount(Math.min(TREE_LIMIT, total - rows.length))}줄 더 보기`);
      btn.addEventListener('click', () => {
        d.treeLimit += TREE_LIMIT;
        this.renderBody();
      });
      more = h(
        'div',
        { class: 'tree-more' },
        h('p', { class: 'hint' }, `${fmtCount(total)}줄 가운데 처음 ${fmtCount(rows.length)}줄만 보입니다. 더 보거나, 접거나, 위 칸에서 이름으로 거르십시오.`),
        btn,
      );
    }
    this.body.append(section('모델 트리', search, filterInfo, tools, this.tree?.el ?? null, more));
    if (!filtering) this.drawnExpanded = new Set(d.expanded);
    // 간섭 검사 묶음(223차 — 나무 조각 panelview.ts interferenceView)
    this.interferenceEl = (d.interference && kit?.interferenceView?.(d, this.host)) || null;
    if (this.interferenceEl) this.body.append(this.interferenceEl);

    // 부품별(묶음): 같은 이름의 부품 자리를 한꺼번에 숨기고 보인다
    // (표도 나무 조각의 가상 목록 — 이름이 모두 다른 큰 조립은 수천 줄)
    const groups = this.host.groups();
    if (groups.length > 1 && kit?.groupGrid) {
      const g = kit.groupGrid(groups, this.body, (name, on) => this.host.setGroupVisible(name, on));
      this.groupList = g.list;
      this.body.append(section('부품별 보이기', g.el));
    }
  }

  // ───────────────────────── 속성 탭 ─────────────────────────

  /**
   * 속성 탭 본문(부품 속성 줄·물리 속성 묶음)은 뷰어 조각(propsview.ts — 222차에 첫 화면 JS에서 옮김)이 그린다. 조각이 아직 없으면 비운다(나무·PMI·정보 탭과 같다 —
   * 앱은 조각을 받은 뒤에만 문서를 보인다)
   */
  private renderProps(d: StepDoc): void {
    const v = this.phys?.propsView(d, this.host);
    this.physView = v?.phys ?? null;
    if (v) this.body.append(...v.els);
  }

  /**
   * 질량 속성 적분 진행이 바뀜(워커): 속성 탭의 물리 속성 묶음만 고친다. 계산 중이던 고른 것이 그대로 계산 중이면 끝낸 입체 수 글만,
   * 값이 다 왔거나 멈췄으면 묶음을 다시 그린다(재질 고르기 칸 등 나머지는 그대로). 고칠지 다시 그릴지는 묶음이 정한다(propsview.ts refresh — 222차)
   */
  onProps(): void {
    const d = this.doc;
    const p = this.physView;
    if (!d || d.panelTab !== 'props' || !p?.el.isConnected) return;
    const next = p.refresh();
    if (!next) return;
    this.swap(p.el, next.el);
    this.physView = next;
  }

  /**
   * 묶음을 제자리에서 갈아 끼운다(간섭 검사 진행·질량 적분 끝 — 워커 알림이라 keynav.ts rescue가 받지 않는다). 그 안 칸에 초점이 있었으면 새 묶음의 같은 칸으로 돌려준다
   * (139차 — 전에는 문서로 빠져 검사 중 100 ms마다 오는 진행이 Tab으로 간 「멈추기」 초점을 떼었다). 같은 칸은 뒤에서 센 차례(쌍이 오면 「멈추기」 앞에 쌍 단추가 붙는다)
   */
  private swap(old: HTMLElement, next: HTMLElement): void {
    const all = [...old.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const k = all.length - all.indexOf(document.activeElement as HTMLElement);
    old.replaceWith(next);
    if (k > all.length) return;
    const now = next.querySelectorAll<HTMLElement>(FOCUSABLE);
    now[now.length - k]?.focus({ preventScroll: true });
  }

  // ───────────────────────── 레이어 탭 ─────────────────────────

  /** 레이어 탭 본문은 나무 조각(panelview.ts layersView — 223차에 첫 화면 JS에서 옮김)이 그린다. 조각이 아직 없으면 비운다(나무·PMI·정보 탭과 같다) */
  private renderLayers(d: StepDoc): void {
    if (this.kit?.layersView) this.body.append(this.kit.layersView(d, this.host));
  }

  // ───────────────────────── PMI 탭 ─────────────────────────

  /**
   * 표현·의미 PMI 표와 저장된 보기(54차 — 나무 조각 pmiview.ts의 가상 목록, 보이는 줄만 만든다. 53차까지는 여기서 줄을 모두 만들었다 —
   * 합성 PMI 2,120개에서 주 스레드 4배 느리게 탭 그리기 228 ms). 나무 조각이 아직 없으면 비운다(나무 탭과 같다)
   */
  private renderPmi(d: StepDoc): void {
    this.pmi = this.kit?.pmiView ? this.kit.pmiView(d, this.host, this.body) : null;
    if (this.pmi) this.body.append(this.pmi.el);
  }

  // ───────────────────────── 정보 탭 ─────────────────────────

  /** 정보 탭 본문은 나무 조각(infoview.ts — 59차에 첫 화면 JS에서 옮김)이 그린다. 조각이 아직 없으면 비운다(나무·PMI 탭과 같다) */
  private renderInfo(d: StepDoc): void {
    if (this.kit?.infoView) this.body.append(...this.kit.infoView(d, this.host.fmt));
  }

  // ───────────────────────── 아래 띠 ─────────────────────────

  /**
   * 아래 띠 줄(고른 것·측정 결과)은 나무 조각(panelview.ts footView — 223차에 첫 화면 JS에서 옮김)이 만든다. 조각이 아직 없으면 띠를 숨긴다
   * (앱은 조각을 받은 뒤에만 문서를 보인다 — 문서가 없으면 지금처럼 숨기기만)
   */
  private renderFoot(): void {
    const d = this.doc;
    const f = this.foot;
    f.innerHTML = '';
    if (!d) {
      f.hidden = true;
      return;
    }
    const lines = this.kit?.footView?.(d, this.host) ?? [];
    f.hidden = !lines.length;
    f.append(...lines);
  }
}
