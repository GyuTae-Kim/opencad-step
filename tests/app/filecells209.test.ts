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
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GroupInfo } from 'opencad-viewer3d';
import { stepToScene, type StepMeta } from '../../src/scene';
import { bodyTitle, createDoc, multiLabel, productAt, type PanelTab, type StepDoc } from '../../src/app/doc';
import { nodeLabel } from '../../src/app/tree';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import { infoView } from '../../src/app/infoview';
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
      views.append(card(nm), iso(nm));
    }
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      // 그린 것이 비지 않았다(나무 줄 다섯 — 뿌리·이름 없는 부품·바디 둘·블록, 레이어 줄 셋, 카드·격리 띠 여섯, 이름 없는 속성 값)
      expect(views.querySelectorAll('.tree-row').length).toBe(5);
      expect(views.querySelectorAll('table.grid tbody tr').length).toBe(3);
      expect(views.querySelectorAll('.mb-name').length).toBe(6);
      expect(views.querySelectorAll('.iso-bar:not([hidden])').length).toBe(6);
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
