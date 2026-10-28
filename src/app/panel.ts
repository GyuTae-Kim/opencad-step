/**
 * 오른쪽 패널(폭 760px 미만이면 아래 시트): 제품 탭(이름 거르기·제품 나무·부품별 보이기), 레이어 탭(있을 때),
 * PMI 탭(있을 때 — 표현 PMI 켜고 끄기, 의미 PMI 목록), 정보 탭(파일 머리·단위·통계·경고).
 * 아래 띠에는 고른 것(3D 고르기·나무 고르기·고른 면·레이어/PMI 고르기)과 측정 결과를 늘 보인다.
 * 패널 가장자리를 끌어 폭(시트는 높이)을 바꾼다(resize.ts).
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import type { StepSavedView } from '../scene';
import type { InterferencePair } from './interference';
import type { Fmt } from './display';
import { bodyName, bodyTitle, hasBodies, instanceCounts, itemById, meshById, nodeItems, productAt, productCountKey, productKeyOf, propsPendingFor, sceneCounts, schemaSummary, selectedBody, subtreeMeshIds, unitLabel, wireLabel, type PanelTab, type StepDoc, TREE_LIMIT } from './doc';
import { nodePath, partRows, type PropRow } from './partinfo';
import { accuracyText, inertiaText, MATERIALS, massText, meshNodes, physProps } from './physics';
import { sceneMm } from './display';
import { selectRow } from './dialog';
import { warningNodes } from './warnparts';
import { isFullCircle, type EdgePick } from './edges';
import { faceKindLabel, type FacePick } from './faces';
import { formatBytes, formatMs, fmtCount } from './format';
import { lineValue } from './entpick';
import { edgeSummary, edgeTitle, entityHint, faceSummary, panelMeasureHint } from './measure';
import { snapPair } from './snap';
import { allExpandableKeys, filterRows, nodeInstances, nodeLabel, nodeVisible, toggleKey, visibleRows, type TreeRow } from './tree';
import { NO_LAYER } from './visibility';

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

/** 간섭 한 쌍의 이름표(고른 묶음 이름과 같다): "A ↔ B" — 안에 든 쌍은 앞이 안쪽 부품 */
export function interferenceLabel(d: StepDoc, p: InterferencePair): string {
  const name = (id: string) => meshById(d.scene, id)?.name ?? id;
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

const row = (k: string, v: string, title?: string): HTMLElement =>
  h('div', { class: 'prop-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v', title: title ?? v }, v));

/** 속성 줄(파일 글은 번역하지 않는다) */
const propRow = (r: PropRow): HTMLElement =>
  h('div', { class: 'prop-row' }, h('span', { class: 'k', translate: r.kData ? 'no' : null }, r.k), h('span', { class: 'v', title: r.v, translate: r.vData ? 'no' : null }, r.v));

const section = (title: string, ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, title), ...children.filter((c): c is HTMLElement => !!c));

export class Panel {
  readonly el: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly foot: HTMLElement;
  private doc: StepDoc | null = null;
  /** 지금 그린 나무의 펼침(같으면 고르기만 바꿀 때 줄 표시만 고친다) */
  private drawnExpanded: Set<string> | null = null;
  /** 지금 그린 나무 줄(열쇠 → 줄 — 고르기만 바뀔 때 줄 표시를 고친다) */
  private drawnRows = new Map<string, TreeRow>();
  private filterTimer = 0;
  /** 제품 탭의 간섭 검사 묶음(진행률만 바뀌면 이것만 다시 그린다) */
  private interferenceEl: HTMLElement | null = null;
  /** 속성 탭의 물리 속성 묶음(질량 속성 적분 진행에 따라 그것만 고친다 — onProps), 그 고른 것, "계산 중"을 보였는지, 다시 만들기 */
  private physEl: HTMLElement | null = null;
  private physSel: ReadonlySet<string> | null = null;
  private physWaiting = false;
  private physRebuild: (() => HTMLElement) | null = null;

  constructor(private readonly host: PanelHost) {
    this.tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '패널 탭' });
    const close = h('button', { type: 'button', class: 'icon-btn', title: '패널 닫기', 'aria-label': '패널 닫기' });
    close.append(icon('close', 16));
    close.addEventListener('click', () => this.host.togglePanel(false));
    this.body = h('div', { class: 'panel-body', role: 'tabpanel' });
    this.foot = h('div', { class: 'panel-foot', 'aria-live': 'polite', hidden: true });
    this.el = h('aside', { class: 'panel', 'aria-label': '제품·정보 패널', hidden: true }, h('div', { class: 'panel-head' }, this.tabsEl, close), this.body, this.foot);
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
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** 고른 것이 바뀜: 나무(펼침이 그대로면 줄 표시만) 고치고 고른 줄을 보이게 */
  onSelection(reveal = false): void {
    const d = this.doc;
    if (!d) return;
    if (d.panelTab === 'tree') {
      if (!this.patchTreeSelection()) this.renderBody();
    } else if (d.panelTab === 'layers' || d.panelTab === 'pmi' || d.panelTab === 'props') this.renderBody();
    // 고른 줄(몸체 줄이 있으면 그 줄 — 부품 줄의 일부 고름 표시보다 먼저)
    if (reveal) (this.body.querySelector('.tree-row.sel') ?? this.body.querySelector('.tree-row.part-sel'))?.scrollIntoView({ block: 'nearest' });
    this.renderFoot();
  }

  onMeasure(): void {
    this.renderFoot();
  }

  /** 간섭 검사 진행·결과가 바뀜: 제품 탭의 그 묶음만 다시 그린다(없으면 탭을 다시 그림) */
  onInterference(): void {
    const d = this.doc;
    if (!d || d.panelTab !== 'tree') return;
    if (this.interferenceEl && d.interference) {
      const el = this.interferenceSection(d);
      this.interferenceEl.replaceWith(el);
      this.interferenceEl = el;
    } else this.renderBody();
  }

  private interferenceSection(d: StepDoc): HTMLElement {
    const st = d.interference!;
    const kids: HTMLElement[] = [];
    const clear = h('button', { type: 'button', class: 'btn small' }, st.running ? '멈추기' : '결과 지우기');
    clear.addEventListener('click', () => this.host.clearInterference());
    if (st.running) kids.push(h('p', { class: 'hint' }, h('span', {}, '검사 중…'), ` ${st.total ? `${fmtCount(st.done)} / ${fmtCount(st.total)}` : ''}`));
    else if (st.error) kids.push(h('p', { class: 'hint' }, h('span', {}, '검사하지 못했습니다:'), ` ${st.error}`));
    else if (st.result) {
      const r = st.result;
      const inside = r.pairs.filter((p) => p.inside).length;
      kids.push(
        h('p', { class: 'hint' }, h('span', {}, '범위가 겹친 쌍'), ` ${fmtCount(r.tested)} · `, h('span', {}, '간섭'), ` ${fmtCount(r.pairs.length)}`, ...(inside ? [' · ', h('span', {}, `안에 듦 ${fmtCount(inside)}`)] : []), ` · ${fmtCount(r.ms)} ms`),
      );
      const LIMIT = 200;
      for (const p of r.pairs.slice(0, LIMIT)) {
        const label = interferenceLabel(d, p);
        const sel = d.items?.label === label;
        const b = h('button', { type: 'button', class: `link-btn${sel ? ' sel' : ''}`, title: p.inside ? '누르면 안쪽 부품을 강조하고 그것으로 맞춰 봅니다' : '누르면 교차하는 삼각형을 강조하고 두 부품으로 맞춰 봅니다' }, h('span', { translate: 'no' }, label));
        b.addEventListener('click', () => this.host.showInterference(p));
        // 안에 든 쌍: 겉면이 만나지 않아 교차 삼각형 수 대신 "안에 듦"(앞이 안쪽 부품)
        const chip = p.inside ? h('span', { class: 'chip dim-chip', title: '앞 부품이 뒤 부품 안에 통째로 들었습니다(겉면은 만나지 않음)' }, '안에 듦') : h('span', { class: 'chip dim-chip', title: '교차하는 삼각형 쌍 수' }, fmtCount(p.count));
        kids.push(h('div', { class: 'prop-row' }, b, chip));
      }
      if (inside) kids.push(h('p', { class: 'hint' }, '안에 든 부품은 바깥 부품에 가려 보이지 않을 수 있습니다 — X-ray 그리기나 나머지 흐리게로 보십시오.'));
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

  /** 보이기/숨기기가 바뀜 */
  onVisibility(): void {
    const t = this.doc?.panelTab;
    if (t === 'tree' || t === 'layers' || t === 'pmi') this.renderBody();
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
    this.tabsEl.innerHTML = '';
    if (!d) {
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
    for (const [k, label] of tabs) {
      const on = k === d.panelTab;
      const b = h('button', { type: 'button', class: `tab${on ? ' active' : ''}`, role: 'tab', 'aria-selected': String(on), id: `tab-${k}` }, label);
      b.addEventListener('click', () => this.setTab(k));
      this.tabsEl.append(b);
    }
    this.body.setAttribute('aria-labelledby', `tab-${d.panelTab}`);
    this.renderBody();
    this.renderFoot();
  }

  private renderBody(): void {
    const d = this.doc;
    if (!d) return;
    const scroll = this.body.scrollTop;
    // 거르기 칸에 초점이 있으면 다시 그린 뒤 돌려준다
    const active = document.activeElement as HTMLInputElement | null;
    const refocus = active?.classList?.contains('tree-filter') ? { start: active.selectionStart, end: active.selectionEnd } : null;
    this.body.innerHTML = '';
    this.drawnExpanded = null;
    if (d.panelTab === 'tree') this.renderTree(d);
    else if (d.panelTab === 'layers') this.renderLayers(d);
    else if (d.panelTab === 'pmi') this.renderPmi(d);
    else if (d.panelTab === 'props') this.renderProps(d);
    else this.renderInfo(d);
    this.body.scrollTop = scroll;
    if (refocus) {
      const inp = this.body.querySelector<HTMLInputElement>('.tree-filter');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(refocus.start, refocus.end);
      }
    }
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
    const picked = treePicked(d);
    let found = !d.selKey && !selectedBody(d);
    for (const el of this.body.querySelectorAll<HTMLElement>('.tree-row')) {
      const r = this.drawnRows.get(el.dataset.key ?? '');
      if (!r) continue;
      const [sel, part] = rowMarks(d, r, picked);
      if (sel || part) found = true;
      markRow(el, sel, part);
    }
    return found;
  }

  private renderTree(d: StepDoc): void {
    const roots = d.products;
    if (!roots.length) {
      this.body.append(h('p', { class: 'empty' }, '이 파일에는 제품 구조 정보가 없습니다.'));
      return;
    }
    const counts = instanceCounts(d.info);
    const filtering = !!d.treeFilter.trim();
    const res = filtering ? filterRows(roots, d.treeFilter, d.expanded, d.treeLimit, (n, i) => bodyName(n, itemById(d.scene, nodeItems(n)[i]!)?.[0], i >= n.meshIds.length)) : { ...visibleRows(roots, d.expanded, d.treeLimit), matches: -1 };
    const { rows, truncated, total } = res;

    // 이름 거르기
    const input = h('input', {
      type: 'search',
      class: 'tree-filter',
      placeholder: '이름·자리 이름·제품 번호로 거르기',
      'aria-label': '제품 나무 이름 거르기',
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
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && input.value) {
        ev.preventDefault();
        ev.stopPropagation();
        input.value = '';
        d.treeFilter = '';
        this.renderBody();
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        (this.body.querySelector('.tree-row') as HTMLElement | null)?.focus();
      }
    });
    const search = h('label', { class: 'tree-search' }, icon('search', 15), input);
    const filterInfo = filtering ? h('p', { class: 'hint filter-info' }, res.matches ? `맞는 마디 ${fmtCount(res.matches)}개 (조상 마디와 함께 보입니다)` : '맞는 마디가 없습니다.') : null;

    const tools = h('div', { class: 'tree-tools' });
    const mk = (label: string, title: string, run: () => void) => {
      const b = h('button', { type: 'button', class: 'btn small', title }, label);
      b.addEventListener('click', run);
      tools.append(b);
    };
    mk('모두 펼치기', '제품 나무를 모두 펼칩니다', () => {
      d.expanded = allExpandableKeys(roots);
      this.renderBody();
    });
    mk('모두 접기', '제품 나무를 모두 접습니다', () => {
      d.expanded = new Set();
      d.treeLimit = TREE_LIMIT;
      this.renderBody();
    });
    mk('모두 보이기', '숨긴 부품을 모두 다시 보입니다(레이어로 끈 것은 레이어 탭에서 켭니다)', () => this.host.showAll());
    if (d.scene.meshes.length > 1) mk('간섭 검사', '보이는 부품끼리 서로 뚫고 지나가거나 한 부품이 다른 부품 안에 든 곳을 찾습니다(맞닿음은 간섭이 아님)', () => this.host.runInterference());

    const list = h('div', { class: 'tree', role: 'tree', 'aria-label': '제품 나무' });
    const picked = treePicked(d);
    this.drawnRows = new Map(rows.map((r) => [r.key, r]));
    for (const r of rows) list.append(this.treeRow(d, r, counts, picked));
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
    this.body.append(section('제품 나무', search, filterInfo, tools, list, more));
    if (!filtering) this.drawnExpanded = new Set(d.expanded);
    this.interferenceEl = null;
    if (d.interference) {
      this.interferenceEl = this.interferenceSection(d);
      this.body.append(this.interferenceEl);
    }

    // 부품별(묶음): 같은 이름의 부품 자리를 한꺼번에 숨기고 보인다
    const groups = this.host.groups();
    if (groups.length > 1) {
      const tbody = h('tbody');
      for (const g of groups) {
        const cb = h('input', { type: 'checkbox', 'aria-label': `${g.name} 보이기` });
        cb.checked = g.visible;
        cb.addEventListener('change', () => this.host.setGroupVisible(g.name, cb.checked));
        tbody.append(h('tr', { class: g.visible ? '' : 'off' }, h('td', {}, h('label', { class: 'check' }, cb, h('span', { translate: 'no' }, g.name))), h('td', { class: 'num' }, fmtCount(g.count))));
      }
      this.body.append(section('부품별 보이기', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '부품'), h('th', { class: 'num' }, '자리'))), tbody)));
    }
  }

  private treeRow(d: StepDoc, r: TreeRow, counts: Map<string, number>, picked: Set<string> | null): HTMLElement {
    const bodyId = r.body === undefined ? null : r.itemIds[0]!;
    const found = bodyId ? itemById(d.scene, bodyId) : undefined;
    // 몸체 줄 이름: 형상 항목 이름(파일 글), 없으면 "몸체 2"·"선 형상 1"(부품 마디 바로 아래라 부품 이름은 되풀이하지 않는다 — 말풍선에 "부품 · 몸체 2")
    const bname = bodyId ? bodyName(r.node, found?.[0], r.wire !== undefined) : '';
    const generic = r.wire !== undefined ? wireLabel(r.node, undefined, found?.[1], r.wire) : `몸체 ${r.body}`;
    const { name, instance } = bodyId ? { name: bname || generic, instance: '' } : nodeLabel(r.node);
    const visible = nodeVisible(r.itemIds, (id) => this.host.isVisible(id));
    // 고름 · 이 부품의 몸체 일부만 고름(몸체 단위 고르기·몸체 줄·여러 개 고르기 — 줄에 옅게 표시)
    const [sel, part] = rowMarks(d, r, picked);
    const tog = h('button', { type: 'button', class: `twisty${bodyId ? ' body-mark' : ''}`, tabindex: '-1', 'aria-hidden': 'true', disabled: !r.hasChildren });
    if (r.hasChildren) tog.append(icon(r.open ? 'chevronDown' : 'chevronRight', 14));
    else if (bodyId) tog.append(icon(r.wire !== undefined ? 'wire' : 'body', 13));
    tog.addEventListener('click', (ev) => {
      ev.stopPropagation();
      d.expanded = toggleKey(d.expanded, r.key);
      this.renderBody();
    });
    const eye = h('button', {
      type: 'button',
      class: `eye${visible ? '' : ' off'}`,
      title: visible ? '숨기기' : '보이기',
      'aria-label': `${name} ${visible ? '숨기기' : '보이기'}`,
      'aria-pressed': String(!visible),
      disabled: !r.itemIds.length,
    });
    eye.append(icon(visible ? 'eye' : 'eyeOff', 15));
    eye.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.host.setItemsVisible(r.itemIds, !visible);
    });
    const n = bodyId ? 0 : nodeInstances(r.node, counts);
    const lines = r.node.lineIds?.length ?? 0;
    // 말풍선은 bodyTitle과 같은 글("부품 / 항목" 또는 "부품 · 몸체 2") — 줄마다 나무를 다시 훑지 않게 줄의 마디로 바로 만든다
    const tip = bodyId
      ? r.wire !== undefined
        ? [bname ? `${r.node.name} / ${bname}` : `${r.node.name} · ${generic}`, '두 번 누르면 이 선 형상으로 맞춰 봅니다']
        : [bname ? found![0].name! : `${r.node.name} · ${generic}`, '두 번 누르면 이 몸체로 맞춰 봅니다']
      : [r.node.productId ? `제품 번호 ${r.node.productId}` : '', `형상 ${r.node.meshIds.length}개`, lines ? `선 형상 ${lines}개` : '', '두 번 누르면 이 부품으로 맞춰 봅니다'];
    const item = h(
      'div',
      {
        class: `tree-row${bodyId ? ' body-row' : ''}${sel ? ' sel' : part ? ' part-sel' : ''}${visible ? '' : ' hidden-node'}${r.match ? ' match' : ''}`,
        role: 'treeitem',
        'aria-level': String(r.depth + 1),
        'aria-selected': String(sel),
        'aria-expanded': r.hasChildren ? String(r.open) : null,
        tabindex: '0',
        style: `--depth:${r.depth}`,
        title: tip.filter(Boolean).join(' · '),
        'data-key': r.key,
      },
      tog,
      eye,
      // 이름 없는 몸체 줄의 "몸체 2"·"선 형상 1"은 화면 글이라 번역층이 옮긴다(파일 이름인 .tree-name은 건너뛴다)
      bodyId && !bname ? h('span', { class: 'tree-name-gen' }, name) : h('span', { class: 'tree-name', translate: bname ? 'no' : null }, name, instance ? h('span', { class: 'dim' }, ` · ${instance}`) : null),
      n > 1 ? h('span', { class: 'chip', title: `이 부품이 모형에 ${n}번 놓였습니다` }, `×${n}`) : null,
    );
    // 이 줄 고르기·맞춰 보기(몸체 줄은 그 몸체 하나, 마디 줄은 그 마디 아래 통째)
    const isSel = () => (bodyId ? selectedBody(d) === bodyId : d.selKey === r.key);
    const select = (on: boolean) => (bodyId ? this.host.selectBody(on ? bodyId : null) : this.host.selectKey(on ? r.key : null));
    const fit = () => (bodyId ? this.host.fitBody(bodyId) : this.host.fitKey(r.key));
    // 첫 누르기에 나무를 다시 그릴 수 있으므로 dblclick 대신 누른 횟수(detail)로 두 번 누르기를 가린다
    item.addEventListener('click', (ev) => {
      // Ctrl·⌘·Shift + 누르기(여러 개 고르기 모드면 그냥 누르기): 이 마디 아래 형상(몸체 줄은 그 몸체)을 여러 개 고르기에 더하거나 뺀다
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || this.host.multiPick) {
        if (ev.detail <= 1) this.host.toggleInSelection(r.itemIds);
        return;
      }
      if (ev.detail === 2) fit();
      else if (ev.detail <= 1) select(!isSel());
    });
    // 오른쪽 누르기(휴대폰은 길게 누르기)로 그 마디를 고르고 작업 메뉴
    item.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // 여러 개 고르기 중에는 이 마디를 모은 것에 더해(이미 있으면 그대로) 메뉴가 모은 것 전체에 쓰이게 한다
      if (this.host.multiPick) {
        if (!rowMarks(d, r, treePicked(d))[0]) this.host.toggleInSelection(r.itemIds);
      } else if (!isSel()) select(true);
      this.host.openContextMenu(ev.clientX, ev.clientY);
    });
    item.addEventListener('keydown', (ev) => {
      const refocus = () => (this.body.querySelector(`.tree-row[data-key="${r.key}"]`) as HTMLElement | null)?.focus();
      if (ev.key === 'Enter') {
        // Enter: 고르기, 이미 골랐으면 맞춰 보기
        ev.preventDefault();
        if (isSel()) fit();
        else select(true);
        refocus();
      } else if (ev.key === ' ') {
        ev.preventDefault();
        select(!isSel());
        refocus();
      } else if ((ev.key === 'ArrowRight' && r.hasChildren && !r.open) || (ev.key === 'ArrowLeft' && r.open)) {
        ev.preventDefault();
        d.expanded = toggleKey(d.expanded, r.key);
        this.renderBody();
        refocus();
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const sib = ev.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling;
        if (sib) (sib as HTMLElement).focus();
        else if (ev.key === 'ArrowUp') this.body.querySelector<HTMLInputElement>('.tree-filter')?.focus();
      }
    });
    return item;
  }

  // ───────────────────────── 속성 탭 ─────────────────────────

  /** 속성을 보일 나무 마디 열쇠: 나무에서 고른 마디, 아니면 3D에서 고른 그물(나무에서 고른 몸체)의 마디 */
  private propsKey(d: StepDoc): string | null {
    if (d.selKey) return d.selKey;
    const id = d.pick?.id ?? (d.items ? null : d.body);
    return id ? productKeyOf(d.products, id) : null;
  }

  private renderProps(d: StepDoc): void {
    const key = this.propsKey(d);
    const path = key ? nodePath(d.products, key) : [];
    const node = path[path.length - 1];
    if (!node && !d.items) this.body.append(section('속성', h('p', { class: 'hint' }, '부품을 고르면(3D에서 누르거나 제품 나무에서) 그 부품의 속성을 보입니다. Ctrl·⌘·Shift를 누른 채 누르거나 "여러 개 고르기"를 켜면 여러 개를 고릅니다.')));
    else if (!node) this.body.append(section('속성', h('p', { class: 'hint' }, '여러 개를 골랐습니다 — 아래 물리 속성은 고른 것의 합입니다.')));
    else {
      const count = instanceCounts(d.info).get(productCountKey(node.name, node.productId)) ?? 1;
      this.body.append(section('부품 속성', ...partRows(path, this.host.fmt, count).map(propRow)));
    }
    // 몸체 단위로 고른 몸체(나무 마디 대신 그물 하나): 부품 속성은 그 부품, 물리 속성은 그 몸체만. 선 형상 몸체는 물리 속성이 없다
    const pid = selectedBody(d);
    const all = node ? subtreeMeshIds(node) : null;
    const body = pid && all && all.length > 1 && all.includes(pid) ? meshById(d.scene, pid) : undefined;
    if (body) this.body.append(this.physSection(d, [body.id], bodyTitle(d.products, d.scene, body.id)));
    else if (pid && node?.lineIds?.includes(pid) && hasBodies(node))
      this.body.append(section('물리 속성', h('p', { class: 'hint' }, '선 형상에는 부피·질량이 없습니다 — 부품 줄을 고르면 부품의 물리 속성을 봅니다.')));
    else this.body.append(this.physSection(d, all ?? (d.items ? d.items.ids : null), d.items && !node ? d.items.label : undefined));
  }

  /** 물리 속성 묶음: 고른 부품(없으면 모형 전체)의 부피·겉넓이·질량·무게중심·외형 크기와 재질 고르기 */
  private physSection(d: StepDoc, ids: string[] | null, multi?: string): HTMLElement {
    const f = this.host.fmt;
    const owner = meshNodes(d.products);
    const sel = ids ? new Set(ids) : null;
    // 질량 속성(곡면 적분)을 워커가 아직 구하는 중인 입체가 있으면 부피·질량·무게중심·관성은 "계산 중"
    const missing = propsPendingFor(d, sel);
    const waiting = missing && d.props.state === 'running';
    this.physWaiting = waiting;
    const pp = physProps(d.scene.meshes, sel, {
      faces: d.faces,
      sceneMm: sceneMm(d.scene.units),
      densityOf: (id) => owner.get(id)?.props?.density,
      picked: d.density,
    });
    const u = f.unit ? ` ${f.unit}` : '';
    const rows: HTMLElement[] = [];
    const r = (k: string, v: string, title?: string) => rows.push(h('div', { class: 'prop-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v', title: title ?? v, translate: 'no' }, v)));
    // 계산 중인 값(번역되는 글이라 값 칸을 번역층에 맡긴다)
    const busy = (k: string) => rows.push(h('div', { class: 'prop-row pending' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, '계산 중…')));
    // 부피·질량·관성: B-rep 곡면 적분이 정확하면 그대로, 아니면 ≈(정확도 줄에 어림 오차)
    const ax = pp.exact ? '' : '≈ ';
    if (pp.closed) {
      if (waiting) busy('부피');
      else r('부피', `${ax}${f.vol(pp.volume)}`);
    }
    r('겉넓이', `${pp.areaExact ? '' : '≈ '}${f.area(pp.area)}`);
    if (pp.mass !== null) {
      if (waiting) busy('질량');
      else r('질량', `${ax}${massText(pp.mass, (v, dg) => f.num(v, dg))}`);
    }
    if (pp.centroid) {
      if (waiting) busy('무게중심');
      else r('무게중심', `${f.pt(pp.centroid)}${u}`);
    }
    // 관성 모멘트(무게중심 기준, 질량을 알 때만): 주 관성 모멘트 셋과 장면 축 대각 성분
    const it = waiting ? null : pp.inertia;
    if (waiting && pp.inertia) busy('주 관성 모멘트');
    if (it) {
      const t = (v: number) => inertiaText(v, (x, dg) => f.num(x, dg));
      r('주 관성 모멘트', `${ax}${it.principal.map(t).join(' · ')}`, `I1 · I2 · I3 (무게중심 기준, 작은 것부터)`);
      r('관성 Ixx · Iyy · Izz', `${ax}${it.tensor.slice(0, 3).map(t).join(' · ')}`);
    }
    // 정확도(번역되는 글이라 값 칸을 번역층에 맡긴다). 계산 중이면 끝낸 입체 수
    if (pp.closed) {
      const acc = waiting
        ? { text: `곡면 적분 계산 중(입체 ${fmtCount(d.props.done)}/${fmtCount(d.props.total)})`, title: '문서를 연 뒤 닫힌 입체의 부피·모멘트를 B-rep 곡면과 모서리 곡선에서 따로 적분하고 있습니다.' }
        : accuracyText(pp, (v, dg) => f.num(v, dg));
      rows.push(h('div', { class: `prop-row${waiting ? ' pending acc' : ''}` }, h('span', { class: 'k' }, '정확도'), h('span', { class: 'v', title: acc.title }, acc.text)));
    }
    const b = pp.bounds;
    if (b) r('외형 크기', `≈ ${f.lenNum(b.max[0] - b.min[0])} × ${f.lenNum(b.max[1] - b.min[1])} × ${f.lenNum(b.max[2] - b.min[2])}${u}`);
    r('닫힌 입체 · 열린 그물', `${fmtCount(pp.closed)} · ${fmtCount(pp.open)}`);
    const notes: (HTMLElement | null)[] = [];
    if (!pp.closed) notes.push(h('p', { class: 'hint' }, '닫힌 입체가 없어 부피·질량·무게중심을 구하지 못했습니다(열린 면·얇은 판).'));
    else if (pp.open) notes.push(h('p', { class: 'hint' }, '열린 그물(닫히지 않은 면)은 부피·질량에서 뺐습니다.'));
    if (pp.closed && pp.mass === null) notes.push(h('p', { class: 'hint' }, '파일에 밀도가 없습니다 — 아래에서 재질을 고르면 질량과 관성 모멘트를 보입니다.'));
    else if (pp.noDensity) notes.push(h('p', { class: 'hint' }, '밀도를 모르는 입체가 있어 질량에서 뺐습니다 — 재질을 고르면 함께 더합니다.'));
    if (pp.timedOut) notes.push(h('p', { class: 'hint' }, '파일이 커서 시간 한도를 넘은 입체는 곡면 적분 대신 화면용 삼각형으로 구했습니다.'));
    if (missing && d.props.state === 'stopped') notes.push(h('p', { class: 'hint' }, '다른 파일을 여느라 곡면 적분을 멈췄습니다 — 적분하지 못한 입체는 화면용 삼각형으로 잰 근삿값입니다. 이 파일을 다시 열면 다시 구합니다.'));
    // 재질 고르기(파일에 밀도가 없는 부품에 쓴다)
    const opts: [string, string][] = [['', '고르지 않음'], ...MATERIALS.map(([name, rho]): [string, string] => [String(rho), `${name} · ${f.num(rho / 1000, 2)} g/cm³`])];
    const cur = d.density === null ? '' : MATERIALS.some(([, rho]) => rho === d.density) ? String(d.density) : 'custom';
    if (cur === 'custom') opts.push(['custom', `${f.num(d.density! / 1000, 3)} g/cm³`]);
    const pick = selectRow('재질(밀도가 없는 부품)', opts, cur, (v) => {
      if (v !== 'custom') this.host.setDensity(v ? Number(v) : null);
    });
    // 밀도 직접 넣기(g/cm³)
    const inp = h('input', { type: 'number', class: 'dlg-input', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': '밀도 직접 입력(g/cm³)', placeholder: 'g/cm³' }) as HTMLInputElement;
    if (d.density !== null) inp.value = String(Number((d.density / 1000).toPrecision(6)));
    inp.addEventListener('change', () => {
      const g = Number(inp.value.replace(',', '.'));
      this.host.setDensity(Number.isFinite(g) && g > 0 ? g * 1000 : null);
    });
    const custom = h('label', { class: 'dlg-row' }, h('span', { class: 'dlg-label' }, '밀도 직접 입력(g/cm³)'), inp);
    const el = section(
      multi ? `물리 속성 · ${multi}` : ids ? '물리 속성' : '모형 전체 물리 속성',
      ...rows,
      ...notes,
      pick,
      custom,
      h(
        'p',
        { class: 'hint' },
        '부피·질량·무게중심·관성 모멘트는 B-rep 곡면과 모서리 곡선을 적분해 구합니다. 평면·원기둥·원뿔·구·원환으로 된 입체는 정확하고, B-스플라인 같은 곡면이 섞이면 그 면만 화면용 삼각형으로 재어 어림 오차를 ±로 보입니다. 외형 크기는 화면용 삼각형으로 잰 값(≈)입니다. 겉넓이는 B-rep 면 넓이의 합이며 근삿값이 섞이면 ≈를 붙입니다.',
      ),
    );
    this.physEl = el;
    this.physSel = sel;
    this.physRebuild = () => this.physSection(d, ids, multi);
    return el;
  }

  /**
   * 질량 속성 적분 진행이 바뀜(워커): 속성 탭의 물리 속성 묶음만 고친다. 계산 중이던 고른 것이 그대로 계산 중이면 끝낸 입체 수 글만,
   * 값이 다 왔거나 멈췄으면 묶음을 다시 그린다(재질 고르기 칸 등 나머지는 그대로)
   */
  onProps(): void {
    const d = this.doc;
    const el = this.physEl;
    if (!d || d.panelTab !== 'props' || !el?.isConnected || !this.physRebuild) return;
    const still = propsPendingFor(d, this.physSel) && d.props.state === 'running';
    if (still && this.physWaiting) {
      const v = el.querySelector('.prop-row.pending.acc .v');
      if (v) v.textContent = `곡면 적분 계산 중(입체 ${fmtCount(d.props.done)}/${fmtCount(d.props.total)})`;
      return;
    }
    if (!still && !this.physWaiting) return;
    const next = this.physRebuild();
    el.replaceWith(next);
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
    const addRow = (idx: number, name: string, title: string, ids: string[], fileHidden: boolean) => {
      const on = v.layerOn(idx);
      const cb = h('input', { type: 'checkbox', 'aria-label': `${name} 레이어 보이기` });
      cb.checked = on;
      cb.addEventListener('change', () => this.host.setLayerVisible(idx, cb.checked));
      const label = `레이어 ${name}`;
      const selected = d.items?.label === label;
      const nameBtn = h('button', { type: 'button', class: `link-btn${selected ? ' sel' : ''}`, title: `${title}${title ? ' · ' : ''}누르면 이 레이어의 형상을 강조합니다(두 번 누르면 맞춰 보기)` }, h('span', { translate: 'no' }, name));
      nameBtn.addEventListener('click', (ev) => {
        if (ev.detail === 2) this.host.selectItems(ids, label, true);
        else if (ev.detail <= 1) this.host.selectItems(selected ? null : ids, label);
      });
      tbody.append(
        h(
          'tr',
          { class: on ? '' : 'off' },
          h('td', {}, h('span', { class: 'check' }, cb, nameBtn, fileHidden ? h('span', { class: 'chip dim-chip', title: '파일이 숨긴 레이어(INVISIBILITY)' }, '숨김') : null)),
          h('td', { class: 'num' }, fmtCount(ids.length)),
        ),
      );
    };
    d.layers.forEach((l, i) => addRow(i, l.name, l.description, l.itemIds, !l.visible));
    if (loose.length) addRow(NO_LAYER, '(레이어 없음)', '어느 레이어에도 들지 않은 형상', loose, false);
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

  private renderPmi(d: StepDoc): void {
    const v = d.vis;
    const pres = d.pmi.presentations;
    if (pres.length) {
      const all = h('input', { type: 'checkbox', 'aria-label': '표현 PMI 모두 보이기' });
      all.checked = !v.pmiOff;
      all.addEventListener('change', () => this.host.setPmiVisible(null, all.checked));
      const tbody = h('tbody');
      const LIMIT = 1000;
      for (const p of pres.slice(0, LIMIT)) {
        const on = !v.pmiHidden.has(p.id);
        const cb = h('input', { type: 'checkbox', 'aria-label': `${p.name || p.type} 보이기` });
        cb.checked = on;
        cb.disabled = v.pmiOff;
        cb.addEventListener('change', () => this.host.setPmiVisible(p.id, cb.checked));
        const label = p.name || pmiTypeLabel(p.type);
        const selected = d.items?.ids.length === 1 && d.items.ids[0] === p.id;
        const nameBtn = h('button', { type: 'button', class: `link-btn${selected ? ' sel' : ''}`, title: `${pmiTypeLabel(p.type)} · #${p.stepId}${p.model ? ` · ${p.model}` : ''} · 누르면 강조(두 번 누르면 맞춰 보기)` }, label);
        nameBtn.addEventListener('click', (ev) => {
          if (ev.detail === 2) this.host.selectItems([p.id], `PMI ${label}`, true);
          else if (ev.detail <= 1) this.host.selectItems(selected ? null : [p.id], `PMI ${label}`);
        });
        tbody.append(h('tr', { class: on && !v.pmiOff ? '' : 'off' }, h('td', {}, h('span', { class: 'check' }, cb, nameBtn)), h('td', { class: 'dim small' }, p.plane ?? pmiTypeLabel(p.type))));
      }
      this.body.append(
        section(
          `표현 PMI ${fmtCount(pres.length)}개`,
          h('label', { class: 'check all-check' }, all, h('span', {}, '표현 PMI 보이기')),
          h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '주석'), h('th', {}, '평면·종류'))), tbody),
          pres.length > LIMIT ? h('p', { class: 'hint' }, `처음 ${fmtCount(LIMIT)}개만 보입니다.`) : null,
        ),
      );
    }
    const sem = d.pmi.semantic;
    if (sem.length) {
      const tbody = h('tbody');
      const LIMIT = 1000;
      for (const x of sem.slice(0, LIMIT)) {
        // 면에 이어진 PMI는 이름을 누르면 그 면을 강조하고 맞춰 본다
        const label = `PMI ${x.name || semanticLabel(x.type)}`;
        const selected = d.items?.label === label;
        let nameCell: HTMLElement;
        if (x.faces?.length) {
          const b = h('button', { type: 'button', class: `link-btn${selected ? ' sel' : ''}`, title: '누르면 이 PMI가 가리키는 면을 강조하고 맞춰 봅니다' }, h('span', { translate: 'no' }, x.name || '—'));
          b.addEventListener('click', () => (selected ? this.host.selectItems(null, label) : this.host.showPmiFaces(x.faces!, label)));
          nameCell = h('td', {}, b, h('span', { class: 'chip dim-chip', title: '이어진 면 수' }, `${x.faces.length}`));
        } else nameCell = h('td', { translate: 'no' }, x.name || '—');
        tbody.append(h('tr', { class: selected ? 'sel' : '' }, h('td', { title: `${x.type} · #${x.stepId}` }, semanticLabel(x.type)), nameCell, h('td', { class: 'mono', translate: 'no' }, x.value || '—')));
      }
      this.body.append(
        section(
          `의미 PMI ${fmtCount(sem.length)}개`,
          h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '이름'), h('th', {}, '값'))), tbody),
          sem.length > LIMIT ? h('p', { class: 'hint' }, `처음 ${fmtCount(LIMIT)}개만 보입니다.`) : null,
          h('p', { class: 'hint' }, '치수(값·± 공차), 기하 공차(크기 | 데이텀), 데이텀을 STEP 의미 PMI에서 읽었습니다.'),
        ),
      );
    }
    const views = d.pmi.views;
    if (views.length) {
      const list = h('div', { class: 'view-list' });
      for (const v of views) {
        const b = h('button', { type: 'button', class: 'btn small view-btn', title: `${v.projection === 'perspective' ? '원근' : '평행'} · ${v.pmiIds?.length ? `PMI ${v.pmiIds.length}개` : 'PMI 없음'}` }, icon('views', 14), h('span', { translate: 'no' }, v.name || `#${v.id}`));
        b.addEventListener('click', () => this.host.applySavedView(v));
        list.append(b);
      }
      this.body.append(section(`저장된 보기 ${fmtCount(views.length)}개`, list, h('p', { class: 'hint' }, '누르면 그 보기의 카메라로 옮기고 그 보기에 든 표현 PMI만 보입니다(PMI 모두 보이기로 되돌립니다).')));
    }
    if (!pres.length && !sem.length && !views.length) this.body.append(h('p', { class: 'empty' }, '이 파일에는 PMI가 없습니다.'));
  }

  // ───────────────────────── 정보 탭 ─────────────────────────

  private renderInfo(d: StepDoc): void {
    const s = d.scene;
    const info = d.info;
    const u = unitLabel(s.units);
    const c = sceneCounts(s);
    const b = s.bounds;
    const docRows: HTMLElement[] = [
      row('파일', d.name),
      row('크기', `${formatBytes(d.size)} (${fmtCount(d.size)} 바이트)`),
      row('형식', `STEP ${schemaSummary(info.schema)}`.trim()),
      row('읽은 시간', formatMs(d.openMs)),
    ];
    if (d.source) {
      const kinds = d.source.containers.map((k) => (k === 'zip' ? 'ZIP' : 'gzip')).join(' → ');
      docRows.splice(2, 0, row('압축', `${kinds}${d.source.entry ? ` · ${d.source.entry}` : ''}`), row('푼 크기', `${formatBytes(d.source.size)} (압축 ${formatBytes(d.source.packedSize)})`));
    }
    if (b) {
      const f = this.host.fmt;
      docRows.push(row('범위 크기', `${f.lenNum(b.max[0] - b.min[0])} × ${f.lenNum(b.max[1] - b.min[1])} × ${f.lenNum(b.max[2] - b.min[2])} ${f.unit}`.trim()));
      docRows.push(row('최소', f.pt(b.min)), row('최대', f.pt(b.max)));
    }
    docRows.push(row('삼각형', fmtCount(c.triangles), '놓인 자리를 모두 센 삼각형 수'));
    this.body.append(section('문서', ...docRows));

    const hd = info.header;
    if (hd) {
      const join = (a: string[]) => a.filter(Boolean).join(', ');
      const r: (HTMLElement | null)[] = [
        hd.name ? row('FILE_NAME', hd.name) : null,
        hd.timeStamp ? row('만든 때', hd.timeStamp) : null,
        join(hd.author) ? row('작성자', join(hd.author)) : null,
        join(hd.organization) ? row('조직', join(hd.organization)) : null,
        hd.preprocessorVersion ? row('전처리기', hd.preprocessorVersion) : null,
        hd.originatingSystem ? row('만든 프로그램', hd.originatingSystem) : null,
        hd.authorization ? row('승인', hd.authorization) : null,
        join(hd.description) ? row('FILE_DESCRIPTION', join(hd.description)) : null,
        hd.implementationLevel ? row('구현 수준', hd.implementationLevel) : null,
        hd.schemas.length ? row('FILE_SCHEMA', hd.schemas.join(', ')) : null,
      ];
      if (r.some(Boolean)) this.body.append(section('파일 머리', ...r));
    }

    const fu = this.host.fmt;
    this.body.append(section('단위', row('장면 단위', u || '모름'), row('파일 길이 단위', info.lengthUnit || '모름'), row('표시 단위', fu.unit || '—'), row('소수 자리', String(fu.decimals))));

    const st = info.stats;
    const statRows: HTMLElement[] = [];
    if (st) {
      statRows.push(row('솔리드', fmtCount(st.solids)), row('면', fmtCount(st.faces)));
      statRows.push(row('삼각화 못 한 면', fmtCount(st.failedFaces)));
      statRows.push(row('고유 삼각형', fmtCount(st.triangles), '같은 형상을 여러 번 놓아도 한 번만 센 삼각형 수'), row('인스턴스', fmtCount(st.instances)));
    }
    const pmiIds = new Set(d.pmi.presentations.map((p) => p.id));
    const curveSets = s.lines.filter((l) => !pmiIds.has(l.id)).length + (s.points?.length ?? 0);
    if (curveSets) statRows.push(row('선 형상 묶음', fmtCount(curveSets), '와이어프레임·곡선 형상(선·점 묶음)'));
    if (d.layers.length) statRows.push(row('레이어', fmtCount(d.layers.length)));
    if (d.pmi.presentations.length || d.pmi.semantic.length) statRows.push(row('PMI', `표현 ${fmtCount(d.pmi.presentations.length)} · 의미 ${fmtCount(d.pmi.semantic.length)}`));
    if (info.entityCount !== null) statRows.push(row('엔티티', fmtCount(info.entityCount)));
    if (st) statRows.push(row('구조 읽기', formatMs(st.parseMs)), row('삼각화', formatMs(st.meshMs)), row('해석 전체', formatMs(st.totalMs)));
    if (statRows.length) this.body.append(section('통계', ...statRows));

    const warns = s.warnings ?? [];
    if (warns.length) {
      const LIMIT = 300;
      this.body.append(
        section(
          `경고 ${fmtCount(warns.length)}개`,
          h('ul', { class: 'warn-list' }, ...warns.slice(0, LIMIT).map((w) => h('li', {}, ...warningNodes(w)))),
          warns.length > LIMIT ? h('p', { class: 'hint' }, `처음 ${LIMIT}개만 보입니다.`) : null,
        ),
      );
    } else this.body.append(section('경고', h('p', { class: 'hint' }, '해석기 경고가 없습니다.')));
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
      const name = pm ? { name: pm.name || pmiTypeLabel(pm.type), instance: pmiTypeLabel(pm.type) } : node ? nodeLabel(node) : { name: item ? bodyTitle(d.products, d.scene, p.id) : p.id, instance: '' };
      const what = pm ? '고른 PMI ' : '고른 것 ';
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, what), h('span', { translate: 'no' }, name.name), name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      // 점·법선 조각을 따로 번역되게 나눈다
      const at = `${p.section ? '단면(자른 면) 위 점' : p.kind === 'edge' ? '모서리 위 점' : '점'} ${fm.pt(p.point)} ${u}`.trim();
      lines.push(h('div', { class: 'dim' }, h('span', {}, at), ...(p.normal ? [' · ', h('span', {}, `법선 ${fm.dir(p.normal)}`)] : [])));
      if (d.face) lines.push(...faceLines(d.face, fm));
      else if (d.edge) lines.push(...edgeLines(d.edge, fm));
    } else if (d.selKey) {
      const node = productAt(d.products, d.selKey);
      if (node) {
        const name = nodeLabel(node);
        lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 제품 '), h('span', { translate: 'no' }, name.name), name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      }
    } else if (d.items) {
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 것 '), d.items.label, h('span', { class: 'dim' }, ` · ${fmtCount(d.items.ids.length)}개`)), fitBtn()));
    } else if (d.body) {
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 몸체 '), h('span', { translate: 'no' }, bodyTitle(d.products, d.scene, d.body))), fitBtn()));
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

/** 나무 줄 표시에 쓰는 고른 항목: 여러 개 고르기 묶음이나 몸체 하나(마디를 통째로 고른 것은 열쇠로 따로), 없으면 null */
function treePicked(d: StepDoc): Set<string> | null {
  if (d.selKey) return null;
  if (d.items) return new Set(d.items.ids);
  const b = selectedBody(d);
  return b ? new Set([b]) : null;
}

/**
 * 줄 표시 [고름, 일부 고름]: 마디를 통째로 골랐거나 줄 아래 항목이 모두 고른 것에 들면 고름,
 * 아니면 부품 줄에 바로 놓인 몸체 가운데 고른 것이 있으면 일부 고름(몸체 단위·몸체 줄·여러 개 고르기)
 */
function rowMarks(d: StepDoc, r: TreeRow, picked: Set<string> | null): [boolean, boolean] {
  const sel = d.selKey === r.key || (!!picked && r.itemIds.length > 0 && r.itemIds.every((id) => picked.has(id)));
  return [sel, !sel && !!picked && r.body === undefined && nodeItems(r.node).some((id) => picked.has(id))];
}

function markRow(el: HTMLElement, sel: boolean, part: boolean): void {
  el.classList.toggle('sel', sel);
  el.classList.toggle('part-sel', part);
  el.setAttribute('aria-selected', String(sel));
}
