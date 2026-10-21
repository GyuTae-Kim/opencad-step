/**
 * 오른쪽 패널(폭 760px 미만이면 아래 시트): 제품 탭(이름 거르기·제품 나무·부품별 보이기), 레이어 탭(있을 때),
 * PMI 탭(있을 때 — 표현 PMI 켜고 끄기, 의미 PMI 목록), 정보 탭(파일 머리·단위·통계·경고).
 * 아래 띠에는 고른 것(3D 고르기·나무 고르기·고른 면·레이어/PMI 고르기)과 측정 결과를 늘 보인다.
 * 패널 가장자리를 끌어 폭(시트는 높이)을 바꾼다(resize.ts).
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import type { Fmt } from './display';
import { instanceCounts, productAt, sceneCounts, schemaSummary, unitLabel, type PanelTab, type StepDoc, TREE_LIMIT } from './doc';
import { faceKindLabel, type FacePick } from './faces';
import { formatBytes, formatMs, fmtCount } from './format';
import { panelMeasureHint } from './measure';
import { allExpandableKeys, filterRows, nodeInstances, nodeLabel, nodeVisible, toggleKey, visibleRows, type TreeRow } from './tree';
import { NO_LAYER } from './visibility';

/** 패널이 부르는 앱 쪽 기능 */
export interface PanelHost {
  readonly measuring: boolean;
  /** 손가락이 주인 기기인지(안내에서 키 설명을 뺀다) */
  readonly touch: boolean;
  /** 수 꼴(표시 단위·소수 자리·언어) */
  readonly fmt: Fmt;
  /** 나무 마디 고르기(null = 풀기) */
  selectKey(key: string | null): void;
  /** 나무 마디를 고르고 그 아래 형상으로 맞춰 보기 */
  fitKey(key: string): void;
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
  private filterTimer = 0;

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
    } else if (d.panelTab === 'layers' || d.panelTab === 'pmi') this.renderBody();
    if (reveal) this.body.querySelector('.tree-row.sel')?.scrollIntoView({ block: 'nearest' });
    this.renderFoot();
  }

  onMeasure(): void {
    this.renderFoot();
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
    const tabs: [PanelTab, string][] = [['tree', '제품']];
    if (d.layers.length) tabs.push(['layers', `레이어 ${d.layers.length}`]);
    if (d.pmi.presentations.length || d.pmi.semantic.length) tabs.push(['pmi', 'PMI']);
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

  /** 펼침이 그대로면 고른 줄 표시만 바꾼다(큰 나무에서 다시 그리지 않게). 못 하면 false */
  private patchTreeSelection(): boolean {
    const d = this.doc;
    if (!d || !this.drawnExpanded || d.treeFilter.trim()) return false;
    if (this.drawnExpanded.size !== d.expanded.size) return false;
    for (const k of d.expanded) if (!this.drawnExpanded.has(k)) return false;
    const rows = this.body.querySelectorAll<HTMLElement>('.tree-row');
    let found = !d.selKey;
    for (const r of rows) {
      const sel = r.dataset.key === d.selKey;
      if (sel) found = true;
      r.classList.toggle('sel', sel);
      r.setAttribute('aria-selected', String(sel));
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
    const res = filtering ? filterRows(roots, d.treeFilter, d.expanded, d.treeLimit) : { ...visibleRows(roots, d.expanded, d.treeLimit), matches: -1 };
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

    const list = h('div', { class: 'tree', role: 'tree', 'aria-label': '제품 나무' });
    for (const r of rows) list.append(this.treeRow(d, r, counts));
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

  private treeRow(d: StepDoc, r: TreeRow, counts: Map<string, number>): HTMLElement {
    const { name, instance } = nodeLabel(r.node);
    const visible = nodeVisible(r.itemIds, (id) => this.host.isVisible(id));
    const sel = d.selKey === r.key;
    const tog = h('button', { type: 'button', class: 'twisty', tabindex: '-1', 'aria-hidden': 'true', disabled: !r.hasChildren });
    if (r.hasChildren) tog.append(icon(r.open ? 'chevronDown' : 'chevronRight', 14));
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
    const n = nodeInstances(r.node, counts);
    const lines = r.node.lineIds?.length ?? 0;
    const item = h(
      'div',
      {
        class: `tree-row${sel ? ' sel' : ''}${visible ? '' : ' hidden-node'}${r.match ? ' match' : ''}`,
        role: 'treeitem',
        'aria-level': String(r.depth + 1),
        'aria-selected': String(sel),
        'aria-expanded': r.hasChildren ? String(r.open) : null,
        tabindex: '0',
        style: `--depth:${r.depth}`,
        title: [r.node.productId ? `제품 번호 ${r.node.productId}` : '', `형상 ${r.node.meshIds.length}개`, lines ? `선 형상 ${lines}개` : '', '두 번 누르면 이 부품으로 맞춰 봅니다'].filter(Boolean).join(' · '),
        'data-key': r.key,
      },
      tog,
      eye,
      h('span', { class: 'tree-name' }, name, instance ? h('span', { class: 'dim' }, ` · ${instance}`) : null),
      n > 1 ? h('span', { class: 'chip', title: `이 부품이 모형에 ${n}번 놓였습니다` }, `×${n}`) : null,
    );
    // 첫 누르기에 나무를 다시 그릴 수 있으므로 dblclick 대신 누른 횟수(detail)로 두 번 누르기를 가린다
    item.addEventListener('click', (ev) => {
      if (ev.detail === 2) this.host.fitKey(r.key);
      else if (ev.detail <= 1) this.host.selectKey(d.selKey === r.key ? null : r.key);
    });
    item.addEventListener('keydown', (ev) => {
      const refocus = () => (this.body.querySelector(`.tree-row[data-key="${r.key}"]`) as HTMLElement | null)?.focus();
      const isSel = d.selKey === r.key;
      if (ev.key === 'Enter') {
        // Enter: 고르기, 이미 골랐으면 맞춰 보기
        ev.preventDefault();
        if (isSel) this.host.fitKey(r.key);
        else this.host.selectKey(r.key);
        refocus();
      } else if (ev.key === ' ') {
        ev.preventDefault();
        this.host.selectKey(isSel ? null : r.key);
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
        tbody.append(h('tr', {}, h('td', { title: `${x.type} · #${x.stepId}` }, semanticLabel(x.type)), h('td', { translate: 'no' }, x.name || '—'), h('td', { class: 'mono', translate: 'no' }, x.value || '—')));
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
    if (!pres.length && !sem.length) this.body.append(h('p', { class: 'empty' }, '이 파일에는 PMI가 없습니다.'));
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
          h('ul', { class: 'warn-list' }, ...warns.slice(0, LIMIT).map((w) => h('li', {}, w))),
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
      const item = p.kind === 'mesh' ? d.scene.meshes.find((m) => m.id === p.id) : p.kind === 'line' ? d.scene.lines.find((l) => l.id === p.id) : d.scene.points?.find((x) => x.id === p.id);
      const pm = d.pmi.presentations.find((x) => x.id === p.id);
      const name = pm ? { name: pm.name || pmiTypeLabel(pm.type), instance: pmiTypeLabel(pm.type) } : node ? nodeLabel(node) : { name: item?.name ?? p.id, instance: '' };
      const what = pm ? '고른 PMI ' : '고른 것 ';
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, what), h('span', { translate: 'no' }, name.name), name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      lines.push(h('div', { class: 'dim' }, `${p.section ? '단면(자른 면) 위 점' : '점'} ${fm.pt(p.point)} ${u}${p.normal ? ` · 법선 ${fm.dir(p.normal)}` : ''}`));
      if (d.face) lines.push(...faceLines(d.face, fm));
    } else if (d.selKey) {
      const node = productAt(d.products, d.selKey);
      if (node) {
        const name = nodeLabel(node);
        lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 제품 '), h('span', { translate: 'no' }, name.name), name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      }
    } else if (d.items) {
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 것 '), d.items.label, h('span', { class: 'dim' }, ` · ${fmtCount(d.items.ids.length)}개`)), fitBtn()));
    }
    if (d.measure) {
      const m = d.measure;
      lines.push(h('div', {}, h('b', {}, '거리 '), fm.len(m.distance), h('span', { class: 'dim' }, ` · dx ${fm.lenNum(m.dx)} · dy ${fm.lenNum(m.dy)} · dz ${fm.lenNum(m.dz)}`)));
    } else if (this.host.measuring) lines.push(h('div', { class: 'dim' }, panelMeasureHint(this.host.touch)));
    f.hidden = !lines.length;
    f.append(...lines);
  }
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
  if (geo.length) out.push(h('div', { class: 'dim' }, geo.join(' · ')));
  const approx = fp.exact ? '' : '≈ ';
  out.push(h('div', { class: 'dim', title: fp.exact ? null : '화면용 삼각형으로 잰 근삿값입니다(B-스플라인 등).' }, `넓이 ${approx}${f.area(fp.area)} · 둘레 ${approx}${f.len(fp.perimeter)}`));
  return out;
}
