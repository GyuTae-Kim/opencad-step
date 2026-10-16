/**
 * 오른쪽 패널(폭 760px 미만이면 아래 시트): 제품 탭(제품 나무·부품별 인스턴스)과 정보 탭(파일 머리·단위·통계·경고).
 * 아래 띠에는 고른 것(3D 고르기·나무 고르기)과 측정 결과를 늘 보인다.
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import { instanceCounts, productAt, sceneCounts, schemaSummary, unitLabel, type PanelTab, type StepDoc } from './doc';
import { formatBytes, formatMs, fmtCount, fmtNum, fmtPt } from './format';
import { allExpandableKeys, nodeInstances, nodeLabel, nodeVisible, toggleKey, visibleRows } from './tree';

/** 패널이 부르는 앱 쪽 기능 */
export interface PanelHost {
  readonly measuring: boolean;
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
}

const TREE_LIMIT = 3000;

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
    this.render();
  }

  /** 열고 닫기(문서가 없으면 늘 닫힘) */
  setOpen(on: boolean): void {
    this.el.hidden = !on || !this.doc;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** 고른 것이 바뀜: 나무 다시 그리고 고른 줄을 보이게 */
  onSelection(reveal = false): void {
    if (!this.doc) return;
    if (this.doc.panelTab === 'tree') this.renderBody();
    if (reveal) this.body.querySelector('.tree-row.sel')?.scrollIntoView({ block: 'nearest' });
    this.renderFoot();
  }

  onMeasure(): void {
    this.renderFoot();
  }

  /** 보이기/숨기기가 바뀜 */
  onVisibility(): void {
    if (this.doc?.panelTab === 'tree') this.renderBody();
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
      ['info', `정보${d.scene.warnings?.length ? ` (경고 ${d.scene.warnings.length})` : ''}`],
    ];
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
    this.body.innerHTML = '';
    if (d.panelTab === 'tree') this.renderTree(d);
    else this.renderInfo(d);
    this.body.scrollTop = scroll;
  }

  // ───────────────────────── 제품 탭 ─────────────────────────

  private renderTree(d: StepDoc): void {
    const roots = d.products;
    if (!roots.length) {
      this.body.append(h('p', { class: 'empty' }, '이 파일에는 제품 구조 정보가 없습니다.'));
      return;
    }
    const counts = instanceCounts(d.info);
    const { rows, truncated } = visibleRows(roots, d.expanded, TREE_LIMIT);

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
      this.renderBody();
    });
    mk('모두 보이기', '숨긴 부품을 모두 다시 보입니다', () => this.host.showAll());

    const list = h('div', { class: 'tree', role: 'tree', 'aria-label': '제품 나무' });
    for (const r of rows) {
      const { name, instance } = nodeLabel(r.node);
      const visible = nodeVisible(r.meshIds, (id) => this.host.isVisible(id));
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
        disabled: !r.meshIds.length,
      });
      eye.append(icon(visible ? 'eye' : 'eyeOff', 15));
      eye.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.host.setItemsVisible(r.meshIds, !visible);
      });
      const n = nodeInstances(r.node, counts);
      const item = h(
        'div',
        {
          class: `tree-row${sel ? ' sel' : ''}${visible ? '' : ' hidden-node'}`,
          role: 'treeitem',
          'aria-level': String(r.depth + 1),
          'aria-selected': String(sel),
          'aria-expanded': r.hasChildren ? String(r.open) : null,
          tabindex: '0',
          style: `--depth:${r.depth}`,
          title: [r.node.productId ? `제품 번호 ${r.node.productId}` : '', `형상 ${r.meshIds.length}개`, '두 번 누르면 이 부품으로 맞춰 봅니다'].filter(Boolean).join(' · '),
          'data-key': r.key,
        },
        tog,
        eye,
        h('span', { class: 'tree-name' }, name, instance ? h('span', { class: 'dim' }, ` · ${instance}`) : null),
        n > 1 ? h('span', { class: 'chip', title: `이 부품이 모형에 ${n}번 놓였습니다` }, `×${n}`) : null,
      );
      // 첫 누르기에 나무를 다시 그리므로 dblclick 대신 누른 횟수(detail)로 두 번 누르기를 가린다
      item.addEventListener('click', (ev) => {
        if (ev.detail === 2) this.host.fitKey(r.key);
        else if (ev.detail <= 1) this.host.selectKey(sel ? null : r.key);
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          // Enter: 고르기, 이미 골랐으면 맞춰 보기
          ev.preventDefault();
          if (sel) this.host.fitKey(r.key);
          else this.host.selectKey(r.key);
          (this.body.querySelector(`.tree-row[data-key="${r.key}"]`) as HTMLElement | null)?.focus();
        } else if (ev.key === ' ') {
          ev.preventDefault();
          this.host.selectKey(sel ? null : r.key);
          (this.body.querySelector(`.tree-row[data-key="${r.key}"]`) as HTMLElement | null)?.focus();
        } else if ((ev.key === 'ArrowRight' && r.hasChildren && !r.open) || (ev.key === 'ArrowLeft' && r.open)) {
          ev.preventDefault();
          d.expanded = toggleKey(d.expanded, r.key);
          this.renderBody();
          (this.body.querySelector(`.tree-row[data-key="${r.key}"]`) as HTMLElement | null)?.focus();
        } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          const sib = ev.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling;
          (sib as HTMLElement | null)?.focus();
        }
      });
      list.append(item);
    }
    this.body.append(section('제품 나무', tools, list, truncated ? h('p', { class: 'hint' }, `처음 ${fmtCount(TREE_LIMIT)}개 마디만 보입니다. 접어서 줄이십시오.`) : null));

    // 부품별(묶음): 같은 이름의 부품 자리를 한꺼번에 숨기고 보인다
    const groups = this.host.groups();
    if (groups.length > 1) {
      const tbody = h('tbody');
      for (const g of groups) {
        const cb = h('input', { type: 'checkbox', 'aria-label': `${g.name} 보이기` });
        cb.checked = g.visible;
        cb.addEventListener('change', () => this.host.setGroupVisible(g.name, cb.checked));
        tbody.append(h('tr', { class: g.visible ? '' : 'off' }, h('td', {}, h('label', { class: 'check' }, cb, h('span', {}, g.name))), h('td', { class: 'num' }, fmtCount(g.count))));
      }
      this.body.append(section('부품별 보이기', h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '부품'), h('th', { class: 'num' }, '자리'))), tbody)));
    }
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
    if (b) {
      docRows.push(row('범위 크기', `${fmtNum(b.max[0] - b.min[0])} × ${fmtNum(b.max[1] - b.min[1])} × ${fmtNum(b.max[2] - b.min[2])} ${u}`.trim()));
      docRows.push(row('최소', fmtPt(b.min)), row('최대', fmtPt(b.max)));
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

    this.body.append(section('단위', row('장면 단위', u || '모름'), row('파일 길이 단위', info.lengthUnit || '모름')));

    const st = info.stats;
    const statRows: HTMLElement[] = [];
    if (st) {
      statRows.push(row('솔리드', fmtCount(st.solids)), row('면', fmtCount(st.faces)));
      statRows.push(row('삼각화 못 한 면', fmtCount(st.failedFaces)));
      statRows.push(row('고유 삼각형', fmtCount(st.triangles), '같은 형상을 여러 번 놓아도 한 번만 센 삼각형 수'), row('인스턴스', fmtCount(st.instances)));
    }
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
    const u = unitLabel(d.scene.units);
    const p = d.pick;
    const fitBtn = (): HTMLButtonElement => {
      const b = h('button', { type: 'button', class: 'btn small foot-fit', title: '고른 부품으로 맞춰 보기' });
      b.append(icon('focus', 14), h('span', {}, '고른 부품 보기'));
      b.addEventListener('click', () => this.host.fitSelection());
      return b;
    };
    if (p) {
      const mesh = d.scene.meshes.find((m) => m.id === p.id);
      const node = d.selKey ? productAt(d.products, d.selKey) : null;
      const name = node ? nodeLabel(node) : { name: mesh?.name ?? p.id, instance: '' };
      lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 것 '), name.name, name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      lines.push(h('div', { class: 'dim' }, `점 ${fmtPt(p.point)} ${u}${p.normal ? ` · 법선 ${fmtPt(p.normal)}` : ''}`));
    } else if (d.selKey) {
      const node = productAt(d.products, d.selKey);
      if (node) {
        const name = nodeLabel(node);
        lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 제품 '), name.name, name.instance ? h('span', { class: 'dim' }, ` · ${name.instance}`) : null), fitBtn()));
      }
    }
    if (d.measure) {
      const m = d.measure;
      lines.push(h('div', {}, h('b', {}, '거리 '), `${fmtNum(m.distance)} ${u}`, h('span', { class: 'dim' }, ` · dx ${fmtNum(m.dx)} · dy ${fmtNum(m.dy)} · dz ${fmtNum(m.dz)}`)));
    } else if (this.host.measuring) lines.push(h('div', { class: 'dim' }, '측정: 모형 위 두 점을 누르십시오(꼭짓점 가까우면 붙습니다). Esc = 지우기'));
    f.hidden = !lines.length;
    f.append(...lines);
  }
}
