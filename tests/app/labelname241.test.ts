// @vitest-environment jsdom
/**
 * 241차(WCAG 2.5.3 Label in Name — 재발 막기): 글이 보이는 누를 칸(단추·탭·메뉴 항목·확인 칸·고르기·입력 칸·링크)은 접근 이름(aria-labelledby·aria-label·감싼 이름표)이
 * 보이는 글을 담아야 한다 — 말로 조작하는 사용자가 화면의 낱말로 그 칸을 부를 수 있게. 번역층(i18n.ts)은 글 마디와 aria-label을 따로 옮기므로 한 언어에서만 갈릴 수 있어
 * 앱 틀을 다섯 언어로 그려 센다(193·194차는 원문 grep·사전 jq로 셌다).
 * - 그리는 것: 앱 틀 전부(StepApp 생성자 — 제목 막대·도구 막대·시작 화면·여는 중 덮개·측정 띠·고른 부품 카드·격리 띠·분해 막대·상태 막대, 문서 없이 처음 그릴 때와 같은 길)
 *   + 최근 문서 줄·동작이 있는 알림·앱 설정 메뉴(연 채) + 뷰어 조각이 끼우는 분해 갈래·손질 칸(거리 칸 넷 — 끈 뒤·끌지 않고 연 빈 칸 셋)·단면 막대(X 축 단면)
 *   + 문서를 연 패널 다섯 탭(targetsize234·filecells209 모형) + 그림 저장 대화 상자 본문 + 언어 메뉴(번역층이 단다). 236차 KBD 42꼴 가운데 글이 보이는 꼴이 모두 든다.
 * - 보이는 글: 아이콘(svg)·aria-hidden·숨은 글(.sr-only)·hidden 칸을 뺀 글. 입력 칸은 감싼 이름표(입력 칸 뒤 단위·안내 글은 빼고 — 확인 칸은 뒤 글이 이름표),
 *   감싸지 않은 칸은 옆 이름표(BESIDE — 근거와 함께), 그것도 없으면 자리 글(placeholder). 보이는 이름표가 없는 칸은 BARE(근거)에, 어느 쪽에도 없는 입력 칸은 실패.
 * - 견줌: 대소문자·문장부호·기호(▾·…·괄호·쌍점 등)·서식 글자(파일 글 가둠 FSI·PDI)·빈칸을 빼고 이름이 보이는 글을 품는지(한두 글자 라틴 글은 낱말로 — 「X」가 「explode」에 들지 않게).
 *   보이는 글 뒤에 키 글을 붙인 이름(「전체 보기 (F)」)은 품는 것으로 본다.
 * - 이름을 따로 단 칸(TABLE — README 개발 절 241차 문단과 같음)이 다섯 언어 모두 같은 표이고(표 밖 새 칸이면 실패), 어긋나는 칸 0(STILL).
 *   241차에 고친 것: 단면 막대 숫자 칸(축 단면) — 보이는 이름표 「X =」를 이름이 품지 않았다(다섯 언어 모두 「단면 위치(숫자)」만, 168·193차가 「입력 칸 — 새 글이 듦」으로 둔 줄)
 *   → aria-labelledby로 이름표 + 제 aria-label(「X = 단면 위치(숫자)」 — 새 원문 0).
 * - 원문 셈: src/app의 이름 다는 자리(aria-label·aria-labelledby 글자) 수가 파일마다 NAME_SITES와 같다 — 새 자리가 생기면 이 표를 보고 늘린다(그리지 않는 칸까지).
 * src/app의 모든 .ts를 소스 글로 읽는다(ci-guard 12번 — 이름 다는 줄을 바꾸면 이 시험도).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { GroupInfo, SectionState, Viewer3d } from 'opencad-viewer3d';
import { stepToScene, type StepMeta } from '../../src/scene';
import { createDoc, type PanelTab, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import * as PV from '../../src/app/panelview';
import * as PHYS from '../../src/app/propsview';
import { infoView } from '../../src/app/infoview';
import { pmiView } from '../../src/app/pmiview';
import { Fmt } from '../../src/app/display';
import { h } from '../../src/app/dom';
import { SectionBar } from '../../src/app/sectionbar';
import { ExplodeControls, type DistField } from '../../src/app/explodebar';
import { closeMenu } from '../../src/app/menu';
import { imageDialogBody } from '../../src/app/imagedlg';
import { installLocalization } from '../../src/app/i18n';
import type { RecentEntry } from '../../src/app/recent';
import { StepApp } from '../../src/app/app';
import { cube, stepString, StepText } from '../stepText';

const ROOT = join(__dirname, '../..');
const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'de'];
const noop = (): void => {};

// ───────────────────────── 셈 ─────────────────────────

/** 견줄 글: NFKC·소문자, 문장부호·기호·서식 글자·빈칸은 빈칸 하나로 */
const norm = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Cf}\s]+/gu, ' ').trim();
/** 이름이 보이는 글을 품는가(한두 글자 라틴 글은 낱말로) */
function holds(name: string, text: string): boolean {
  const n = norm(name);
  const t = norm(text);
  if (!t) return true;
  return /^[a-z0-9]{1,2}$/.test(t) ? ` ${n} `.includes(` ${t} `) : n.includes(t);
}
/** 표에 적는 글(서식 글자를 빼고 빈칸을 하나로) */
const plain = (s: string): string => s.replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();

/** 누를 칸(이름이 내용에서 오는 역할) */
const PRESS = 'button, a[href], summary, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], [role=checkbox], [role=switch], [role=option], [role=treeitem]';
/** 입력 칸(이름이 이름표에서 오는 칸) */
const FIELD = 'input, select, textarea, [role=slider]';
/** 보이는 글에서 빼는 것(아이콘·aria-hidden·숨은 글·숨긴 칸·입력 칸 값) */
const UNSEEN = 'svg, input, select, textarea, [aria-hidden="true"], [hidden], .sr-only';

/** 마디의 글(seen: 보이는 글만 — 아니면 aria-hidden만 빼고 숨은 글도, 이름을 내용에서 셀 때) */
function textOf(n: Node, seen: boolean): string {
  if (n.nodeType === Node.TEXT_NODE) return n.nodeValue ?? '';
  if (!(n instanceof Element)) return '';
  if (seen ? n.matches(UNSEEN) : n.matches('svg, [aria-hidden="true"]')) return '';
  return [...n.childNodes].map((c) => textOf(c, seen)).join('');
}
const inner = (el: Element, seen: boolean): string => [...el.childNodes].map((c) => textOf(c, seen)).join('');

/** 감싼 이름표의 글: 칸 앞 글(입력 칸 뒤 단위·안내는 빼고), 확인 칸·라디오는 칸 밖 모든 글 */
function labelText(label: Element, ctl: Element): string {
  const box = ctl instanceof HTMLInputElement && /^(checkbox|radio)$/.test(ctl.type);
  let out = '';
  for (const n of label.childNodes) {
    if (n === ctl || n.contains(ctl)) {
      if (!box) break;
      continue;
    }
    out += textOf(n, true);
  }
  return out;
}

/** 접근 이름(aria-labelledby → aria-label → 그 밖): labelledby가 제 칸을 가리키면 그 칸의 aria-label(accname 2B — 이미 걷는 중이면 2C) */
function nameOf(el: Element, fallback: () => string): string {
  const ids = el.getAttribute('aria-labelledby')?.trim();
  if (ids)
    return ids
      .split(/\s+/)
      .map((id) => {
        const r = document.getElementById(id);
        return !r ? '' : r === el ? (el.getAttribute('aria-label') ?? '') : (r.textContent ?? '');
      })
      .join(' ');
  return el.getAttribute('aria-label')?.trim() || fallback();
}

/** 감싸지 않은 입력 칸의 옆 이름표(그 칸 바로 앞에 보이는 글 — 근거) */
const BESIDE: [sel: string, find: (el: Element) => Element | null | undefined, why: string][] = [
  ['.explode-slider', (el) => el.closest('.explode-bar')?.querySelector('.explode-label'), '분해 막대 머리 「분해」 바로 뒤 밀대(app.ts explodeBar — 194차 셈)'],
  ['.section-num', (el) => el.closest('.section-val')?.querySelector('.section-lbl'), '단면 막대 값 칸 「X =」 바로 뒤 숫자 칸(sectionbar.ts — 휴대폰은 이름표를 숨김, styles.css)'],
  ['.cb-hit > input[type=checkbox]', (el) => el.closest('[role=row], tr')?.querySelector('.link-btn'), '레이어·표현 PMI 표 줄의 보이기 상자 — 같은 줄 이름 단추가 보이는 이름(168·231차 규칙)'],
];
/** 보이는 이름표가 없는 입력 칸(이름만 — 근거) */
const BARE: [sel: string, why: string][] = [
  ['.section-slider', '단면 밀대 — 옆 글이 없다(값은 aria-valuetext 「X = 10 mm」, 146차)'],
  ['input[type=file]', '숨은 파일 칸(hidden·tabindex −1 — 「열기」·Ctrl·⌘+O가 엶)'],
];

const tagOf = (el: Element): string => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}${el instanceof HTMLInputElement ? `[${el.type}]` : ''}`;

type Kind = 'content' | 'label' | 'beside' | 'placeholder';
interface Cell {
  el: Element;
  tag: string;
  kind: Kind;
  /** 보이는 글 */
  text: string;
  /** 접근 이름 */
  name: string;
  /** 이름을 따로 달았는가(aria-labelledby·aria-label) */
  named: boolean;
}

/** 문서의 글이 보이는 누를 칸(아이콘만 칸 수, 보이는 이름표 없는 칸·분류 없는 입력 칸) */
function scan(): { cells: Cell[]; icons: number; bare: string[]; unknown: string[]; beside: Set<string> } {
  const cells: Cell[] = [];
  const bare: string[] = [];
  const unknown: string[] = [];
  const beside = new Set<string>();
  let icons = 0;
  const named = (el: Element) => !!el.getAttribute('aria-labelledby')?.trim() || !!el.getAttribute('aria-label')?.trim();
  for (const el of document.body.querySelectorAll(`${PRESS}, ${FIELD}`)) {
    const tag = tagOf(el);
    if (!el.matches(FIELD)) {
      const text = inner(el, true);
      if (!norm(text)) {
        icons++;
        continue;
      }
      cells.push({ el, tag, kind: 'content', text, name: nameOf(el, () => inner(el, false)), named: named(el) });
      continue;
    }
    const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
    let text = label ? labelText(label, el) : '';
    let kind: Kind = 'label';
    if (!norm(text)) {
      const b = BESIDE.find(([s]) => el.matches(s));
      const by = b?.[1](el);
      if (b && by) {
        text = inner(by, true);
        kind = 'beside';
        beside.add(b[0]);
      }
    }
    if (!norm(text) && el.getAttribute('placeholder')) {
      text = el.getAttribute('placeholder')!;
      kind = 'placeholder';
    }
    if (!norm(text)) {
      (BARE.some(([s]) => el.matches(s)) ? bare : unknown).push(tag);
      continue;
    }
    cells.push({ el, tag, kind, text, name: nameOf(el, () => (kind === 'label' ? text : (el.getAttribute('title') ?? ''))), named: named(el) });
  }
  return { cells, icons, bare, unknown, beside };
}
const misses = (cs: Cell[]): string[] => cs.filter((c) => !holds(c.name, c.text)).map((c) => `${c.tag} | ${plain(c.text)} | ${plain(c.name)}`);

// ───────────────────────── 모형(filecells209 꼴 — 이름 없는 부품·레이어 배정, 부품 「블록」) ─────────────────────────

function model(): { bytes: Uint8Array; pd: number; layer: number } {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  const a = cube(w, 10, [0, 0, 0], '');
  const b = cube(w, 10, [20, 0, 0], '');
  const app = w.add('APPLICATION_CONTEXT', `'mechanical design'`);
  const pc = w.add('PRODUCT_CONTEXT', `'',#${app},'mechanical'`);
  const prod = w.add('PRODUCT', `'','','',(#${pc})`);
  const form = w.add('PRODUCT_DEFINITION_FORMATION', `'','',#${prod}`);
  const pdc = w.add('PRODUCT_DEFINITION_CONTEXT', `'part definition',#${app},'design'`);
  const pd = w.add('PRODUCT_DEFINITION', `'','',#${form},#${pdc}`);
  const pds = w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${pd}`);
  const origin = w.ax2([0, 0, 0]);
  const rep = w.add('ADVANCED_BREP_SHAPE_REPRESENTATION', `'',(#${a.solid},#${b.solid},#${origin}),#${mm}`);
  w.add('SHAPE_DEFINITION_REPRESENTATION', `#${pds},#${rep}`);
  w.place(root, { pd, rep, origin }, w.ax2([0, 0, 0]), '');
  w.place(root, w.product(stepString('블록'), [cube(w, 10, [40, 0, 0], '').solid], mm), w.ax2([0, 0, 0]), '');
  w.textProperty(pd, '', '', 'ACME', mm);
  const layer = w.add('PRESENTATION_LAYER_ASSIGNMENT', `'','',(#${a.solid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'L1','',(#${b.solid})`);
  return { bytes: w.bytes(''), pd, layer };
}
const { bytes: BYTES, pd: PD, layer: LAYER } = model();
const SCENE = stepToScene(BYTES, { name: 'a.stp' });
const META = SCENE.meta as unknown as StepMeta;
const GROUPS: GroupInfo[] = [...new Set(SCENE.meshes.map((m) => m.group ?? ''))].map((name) => ({ name, visible: true, count: SCENE.meshes.filter((m) => m.group === name).length }));
const BARE_KEY = `0/${META.products[0]!.children.findIndex((n) => n.name !== '블록')}`;

function stepDoc(): StepDoc {
  const d = createDoc('a.stp', BYTES.length, { scene: SCENE, ms: 1 });
  d.density = 7850;
  d.selKey = BARE_KEY;
  d.expanded = new Set(['0', BARE_KEY]);
  return d;
}
/** PMI 탭: 이름 없는 표현 PMI 하나(보이기 상자·이름 단추), 의미 PMI 하나, 저장된 보기 하나(targetsize234 꼴) */
const PMI_META = {
  products: [],
  pmi: {
    presentations: [{ id: 'pmi1', name: '', type: 'ANNOTATION_OCCURRENCE', stepId: 21 }],
    semantic: [{ kind: 'dimension', type: 'DIMENSIONAL_SIZE', name: 'D1', value: '10', stepId: 22, faces: [7] }],
    views: [{ id: 23, name: 'V1', target: [0, 0, 0], dir: [0, 0, 1], up: [0, 1, 0], distance: 10, projection: 'orthographic', height: 10 }],
  },
};
const pmiDoc = (): StepDoc => createDoc('p.stp', 1, { scene: { meshes: [], lines: [], meta: PMI_META }, ms: 1 } as unknown as ParseResult);

function panelOf(d: StepDoc, tab: PanelTab): HTMLElement {
  const t: Record<string, unknown> = { measuring: false, measureKind: 'points', touch: false, multiPick: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => GROUPS, setDensity: (v: number | null) => (d.density = v) };
  const host = new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : () => {}) }) as unknown as PanelHost;
  const p = Object.assign(new Panel(host), { phys: PHYS, kit: { ...TV, ...PV, infoView, pmiView } });
  p.show(d);
  p.setTab(tab);
  return p.el;
}
const SNAP = { snapshotSize: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 800 * scale, height: 600 * scale, scale }) } as unknown as Pick<Viewer3d, 'snapshotSize'>;
const X_SECTION = { normal: [1, 0, 0], offset: 10, axis: 'x', dir: [1, 0, 0], flip: false, position: 10, min: 0, max: 20, t: 0.5 } as unknown as SectionState;

/** 앱 틀과 뷰어 조각·패널 칸을 그린다(한국어 — 번역층은 그 뒤에 건다) */
function frame(): { root: HTMLElement; close: () => void } {
  const root = h('div', { id: 'app' });
  document.body.append(root);
  const app = new StepApp(root);
  const extra = h('div', { class: 'extra' });
  root.append(extra);
  // 분해 갈래·손질 칸(뷰어 조각 — 앱이 분해 막대 안에 끼운다), 거리 칸: 끈 뒤(옮긴 거리)
  const bound: { f?: DistField } = {};
  const explode = new ExplodeControls(noop, noop, { bind: (f) => (bound.f = f) });
  root.querySelector('.explode-opts')!.append(...explode.els);
  bound.f!.show({ value: '12', unit: 'mm', axis: 'x', live: false });
  // 끌지 않고 연 빈 칸 셋(축 하나·화면 평면·사방 — 옮길 거리) — 거리 칸만
  for (const axis of ['x', 'sp', 'free'] as const) {
    const more: { f?: DistField } = {};
    const c = new ExplodeControls(noop, noop, { bind: (f) => (more.f = f) });
    more.f!.show({ value: '', unit: 'mm', axis, live: false, fresh: true });
    extra.append(c.els[3]!.querySelector('.explode-distance')!);
  }
  // 단면 막대(뷰어 조각): X 축 단면
  const bar = new SectionBar({ viewerRef: null, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: noop, toast: noop });
  extra.append(bar.el);
  bar.sync(X_SECTION);
  // 문서를 연 패널 다섯 탭
  for (const tab of ['tree', 'props', 'layers', 'info'] as PanelTab[]) extra.append(panelOf(stepDoc(), tab));
  extra.append(panelOf(pmiDoc(), 'pmi'));
  // 최근 문서 줄(시작 화면 — 저장한 파일이 있으면)
  const recent = app as unknown as { recentRow(r: RecentEntry, now: number, locale: string): HTMLElement };
  extra.append(h('ul', { class: 'recent-list' }, recent.recentRow({ id: '블록.stp:2048', name: '블록.stp', size: 2048, time: Date.now() - 60_000 }, Date.now(), 'ko')));
  // 그림 저장 대화 상자 본문(고르기 줄 셋·저장)
  extra.append(...imageDialogBody(SNAP, { scale: 1, transparent: false, overlays: true }, noop));
  // 동작이 있는 알림(다시 시도)·앱 설정 메뉴(연 채)
  const shut = app.toast('STEP 파일을 열지 못했습니다.', 'error', 600_000, { label: '다시 시도', run: noop });
  root.querySelector<HTMLButtonElement>('.title-actions button[aria-haspopup="menu"]')!.click();
  return {
    root,
    close: () => {
      shut();
      closeMenu();
      root.remove();
    },
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** 그 언어가 되고 번역층·다시 그리기가 가라앉을 때까지(ci-guard 13번 — 시간과 조건) */
async function settle(code: string): Promise<void> {
  const end = Date.now() + 5000;
  while (document.documentElement.lang !== code && Date.now() < end) await tick();
  let changed = false;
  const watch = new MutationObserver(() => (changed = true));
  watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  for (let quiet = 0; quiet < 5 && Date.now() < end; ) {
    changed = false;
    await tick();
    quiet = changed ? 0 : quiet + 1;
  }
  watch.disconnect();
  expect(document.documentElement.lang).toBe(code);
}

/** 이름을 따로 단 칸의 표(한국어 글 — 번역층을 걸기 전에 센 것, 번역층이 단 언어 메뉴 항목은 그 글) */
const rowsOf = (cs: Cell[], ko: Map<Element, Cell>): string[] =>
  cs
    .filter((c) => c.named)
    .map((c) => {
      const k = ko.get(c.el) ?? c;
      return `${c.tag} | ${plain(k.text)} | ${plain(k.name)}`;
    })
    .sort();

/**
 * 이름을 따로 단 칸(236차 KBD 꼴 · 칸 · 보이는 글 · 이름 — 한국어). 다섯 언어 값은 README 개발 절 241차 문단·.runtime/r241 표.
 * 나머지 글이 보이는 칸(도구 막대·제목 막대 글 단추·탭·메뉴 항목·나무 줄·이름 단추·시작 화면·최근 문서·알림 동작·측정 종류·분해 방식·손질 단추·대화 상자 저장 등)은
 * 이름이 내용에서 와 늘 품는다(따로 단 이름 없음)
 */
const TABLE: [form: string, tag: string, text: string, name: string][] = [
  ['#1 제목 막대 단추', 'a.btn.link', 'GitHub', 'GitHub 소스 코드'],
  ['#17 띠 단추(측정 띠)', 'button.mb-btn', '다시 재기', '다시 재기'],
  ['#17 띠 단추(고른 부품 카드)', 'button.mb-btn', '맞춰 보기', '맞춰 보기'],
  ['#17', 'button.mb-btn', '속성', '속성'],
  ['#17', 'button.mb-btn', '여러 개', '여러 개 고르기'],
  ['#17', 'button.mb-btn', '작업', '작업 메뉴'],
  ['#17 띠 단추(면 띠)', 'button.mb-btn', '정면', '정면'],
  ['#17', 'button.mb-btn', '자르기', '자르기'],
  ['#36 분해 밀대(옆 이름표)', 'input.explode-slider[range]', '분해', '분해 정도'],
  ['#8 갈래 단추(분해 화면 방향)', 'button.seg-btn', '가로', '화면 가로'],
  ['#8', 'button.seg-btn', '세로', '화면 세로'],
  ['#8', 'button.seg-btn', '가로세로', '가로세로(화면 평면)'],
  ['#24·#25 분해 거리 칸(감싼 이름표 — 끈 뒤)', 'input.explode-num[text]', '옮긴 거리', '옮긴 거리(숫자)'],
  ['#24·#25 (끌지 않고 연 빈 칸 — 축 하나)', 'input.explode-num[text]', '옮길 거리', '옮길 거리(숫자)'],
  ['#24·#25 (화면 평면)', 'input.explode-num[text]', '옮길 거리', '옮길 거리(가로; 세로)'],
  ['#24·#25 (사방)', 'input.explode-num[text]', '옮길 거리', '옮길 거리(ΔX; ΔY; ΔZ)'],
  ['#23 단면 숫자 칸(옆 이름표 — 241차 고침)', 'input.section-num[number]', 'X =', 'X = 단면 위치(숫자)'],
  ['#22 이름 거르기 입력(자리 글)', 'input.tree-filter[search]', '이름·자리 이름·제품 번호로 거르기', '이름·자리 이름·제품 번호로 거르기'],
  ['#31·#32 부품별 보이기(감싼 이름표 — 파일 글)', 'input[checkbox]', `#${PD}`, `#${PD} 보이기`],
  ['#31·#32', 'input[checkbox]', '블록', '블록 보이기'],
  ['#30·#31 레이어 보이기(줄 이름 단추)', 'input[checkbox]', `#${LAYER}`, `#${LAYER} 레이어 보이기`],
  ['#30·#31', 'input[checkbox]', 'L1', 'L1 레이어 보이기'],
  ['#30·#31', 'input[checkbox]', '(레이어 없음)', '(레이어 없음) 레이어 보이기'],
  ['#30·#31 표현 PMI 줄 보이기(줄 이름 단추)', 'input[checkbox]', '주석', '주석 보이기'],
  ['#26·#27 대화 상자 줄(속성 탭 재질)', 'select.dlg-select', '재질(밀도가 없는 부품)', '재질(밀도가 없는 부품)'],
  ['#26·#27 (속성 탭 밀도)', 'input.dlg-input[number]', '밀도 직접 입력(g/cm³)', '밀도 직접 입력(g/cm³)'],
  ['#26·#27 (그림 저장)', 'select.dlg-select', '크기', '크기'],
  ['#26·#27', 'select.dlg-select', '바탕', '바탕'],
  ['#26·#27', 'select.dlg-select', '덧그림', '덧그림'],
  ['#13 언어 목록 항목(번역층 — 이름 = 보이는 언어 이름)', 'button', '한국어', '한국어'],
  ['#13', 'button', 'English', 'English'],
  ['#13', 'button', '日本語', '日本語'],
  ['#13', 'button', '简体中文', '简体中文'],
  ['#13', 'button', 'Deutsch', 'Deutsch'],
];
const TABLE_ROWS = TABLE.map(([, tag, text, name]) => `${tag} | ${plain(text)} | ${plain(name)}`).sort();
/** 아직 둔 어긋남(언어 → 칸). 지금 없음 */
const STILL: Record<string, string[]> = {};

beforeAll(async () => {
  // 번역층이 언어를 바꿀 때 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
  await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
});

afterEach(() => {
  closeMenu();
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

describe('241차: 글이 보이는 누를 칸의 이름이 그 글을 품는다(앱 틀을 다섯 언어로 그려)', () => {
  it.each(LANGS)('%s: 어긋나는 칸 0, 이름을 따로 단 칸은 표와 같고, 입력 칸은 모두 이름표·옆 이름표·자리 글·이름표 없음(근거) 가운데 하나', async (code) => {
    const f = frame();
    const ko = new Map(scan().cells.map((c) => [c.el, c] as const));
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(f.root);
    try {
      await settle(code);
      const got = scan();
      const named = got.cells.filter((c) => c.named);
      expect.soft(misses(got.cells), `${code}: 글이 보이는 칸 ${got.cells.length} · 이름을 따로 단 칸 ${named.length} · 아이콘만 ${got.icons}`).toEqual(STILL[code] ?? []);
      expect.soft(rowsOf(got.cells, ko)).toEqual(TABLE_ROWS);
      expect(got.unknown).toEqual([]);
      expect(got.bare.sort()).toEqual(['input.section-slider[range]', 'input[file]']);
      // 옆 이름표 규칙은 모두 쓰인다(낡은 줄 없음)
      expect([...got.beside].sort()).toEqual(BESIDE.map(([s]) => s).sort());
      // 셈이 비지 않음: 이름을 내용에서 받는 칸이 더 많고, 다른 언어는 이름이 실제로 옮겨졌다
      expect(got.cells.length).toBeGreaterThan(named.length * 2);
      // (파일 글 「블록」·언어 이름 「한국어」는 번역하지 않는 글)
      if (code !== 'ko') expect(named.filter((c) => /[가-힣]/.test(plain(c.name).replace(/블록|한국어/g, ''))).map((c) => c.tag)).toEqual([]);
    } finally {
      dispose();
      f.close();
    }
  });

  it('언어를 바꿔도(한국어 → 독일어 → 일본어 — 번역층이 기록한 원문으로 다시 옮김) 어긋남 0, 이름 칸은 같은 표', async () => {
    const f = frame();
    const ko = new Map(scan().cells.map((c) => [c.el, c] as const));
    history.replaceState(null, '', '/?lang=ko');
    const dispose = await installLocalization(f.root);
    try {
      await settle('ko');
      for (const code of ['de', 'ja']) {
        document.querySelector<HTMLButtonElement>(`.language-list [data-language="${code}"]`)!.click();
        await settle(code);
        const got = scan();
        expect.soft(misses(got.cells), code).toEqual([]);
        expect.soft(rowsOf(got.cells, ko), code).toEqual(TABLE_ROWS);
      }
    } finally {
      dispose();
      f.close();
    }
  });
});

describe('241차: 단면 막대 숫자 칸 — 축 단면은 보이는 이름표 「X =」를 이름 앞에(aria-labelledby: 이름표 + 제 aria-label)', () => {
  it('X·Y·Z 단면은 「X = 단면 위치(숫자)」 꼴, 면 단면(이름표 「위치」 — 이름이 이미 품음)은 aria-label만, 설명(단위)·aria-label은 그대로', () => {
    const bar = new SectionBar({ viewerRef: null, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: noop, toast: noop });
    document.body.append(bar.el);
    const num = bar.el.querySelector<HTMLInputElement>('.section-num')!;
    const lbl = bar.el.querySelector<HTMLElement>('.section-lbl')!;
    const name = () => nameOf(num, () => '');
    for (const axis of ['x', 'y', 'z'] as const) {
      bar.sync({ ...X_SECTION, axis } as SectionState);
      expect([lbl.textContent, name()]).toEqual([`${axis.toUpperCase()} =`, `${axis.toUpperCase()} = 단면 위치(숫자)`]);
      expect(holds(name(), lbl.textContent!)).toBe(true);
    }
    bar.sync({ ...X_SECTION, axis: null } as SectionState);
    expect([lbl.textContent, num.hasAttribute('aria-labelledby'), name()]).toEqual(['위치', false, '단면 위치(숫자)']);
    expect(holds(name(), lbl.textContent!)).toBe(true);
    expect([num.getAttribute('aria-label'), num.getAttribute('aria-describedby')]).toEqual(['단면 위치(숫자)', 'section-unit']);
    // 이름표·숫자 칸 id는 문서에 하나(단면 막대는 하나뿐 — 단위 칸 section-unit과 같은 꼴)
    expect([lbl.id, num.id]).toEqual(['section-lbl', 'section-pos']);
  });
});

/** src/app 파일마다 이름 다는 글자('aria-label'·'aria-labelledby' 자리) 수 — 새 자리가 생기면 그 칸이 보이는 글을 품는지 보고 늘린다 */
const NAME_SITES: Record<string, number> = {
  // 제목 막대 GitHub·여는 중 진행 막대·측정 띠(다시 재기·측정 종류·카드 다섯·방향 잠금)·분해 밀대·끄기·막대·3D 보기·최근 문서 묶음·✕·테마·알림 ✕·끝내기 ✕
  'app.ts': 20,
  // 닫기·대화 상자·고르기 줄
  'dialog.ts': 3,
  // 아이콘만 단추(hideLabel)
  'dom.ts': 1,
  // 방식·방향 묶음·화면 방향 셋·손질 파일·손질 묶음·거리 칸 둘
  'explodebar.ts': 7,
  // 번역층(옮기는 속성·언어 단추·목록)
  'i18n.ts': 6,
  'menu.ts': 1,
  // 탭 줄·닫기·패널·탭 본문(labelledby)·거르기 칸
  'panel.ts': 5,
  // 레이어 보이기 상자
  'panelview.ts': 1,
  // PMI 표(labelledby)·줄 보이기 상자
  'pmiview.ts': 2,
  // 밀도 칸
  'propsview.ts': 1,
  // 패널 크기 손잡이
  'resize.ts': 1,
  // 축 묶음·밀대·숫자 칸·뒤집기·끄기·막대, 241차 숫자 칸 labelledby 둘(달기·떼기)
  'sectionbar.ts': 8,
  'toolbar.ts': 1,
  // 나무 도구·모델 트리·눈·부품별 보이기 표·상자
  'treeview.ts': 5,
};

describe('241차: 원문의 이름 다는 자리', () => {
  it('src/app 파일마다 aria-label·aria-labelledby 자리 수가 표와 같다(그리지 않는 칸까지 — 새 자리면 보이는 글을 품는지 보고 표를 늘린다)', () => {
    const got: Record<string, number> = {};
    for (const f of readdirSync(join(ROOT, 'src/app')).filter((x) => x.endsWith('.ts')).sort()) {
      const n = readFileSync(join(ROOT, 'src/app', f), 'utf8').match(/['"]aria-label(?:ledby)?['"]/g)?.length ?? 0;
      if (n) got[f] = n;
    }
    expect(got).toEqual(NAME_SITES);
  });
});

describe('241차: 셈이 헛돌지 않는다', () => {
  it('이름이 글을 품지 않으면 잡고, 대소문자·문장부호·기호·키 글 「(F)」는 셈 밖, 한두 글자 라틴 글은 낱말로, 아이콘만 칸·입력 칸 뒤 단위는 빼고, 확인 칸은 뒤 글이 이름표', () => {
    document.body.innerHTML = [
      '<button aria-label="열기">파일 열기</button>',
      '<button aria-label="전체 보기 (F)">전체 보기</button>',
      '<button aria-label="SHOW ALL!">Show all ▾</button>',
      '<button aria-label="닫기"><svg></svg><span class="sr-only">닫기 글</span></button>',
      '<label>거리 <input type="text" aria-label="옮긴 거리(숫자)"> mm</label>',
      '<label><input type="checkbox" aria-label="보이기"> 블록</label>',
      '<span class="section-val"><span class="section-lbl">X =</span><input type="number" class="section-num" aria-label="explode"></span>',
      '<input type="text" class="new-field" aria-label="새 칸">',
    ].join('');
    const got = scan();
    expect(got.icons).toBe(1);
    expect(got.unknown).toEqual(['input.new-field[text]']);
    expect(misses(got.cells)).toEqual(['button | 파일 열기 | 열기', 'input[checkbox] | 블록 | 보이기', 'input.section-num[number] | X = | explode']);
    expect(holds('Multi-select', 'Multi')).toBe(true);
    expect(holds('Schnittposition (Zahl)', 'Position')).toBe(true);
    expect(holds('移動距離（数値）', '移動距離')).toBe(true);
    expect(holds('X = Section position (number)', 'X =')).toBe(true);
    expect(holds('Section position (number)', 'X =')).toBe(false);
  });
});
