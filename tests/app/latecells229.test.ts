// @vitest-environment jsdom
/**
 * 229차(WCAG 3.1.2 — 209차 재발 막기 시험의 둘째): filecells209는 번역층을 걸기 전에 그린 패널 탭·고른 부품 카드·격리 띠·상태 막대·열기 오류 칸만 센다.
 * 210~228차가 더한 화면·칸 가운데 그 시험이 그리지 않던 상태를 앱 차례대로 — 번역층을 먼저 걸고(main.ts) 그 뒤 그리거나 바꾼 칸(문서를 연 뒤 받는 조각이 그린 칸·
 * 메뉴를 연 상태·받지 못한 조각 알림) — 다섯 언어로 그려 파일 글(「블록」) 밖의 글·말풍선·이름에 한글이 없는지 센다(한국어 화면은 번역하지 않는 칸 안의 앱 한국어). 셈은 filecells209 leaks 꼴.
 * - 문서를 연 뒤 받는 조각(뷰어 조각 — 222·223·226차)이 그린 칸: 패널 속성·레이어·정보 탭, 제품 탭의 간섭 검사 묶음 여섯 상태, 단면 막대·손잡이 세 상태(축·뒤집기·면)
 * - 분해 막대 방식·방향·손질 칸(219·221차 되돌리기·다시 하기 말풍선, 거리 칸 세 꼴)과 손질 파일 ⋯ 메뉴, 작업 메뉴 다섯과 그 밖의 작업(220·221차 키 글·172차 설정 켬/끔·분해 손질 항목·손가락 접기)
 * - 도구 막대 둘(219~221차 말풍선 — 172차 설정 켬/끔)과 표준 뷰 메뉴 둘, 키보드 도움말 대화 상자(216차 X·Y·Z·L 줄)
 * - 측정 잠금 안내 열 꼴(217·218차 X·Y·Z·L 꼴 포함 — 상태 막대 고른 것 칸 끝·측정 띠 카드)
 * - 받지 못한 조각 알림(224·225차): 경고 넷(app.fail 원문 — 다시 시도, 다시 시도도 받지 못하면 새로 고침), 열기 오류 둘(ChunkGone 원문 — 오류 알림의 다시 시도·새로 고침,
 *   시작 화면 오류 줄), 받은 보기 링크 안내(225차)·새 판 알림·잠글 방향 없음 알림 둘
 * 상태 막대·측정 띠·알림·시작 화면 오류 줄은 앱 전체를 띄우지 않고 app.ts 원문을 잘라 돌린다(filecells209·loadfail225 꼴). dom.ts는 다시 시도를 누른 글을 모듈 안에 기억하므로
 * 시험마다 새로 받는다(vi.resetModules — 맨 위 곁효과 없음).
 * 229차에 남는 글이 없었다(고칠 것 0) — 이 시험은 그 상태들이 0을 지키게 하고, 끝 묶음이 셈이 비지 않음(번역하지 않는 칸의 앱 낱말·사전에 없는 앱 글은 잡힌다)을 함께 본다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY_SNAP_KEYS, type GroupInfo, type SectionState, type Viewer3d } from 'opencad-viewer3d';
import { stepToScene, type StepMeta } from '../../src/scene';
import { bodyTitle, createDoc, productAt, type PanelTab, type StepDoc } from '../../src/app/doc';
import { friendlyError, type ParseResult } from '../../src/app/protocol';
import { nodeLabel } from '../../src/app/tree';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import * as PV from '../../src/app/panelview';
import * as PHYS from '../../src/app/propsview';
import { infoView } from '../../src/app/infoview';
import { pmiTypeLabel } from '../../src/app/pmiview';
import { Fmt } from '../../src/app/display';
import { h, icon } from '../../src/app/dom';
import { isolateText } from '../../src/app/ftext';
import { installLocalization } from '../../src/app/i18n';
import { warningNodes } from '../../src/app/warnparts';
import { SectionBar } from '../../src/app/sectionbar';
import { ExplodeControls, type TweakState } from '../../src/app/explodebar';
import type { ExplodeAxis } from '../../src/app/explode';
import { ExplodeTweakTool } from '../../src/app/explodetool';
import { contextItems, type CtxHost } from '../../src/app/ctxmenu';
import { closeMenu, openMenu, type MenuItem } from '../../src/app/menu';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { openDialog } from '../../src/app/dialog';
import { keyHelpBody } from '../../src/app/keysnap';
import { lockHint, type LockName } from '../../src/app/snap';
import type { FacePick } from '../../src/app/faces';
import type { InterferencePair } from '../../src/app/interference';
import { cube, stepString, StepText } from '../stepText';

type Dom = typeof import('../../src/app/dom');
type Act = { label: string; run: () => void };

/** 파일 글 이름(한국어) — 번역하지 않는 칸에 그대로 남아도 되는 한글은 이것뿐 */
const KO_FILE = '블록';
const HANGUL = /[가-힣]/;
/** 번역층이 옮기는 속성(i18n.ts element) */
const ATTRS = ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'];
const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'de'] as const;
/** 아직 둔 것(언어 → 남는 글 — filecells209 STILL 꼴). 지금 없음 */
const STILL: Record<string, string[]> = {};

/** filecells209 leaks 꼴: 파일 글 「블록」을 뺀 뒤 한글이 남는 글 마디·속성. 한국어 화면은 번역하지 않는 칸(translate="no" 안) 것만 */
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

/** 다음 매크로 작업까지(번역층 MutationObserver는 마이크로태스크 — 그 뒤에는 모두 돌았다) */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** filecells209 모형: 뿌리 'asm' 아래 이름 없는 부품(이름 없는 입체 둘·이름 없는 속성)과 한국어 이름 부품 「블록」, 이름 없는 레이어 배정 하나·L1 하나, 빈 FILE_NAME */
function model(): Uint8Array {
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
  w.place(root, w.product(stepString(KO_FILE), [cube(w, 10, [40, 0, 0], '').solid], mm), w.ax2([0, 0, 0]), '');
  w.textProperty(pd, '', '', 'ACME', mm);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'','',(#${a.solid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'L1','',(#${b.solid})`);
  return w.bytes('');
}

const bytes = model();
const scene = stepToScene(bytes, { name: 'a.stp' });
const meta = scene.meta as unknown as StepMeta;
const groups: GroupInfo[] = [...new Set(scene.meshes.map((m) => m.group ?? ''))].map((name) => ({ name, visible: true, count: scene.meshes.filter((m) => m.group === name).length }));
const bareKey = `0/${meta.products[0]!.children.findIndex((n) => n.name !== KO_FILE)}`;
const ids = scene.meshes.map((m) => m.id);

function newDoc(): StepDoc {
  const d = createDoc('a.stp', bytes.length, { scene, ms: 1 });
  d.density = 7850;
  return d;
}

function host(d: StepDoc): PanelHost {
  const t: Record<string, unknown> = {
    measuring: false,
    measureKind: 'points',
    touch: false,
    multiPick: false,
    fmt: new Fmt('mm'),
    isVisible: () => true,
    groups: () => groups,
    setDensity: (v: number | null) => (d.density = v),
  };
  return new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : () => {}) }) as unknown as PanelHost;
}

/** 패널 하나(앱처럼 뷰어 조각의 나무·속성 탭 본문을 넣고 — 번역층을 건 뒤 그린다). 이름 없는 부품을 고르고 뿌리와 그 부품을 펼친 채 */
function panel(tab: PanelTab, setup: (d: StepDoc) => void = () => {}): HTMLElement {
  const d = newDoc();
  d.selKey = bareKey;
  d.expanded = new Set(['0', bareKey]);
  setup(d);
  const p = Object.assign(new Panel(host(d)), { phys: PHYS, kit: { ...TV, ...PV, infoView } });
  p.show(d);
  p.setTab(tab);
  return p.el;
}

/** 간섭 검사 묶음(223차 — 뷰어 조각 panelview.ts interferenceView): 결과(겹친 부피·안에 든 쌍·시간 한도)·검사 중·부피 계산 중·오류·찾지 못함·멈춤 */
const P1: InterferencePair = { a: ids[0]!, b: ids[2]!, count: 12, trisA: [], trisB: [], volume: 3.5, volumeErr: 0.2 };
const P2: InterferencePair = { a: ids[1]!, b: ids[2]!, count: 0, trisA: [], trisB: [], inside: true };
const CHECKS: NonNullable<StepDoc['interference']>[] = [
  { running: false, done: 0, total: 0, result: { pairs: [P1, P2], tested: 3, ms: 4, volumes: { done: 1, left: 1, ms: 2 } } },
  { running: true, done: 1, total: 3 },
  { running: true, done: 1, total: 2, phase: 'volume', result: { pairs: [P1], tested: 3, ms: 4 } },
  // app.ts 검사 워커 오류 글(워커가 멈춤)
  { running: false, done: 0, total: 0, error: '검사 워커가 멈췄습니다' },
  { running: false, done: 0, total: 0, result: { pairs: [], tested: 2, ms: 1 } },
  { running: false, done: 0, total: 0, stopped: true, result: { pairs: [P1], tested: 3, ms: 4, volumes: { done: 0, left: 1, ms: 9 } } },
];

/** 단면 막대(226차 — 뷰어 조각이 만든다): X 축·Z 축 뒤집기·면 단면 */
const SECTIONS = [
  { axis: 'x', t: 0.5, position: 12.5, flip: false },
  { axis: 'z', t: 0.2, position: -3, flip: true },
  { axis: null, t: 0.4, position: 7, flip: false },
] as unknown as SectionState[];

/** 분해 손질 칸 상태(옮기기·붙잡기 끔·되돌리기·다시 하기·모두 되돌리기, 거리 칸 — 끌기 없이 연 칸·막 끈 칸) */
const TWEAKS: [ExplodeAxis, TweakState][] = [
  ['sp', { on: true, snapOff: true, count: 2, undo: true, redo: true, any: true, dist: { value: '1; 2', unit: 'mm', axis: 'sp', live: true, fresh: true } }],
  ['x', { on: false, count: 0, undo: false, redo: true, dist: { value: '12', unit: 'mm', axis: 'x', live: true } }],
  ['free', { on: false, count: 1, undo: true, dist: { value: '1; 2; 3', unit: 'mm', axis: 'free', live: false, fresh: true } }],
];

/** 분해 손질 도구의 작업 메뉴 항목(explodetool.ts moveItem·menuItems 원 함수 — 고칠 손질·되돌리기·다시 하기가 있는 상태) */
function fakeTweak(d: StepDoc): Pick<ExplodeTweakTool, 'moveItem' | 'menuItems'> {
  const me = { g: null, amendable: () => ({}), selRec: () => null, host: { live: () => ({ doc: d }) }, enterDistance: () => true, state: () => ({ on: false, count: 1, undo: true, redo: true }), undo: () => {}, redo: () => {} };
  const tool = ExplodeTweakTool.prototype;
  return {
    moveItem: (x: StepDoc) => tool.moveItem.call(me as unknown as ExplodeTweakTool, x),
    menuItems: (x: StepDoc, a: ExplodeAxis) => tool.menuItems.call(me as unknown as ExplodeTweakTool, x, a),
  };
}

interface CtxCase {
  select: boolean;
  iso: boolean;
  letters: boolean;
  touch?: boolean;
  explode?: boolean;
  face?: 'normal' | 'axis';
  opacity?: boolean;
}
/** 작업 메뉴(ctxmenu.ts contextItems): 고른 것·격리·172차 설정 켬/끔·분해 손질 항목·면·손가락 접기 */
const CTX: CtxCase[] = [
  { select: true, iso: false, letters: true, explode: true, face: 'normal', opacity: true },
  { select: true, iso: true, letters: false, face: 'axis' },
  { select: false, iso: false, letters: true },
  { select: false, iso: true, letters: false, explode: true },
  { select: true, iso: false, letters: true, touch: true },
];
function ctxMenu(o: CtxCase): MenuItem[] {
  const d = createDoc('a.stp', 1, { scene: { meshes: [], lines: [], meta: { products: [] } }, ms: 1 } as unknown as ParseResult);
  if (o.select) d.items = { ids: ['m1'], label: '부품 1개' };
  if (o.iso) d.vis.isolated = new Set(['m1']);
  if (o.opacity) d.opacity.set('m1', 0.5);
  const t: Record<string, unknown> = { doc: d, touch: !!o.touch, faceMode: false, multiPick: false, explodeOpen: !!o.explode, explodeAxis: 'free', tweakTool: o.explode ? fakeTweak(d) : null, groups: () => [], lettersOutside: o.letters };
  const H = new Proxy(t, { get: (x, k) => (k in x ? x[k as string] : () => {}) }) as unknown as CtxHost;
  const face = o.face === 'normal' ? { normal: [0, 0, 1] } : o.face === 'axis' ? { axis: { origin: [0, 0, 0], dir: [0, 0, 1] } } : null;
  return contextItems(H, face as unknown as FacePick | null, { x: 8, y: 8 });
}

/** 도구 막대 호스트(keyshortcuts218 꼴 — 172차 설정 켬/끔, 키보드 도움말 항목 있음) */
function toolHost(letters: boolean): ToolbarHost {
  const no = (): void => {};
  return {
    hasDoc: true,
    hasSelection: true,
    projection: 'perspective',
    renderMode: 'shadedEdges',
    gridOn: false,
    cubeOn: false,
    axesOn: false,
    measuring: false,
    panelOpen: false,
    pickUnit: 'part',
    multiPick: false,
    sectionAxis: null,
    sectionOn: false,
    hiddenEdges: false,
    profiles: false,
    partColors: false,
    ambientOcclusion: false,
    explodeOpen: false,
    lettersOutside: letters,
    fit: no,
    fitSelection: no,
    setView: no,
    goHome: no,
    setHome: no,
    showKeyHelp: no,
    setProjection: no,
    setRenderMode: no,
    toggleHiddenEdges: no,
    toggleProfiles: no,
    togglePartColors: no,
    toggleAmbientOcclusion: no,
    toggleExplode: no,
    toggleGrid: no,
    toggleCube: no,
    toggleAxes: no,
    toggleMeasure: no,
    setPickUnit: no,
    toggleMultiPick: no,
    setSectionAxis: no,
    savePng: no,
    exportItems: () => [],
    togglePanel: no,
  };
}

/** 측정 잠금 안내 열 꼴(snap.ts lockHint — 잠근 방향 여섯, 첫 점 뒤 Shift·화살표 안내 둘, 217·218차 X·Y·Z·L 안내 둘) */
const LOCKS: string[] = [
  ...(['x', 'y', 'z', 'parallel', 'perpendicular', 'tangent'] as LockName[]).map((l) => lockHint(1, l)!),
  lockHint(1, null, false, true)!,
  lockHint(1, null, false, false)!,
  lockHint(1, null, false, true, true)!,
  lockHint(1, null, false, false, true)!,
];

// app.ts 원문을 잘라 돌린다(앱 전체는 시험에서 띄우지 않는다)
const read = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8');
const APP = read('src/app/app.ts');
const MAIN = read('src/app/main.ts');
const cut = (re: RegExp): string => {
  const m = re.exec(APP)?.[1];
  if (!m) throw new Error(`app.ts에서 찾지 못함: ${re}`);
  return m;
};
const NAME = cut(/\n {2}private selectionName\(d: StepDoc\): string \{\n([\s\S]*?)\n {2}\}\n/);
const selectionName = new Function('d', 'productAt', 'nodeLabel', 'isolateText', 'bodyTitle', NAME) as (d: object, ...fns: unknown[]) => string;
const SEL_TEXT = cut(/\n {2}private selectionText\(d: StepDoc\): \(Node \| string\)\[\] \{\n([\s\S]*?)\n {2}\}\n/).replace(/(\w)!\./g, '$1.');
const STATUS_MAKE = cut(/\n\s*(this\.statusSel = h\('div', [^\n]*\);)\n/);
// updateStatus의 고른 것 칸 채우기(고른 것 · 자세히 · 측정 짝 · 잠금 안내 — 잠금 안내는 따로 둔 조각)
const STATUS_FILL = cut(/\n(\s*this\.statusSel\.replaceChildren\(\n[\s\S]*?\n\s*\);)\n/);
const STATUS_TITLE = cut(/\n\s*(this\.statusSel\.title = this\.statusSel\.textContent \?\? '';)\n/);
// 측정 띠 카드의 잠금 안내 줄(refreshBar)
const STRIP_LOCK = cut(/\n\s*(if \(lockText\) t\.append\(h\('span', \{ class: .mb-sub mb-lock-hint[^\n]*)\n/);
// 알림 하나(toast — pushToast 앞까지: 닫기·동작 버튼과 알림 칸)
const TOAST_BODY = cut(/\n {2}toast\(msg: string \| string\[\], [^\n]*\{\n([\s\S]*?)\n\s*const remove = pushToast\(/);
const START_MAKE = cut(/\n\s*(this\.startError = h\('div', \{ class: 'start-error'[^\n]*)\n/);
const START_FILL = cut(/\n\s*(this\.startError\.replaceChildren\([^\n]*)\n/);
const LOCK_FAIL = cut(/private lockFailed\(\): void \{[\s\S]*?this\.toast\(\n\s*(this\.touch \? '[^']*' : '[^']*'),/);
/** 224차: 받지 못한 조각 경고 원문(app.ts this.fail·main.ts app.fail 모든 자리) */
const FAILS = [...new Set([...APP.matchAll(/this\.fail\('([^']+)'/g), ...MAIN.matchAll(/app\.fail\('([^']+)'/g)].map((m) => m[1]!))];
/** 225차: 열 때 받는 조각(예제 모형·3D 보기)을 받지 못한 열기 오류(ChunkGone 원문) */
const GONE = [...APP.matchAll(/new ChunkGone\('([^']+)'/g)].map((m) => m[1]!);
/** 225차: 받은 보기 링크를 다 걸었을 때만 띄우는 안내 */
const LINK_OK = /this\.toast\('(주소의 보기\([^']+\)를 적용했습니다\.)'\)/.exec(APP)?.[1];
/** 새 판 알림과 그 버튼(225차 「새로 고침」은 이 버튼의 원문) */
const SW = /this\.toast\('([^']+)', 'info', 60_000, \{ label: '([^']+)'/.exec(APP);
/** app.ts showError 첫 조각(문서를 열다 실패 — 파일 이름은 갇힘) */
const OPEN_FAIL = `${isolateText(`${KO_FILE}.stp`)}: 파일을 열지 못했습니다.`;

/** 상태 막대 고른 것 칸(앱이 만드는 칸·selectionText 조각·잠금 안내·막대 말풍선 — filecells209 status 꼴에 잠금 안내) */
function status(d: object, lock: string | null): HTMLElement {
  const self = { fmt: new Fmt('mm'), entMeasuring: false, measuring: false, ent: { pmiTypeLabel }, selectionName: (x: object) => selectionName(x, productAt, nodeLabel, isolateText, bodyTitle) };
  const sel = new Function('d', 'h', 'productAt', 'isolateText', SEL_TEXT).call(self, d, h, productAt, isolateText) as (Node | string)[];
  const bar: { statusSel?: HTMLElement } = {};
  new Function('h', STATUS_MAKE).call(bar, h);
  new Function('sel', 'detail', 'sp', 'lock', 'h', STATUS_FILL).call(bar, sel, [], null, lock, h);
  new Function(STATUS_TITLE).call(bar);
  return bar.statusSel!;
}

/** 측정 띠 카드 글 칸의 잠금 안내 줄(잠갔으면 on) */
function strip(lock: string, on: boolean): HTMLElement {
  const t = h('div', { class: 'mb-text' });
  new Function('t', 'h', 'lockText', 'v', STRIP_LOCK)(t, h, lock, { measureInferenceLock: on ? { kind: 'axis', axis: 'x' } : null });
  return t;
}

/** 알림 하나(app.ts toast 몸통 — 알림 칸에 넣기 전까지) */
function toastEl(msg: string | string[], kind: 'info' | 'warn' | 'error', action?: Act): HTMLElement {
  return new Function('h', 'icon', 'warningNodes', 'msg', 'kind', 'keep', 'action', `${TOAST_BODY}\nreturn t;`)(h, icon, warningNodes, msg, kind, false, action) as HTMLElement;
}

/** 처음 화면 읽기 오류(app.ts startError 만들기·채우기 줄 — showError가 남긴 글 조각) */
function startError(parts: string[]): HTMLElement {
  const self: { startError?: HTMLElement; lastError: string; lastErrorParts: string[] } = { lastError: parts.join(' '), lastErrorParts: parts };
  new Function('h', 'warningNodes', `${START_MAKE}\n${START_FILL}`).call(self, h, warningNodes);
  return self.startError!;
}

/** 키보드 도움말이 읽는 가상 커서 키 표(코어 기본 키) */
const KEYS_VIEWER = { keyboardSnap: { step: 8, bigStep: 40, keys: KEY_SNAP_KEYS } } as unknown as Pick<Viewer3d, 'keyboardSnap'>;

let dom: Dom;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  dom = await import('../../src/app/dom');
});

describe('229차: 209차 시험 밖 상태(늦게 받는 조각이 그린 칸·메뉴를 연 상태·받지 못한 조각 알림·잠금 안내) — 번역층을 먼저 건 뒤 그려 다섯 언어 파일 글 칸 밖 한글 0', () => {
  it('앱 원문에서 읽은 알림·잠금 안내 자리(경고 넷·열기 오류 둘·보기 링크 안내·새 판 알림·잠글 방향 없음 둘·잠금 안내 열 꼴)', () => {
    expect([...FAILS].sort()).toEqual(['고른 언어를 받지 못했습니다.', '내보내기 기능을 받지 못했습니다.', '보기 링크 기능을 받지 못했습니다.', '분해 보기를 받지 못했습니다.'].sort());
    expect(GONE).toEqual(['예제 모형을 받지 못했습니다.', '3D 보기를 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 여십시오.']);
    expect(LINK_OK).toBe('주소의 보기(카메라·단면·고른 것·분해)를 적용했습니다.');
    expect(SW?.slice(1)).toEqual(['새 버전이 있습니다.', '새로 고침']);
    expect([false, true].map((touch) => new Function(`return ${LOCK_FAIL}`).call({ touch }) as string).every((s) => s.startsWith('잠글 방향이 없습니다: '))).toBe(true);
    expect(new Set(LOCKS).size).toBe(10);
    expect(LOCKS.slice(-2)).toEqual(['X·Y·Z로 축 방향, L로 지금 방향 잠금', 'X·Y·Z로 축 잠금']);
  });

  it.each(LANGS)('%s: 뷰어 조각 칸·분해 막대·도구 막대·잠금 안내·알림을 그린 뒤, 메뉴 아홉·키보드 도움말을 하나씩 열고', async (code) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    history.replaceState(null, '', `/?lang=${code}`);
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    const dispose = await installLocalization(root);
    const found: string[] = [];
    const anchors: HTMLElement[] = [];
    try {
      // 1) 문서를 연 뒤 받는 조각이 그린 칸 — 번역층을 건 뒤(앱 차례)
      for (const tab of ['props', 'layers', 'info'] as const) views.append(panel(tab));
      for (const st of CHECKS) views.append(panel('tree', (d) => (d.interference = st)));
      for (const st of SECTIONS) {
        const bar = new SectionBar({ viewerRef: null, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {}, toast: () => {} });
        views.append(bar.el, bar.handle);
        bar.sync(st);
      }
      // 2) 분해 막대(붙인 뒤 맞추기 — 말풍선·이름·거리 칸 글이 바뀐다)
      const explode: HTMLElement[] = [];
      for (const [axis, tw] of TWEAKS) {
        const c = new ExplodeControls(
          () => {},
          () => {},
          {},
        );
        const el = h('div', { class: 'explode-opts' }, ...c.els);
        views.append(el);
        c.sync(null, 'all', true, axis, null, tw);
        explode.push(el);
      }
      // 3) 도구 막대(172차 설정 켬/끔 — 다시 그리기)
      const bars = [true, false].map((letters) => {
        const tb = new Toolbar(toolHost(letters));
        views.append(tb.el);
        tb.refresh();
        return tb;
      });
      // 4) 잠금 안내(상태 막대 고른 것 칸 끝·측정 띠 카드)
      const d = newDoc();
      d.selKey = bareKey;
      // 앞의 여섯은 잠근 방향(측정 띠 줄 on), 나머지는 잠그는 법 안내
      LOCKS.forEach((lock, i) => views.append(status(d, lock), strip(lock, i < 6)));
      // 5) 알림: 받지 못한 조각(다시 시도 → 또 받지 못함 → 새로 고침), 열기 오류, 안내
      const box = h('div', { class: 'toasts' });
      views.append(box);
      const acts: Act[] = [];
      const show =
        (kind: 'warn' | 'error', parts?: string[]) =>
        (m: string, a: Act): (() => void) => {
          acts.push(a);
          box.append(toastEl(parts ?? m, kind, a));
          return () => {};
        };
      const twice = (msg: string, sh: (m: string, a: Act) => () => void): void => {
        const e = new TypeError('Failed to fetch dynamically imported module');
        const retry = (): void => void dom.loadFailed(e, msg, retry, sh);
        dom.loadFailed(e, msg, retry, sh);
        // 다시 시도를 누름(dom.ts가 단 run — 그 글을 기억하고 retry) → 또 받지 못함
        acts[acts.length - 1]!.run();
      };
      for (const m of FAILS) twice(m, show('warn'));
      for (const g of GONE) {
        const parts = [OPEN_FAIL, friendlyError(g)];
        twice(parts.join(' '), show('error', parts));
        views.append(startError(parts));
      }
      box.append(toastEl(LINK_OK!, 'info'), toastEl(SW![1]!, 'info', { label: SW![2]!, run: () => {} }));
      for (const touch of [false, true]) box.append(toastEl(new Function(`return ${LOCK_FAIL}`).call({ touch }) as string, 'warn'));
      await settle();
      // 그린 것이 비지 않았다(간섭 쌍 버튼 넷, 단면 막대 셋, 분해 손질 칸 셋, 도구 막대 둘, 잠금 안내 열씩, 알림 열여섯·버튼 열셋, 시작 화면 오류 줄 둘)
      expect(views.querySelectorAll('[data-pair]').length).toBe(4);
      expect(views.querySelectorAll('.section-bar:not([hidden])').length).toBe(3);
      expect(views.querySelectorAll('.explode-tweak').length).toBe(3);
      expect(views.querySelectorAll('nav.toolbar').length).toBe(2);
      expect(views.querySelectorAll('.status-sel .st-lock').length).toBe(10);
      expect(views.querySelectorAll('.mb-lock-hint').length).toBe(10);
      expect(views.querySelectorAll('.toast').length).toBe(16);
      expect(views.querySelectorAll('.start-error').length).toBe(2);
      const actLabels = [...box.querySelectorAll('.toast-act')].map((b) => b.textContent);
      expect(actLabels).toHaveLength(13);
      if (code === 'ko') expect(actLabels).toEqual([...[...FAILS, ...GONE].flatMap(() => ['다시 시도', '새로 고침']), '새로 고침']);
      found.push(...leaks(views, code));

      // 6) 메뉴(문서 body에 붙는다 — 하나씩 열고 센다)와 키보드 도움말
      const anchor = (): HTMLElement => {
        const b = h('button', { type: 'button' });
        document.body.append(b);
        anchors.push(b);
        return b;
      };
      const opens: [string, () => void][] = [
        ['손질 파일', () => explode[0]!.querySelector<HTMLButtonElement>('.explode-file-btn')!.click()],
        ...CTX.map((c, i): [string, () => void] => [`작업 메뉴 ${i}`, () => openMenu(anchor(), ctxMenu(c), '작업 메뉴')]),
        ['그 밖의 작업', () => ctxMenu(CTX[4]!).find((it) => it.label === '그 밖의 작업…')!.run()],
        ...bars.map((tb, i): [string, () => void] => [`표준 뷰 ${i}`, () => tb.el.querySelector<HTMLButtonElement>('button[data-tool="views"]')!.click()]),
      ];
      const labels: string[] = [];
      const kbds: string[] = [];
      for (const [name, open] of opens) {
        open();
        await settle();
        const el = document.querySelector('.menu');
        expect(el, name).not.toBeNull();
        expect(el!.querySelectorAll('.menu-item').length, name).toBeGreaterThan(1);
        if (code === 'ko') {
          labels.push(...[...el!.querySelectorAll('.menu-label')].map((x) => x.textContent ?? ''));
          kbds.push(`${name}: ${[...el!.querySelectorAll('kbd')].map((x) => x.textContent).join(' ')}`);
        }
        found.push(...leaks(el!, code));
        closeMenu();
      }
      if (code === 'ko') {
        // 연 메뉴에 든 상태: 분해 손질 항목·손질 파일·면·불투명도·손가락 접기·홈 뷰·키보드 도움말
        for (const l of ['거리로 옮기기…', '손질 되돌리기', '손질 다시 하기', '손질 불러오기…', '이 면으로 자르기', '축을 지나게 자르기', '불투명도 모두 되돌리기', '고르기 풀기', '홈 뷰', '키보드로 3D 보기 다루기'])
          expect(labels, l).toContain(l);
        // 키 글(번역하지 않는 칸 — 한글 없음): 172차 설정을 끈 메뉴에는 한 글자 키가 없다
        expect(kbds).toEqual([
          '손질 파일: ',
          '작업 메뉴 0: Enter H I Ctrl·⌘+Z Ctrl·⌘+Shift+Z·Ctrl+Y',
          '작업 메뉴 1: ',
          '작업 메뉴 2: F',
          '작업 메뉴 3: Enter Ctrl·⌘+Z Ctrl·⌘+Shift+Z·Ctrl+Y',
          '작업 메뉴 4: H I',
          '그 밖의 작업: ',
          '표준 뷰 0: Home 1 2 3 4 5 6 7',
          '표준 뷰 1: Home',
        ]);
      }
      const dlg = openDialog('키보드로 3D 보기 다루기', keyHelpBody(KEYS_VIEWER));
      await settle();
      // 키 표 줄 여덟(옮기기·크게 옮기기·후보·찍기·지우기·X·Y·Z·L·작업 메뉴·전체 보기와 표준 뷰 — keysnap.ts keyHelpRows)
      expect(dlg.el.querySelectorAll('.key-help tr').length).toBe(8);
      found.push(...leaks(dlg.el, code));
      dlg.close();
      expect(found).toEqual(STILL[code] ?? []);
    } finally {
      closeMenu();
      dispose();
      for (const a of anchors) a.remove();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });

  it.each(['en', 'ja', 'zh-CN', 'de'])('%s: 셈이 비지 않는다 — 번역 뒤에 넣은 칸이라도 번역하지 않는 칸의 앱 낱말·사전에 없는 앱 글은 남는 글로 잡히고, 사전 글은 옮겨진다', async (code) => {
    history.replaceState(null, '', `/?lang=${code}`);
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    const dispose = await installLocalization(root);
    try {
      const said = h('span', {}, '다시 시도');
      views.append(h('span', { translate: 'no' }, '격리 풀기'), h('span', { title: '사전에 없는 앱 글' }, KO_FILE), said);
      await settle();
      expect(leaks(views, code)).toEqual(['text: 격리 풀기', 'title: 사전에 없는 앱 글']);
      expect(said.textContent).not.toMatch(HANGUL);
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });
});
