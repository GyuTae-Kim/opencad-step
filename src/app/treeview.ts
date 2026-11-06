/**
 * 나무 조각(49차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖): 제품 나무와 "부품별 보이기" 표를 화면에 보이는 줄만 만드는 가상 목록(VList)으로 그린다.
 * 부품이 수천 개인 큰 조립에서 문서를 열 때·거를 때·펼칠 때 줄을 모두 만들지 않게(48차 프로필 — 나무 3,000줄 그리기 170~265 ms, 표 2,000줄과 함께 다시 그리기 0.3~0.9초).
 * - 패널 본문(스크롤 상자) 안의 목록 높이를 줄 수 × 줄 높이로 두고, 보이는 줄과 앞뒤 여유 줄만 absolute로 놓는다. 줄 높이는 그린 줄에서 잰다(손가락 기기 36px).
 * - 나무는 WAI-ARIA tree: 줄마다 aria-level·aria-setsize·aria-posinset(형제 수·차례 — 화면 밖 줄이 없어도 스크린 리더가 구조를 읽는다), 탭 멈춤은 한 줄(roving tabindex).
 *   ↑↓로 앞뒤 줄, →로 펼치기·첫 자식, ←로 접기·부모, Home·End로 처음·끝 — 화면 밖 줄이면 스크롤해 만든 뒤 초점을 옮긴다. 초점이 든 줄은 화면 밖으로 스크롤해도 남긴다.
 * - 표는 ARIA table(aria-rowcount·aria-rowindex). 칸의 고르기 상자에 초점이 들면 앞뒤 줄을 만들어 두어 Tab이 끊기지 않는다.
 */
import type { GroupInfo } from 'opencad-viewer3d';
import { h, icon } from './dom';
import { bodyName, instanceCounts, itemById, nodeItems, selectedBody, wireLabel, type StepDoc } from './doc';
import { fmtCount } from './format';
import { isTextTarget } from './keys';
import type { PanelHost } from './panel';
import { nodeInstances, nodeLabel, nodeVisible, toggleKey, type TreeRow } from './tree';

/**
 * 가상 목록: 스크롤 상자(scroller) 안의 목록(list)에 보이는 줄과 앞뒤 여유 줄만 둔다. 줄은 차례(data-i)대로 DOM에 끼우고, 이미 있는 줄은 옮기지 않는다
 * (초점·화면 언어 층의 번역을 지킨다). pinned()의 줄(나무의 탭 멈춤 줄)과 초점이 든 줄은 화면 밖이어도 둔다
 */
export class VList {
  /** 줄 높이(px — 처음 그린 줄에서 잰다) */
  rowH: number;
  /** 지금 DOM에 있는 줄(차례 → 요소) */
  readonly shown = new Map<number, HTMLElement>();
  private raf = 0;
  private measured = false;
  private readonly ro: ResizeObserver | null = null;

  constructor(
    readonly list: HTMLElement,
    private readonly scroller: HTMLElement,
    readonly count: number,
    private readonly make: (i: number) => HTMLElement,
    rowH: number,
    private readonly pinned: () => number = () => -1,
  ) {
    this.rowH = rowH;
    list.classList.add('vlist');
    list.style.height = `${count * rowH}px`;
    scroller.addEventListener('scroll', this.onScroll, { passive: true });
    // 패널을 열거나(숨김 → 보임) 크기가 바뀌면 다시 센다
    if (typeof ResizeObserver === 'function') (this.ro = new ResizeObserver(this.onScroll)).observe(scroller);
    // 줄 안에 초점이 들면 앞뒤 줄도 만들어 둔다(Tab·Shift+Tab이 화면 밖 다음 줄로 이어지게)
    list.addEventListener('focusin', (ev) => {
      const i = this.indexOf(ev.target as Element);
      if (i >= 0) this.update([i - 1, i + 1]);
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.ro?.disconnect();
  }

  private readonly onScroll = (): void => {
    this.raf ||= requestAnimationFrame(() => {
      this.raf = 0;
      if (this.list.isConnected) this.update();
    });
  };

  /** 요소가 든 줄의 차례(이 목록의 줄이 아니면 -1) */
  indexOf(el: Element | null): number {
    const r = el?.closest?.<HTMLElement>('[data-i]');
    return r?.parentElement === this.list ? Number(r.dataset.i) : -1;
  }

  /** 보일 차례 범위(앞뒤로 화면 반쯤 여유) — 레이아웃이 없으면(숨김·jsdom) 창 높이만큼 처음부터 */
  private range(): [number, number] {
    const s = this.scroller.getBoundingClientRect();
    const top = s.top + this.scroller.clientTop - this.list.getBoundingClientRect().top;
    const view = this.scroller.clientHeight || innerHeight;
    const pad = Math.max(8, Math.ceil(view / this.rowH / 2));
    return [Math.max(0, Math.floor(top / this.rowH) - pad), Math.min(this.count - 1, Math.ceil((top + view) / this.rowH) + pad)];
  }

  /** 보이는 줄을 맞춘다(extra: 이번에 꼭 둘 줄) */
  update(extra: readonly number[] = []): void {
    const [a, b] = this.range();
    const more = [...extra, this.pinned()].filter((i) => i >= 0 && i < this.count && (i < a || i > b));
    const act = document.activeElement;
    for (const [i, el] of this.shown)
      if ((i < a || i > b) && !more.includes(i) && !el.contains(act)) {
        el.remove();
        this.shown.delete(i);
      }
    const add: number[] = [];
    for (let i = a; i <= b; i++) if (!this.shown.has(i)) add.push(i);
    for (const i of more) if (!this.shown.has(i) && !add.includes(i)) add.push(i);
    if (!add.length) return;
    add.sort((x, y) => x - y);
    const have = [...this.shown.keys()].sort((x, y) => x - y);
    let k = 0;
    for (const i of add) {
      while (k < have.length && have[k]! < i) k++;
      const el = this.make(i);
      el.dataset.i = String(i);
      el.style.top = `${i * this.rowH}px`;
      this.list.insertBefore(el, k < have.length ? this.shown.get(have[k]!)! : null);
      this.shown.set(i, el);
    }
    if (!this.measured) this.measure();
  }

  /** 처음 그린 줄의 높이로 줄 높이를 맞춘다(CSS — 손가락 기기·글자 크기) */
  private measure(): void {
    const hh = this.shown.values().next().value?.getBoundingClientRect().height ?? 0;
    if (!hh) return;
    this.measured = true;
    if (Math.abs(hh - this.rowH) < 0.25) return;
    this.rowH = hh;
    this.list.style.height = `${this.count * hh}px`;
    for (const [i, el] of this.shown) el.style.top = `${i * hh}px`;
    this.update();
  }

  /** i번 줄이 보이게 스크롤하고(가까운 쪽 — 이미 보이면 그대로) 만든다 */
  reveal(i: number): HTMLElement | undefined {
    const view = this.scroller.clientHeight;
    if (view) {
      const top = this.list.getBoundingClientRect().top + i * this.rowH - this.scroller.getBoundingClientRect().top - this.scroller.clientTop;
      if (top < 0) this.scroller.scrollTop += top;
      else if (top + this.rowH > view) this.scroller.scrollTop += top + this.rowH - view;
    }
    this.update([i]);
    return this.shown.get(i);
  }
}

/** 패널이 나무 조각에 주는 것 */
export interface TreeOpts {
  d: StepDoc;
  rows: readonly TreeRow[];
  host: PanelHost;
  /** 패널 본문(스크롤 상자) */
  scroller: HTMLElement;
  /** 펼침이 바뀜: 패널 본문을 다시 그린다(초점이 든 줄은 패널이 되돌린다) */
  redraw(): void;
  /** 나무 위 이름 거르기 칸: 첫 줄에서 ↑, 그리고 Ctrl·⌘+F(findToFilter)가 이 칸으로 */
  filter: HTMLInputElement;
}

/** Ctrl·⌘+F가 옮겨 갈 거르기 칸(가장 최근에 그린 나무의 것 — 탭을 바꾸거나 다시 그리면 DOM에서 빠진다) */
let findFilter: HTMLInputElement | null = null;
let findBound = false;

/**
 * Ctrl·⌘+F → 나무 위 이름 거르기 칸(50차). 가상 목록은 화면 밖 줄이 DOM에 없어 브라우저의 페이지 안 찾기가 그 줄을 찾지 못하므로,
 * 나무가 보이는 동안(패널이 열리고 제품 탭) 첫 Ctrl·⌘+F는 거르기 칸에 초점을 주고 글을 고른다. 그 칸에서 한 번 더 누르면 가로채지 않아
 * 브라우저 찾기가 열린다(GitHub 코드 보기와 같은 꼴 — GitHub Projects도 Ctrl·⌘+F가 거르기 칸으로 간다). 패널이 닫혔거나 다른 탭이면 브라우저 찾기 그대로.
 * Shift·Alt가 붙은 조합(브라우저·운영 체제의 다른 찾기)은 건드리지 않는다.
 * 51차: 다른 글 칸(단면 위치·분해 거리·대화 상자의 밀도 칸 등 — keys.ts isTextTarget)에 초점이 있으면 가로채지 않는다(쳐 넣던 칸을 떠나면 분해 거리 칸은
 * 그 글로 옮기고 단면 위치 칸은 값을 건다 — 반쯤 친 값이 걸리지 않게, 그 칸에서는 브라우저 찾기). 칸으로 초점이 옮겨지지 않으면(모달 대화 상자가 열려
 * 패널이 inert 등) 기본 동작을 막지 않는다(전에는 막기만 해서 아무 일도 일어나지 않았다)
 */
export function findToFilter(ev: KeyboardEvent, f: HTMLInputElement | null = findFilter): boolean {
  if (!f || ev.defaultPrevented || ev.altKey || ev.shiftKey || !(ev.ctrlKey || ev.metaKey) || (ev.key !== 'f' && ev.key !== 'F')) return false;
  if (isTextTarget(ev.target) || !f.isConnected || f.closest('[hidden]')) return false;
  f.focus();
  if (document.activeElement !== f) return false;
  ev.preventDefault();
  f.select();
  return true;
}

export interface TreeView {
  readonly el: HTMLElement;
  readonly list: VList;
  /** 고르기만 바뀜: 그린 줄 표시를 고친다(고른 마디·몸체가 목록에 없으면 false) */
  patch(): boolean;
  /** 고른 줄(없으면 일부 고른 줄)이 보이게 스크롤 */
  reveal(): void;
  /** 열쇠 줄(eye면 그 눈 단추)에 초점 — 목록에 없으면 false */
  focusKey(key: string, eye?: boolean): boolean;
  /** i번 줄에 초점(화면 밖이면 스크롤해 만든다) */
  focusAt(i: number): void;
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

/**
 * 형제 차례: 줄마다 부모 줄 차례(뿌리 -1)와 형제 가운데 차례(1부터), 형제 수. 줄은 깊이 우선 차례(부모 바로 뒤에 자식 — 몸체 줄은 자식 마디 앞)
 */
export function siblingInfo(rows: readonly { depth: number }[]): { parent: Int32Array; pos: Int32Array; size: Int32Array } {
  const n = rows.length;
  const parent = new Int32Array(n);
  const pos = new Int32Array(n);
  const kids = new Int32Array(n + 1);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    const dep = rows[i]!.depth;
    while (stack.length && rows[stack[stack.length - 1]!]!.depth >= dep) stack.pop();
    const p = stack.length ? stack[stack.length - 1]! : -1;
    parent[i] = p;
    pos[i] = ++kids[p + 1]!;
    stack.push(i);
  }
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) size[i] = kids[parent[i]! + 1]!;
  return { parent, pos, size };
}

/** 제품 나무(가상 목록): 패널이 renderTree에서 부른다 */
export function treeView(o: TreeOpts): TreeView {
  const { d, rows, host } = o;
  const counts = instanceCounts(d.info);
  const { parent, pos, size } = siblingInfo(rows);
  const index = new Map(rows.map((r, i) => [r.key, i]));
  // 고른 항목(여러 개 고르기 묶음 등 — 줄을 만들 때마다 집합을 다시 만들지 않게, 고르기가 바뀌면 patch가 고친다)
  let picked = treePicked(d);
  const el = h('div', { class: 'tree', role: 'tree', 'aria-label': '제품 나무' });
  // Ctrl·⌘+F: 이 나무의 거르기 칸으로(창 글쇠는 처음 한 번만 듣는다). 칸에 단축키를 알린다(화면 읽기 프로그램·말풍선)
  findFilter = o.filter;
  o.filter.setAttribute('aria-keyshortcuts', 'Control+F Meta+F');
  o.filter.title = 'Ctrl·⌘+F로 이 칸에 옵니다 — 칸에서 한 번 더 누르면 브라우저 찾기(화면 밖 나무 줄은 브라우저 찾기에 걸리지 않습니다)';
  if (!findBound) {
    findBound = true;
    window.addEventListener('keydown', (ev) => void findToFilter(ev));
  }
  // 거르기 칸에서 ↓: 첫 줄로(거른 줄이 없으면 그대로)
  o.filter.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    focusAt(0);
  });
  // 탭 멈춤 줄(roving tabindex): 고른 줄, 없으면 첫 줄 — 늘 DOM에 남긴다(Tab으로 들어오면 그 줄로)
  let active = Math.max(0, rows.findIndex((r) => d.selKey === r.key));
  const setActive = (i: number) => {
    if (i === active) return;
    for (const [j, t] of [
      [active, '-1'],
      [i, '0'],
    ] as const) {
      const row = vl.shown.get(j);
      row?.setAttribute('tabindex', t);
      row?.querySelector('.eye')?.setAttribute('tabindex', t);
    }
    active = i;
  };
  const focusAt = (i: number, eye = false) => {
    if (i < 0 || i >= rows.length) return;
    const row = vl.reveal(i);
    setActive(i);
    ((eye && row?.querySelector<HTMLElement>('.eye:not(:disabled)')) || row)?.focus({ preventScroll: true });
  };
  const toggle = (r: TreeRow) => {
    d.expanded = toggleKey(d.expanded, r.key);
    o.redraw();
  };

  const make = (i: number): HTMLElement => {
    const r = rows[i]!;
    const bodyId = r.body === undefined ? null : r.itemIds[0]!;
    const found = bodyId ? itemById(d.scene, bodyId) : undefined;
    // 몸체 줄 이름: 형상 항목 이름(파일 글), 없으면 "몸체 2"·"선 형상 1"(부품 마디 바로 아래라 부품 이름은 되풀이하지 않는다 — 말풍선에 "부품 · 몸체 2")
    const bname = bodyId ? bodyName(r.node, found?.[0], r.wire !== undefined) : '';
    const generic = r.wire !== undefined ? wireLabel(r.node, undefined, found?.[1], r.wire) : `몸체 ${r.body}`;
    const { name, instance } = bodyId ? { name: bname || generic, instance: '' } : nodeLabel(r.node);
    const visible = nodeVisible(r.itemIds, (id) => host.isVisible(id));
    // 고름 · 이 부품의 몸체 일부만 고름(몸체 단위 고르기·몸체 줄·여러 개 고르기 — 줄에 옅게 표시)
    const [sel, part] = rowMarks(d, r, picked);
    const tab = i === active ? '0' : '-1';
    const tog = h('button', { type: 'button', class: `twisty${bodyId ? ' body-mark' : ''}`, tabindex: '-1', 'aria-hidden': 'true', disabled: !r.hasChildren });
    if (r.hasChildren) tog.append(icon(r.open ? 'chevronDown' : 'chevronRight', 14));
    else if (bodyId) tog.append(icon(r.wire !== undefined ? 'wire' : 'body', 13));
    tog.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggle(r);
    });
    const eye = h('button', {
      type: 'button',
      class: `eye${visible ? '' : ' off'}`,
      title: visible ? '숨기기' : '보이기',
      'aria-label': `${name} ${visible ? '숨기기' : '보이기'}`,
      'aria-pressed': String(!visible),
      tabindex: tab,
      disabled: !r.itemIds.length,
    });
    eye.append(icon(visible ? 'eye' : 'eyeOff', 15));
    eye.addEventListener('click', (ev) => {
      ev.stopPropagation();
      host.setItemsVisible(r.itemIds, !visible);
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
        'aria-setsize': String(size[i]),
        'aria-posinset': String(pos[i]),
        'aria-selected': String(sel),
        'aria-expanded': r.hasChildren ? String(r.open) : null,
        tabindex: tab,
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
    const select = (on: boolean) => (bodyId ? host.selectBody(on ? bodyId : null) : host.selectKey(on ? r.key : null));
    const fit = () => (bodyId ? host.fitBody(bodyId) : host.fitKey(r.key));
    // 첫 누르기에 나무를 다시 그릴 수 있으므로 dblclick 대신 누른 횟수(detail)로 두 번 누르기를 가린다
    item.addEventListener('click', (ev) => {
      // Ctrl·⌘·Shift + 누르기(여러 개 고르기 모드면 그냥 누르기): 이 마디 아래 형상(몸체 줄은 그 몸체)을 여러 개 고르기에 더하거나 뺀다
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || host.multiPick) {
        if (ev.detail <= 1) host.toggleInSelection(r.itemIds);
        return;
      }
      if (ev.detail === 2) fit();
      else if (ev.detail <= 1) select(!isSel());
    });
    // 오른쪽 누르기(휴대폰은 길게 누르기)로 그 마디를 고르고 작업 메뉴
    item.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // 여러 개 고르기 중에는 이 마디를 모은 것에 더해(이미 있으면 그대로) 메뉴가 모은 것 전체에 쓰이게 한다
      if (host.multiPick) {
        if (!rowMarks(d, r, treePicked(d))[0]) host.toggleInSelection(r.itemIds);
      } else if (!isSel()) select(true);
      host.openContextMenu(ev.clientX, ev.clientY);
    });
    item.addEventListener('focusin', () => setActive(i));
    item.addEventListener('keydown', (ev) => {
      const k = ev.key;
      // 눈 단추의 Enter·Space는 단추 그대로(보이기·숨기기), 화살표는 줄처럼
      if (ev.target !== item && (k === 'Enter' || k === ' ')) return;
      if (k === 'Enter') {
        // Enter: 고르기, 이미 골랐으면 맞춰 보기
        if (isSel()) fit();
        else select(true);
      } else if (k === ' ') select(!isSel());
      else if (k === 'ArrowRight' && r.hasChildren) (r.open ? focusAt(i + 1) : toggle(r));
      else if (k === 'ArrowLeft' && (r.open || parent[i]! >= 0)) (r.open ? toggle(r) : focusAt(parent[i]!));
      else if (k === 'ArrowDown') focusAt(i + 1);
      else if (k === 'ArrowUp') (i ? focusAt(i - 1) : o.filter.focus());
      else if (k === 'Home' || k === 'End') focusAt(k === 'Home' ? 0 : rows.length - 1);
      else return;
      ev.preventDefault();
    });
    return item;
  };
  const vl = new VList(el, o.scroller, rows.length, make, 28, () => active);

  return {
    el,
    list: vl,
    patch() {
      picked = treePicked(d);
      let found = !d.selKey && !selectedBody(d);
      if (!found) found = d.selKey ? index.has(d.selKey) : rows.some((r) => rowMarks(d, r, picked).some(Boolean));
      for (const [i, row] of vl.shown) markRow(row, ...rowMarks(d, rows[i]!, picked));
      return found;
    },
    reveal() {
      const marks = d.selKey ? null : rows.map((r) => rowMarks(d, r, picked));
      const i = d.selKey ? (index.get(d.selKey) ?? -1) : marks!.findIndex((m) => m[0]);
      const j = i >= 0 ? i : (marks?.findIndex((m) => m[1]) ?? -1);
      if (j >= 0) vl.reveal(j);
    },
    focusKey(key, eye = false) {
      const i = index.get(key);
      if (i === undefined) return false;
      focusAt(i, eye);
      return true;
    },
    focusAt: (i) => focusAt(i),
  };
}

/**
 * 부품별 보이기 표(가상 목록, ARIA table): 같은 이름의 부품 자리를 한꺼번에 숨기고 보인다. 이름이 길면 말줄임(말풍선에 전체 이름)
 */
export function groupGrid(groups: readonly GroupInfo[], scroller: HTMLElement, onToggle: (name: string, on: boolean) => void): { el: HTMLElement; list: VList } {
  const body = h('div', { role: 'rowgroup' });
  const el = h(
    'div',
    { class: 'vgrid', role: 'table', 'aria-label': '부품별 보이기', 'aria-rowcount': String(groups.length + 1) },
    h('div', { class: 'vgrid-row vgrid-head', role: 'row', 'aria-rowindex': '1' }, h('span', { role: 'columnheader' }, '부품'), h('span', { class: 'num', role: 'columnheader' }, '자리')),
    body,
  );
  const make = (i: number): HTMLElement => {
    const g = groups[i]!;
    const cb = h('input', { type: 'checkbox', 'aria-label': `${g.name} 보이기` });
    cb.checked = g.visible;
    cb.addEventListener('change', () => onToggle(g.name, cb.checked));
    return h(
      'div',
      { class: `vgrid-row${g.visible ? '' : ' off'}`, role: 'row', 'aria-rowindex': String(i + 2) },
      h('label', { class: 'check', role: 'cell' }, cb, h('span', { translate: 'no', title: g.name }, g.name)),
      h('span', { class: 'num', role: 'cell' }, fmtCount(g.count)),
    );
  };
  return { el, list: new VList(body, scroller, groups.length, make, 26) };
}
