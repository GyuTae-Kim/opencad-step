/**
 * 오른쪽 패널(폭 760px 미만이면 아래 시트): 제품 탭(이름 거르기·제품 나무·부품별 보이기), 레이어 탭(있을 때),
 * PMI 탭(있을 때 — 표현 PMI 켜고 끄기, 의미 PMI 목록), 정보 탭(파일 머리·단위·통계·경고).
 * 아래 띠에는 고른 것(3D 고르기·나무 고르기·고른 면·레이어/PMI 고르기)과 측정 결과를 늘 보인다.
 * 패널 가장자리를 끌어 폭(시트는 높이)을 바꾼다(resize.ts).
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import { fileSpan, isolateText } from './ftext';
import type { StepSavedView } from '../scene';
import type { InterferencePair } from './interference';
import type { Fmt } from './display';
import { bodyName, bodyTitle, itemById, meshById, nodeItems, productAt, type PanelTab, type ProductNode, type StepDoc, TREE_LIMIT } from './doc';
import { isFullCircle, type EdgePick } from './edges';
import { faceKindLabel, type FacePick } from './faces';
import { fmtCount } from './format';
import { edgeSummary, edgeTitle, entityHint, faceSummary, lineValue, panelMeasureHint } from './measure';
import { snapPair } from './snap';
import { allExpandableKeys, filterRows, nodeLabel, visibleRows } from './tree';
import type { TreeView, VList } from './treeview';
import type { PmiView } from './pmiview';
import type { PhysView } from './propsview';
import { NO_LAYER } from './visibility';

/**
 * 나무 조각(treeview.ts — 제품 나무·부품별 보이기 표의 가상 목록, 뷰어 조각에 든다): 앱이 뷰어를 만들 때 넣는다.
 * 54차: PMI 탭 본문(pmiview.ts — 표현·의미 PMI 표도 가상 목록, 고르기·보이기는 줄 표시만 고침)도 이 조각에(앱은 늘 넣는다 — 없으면 PMI 탭을 비운다)
 * 59차: 정보 탭 본문(infoview.ts — 문서·파일 머리·단위·통계·경고)도 이 조각에(없으면 정보 탭을 비운다)
 */
export type TreeKit = Pick<typeof import('./treeview'), 'treeView' | 'groupGrid'> & Partial<Pick<typeof import('./pmiview'), 'pmiView'> & Pick<typeof import('./infoview'), 'infoView'>>;

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

const PMI_TYPE: Record<string, string> = {
  ANNOTATION_CURVE_OCCURRENCE: '곡선 주석',
  ANNOTATION_OCCURRENCE: '주석',
  ANNOTATION_FILL_AREA_OCCURRENCE: '채운 영역 주석',
  DRAUGHTING_ANNOTATION_OCCURRENCE: '제도 주석',
  TESSELLATED_ANNOTATION_OCCURRENCE: '삼각형 주석',
  ANNOTATION_PLACEHOLDER_OCCURRENCE: '자리 주석',
  ANNOTATION_SYMBOL_OCCURRENCE: '기호 주석',
  ANNOTATION_TEXT_OCCURRENCE: '글 주석',
  ANNOTATION_POINT_OCCURRENCE: '점 주석',
};

const SEMANTIC_TYPE: Record<string, string> = {
  DIMENSIONAL_SIZE: '크기 치수',
  DIMENSIONAL_LOCATION: '위치 치수',
  ANGULAR_SIZE: '각도 크기',
  ANGULAR_LOCATION: '각도 위치',
  DIMENSIONAL_SIZE_WITH_PATH: '경로 크기 치수',
  DIMENSIONAL_LOCATION_WITH_PATH: '경로 위치 치수',
  DIRECTED_DIMENSIONAL_LOCATION: '방향 위치 치수',
  FLATNESS_TOLERANCE: '평면도 ⏥',
  STRAIGHTNESS_TOLERANCE: '진직도 ⏤',
  ROUNDNESS_TOLERANCE: '진원도 ○',
  CYLINDRICITY_TOLERANCE: '원통도 ⌭',
  LINE_PROFILE_TOLERANCE: '선의 윤곽도 ⌒',
  SURFACE_PROFILE_TOLERANCE: '면의 윤곽도 ⌓',
  ANGULARITY_TOLERANCE: '경사도 ∠',
  PARALLELISM_TOLERANCE: '평행도 ∥',
  PERPENDICULARITY_TOLERANCE: '직각도 ⟂',
  POSITION_TOLERANCE: '위치도 ⌖',
  CONCENTRICITY_TOLERANCE: '동심도 ◎',
  COAXIALITY_TOLERANCE: '동축도 ◎',
  SYMMETRY_TOLERANCE: '대칭도 ⌯',
  CIRCULAR_RUNOUT_TOLERANCE: '원주 흔들림 ↗',
  TOTAL_RUNOUT_TOLERANCE: '온 흔들림 ⌰',
  GEOMETRIC_TOLERANCE: '기하 공차',
  DATUM: '데이텀',
  COMMON_DATUM: '공통 데이텀',
};

/** 간섭 한 쌍의 이름표(고른 묶음 이름과 같다): "A ↔ B" — 안에 든 쌍은 앞이 안쪽 부품. 이름은 파일 글이라 방향을 가둔다(ftext.ts) */
export function interferenceLabel(d: StepDoc, p: InterferencePair): string {
  const name = (id: string) => isolateText(meshById(d.scene, id)?.name ?? id);
  return `${name(p.a)} ↔ ${name(p.b)}`;
}

/** 의미 PMI 개체 이름 → 한국어 */
export function semanticLabel(type: string): string {
  return SEMANTIC_TYPE[type] ?? type;
}

/** 표현 PMI 개체 이름 → 한국어 */
export function pmiTypeLabel(type: string): string {
  return PMI_TYPE[type] ?? type;
}

/** 본문을 다시 그린 뒤 초점을 돌려줄 칸 */
const FOCUSABLE = 'button, input, select, a[href]';

const section = (title: string | (Node | string)[], ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, ...(typeof title === 'string' ? [title] : title)), ...children.filter((c): c is HTMLElement => !!c));

/**
 * 표 줄의 보이기 확인 칸을 라벨로 감싼다: 손가락 기기에서 라벨이 44×44 누르는 자리가 된다(styles.css `.cb-hit`).
 * 이름은 옆의 이름 단추(강조)가 따로 누르므로 라벨에 넣지 않고, 칸의 이름은 칸의 aria-label 그대로
 */
const cbHit = (cb: HTMLInputElement): HTMLElement => h('label', { class: 'cb-hit' }, cb);

/**
 * 간섭 쌍 버튼 강조: 고른 묶음 이름표가 그 쌍 이름표(data-pair)이면 `.sel`과 `aria-current="true"`(184차 — 쌍 목록에서 지금 3D 보기에 강조한 쌍.
 * 누르면 늘 강조하는 버튼이라 토글 `aria-pressed`는 맞지 않고(182차), 목록(role=list)이라 `aria-selected`도 뜻이 없다). 그릴 때와 고르기만 바뀔 때 같은 자리
 */
const markPair = (b: HTMLElement, label: string | undefined): void => {
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
    if (this.interferenceEl && d.interference) {
      const el = this.interferenceSection(d, this.open);
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

  /**
   * fresh: 워커 알림으로 묶음을 갈아 끼울 때(onInterference). 그때 새로 붙는 오류 줄은 role=alert로 화면 읽기 프로그램이 읽게 한다(143차 — 전에는 role·aria-live 없는 새 줄이라
   * 「검사 중…」 뒤 아무것도 듣지 못했다. 쌍 수는 앱 알림 상자가 알린다). 탭을 다시 그릴 때(나무 펼치기·거르기·보이기)는 같은 오류를 다시 읽히지 않게 role 없이.
   * 패널이 닫혀 있으면 거짓(156차 — 오류는 알림 상자가 알리고, 다시 열 때 숨었던 줄이 한 번 더 읽히지 않게)
   */
  private interferenceSection(d: StepDoc, fresh = false): HTMLElement {
    const st = d.interference!;
    const kids: HTMLElement[] = [];
    const clear = h('button', { type: 'button', class: 'btn small' }, st.running ? '멈추기' : '결과 지우기');
    clear.addEventListener('click', () => this.host.clearInterference());
    const count = st.total ? ` ${fmtCount(st.done)} / ${fmtCount(st.total)}` : '';
    if (st.running && !st.result) kids.push(h('p', { class: 'hint' }, h('span', {}, '검사 중…'), count));
    else if (st.error) kids.push(h('p', { class: 'hint', role: fresh && 'alert' }, h('span', {}, '검사하지 못했습니다:'), ` ${st.error}`));
    if (st.result) {
      const r = st.result;
      const f = this.host.fmt;
      const inside = r.pairs.filter((p) => p.inside).length;
      kids.push(
        h('p', { class: 'hint' }, h('span', {}, '범위가 겹친 쌍'), ` ${fmtCount(r.tested)} · `, h('span', {}, '간섭'), ` ${fmtCount(r.pairs.length)}`, ...(inside ? [' · ', h('span', {}, `안에 듦 ${fmtCount(inside)}`)] : []), ` · ${fmtCount(r.ms)} ms`),
      );
      // 쌍을 찾은 뒤 워커가 겹친 부피를 구하는 동안(쌍 목록은 먼저 보인다)
      if (st.running) kids.push(h('p', { class: 'hint' }, h('span', {}, '겹친 부피 계산 중…'), count));
      const LIMIT = 200;
      // 151차: 쌍 줄을 목록(role=list·listitem)으로 — 화면 읽기 프로그램이 쌍 수·차례를 읽는다(SKP 156차 꼴, ul·li가 아니라 스타일시트가 들지 않음).
      // 겹친 부피 줄이 없는 쌍은 이름 줄이 곧 항목, 있으면 두 줄을 한 항목 칸에 담는다(묶음은 블록이고 두 줄 선택자는 클래스뿐이라 모양 그대로)
      const items: HTMLElement[] = [];
      for (const p of r.pairs.slice(0, LIMIT)) {
        const label = interferenceLabel(d, p);
        const b = h('button', { type: 'button', class: 'link-btn', 'data-pair': label, title: p.inside ? '누르면 안쪽 부품을 강조하고 그것으로 맞춰 봅니다' : '누르면 교차하는 삼각형을 강조하고 두 부품으로 맞춰 봅니다' }, h('span', { translate: 'no' }, label));
        markPair(b, d.items?.label);
        b.addEventListener('click', () => this.host.showInterference(p));
        // 안에 든 쌍: 겉면이 만나지 않아 교차 삼각형 수 대신 "안에 듦"(앞이 안쪽 부품)
        const chip = p.inside ? h('span', { class: 'chip dim-chip', title: '앞 부품이 뒤 부품 안에 통째로 들었습니다(겉면은 만나지 않음)' }, '안에 듦') : h('span', { class: 'chip dim-chip', title: '교차하는 삼각형 쌍 수' }, fmtCount(p.count));
        const row = h('div', { class: `prop-row${p.volume === undefined ? '' : ' has-vol'}`, role: p.volume === undefined && 'listitem' }, b, chip);
        // 겹친 부피(두 그물이 닫힌 입체일 때 — 광선 표본 어림): 이름 아래 줄에, 어림 오차는 부피에 견준 몫을 유효 숫자 두 자리쯤으로(전체 값은 title)
        if (p.volume !== undefined) {
          const rel = p.volume && p.volumeErr ? (100 * p.volumeErr) / p.volume : 0;
          const text = `≈ ${f.vol(p.volume)}${rel > 0 ? ` ±${f.num(rel, Math.min(6, Math.max(1, 1 - Math.floor(Math.log10(rel)))))}%` : ''}`;
          items.push(h('div', { role: 'listitem' }, row, h('div', { class: 'vol-line', title: `겹친 부피 ≈ ${f.vol(p.volume)} ± ${f.vol(p.volumeErr ?? 0)}` }, h('span', {}, '겹친 부피'), ' ', h('span', { class: 'vol-val' }, text))));
        } else items.push(row);
      }
      if (items.length) kids.push(h('div', { role: 'list' }, ...items));
      // 140차: 자른 목록 밑에 남은 쌍 수(머리 줄의 「간섭」은 온 수 — 전에는 알리지 않았다)
      if (r.pairs.length > LIMIT) kids.push(h('p', { class: 'hint' }, `그 밖 ${fmtCount(r.pairs.length - LIMIT)}쌍은 목록에 넣지 않았습니다.`));
      if (inside) kids.push(h('p', { class: 'hint' }, '안에 든 부품은 바깥 부품에 가려 보이지 않을 수 있습니다 — X-ray 그리기나 나머지 흐리게로 보십시오.'));
      if (r.volumes?.done)
        kids.push(h('p', { class: 'hint' }, '겹친 부피(≈)는 화면 메시를 광선으로 훑은 어림값이고, ±는 어림 오차입니다.'));
      if (r.volumes?.left) kids.push(h('p', { class: 'hint' }, `시간 한도로 ${fmtCount(r.volumes.left)}쌍은 겹친 부피를 구하지 못했습니다.`));
      if (st.stopped) kids.push(h('p', { class: 'hint' }, '겹친 부피 계산을 멈췄습니다.'));
      if (!r.pairs.length) kids.push(h('p', { class: 'hint' }, '간섭을 찾지 못했습니다. 맞닿은 면·모서리는 간섭으로 치지 않습니다(닫히지 않은 면 모형은 안에 들었는지 보지 않습니다).'));
    }
    return section('간섭 검사', ...kids, h('div', { class: 'tree-tools' }, clear));
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
    this.tree = kit
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
    this.interferenceEl = null;
    if (d.interference) {
      this.interferenceEl = this.interferenceSection(d);
      this.body.append(this.interferenceEl);
    }

    // 부품별(묶음): 같은 이름의 부품 자리를 한꺼번에 숨기고 보인다
    // (표도 나무 조각의 가상 목록 — 이름이 모두 다른 큰 조립은 수천 줄)
    const groups = this.host.groups();
    if (groups.length > 1 && kit) {
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

  private renderLayers(d: StepDoc): void {
    const v = d.vis;
    const tools = h('div', { class: 'tree-tools' });
    const mk = (label: string, title: string, run: () => void) => {
      const b = h('button', { type: 'button', class: 'btn small', title }, label);
      b.addEventListener('click', run);
      tools.append(b);
    };
    mk('모두 켜기', '레이어를 모두 켭니다', () => this.host.setAllLayersVisible(true));
    mk('모두 끄기', '레이어를 모두 끕니다', () => this.host.setAllLayersVisible(false));
    const inLayer = new Set<string>();
    for (const l of d.layers) for (const id of l.itemIds) inLayer.add(id);
    const loose: string[] = [];
    for (const m of d.scene.meshes) if (!inLayer.has(m.id)) loose.push(m.id);
    for (const l of d.scene.lines) if (!inLayer.has(l.id)) loose.push(l.id);
    for (const p of d.scene.points ?? []) if (!inLayer.has(p.id)) loose.push(p.id);
    const tbody = h('tbody');
    // 파일 레이어의 이름·설명은 파일 글(번역하지 않음·방향 가둠·길이 한도 — ftext.ts). "(레이어 없음)"·그 설명은 화면 글
    const addRow = (idx: number, name: string, title: string, ids: string[], fileHidden: boolean, data = true) => {
      const on = v.layerOn(idx);
      const nm = data ? isolateText(name) : name;
      const cb = h('input', { type: 'checkbox', 'aria-label': `${nm} 레이어 보이기` });
      cb.checked = on;
      cb.addEventListener('change', () => this.host.setLayerVisible(idx, cb.checked));
      const label = `레이어 ${nm}`;
      const selected = d.items?.label === label;
      const tip = data ? isolateText(title) : title;
      // 182차(WCAG 4.1.2): 누르면 강조·다시 누르면 푸는 토글이라 강조(.sel)를 aria-pressed로도(전에는 화면 읽기에 강조가 드러나지 않았다 — PMI 이름 단추와 같은 꼴)
      const nameBtn = h('button', { type: 'button', class: `link-btn${selected ? ' sel' : ''}`, 'aria-pressed': String(selected), title: `${tip}${tip ? ' · ' : ''}누르면 이 레이어의 형상을 강조합니다(두 번 누르면 맞춰 보기)` }, data ? fileSpan(name) : h('span', {}, name));
      nameBtn.addEventListener('click', (ev) => {
        if (ev.detail === 2) this.host.selectItems(ids, label, true);
        else if (ev.detail <= 1) this.host.selectItems(selected ? null : ids, label);
      });
      tbody.append(
        h(
          'tr',
          { class: on ? '' : 'off' },
          h('td', {}, h('span', { class: 'check' }, cbHit(cb), nameBtn, fileHidden ? h('span', { class: 'chip dim-chip', title: '파일이 숨긴 레이어(INVISIBILITY)' }, '숨김') : null)),
          h('td', { class: 'num' }, fmtCount(ids.length)),
        ),
      );
    };
    d.layers.forEach((l, i) => addRow(i, l.name, l.description, l.itemIds, !l.visible));
    if (loose.length) addRow(NO_LAYER, '(레이어 없음)', '어느 레이어에도 들지 않은 형상', loose, false, false);
    this.body.append(
      section(
        `레이어 ${fmtCount(d.layers.length)}개`,
        tools,
        h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '레이어'), h('th', { class: 'num' }, '항목'))), tbody),
        h('p', { class: 'hint' }, 'PRESENTATION_LAYER_ASSIGNMENT로 묶은 형상입니다. 파일이 숨긴 레이어는 처음에 꺼져 있습니다.'),
      ),
    );
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

  private renderFoot(): void {
    const d = this.doc;
    const f = this.foot;
    f.innerHTML = '';
    if (!d) {
      f.hidden = true;
      return;
    }
    const lines: HTMLElement[] = [];
    const fm = this.host.fmt;
    const u = fm.unit;
    const p = d.pick;
    const fitBtn = (): HTMLButtonElement => {
      const b = h('button', { type: 'button', class: 'btn small foot-fit', title: '고른 것으로 맞춰 보기' });
      b.append(icon('focus', 14), h('span', {}, '고른 부품 보기'));
      b.addEventListener('click', () => this.host.fitSelection());
      return b;
    };
    if (p) {
      const node = d.selKey ? productAt(d.products, d.selKey) : null;
      // 윤곽선(모서리) 고르기의 id는 그물 id
      const item = p.kind === 'mesh' || p.kind === 'edge' ? d.scene.meshes.find((m) => m.id === p.id) : p.kind === 'line' ? d.scene.lines.find((l) => l.id === p.id) : d.scene.points?.find((x) => x.id === p.id);
      const pm = d.pmi.presentations.find((x) => x.id === p.id);
      const what = pm ? '고른 PMI ' : '고른 것 ';
      // 이름·자리 이름은 파일 글(ftext.ts), PMI 종류는 화면 글
      const name = pm ? [pm.name ? fileSpan(pm.name) : h('span', {}, pmiTypeLabel(pm.type)), h('span', { class: 'dim' }, ' · ', h('span', {}, pmiTypeLabel(pm.type)))] : node ? nodeNames(node) : [item ? h('span', {}, bodyTitle(d.products, d.scene, p.id, isolateText)) : fileSpan(p.id)];
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, what), ...name), fitBtn()));
      // 점·법선 조각을 따로 번역되게 나눈다
      const at = `${p.section ? '단면(자른 면) 위 점' : p.kind === 'edge' ? '모서리 위 점' : '점'} ${fm.pt(p.point)} ${u}`.trim();
      lines.push(h('div', { class: 'dim' }, h('span', {}, at), ...(p.normal ? [' · ', h('span', {}, `법선 ${fm.dir(p.normal)}`)] : [])));
      if (d.face) lines.push(...faceLines(d.face, fm));
      else if (d.edge) lines.push(...edgeLines(d.edge, fm));
    } else if (d.selKey) {
      const node = productAt(d.products, d.selKey);
      if (node) lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 제품 '), ...nodeNames(node)), fitBtn()));
    } else if (d.items) {
      // 묶음 이름표의 파일 글(레이어·PMI·간섭 쌍 이름)은 FSI…PDI로 갇혀 번역층이 틀 그대로 끼운다(ftext.ts) — 길이 한도는 이름표를 만들 때
      // 211차: 이름표는 앱 글 칸(i18n.ts uiTranslate — 「PMI {0}」 틀이 의미 PMI 종류도 옮김)
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 것 '), h('span', { 'data-i18n-ui': '' }, d.items.label), h('span', { class: 'dim' }, ` · ${fmtCount(d.items.ids.length)}개`)), fitBtn()));
    } else if (d.body) {
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 바디 '), h('span', {}, bodyTitle(d.products, d.scene, d.body, isolateText))), fitBtn()));
    }
    if (this.host.measuring && this.host.measureKind === 'entities') lines.push(...entityLines(d, fm, this.host.touch));
    else if (d.measure) {
      const m = d.measure;
      lines.push(h('div', {}, h('b', {}, '거리 '), fm.len(m.distance), h('span', { class: 'dim' }, ` · dx ${fm.lenNum(m.dx)} · dy ${fm.lenNum(m.dy)} · dz ${fm.lenNum(m.dz)}`)));
      const sp = snapPair(m);
      if (sp) lines.push(h('div', { class: 'dim' }, h('span', {}, sp[0]), ' → ', h('span', {}, sp[1])));
    } else if (this.host.measuring) lines.push(h('div', { class: 'dim' }, panelMeasureHint(this.host.touch)));
    f.hidden = !lines.length;
    f.append(...lines);
  }
}

/** 나무 마디 이름(파일 글)과 다르면 " · 자리 이름"(파일 글) 조각. 이름·제품 번호가 모두 없으면 "(이름 없음)"은 화면 글 */
export function nodeNames(n: ProductNode): HTMLElement[] {
  const l = nodeLabel(n);
  const name = n.name || n.productId ? fileSpan(l.name) : h('span', {}, l.name);
  return l.instance ? [name, h('span', { class: 'dim' }, ' · ', fileSpan(l.instance))] : [name];
}

/** 개체 측정 줄: 누른 개체(A·B — 이름과 주요 치수)와 결과(이름표 값), 아직이면 안내 */
function entityLines(d: StepDoc, f: Fmt, touch: boolean): HTMLElement[] {
  const { picks, result } = d.ent;
  const out: HTMLElement[] = [];
  picks.forEach((p, i) => {
    const main = p.face ? faceSummary(p.face, f).main : p.edge && p.what === 'edge' ? edgeSummary(p.edge, f).main : null;
    out.push(h('div', { class: 'foot-face' }, h('b', {}, i ? 'B ' : 'A '), h('span', {}, p.title), main ? h('span', { class: 'dim' }, ` ${main}`) : null));
  });
  if (result) for (const l of result.lines) out.push(h('div', {}, h('b', {}, l.label), ` ${lineValue(l, f)}`));
  else out.push(h('div', { class: 'dim' }, entityHint(picks.length, touch)));
  return out;
}

/** 고른 모서리 정보 줄: 종류·STEP 번호, 길이(곡선 적분)·지름·반지름·중심·축·호 각, 두 끝점 */
function edgeLines(ep: EdgePick, f: Fmt): HTMLElement[] {
  const out: HTMLElement[] = [h('div', { class: 'foot-face' }, h('b', {}, '고른 모서리 '), edgeTitle(ep), h('span', { class: 'dim' }, ` · #${ep.stepId} · 선분 ${fmtCount(ep.segCount)}`))];
  const geo: string[] = [`길이 ${f.len(ep.length)}`];
  if (ep.radius !== undefined) {
    if (ep.kind === 'circle') geo.push(`반지름 ${f.len(ep.radius)}`, `지름 ${f.len(ep.radius * 2)}`);
    else geo.push(`긴 반지름 ${f.len(ep.radius)}`);
  }
  if (ep.minorRadius !== undefined) geo.push(`짧은 반지름 ${f.len(ep.minorRadius)}`);
  if (ep.kind === 'circle' && !isFullCircle(ep) && ep.sweepDeg !== undefined) geo.push(`호 각 ${f.deg(ep.sweepDeg)}`);
  if (ep.center) geo.push(`중심 ${f.pt(ep.center)}`);
  if (ep.axis) geo.push(`축 ${f.dir(ep.axis)}`);
  out.push(h('div', { class: 'dim' }, ...geo.flatMap((g, i) => (i ? [' · ', h('span', {}, g)] : [h('span', {}, g)]))));
  if (!isFullCircle(ep)) out.push(h('div', { class: 'dim' }, h('span', {}, `시작 ${f.pt(ep.ends[0])}`), ' · ', h('span', {}, `끝 ${f.pt(ep.ends[1])}`)));
  return out;
}

/** 고른 면 정보 줄 */
function faceLines(fp: FacePick, f: Fmt): HTMLElement[] {
  const out: HTMLElement[] = [h('div', { class: 'foot-face' }, h('b', {}, '고른 면 '), faceKindLabel(fp.kind), h('span', { class: 'dim' }, ` · #${fp.stepId} · 삼각형 ${fmtCount(fp.triangles)}`))];
  const geo: string[] = [];
  if (fp.radius !== undefined) geo.push(`${fp.kind === 'torus' ? '큰 반지름' : '반지름'} ${f.len(fp.radius)}`);
  if (fp.minorRadius !== undefined) geo.push(`작은 반지름 ${f.len(fp.minorRadius)}`);
  if (fp.halfAngleDeg !== undefined) geo.push(`반각 ${f.deg(fp.halfAngleDeg)}`);
  if (fp.radius !== undefined && (fp.kind === 'cylinder' || fp.kind === 'sphere')) geo.push(`지름 ${f.len(fp.radius * 2)}`);
  if (fp.normal) geo.push(`법선 ${f.dir(fp.normal)}`);
  if (fp.axis) geo.push(`축 ${f.dir(fp.axis)}`);
  if (fp.origin && fp.kind !== 'plane') geo.push(`${fp.kind === 'sphere' || fp.kind === 'torus' ? '중심' : '축 위 점'} ${f.pt(fp.origin)}`);
  // 조각마다 따로 번역되게(반지름 …·지름 …·축 …) 글 마디를 나눈다
  if (geo.length) out.push(h('div', { class: 'dim' }, ...geo.flatMap((g, i) => (i ? [' · ', h('span', {}, g)] : [h('span', {}, g)]))));
  const approx = fp.exact ? '' : '≈ ';
  out.push(h('div', { class: 'dim', title: fp.exact ? null : '화면용 삼각형으로 잰 근삿값입니다(B-스플라인 등).' }, `넓이 ${approx}${f.area(fp.area)} · 둘레 ${approx}${f.len(fp.perimeter)}`));
  return out;
}
