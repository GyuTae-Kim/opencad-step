// @vitest-environment jsdom
/**
 * 209차(WCAG 3.1.2 — 재발 막기): 앱이 만든 한국어 낱말이 번역하지 않는 칸(파일 글 칸 — `translate="no"`: fileSpan·속성 줄 kData·vData·격리 띠 이름 칸)에 들어가면
 * 번역층(i18n.ts SKIP)이 옮기지 않아 다른 언어 화면에 한국어로 남는다(208차 이름 없는 속성 줄 「속성」 꼴). 이름·설명이 빈 제품·몸체·속성·레이어 배정을 단 합성 STEP으로
 * 주요 화면 — 모델 트리(나무 줄·몸체 줄·부품별 보이기)·속성 탭(부품 속성·물리 속성)·레이어 탭·정보 탭·패널 아래 띠·고른 부품 카드 이름·격리 띠 — 을 다섯 언어로 그려,
 * 파일 글(한국어 이름 「블록」) 밖의 글·말풍선·이름에 한글이 없는지 본다(한국어 화면은 번역하지 않는 칸 안에 앱 한국어가 없는지).
 * 카드 이름·격리 띠는 앱 전체를 띄우지 않고 app.ts 원문의 selectionName·카드 이름 줄·격리 띠 만들기·syncIsolate를 잘라 가짜 this로 돌린다(keynav 180차 꼴).
 * 209차에 고친 것: 격리 띠 이름 칸의 translate="no"(묶음 이름표 「부품 2개」·「레이어 …」·몸체 「… · 바디 2」가 남음), 해석기의 이름 없는 제품 「제품 #n」·레이어 배정 「레이어 #n」
 * → STEP 번호 「#n」(앱 낱말 없음), 물리 속성 주 관성 모멘트 값 칸의 앱 말풍선(translate="no" 칸이라 사전에 있어도 옮겨지지 않음).
 * 아직 둔 것은 STILL(언어 → 남는 글) — 목록에 있는데 이제 한글이 없으면 실패한다(고쳤으면 목록에서 뺀다).
 * 210차: 이름 없는 표현 PMI의 묶음 이름표·3D에서 누른 PMI의 상태 막대(아래 describe — 따로 만든 PMI 합성 STEP).
 * 211차: 상태 막대(글·말풍선 — 말풍선은 번역 전 글 통째라 「고른 것: {0}」 틀이 묶음 이름표를 그대로 끼웠다)도 그린다, 이름 없는 의미 PMI 25종, 앱 글 칸(data-i18n-ui)의 파일 글(맨 아래 describe).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GroupInfo } from 'opencad-viewer3d';
import { stepToScene, type StepMeta } from '../../src/scene';
import { bodyTitle, createDoc, multiLabel, productAt, type PanelTab, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { nodeLabel } from '../../src/app/tree';
import { Panel, pmiTypeLabel, semanticLabel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import { infoView } from '../../src/app/infoview';
import { pmiView } from '../../src/app/pmiview';
import * as PHYS from '../../src/app/physics';
import { Fmt } from '../../src/app/display';
import { h, icon } from '../../src/app/dom';
import { isolateText } from '../../src/app/ftext';
import { installLocalization } from '../../src/app/i18n';
import { cube, stepString, StepText } from '../stepText';

/** 파일 글 이름(한국어) — 번역하지 않는 칸에 그대로 남아도 되는 한글은 이것뿐 */
const KO_FILE = '블록';
const HANGUL = /[가-힣]/;
/** 번역층이 옮기는 속성(i18n.ts element) */
const ATTRS = ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'];
/** 아직 둔 것(언어 → 남는 글 — leaks 꼴). 지금 없음 */
const STILL: Record<string, string[]> = {};

/** 뿌리 'asm' 아래 이름 없는 부품(이름 없는 입체 둘·이름 없는 속성)과 한국어 이름 부품 「블록」, 이름 없는 레이어 배정 하나·L1 하나. 파일 머리 FILE_NAME도 빈 글 */
function model(): { bytes: Uint8Array; pd: number; layer: number } {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  const a = cube(w, 10, [0, 0, 0], '');
  const b = cube(w, 10, [20, 0, 0], '');
  // 제품 이름·번호·정의 이름·표현 이름이 모두 빈 제품 — 해석기가 이름을 찾는 길(제품 → 정의 → 표현 → 파일 머리)의 끝
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
  w.place(root, w.product(stepString(KO_FILE), [cube(w, 10, [40, 0, 0], '').solid], mm), w.ax2([0, 0, 0]), '');
  // 이름·설명 없는 STEP 속성(208차)
  w.textProperty(pd, '', '', 'ACME', mm);
  const layer = w.add('PRESENTATION_LAYER_ASSIGNMENT', `'','',(#${a.solid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'L1','',(#${b.solid})`);
  return { bytes: w.bytes(''), pd, layer };
}

const { bytes, pd, layer } = model();
const scene = stepToScene(bytes, { name: 'a.stp' });
const meta = scene.meta as unknown as StepMeta;
/** 코어 groups()와 같은 묶음(메시 group 이름 — 부품별 보이기 표) */
const groups: GroupInfo[] = [...new Set(scene.meshes.map((m) => m.group ?? ''))].map((name) => ({ name, visible: true, count: scene.meshes.filter((m) => m.group === name).length }));
const bareKey = `0/${meta.products[0]!.children.findIndex((n) => n.name !== KO_FILE)}`;

function newDoc(): StepDoc {
  const d = createDoc('a.stp', bytes.length, { scene, ms: 1 });
  d.density = 7850;
  return d;
}

function host(d: StepDoc, picked: string[]): PanelHost {
  const t: Record<string, unknown> = {
    measuring: false,
    measureKind: 'points',
    touch: false,
    multiPick: false,
    fmt: new Fmt('mm'),
    isVisible: () => true,
    groups: () => groups,
    setDensity: (v: number | null) => (d.density = v),
    selectItems: (_ids: unknown, label: string) => picked.push(label),
    // 의미 PMI 이름 버튼(면에 이어진 줄 — 211차)
    showPmiFaces: (_faces: unknown, label: string) => (picked.push(label), true),
  };
  return new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : () => {}) }) as unknown as PanelHost;
}

/** 패널 하나(나무 조각·정보 탭·물리 속성은 앱이 뷰어를 만들 때 넣는다 — 시험은 모듈을 바로 넣는다) */
function panel(tab: PanelTab, picked: string[]): HTMLElement {
  const d = newDoc();
  // 이름 없는 부품을 고른 채(아래 띠), 뿌리와 그 부품을 펼쳐 몸체 줄까지
  d.selKey = bareKey;
  d.expanded = new Set(['0', bareKey]);
  const p = Object.assign(new Panel(host(d, picked)), { phys: PHYS, kit: { ...TV, infoView } });
  p.show(d);
  p.setTab(tab);
  return p.el;
}

// app.ts 원문을 잘라 돌린다(앱 전체는 시험에서 띄우지 않는다)
const APP = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
const cut = (re: RegExp): string => {
  const m = re.exec(APP)?.[1];
  if (!m) throw new Error(`app.ts에서 찾지 못함: ${re}`);
  return m;
};
const NAME = cut(/\n {2}private selectionName\(d: StepDoc\): string \{\n([\s\S]*?)\n {2}\}\n/);
const CARD = cut(/const nm = this\.selectionName\(d\);\n\s*(t\.append\(h\('b', \{ class: 'mb-value mb-name'[^\n]*)/);
const ISO_MAKE = cut(/(this\.isoText = h\([\s\S]*?this\.isoBar = h\([^\n]*\n)/);
const ISO_SYNC = cut(/\n {2}private syncIsolate\(\): void \{\n([\s\S]*?)\n {2}\}\n/).replace(/\bd!\./g, 'd.');
const selectionName = new Function('d', 'productAt', 'nodeLabel', 'isolateText', 'bodyTitle', NAME) as (d: object, ...fns: unknown[]) => string;

/** 고른 부품 카드 이름(refreshBar의 그 줄) */
function card(nm: string): HTMLElement {
  const t = h('div', { class: 'mb-text' });
  new Function('h', 't', 'nm', CARD)(h, t, nm);
  return t;
}

/** 격리 띠(만들기 + syncIsolate — 이것만 보기 중) */
function iso(label: string): HTMLElement {
  const self: Record<string, unknown> = { unisolate: () => {}, toolbar: { refresh: () => {} }, doc: null };
  new Function('h', 'icon', ISO_MAKE).call(self, h, icon);
  self.doc = { vis: { isolated: new Set(['x']) }, dim: null, isoLabel: label };
  new Function(ISO_SYNC).call(self);
  return self.isoBar as HTMLElement;
}

/**
 * 파일 글 「블록」을 뺀 뒤 한글이 남는 글 마디·번역층이 옮기는 속성. 한국어 화면은 번역하지 않는 칸(translate="no" 안) 것만 —
 * 그 칸의 앱 한국어는 다른 언어에서 그대로 남는다
 */
function leaks(root: Element, code: string): string[] {
  const out: string[] = [];
  const korean = (s: string) => HANGUL.test(s.split(KO_FILE).join(''));
  const counted = (el: Element) => code !== 'ko' || !!el.closest('[translate="no"]');
  const walk = (el: Element): void => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && korean(v) && counted(el)) out.push(`${a}: ${v}`);
    }
    for (const n of el.childNodes) {
      if (n instanceof Element) walk(n);
      else if (n.nodeType === Node.TEXT_NODE && korean(n.nodeValue ?? '') && counted(el)) out.push(`text: ${n.nodeValue}`);
    }
  };
  walk(root);
  return out;
}

describe('209차: 앱 한국어는 번역하지 않는 칸 밖에(다섯 언어 — 파일 글 칸 밖 한글 0)', () => {
  it('해석기: 이름 없는 제품·레이어 배정의 이름은 앱 낱말 없이 STEP 번호(#n — 같은 해석기의 이름 없는 저장된 보기 꼴)', () => {
    expect(meta.products[0]!.children.map((n) => n.name).sort()).toEqual([`#${pd}`, KO_FILE].sort());
    expect(meta.layers!.map((l) => l.name).sort()).toEqual([`#${layer}`, 'L1'].sort());
    // 부품별 보이기 묶음 열쇠도 그 이름(이름 없는 제품끼리 한 묶음으로 합쳐지지 않는다)
    expect(groups.map((g) => `${g.name} ${g.count}`).sort()).toEqual([`#${pd} 2`, `${KO_FILE} 1`].sort());
  });

  it.each(['ko', 'en', 'ja', 'zh-CN', 'de'])('%s: 모델 트리·속성·레이어·정보 탭·아래 띠·고른 부품 카드·격리 띠', async (code) => {
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    const picked: string[] = [];
    for (const tab of ['tree', 'props', 'layers', 'info'] as const) views.append(panel(tab, picked));
    // 레이어 탭 이름 버튼이 넘기는 고른 것 이름표(이름 없는 레이어·L1·레이어 없음)
    for (const b of views.querySelectorAll<HTMLElement>('table.grid tbody .link-btn')) b.click();
    expect(picked).toHaveLength(3);
    // 고른 것: 이름 없는 부품·그 둘째 바디·여러 개(부품 2개)·레이어 이름표 셋
    const base = newDoc();
    const ids = scene.meshes.map((m) => m.id);
    const sels: object[] = [
      { ...base, selKey: bareKey },
      { ...base, body: productAt(base.products, bareKey)!.meshIds[1] },
      { ...base, items: { ids, label: multiLabel(base.products, ids) } },
      ...picked.map((label) => ({ ...base, items: { ids: [], label } })),
    ];
    for (const s of sels) {
      const nm = selectionName(s, productAt, nodeLabel, isolateText, bodyTitle);
      // 211차: 상태 막대도(말풍선 「고른 것: 부품 2개」·「고른 것: 레이어 …」 — 틀이 묶음 이름표를 그대로 끼워 남았다)
      views.append(card(nm), iso(nm), status(s));
    }
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      // 그린 것이 비지 않았다(나무 줄 다섯 — 뿌리·이름 없는 부품·바디 둘·블록, 레이어 줄 셋, 카드·격리 띠·상태 막대 여섯, 이름 없는 속성 값)
      expect(views.querySelectorAll('.tree-row').length).toBe(5);
      expect(views.querySelectorAll('table.grid tbody tr').length).toBe(3);
      expect(views.querySelectorAll('.mb-name').length).toBe(6);
      expect(views.querySelectorAll('.iso-bar:not([hidden])').length).toBe(6);
      expect(views.querySelectorAll('.status-sel').length).toBe(6);
      expect([...views.querySelectorAll('.prop-row dd')].some((dd) => dd.textContent === 'ACME')).toBe(true);
      // 파일 글(한국어 이름)은 어느 언어에서나 번역하지 않는 칸에 그대로
      expect([...views.querySelectorAll('[translate="no"]')].some((el) => el.textContent === KO_FILE)).toBe(true);
      expect(leaks(views, code)).toEqual(STILL[code] ?? []);
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });
});

// ───────────────────────── 210차 ─────────────────────────

/**
 * 210차: 이름 없는 표현 PMI를 누르면 넘기는 묶음 이름표 「PMI {종류}」(pmiview.ts)는 한 글로 상태 막대·고른 부품 카드·아래 띠·격리 띠에 들어간다. 번역층은 틀이
 * 잡은 값을 그대로 끼워(문서 자료로 본다 — site-kit translate, uiParameters 없음) 「PMI {0}」 틀로는 종류가 옮겨지지 않아 「PMI 주석」 밖 여덟 종류가 네 언어에서
 * 한국어로 남았다 → 통째 원문 열쇠 여덟. 3D에서 이름 없는 PMI를 누른 상태 막대 「고른 PMI: {종류}」도 틀이 종류를 그대로 끼워 남았다 → 조각(아래 띠 꼴).
 */
const PMI_KINDS: [type: string, kind: string][] = [
  ['ANNOTATION_CURVE_OCCURRENCE', '곡선 주석'],
  ['ANNOTATION_OCCURRENCE', '주석'],
  ['ANNOTATION_FILL_AREA_OCCURRENCE', '채운 영역 주석'],
  ['DRAUGHTING_ANNOTATION_OCCURRENCE', '제도 주석'],
  ['TESSELLATED_ANNOTATION_OCCURRENCE', '삼각형 주석'],
  ['ANNOTATION_PLACEHOLDER_OCCURRENCE', '자리 주석'],
  ['ANNOTATION_SYMBOL_OCCURRENCE', '기호 주석'],
  ['ANNOTATION_TEXT_OCCURRENCE', '글 주석'],
  ['ANNOTATION_POINT_OCCURRENCE', '점 주석'],
];

/** 부품 하나와 이름 없는 제도 모형 — 그 안에 이름 없는 표현 PMI 아홉 종류(PMI_TYPE 차례, 꺾은선 하나씩 — 그려야 PMI 표에 든다) */
function pmiBytes(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const part = w.product('part', [cube(w, 10, [0, 0, 0], '').solid], mm);
  const occ = PMI_KINDS.map(([type], i) => w.add(type, `'',(),#${w.add('POLYLINE', `'',(#${w.pt([0, i - 2, 0])},#${w.pt([10, i - 2, 0])})`)}`));
  const dm = w.add('DRAUGHTING_MODEL', `'',(${occ.map((id) => `#${id}`).join(',')}),#${mm}`);
  w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${dm},#${part.rep}`);
  return w.bytes();
}

const pscene = stepToScene(pmiBytes(), { name: 'p.stp' });
const pmeta = pscene.meta as unknown as StepMeta;
/** 네 사전(종류 이름 꼴·틀 값) */
const CAT: Record<string, Record<string, string>> = Object.fromEntries(
  ['en', 'ja', 'zh-CN', 'de'].map((c) => [c, JSON.parse(readFileSync(join(__dirname, `../../site/locales/${c}.json`), 'utf8')) as Record<string, string>]),
);
const fill = (t: string, ...v: string[]): string => t.replace(/\{(\d+)\}/g, (_, i: string) => v[Number(i)] ?? '');

// 상태 막대 고른 것 칸(앱이 만드는 칸 — 211차 표지도 — 과 updateStatus의 selectionText 조각·막대 말풍선)
const STATUS_MAKE = cut(/\n\s*(this\.statusSel = h\('div', [^\n]*\);)\n/);
const SEL_TEXT = cut(/\n {2}private selectionText\(d: StepDoc\): \(Node \| string\)\[\] \{\n([\s\S]*?)\n {2}\}\n/).replace(/(\w)!\./g, '$1.');
const STATUS_TITLE = cut(/\n\s*(this\.statusSel\.title = this\.statusSel\.textContent \?\? '';)\n/);
function status(d: object): HTMLElement {
  const self = { fmt: new Fmt('mm'), entMeasuring: false, measuring: false, selectionName: (x: object) => selectionName(x, productAt, nodeLabel, isolateText, bodyTitle) };
  const sel = new Function('d', 'h', 'productAt', 'isolateText', 'pmiTypeLabel', SEL_TEXT).call(self, d, h, productAt, isolateText, pmiTypeLabel) as (Node | string)[];
  const bar: { statusSel?: HTMLElement } = {};
  new Function('h', STATUS_MAKE).call(bar, h);
  const statusSel = bar.statusSel!;
  statusSel.replaceChildren(...sel);
  new Function(STATUS_TITLE).call({ statusSel });
  return statusSel;
}

describe('210차: 이름 없는 표현 PMI 묶음 이름표(다섯 언어 — 상태 막대·고른 부품 카드·아래 띠·격리 띠)와 3D에서 누른 PMI의 상태 막대', () => {
  it('해석기: 이름·모형 이름 없는 표현 PMI 아홉 종류(PMI_TYPE 차례)', () => {
    expect(pmeta.pmi!.presentations.map((x) => [x.type, x.name, x.model ?? ''])).toEqual(PMI_KINDS.map(([type]) => [type, '', '']));
  });

  it.each(['ko', 'en', 'ja', 'zh-CN', 'de'])('%s: PMI 표·누른 이름표의 네 자리·3D에서 누른 상태 막대', async (code) => {
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    const picked: string[] = [];
    const d = createDoc('p.stp', 1, { scene: pscene, ms: 1 });
    const p = Object.assign(new Panel(host(d, picked)), { phys: PHYS, kit: { ...TV, infoView, pmiView } });
    p.show(d);
    p.setTab('pmi');
    views.append(p.el);
    // 표 줄 이름 버튼이 넘기는 묶음 이름표(이름 없는 PMI — 「PMI {종류}」)
    const btns = [...views.querySelectorAll<HTMLElement>('.pmi-grid .link-btn')];
    expect(btns).toHaveLength(9);
    for (const b of btns) b.click();
    expect(picked).toEqual(PMI_KINDS.map(([, kind]) => `PMI ${kind}`));
    const pres = d.pmi.presentations;
    const foot = p.el.querySelector<HTMLElement>('.panel-foot')!;
    picked.forEach((label, i) => {
      const sel = { ...d, items: { ids: [pres[i]!.id], label } };
      const nm = selectionName(sel, productAt, nodeLabel, isolateText, bodyTitle);
      d.items = sel.items;
      p.onSelection();
      views.append(card(nm), iso(nm), status(sel), foot.cloneNode(true) as HTMLElement);
      // 3D에서 그 PMI를 누름(상태 막대 「고른 PMI: …」)
      views.append(status({ ...d, items: null, pick: { id: pres[i]!.id, kind: 'line', point: [0, 0, 0] } }));
    });
    d.items = null;
    p.onSelection();
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      expect(views.querySelectorAll('.mb-name').length).toBe(9);
      expect(views.querySelectorAll('.iso-bar:not([hidden])').length).toBe(9);
      expect(views.querySelectorAll('.status-sel').length).toBe(18);
      expect(views.querySelectorAll('.panel-foot .foot-sel').length).toBe(9);
      // 한국어 화면의 상태 막대 글은 원문 그대로(조각으로 나눠도 바이트 같음)
      if (code === 'ko') expect([...views.querySelectorAll('.status-sel')].map((s) => s.textContent)).toEqual(picked.flatMap((label, i) => [`고른 것: ${label}`, `고른 PMI: ${PMI_KINDS[i]![1]}`]));
      // 211차: 210차에 둔 말풍선 27(언어마다 — PMI 표 이름 버튼 「{종류} · #{번호} · 누르면 강조(…)」 9, 상태 막대 「고른 것: PMI {종류}」 9·「고른 PMI: {종류}」 9)은
      // 앱 글 칸(data-i18n-ui)이라 틀이 잡은 종류도 옮겨져 남지 않는다
      expect(leaks(views, code).sort()).toEqual([]);
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });
});

// ───────────────────────── 211차 ─────────────────────────

/** 의미 PMI 개체 25종(panel.ts SEMANTIC_TYPE 차례) — 이름 없는 줄을 누르면 넘기는 묶음 이름표는 「PMI {종류}」(pmiview.ts labelOf) */
const SEM_TYPES = [
  'DIMENSIONAL_SIZE', 'DIMENSIONAL_LOCATION', 'ANGULAR_SIZE', 'ANGULAR_LOCATION', 'DIMENSIONAL_SIZE_WITH_PATH', 'DIMENSIONAL_LOCATION_WITH_PATH', 'DIRECTED_DIMENSIONAL_LOCATION',
  'FLATNESS_TOLERANCE', 'STRAIGHTNESS_TOLERANCE', 'ROUNDNESS_TOLERANCE', 'CYLINDRICITY_TOLERANCE', 'LINE_PROFILE_TOLERANCE', 'SURFACE_PROFILE_TOLERANCE', 'ANGULARITY_TOLERANCE',
  'PARALLELISM_TOLERANCE', 'PERPENDICULARITY_TOLERANCE', 'POSITION_TOLERANCE', 'CONCENTRICITY_TOLERANCE', 'COAXIALITY_TOLERANCE', 'SYMMETRY_TOLERANCE',
  'CIRCULAR_RUNOUT_TOLERANCE', 'TOTAL_RUNOUT_TOLERANCE', 'GEOMETRIC_TOLERANCE', 'DATUM', 'COMMON_DATUM',
];
/** 이름·값 없이 면 하나에 이어진 의미 PMI(이름 버튼이 생긴다 — pmiview.test 꼴로 meta를 바로 넣는다) */
const SEM = SEM_TYPES.map((type, i) => ({ kind: /TOLERANCE$/.test(type) ? 'tolerance' : /DATUM$/.test(type) ? 'datum' : 'dimension', type, name: '', value: '', stepId: 7000 + i, faces: [7] }));

describe('211차: 앱 글 칸은 틀이 잡은 앱 글도 옮긴다 — 이름 없는 의미 PMI 묶음 이름표(다섯 언어)·파일 글은 그대로·PMI 종류 이름표 꼴', () => {
  it('종류 이름이 모두 사전 원문(25종)이고, PMI 종류 이름표 값은 네 언어 모두 같은 사전의 종류 이름 + 「PMI 주석」 꼴 앞머리(일본어 「PMI 주석」도 注釈 — 전에는 アノテーション)', () => {
    expect(SEM_TYPES.map(semanticLabel).filter((kind) => !CAT.en![kind])).toEqual([]);
    const head: Record<string, (v: string) => string> = { en: (v) => `PMI ${v[0]!.toLowerCase()}${v.slice(1)}`, ja: (v) => `PMI${v}`, 'zh-CN': (v) => `PMI${v}`, de: (v) => `PMI-${v}` };
    for (const [code, f] of Object.entries(head)) for (const [, kind] of PMI_KINDS) expect(CAT[code]![`PMI ${kind}`], `${code}: ${kind}`).toBe(f(CAT[code]![kind]!));
    // 이름 없는 의미 PMI는 틀 하나 — 앞머리 같은 꼴(영어는 종류 이름의 대문자 그대로)
    expect(['en', 'ja', 'zh-CN', 'de'].map((c) => CAT[c]!['PMI {0}'])).toEqual(['PMI {0}', 'PMI{0}', 'PMI{0}', 'PMI-{0}']);
  });

  it.each(['ko', 'en', 'ja', 'zh-CN', 'de'])('%s: 의미 PMI 표·누른 이름표의 네 자리(카드·격리 띠·상태 막대·아래 띠)', async (code) => {
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    const picked: string[] = [];
    const d = createDoc('s.stp', 1, { scene: { meshes: [], lines: [], meta: { products: [], pmi: { presentations: [], semantic: SEM } } }, ms: 1 } as unknown as ParseResult);
    const p = Object.assign(new Panel(host(d, picked)), { phys: PHYS, kit: { ...TV, infoView, pmiView } });
    p.show(d);
    p.setTab('pmi');
    views.append(p.el);
    const btns = [...views.querySelectorAll<HTMLElement>('.pmi-grid .link-btn')];
    expect(btns).toHaveLength(25);
    for (const b of btns) b.click();
    expect(picked).toEqual(SEM_TYPES.map((type) => `PMI ${semanticLabel(type)}`));
    const foot = p.el.querySelector<HTMLElement>('.panel-foot')!;
    for (const label of picked) {
      const sel = { ...d, items: { ids: ['f'], label } };
      const nm = selectionName(sel, productAt, nodeLabel, isolateText, bodyTitle);
      d.items = sel.items;
      p.onSelection();
      views.append(card(nm), iso(nm), status(sel), foot.cloneNode(true) as HTMLElement);
    }
    d.items = null;
    p.onSelection();
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      expect(views.querySelectorAll('.mb-name').length).toBe(25);
      expect(views.querySelectorAll('.iso-bar:not([hidden])').length).toBe(25);
      expect(views.querySelectorAll('.status-sel').length).toBe(25);
      expect(views.querySelectorAll('.panel-foot .foot-sel').length).toBe(25);
      if (code === 'ko') expect([...views.querySelectorAll('.status-sel')].map((s) => s.textContent)).toEqual(picked.map((label) => `고른 것: ${label}`));
      expect(leaks(views, code).sort()).toEqual([]);
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });

  it.each(['en', 'ja', 'zh-CN', 'de'])('%s: 앱 글 칸(data-i18n-ui)의 갇힌 파일 글은 앱 글·사전 열쇠와 같아도 그대로, 표지 없는 칸은 틀 값을 그대로(지금처럼)', async (code) => {
    const c = CAT[code]!;
    // 파일 글이 앱 글(사전 열쇠)과 같은 이름 — 「부품 2개」·「열기」
    const part = isolateText('부품 2개');
    const open = isolateText('열기');
    const cell = h('span', { 'data-i18n-ui': '', title: `고른 것: 부품 2개 · ${part}`, 'aria-label': `${open} 숨기기` }, `레이어 ${part}`);
    const inner = h('b', {}, `고른 것: ${open}`);
    const plain = h('span', { title: '고른 것: 부품 2개' });
    const root = h('div', {}, h('div', { 'data-i18n-ui': '' }, inner), cell, plain);
    document.body.append(root);
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      // 틀이 잡은 앱 글(「부품 2개」)은 옮기고 갇힌 파일 글은 한 번 그대로
      expect(cell.title.split(part)).toHaveLength(2);
      expect(cell.title.split(part).join(''), cell.title).not.toMatch(HANGUL);
      expect(cell.title).toContain(fill(c['부품 {0}개']!, '2'));
      expect(cell.getAttribute('aria-label')).toBe(fill(c['{0} 숨기기']!, open));
      expect(cell.textContent).toBe(fill(c['레이어 {0}']!, part));
      // 표지는 안쪽 글 마디에도(조상 칸)
      expect(inner.textContent).toBe(fill(c['고른 것: {0}']!, open));
      // 표지 없는 칸: 틀이 잡은 값은 문서 자료로 보고 그대로(i18n.test 「열기 숨기기」 꼴)
      expect(plain.title).toBe(fill(c['고른 것: {0}']!, '부품 2개'));
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });
});
