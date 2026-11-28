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
 * 230차(229차가 그리지 못한 것): 여는 중 덮개 단계 아홉, 캔버스 글(측정 글상자·뷰 큐브 면 — 앱이 넣기 전에 옮김), 겹친 것 고르기 목록 셋, 209차 앞 메뉴(보기 설정·그리기 모드·내보내기)와
 * 단면 보기·고르기 메뉴, 복사 알림 넷·그림 저장 실패 알림을 같은 다섯 언어 셈에 더하고(남는 글 0), 둘째 describe가 언어를 바꾼 뒤 다시 옮기는 차례를 본다 —
 * 한국어·영어에서 시작해 다섯 번 바꾼 화면이 처음부터 그 언어로 그린 화면과 같은지(고치기 전: 복사 알림이 미리 옮긴 낱말·그림 저장 실패가 미리 옮긴 까닭을 앞 언어로 남김,
 * 가상 커서 알림 영역이 앞 언어 글을 남김 — 언어마다 4~5칸과 영역 1).
 * 231차(230차가 코드로만 본 둘과 수 꼴): 개체 측정 덧그림 글(캔버스 — showEntities)과 측정 띠 개체 측정 글(refreshBar 갈래 — 만든 글이 같으면 바꾸지 않음), 마우스 측정 말풍선
 * (상태 막대·측정 띠 스냅 이름 여섯 — showHoverSnap, Tab 돌리기 차례 포함)을 앱 원문을 잘라 그리고 230차 차례로 언어를 바꿔, 처음부터 그 언어로 그린 것과 견준다
 * (수 꼴 — 독일어 「1.234,5」 ↔ 영어 「1,234.5」 — 이 바뀌는 칸이 든다). 고치기 전에도 남는 칸 0(지금 0을 지킴).
 * 232차(231차가 표에 둔 셈 수 꼴): format.ts fmtCount가 늘 ko-KR이라 독일어 화면에서도 천 단위가 「12,345」였다 — 이제 화면 언어 꼴(독일어 「12.345」, 나머지 그대로).
 * 대표 칸(정보 탭 파일 크기 바이트·상태 막대 파일 크기 말풍선·간섭 결과 범위가 겹친 쌍·ms·쌍 칩)을 다섯 언어로 그려 꼴을 보고, 앱 언어 알림 처리기(refreshFmt →
 * panel.redraw·updateStatus — app.ts 원문)로 바꾼 뒤 처음부터 그 언어로 그린 것과 견준다. 230차 껍데기의 panel.redraw도 그린 패널을 실제로 다시 그린다(앱과 같게).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatKeySnapMessage, KEY_SNAP_KEYS, keySnapMessages, type GroupInfo, type Pick3d, type SectionState, type Viewer3d } from 'opencad-viewer3d';
import { CUBE_FACES } from 'opencad-viewer3d/viewcube';
import { translate as translateCatalog } from '../../site/i18n-core.mjs';
import { stepToScene, type StepMeta } from '../../src/scene';
import { bodyTitle, createDoc, docStatus, productAt, selectionItemIds, type PanelTab, type StepDoc } from '../../src/app/doc';
import { errorText, friendlyError, type ParseResult } from '../../src/app/protocol';
import { nodeLabel } from '../../src/app/tree';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import * as PV from '../../src/app/panelview';
import * as PHYS from '../../src/app/propsview';
import { infoView } from '../../src/app/infoview';
import { pmiTypeLabel } from '../../src/app/pmiview';
import { Fmt, numberLocale } from '../../src/app/display';
import { h, icon } from '../../src/app/dom';
import { clipText, isolateText } from '../../src/app/ftext';
import { fmtPercent, formatBytes, stageLabel } from '../../src/app/format';
import { installLocalization } from '../../src/app/i18n';
import { measureLabelLines } from '../../src/app/measure';
import { warningNodes } from '../../src/app/warnparts';
import { SectionBar } from '../../src/app/sectionbar';
import { ExplodeControls, type TweakState } from '../../src/app/explodebar';
import type { ExplodeAxis } from '../../src/app/explode';
import { ExplodeTweakTool } from '../../src/app/explodetool';
import { contextItems, openPickList, type CtxHost } from '../../src/app/ctxmenu';
import { pickRows, type PickRow } from '../../src/app/picklist';
import { closeMenu, openMenu, type MenuItem } from '../../src/app/menu';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { openDialog } from '../../src/app/dialog';
import { installKeySnap, keyHelpBody } from '../../src/app/keysnap';
import { hoverSnapLabel, lockHint, type LockName } from '../../src/app/snap';
import { entityBar, pickedAnnotations, type Picked, type PickedMeasure } from '../../src/app/entpick';
import { guideSnapLabel } from '../../src/app/trackdir';
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

/**
 * 패널 하나(앱처럼 뷰어 조각의 나무·속성 탭 본문을 넣고 — 번역층을 건 뒤 그린다). 이름 없는 부품을 고르고 뿌리와 그 부품을 펼친 채.
 * keep에 패널을 모으면 언어 알림 처리기(refreshFmt → panel.redraw — app.ts)가 그 패널들을 다시 그린다(232차 — 셈 수 꼴이 화면 언어를 따름)
 */
function panel(tab: PanelTab, setup: (d: StepDoc) => void = () => {}, keep?: Panel[]): HTMLElement {
  const d = newDoc();
  d.selKey = bareKey;
  d.expanded = new Set(['0', bareKey]);
  setup(d);
  const p = Object.assign(new Panel(host(d)), { phys: PHYS, kit: { ...TV, ...PV, infoView } });
  p.show(d);
  p.setTab(tab);
  keep?.push(p);
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
    // 230차: 내보내기 메뉴는 앱 항목 그대로(app.ts exportItems 원문 — 아래)
    exportItems: () => exportItems(newDoc()),
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

/** 알림 하나(app.ts toast 몸통 — 알림 칸에 넣기 전까지). 230차: ui = 앱 글 칸(toast의 기본은 오류 알림 — TOAST_SIG로 본다) */
function toastEl(msg: string | string[], kind: 'info' | 'warn' | 'error', action?: Act, ui = kind === 'error'): HTMLElement {
  return new Function('h', 'icon', 'warningNodes', 'msg', 'kind', 'keep', 'action', 'ui', `${TOAST_BODY}\nreturn t;`)(h, icon, warningNodes, msg, kind, false, action, ui) as HTMLElement;
}

// ── 230차: 여는 중 덮개·캔버스 글·언어 알림·복사 알림·그림 저장 실패·내보내기 메뉴(app.ts 원문을 잘라 돌린다) ──
const TOAST_SIG = cut(/\n {2}toast\((msg: string \| string\[\], [^\n]*)\): \(\) => void \{\n/);
// 생성자의 진행 카드 줄(이름·단계·백분율·진행 막대·취소)과 setLoading(157차 — 숨은 카드를 보이는 차례면 다음 그림에 단계 글)
const BUSY_MAKE = cut(/\n(\s*this\.busyName = h\('div', \{ class: 'busy-name'[\s\S]*?\n\s*\);)\n\s*this\.dropEl = /);
const SET_LOADING = cut(/\n {2}private setLoading\(l: Loading \| null\): void \{\n([\s\S]*?)\n {2}\}\n/);
// 생성자의 언어 알림 처리기(뷰 큐브 면 글·최근 문서·수 꼴·가상 커서 알림 틀)와 그것이 부르는 것
const ON_LANG = cut(/\n\s*root\.addEventListener\('languagechange', \(\) => \{\n([\s\S]*?)\n {4}\}\);\n/);
const REFRESH_FMT = cut(/\n {2}refreshFmt\(\): void \{\n([\s\S]*?)\n {2}\}\n/);
const MAKE_FMT = cut(/\n {2}private makeFmt\(\): Fmt \{\n([\s\S]*?)\n {2}\}\n/);
const RELABEL = cut(/\n {2}private relabelCube\(\): void \{\n([\s\S]*?)\n {2}\}\n/).replace(/\]!/g, ']');
const TRANSLATE_UI = cut(/\nfunction translateUi\(ko: string\): string \{\n([\s\S]*?)\n\}\n/);
const IMAGE_FAIL = cut(/\nfunction imageSaveFailed\(e: unknown\): string \{\n([\s\S]*?)\n\}\n/);
const COPY_TEXT = cut(/\n {2}private async copyText\(text: string, fileName: string, what: string\): Promise<void> \{\n([\s\S]*?)\n {2}\}\n/);
/** 복사 알림이 끼우는 낱말(copyMeasureCsv·copyPmiCsv가 copyText에 넘기는 식 그대로) */
const COPY_WHAT = [...APP.matchAll(/await this\.copyText\([^\n]*, ((?:translateUi\()?'[^']+'\)?)\);/g)].map((m) => m[1]!);
const EXPORT_ITEMS = cut(/\n {2}exportItems\(\): MenuItem\[\] \{\n([\s\S]*?)\n {2}\}\n/);

/** app.ts translateUi(파일·캔버스로 나가는 글을 지금 화면 언어로 — 번역층과 같은 사전) */
const translateUi = new Function('translateCatalog', 'ko', TRANSLATE_UI).bind(null, translateCatalog) as (ko: string) => string;
/** app.ts imageSaveFailed */
const imageSaveFailed = (e: unknown): string => new Function('e', 'translateUi', 'errorText', IMAGE_FAIL)(e, translateUi, errorText) as string;
/** app.ts exportItems(고른 것·측정 기록·PMI 표 — 이 문서) */
function exportItems(d: StepDoc): MenuItem[] {
  return new Function('selectionItemIds', EXPORT_ITEMS).call({ doc: d }, selectionItemIds) as MenuItem[];
}
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<void>;
/** app.ts copyText(클립보드 됨·안 됨) — 알림은 app.ts toast 몸통으로 */
const copyText = new AsyncFunction('navigator', 'text', 'fileName', 'what', COPY_TEXT);
const CLIP_OK = { clipboard: { writeText: async () => {} } };
const CLIP_NO = { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } };
/** 복사 알림 넷(측정 기록·PMI 표 × 클립보드 됨·안 됨)을 box에 — 낱말은 지금 화면 언어에서 앱이 넘기는 그대로 */
async function copyToasts(box: HTMLElement): Promise<void> {
  const self = {
    toast: (msg: string, kind: 'info' | 'warn' | 'error' = 'info', _ms?: number, action?: Act, _keep?: boolean, ui?: boolean) => box.append(toastEl(msg, kind, action, ui)),
    deliver: async () => 'saved',
  };
  for (const expr of COPY_WHAT) {
    const what = new Function('translateUi', `return ${expr}`)(translateUi) as string;
    for (const nav of [CLIP_OK, CLIP_NO]) await copyText.call(self, nav, 'x', 'a-measure.csv', what);
  }
}
/** 코어가 던지는 그림 만들기 실패(115차 i18n.test가 코어 원문에서 읽는 글 가운데 하나) */
const GL_LOST = new Error('3D 보기 문맥이 없어 그림을 만들 수 없습니다');

/** 해석 단계 이름(scene.ts·job.ts progress — 읽기·구조·삼각화·완료·압축 풀기)과 앱이 넣는 단계 글(열기 첫 글·주소 파일 받기 — app.ts load) */
const BUSY_STAGES = ['파일 읽는 중', `파일 받는 중 (${formatBytes(1.2e6)} / ${formatBytes(3.4e6)})`, `파일 받는 중 (${formatBytes(5e5)})`, ...['읽기', '구조', '삼각화', '완료', '압축 풀기', ''].map(stageLabel)];
/** 여는 중 덮개 하나(생성자 줄 + setLoading — 숨은 카드를 처음 보이는 차례) */
function busy(stage: string): HTMLElement {
  const self: Record<string, unknown> = { loading: null, doc: null, viewer: null, startOpen: null, updateStatus: () => {}, cancel: () => {} };
  new Function('h', BUSY_MAKE).call(self, h);
  new Function('l', 'clipText', 'fmtPercent', 'nextPaint', SET_LOADING).call(self, { name: 'a.stp', fraction: 0.42, stage }, clipText, fmtPercent, () => Promise.resolve());
  return self.busyEl as HTMLElement;
}

/** 3D 보기 측정 값 하나(코어 MeasureResult — 거리·성분) */
const MEASURE = { distance: 12.5, dx: 1.5, dy: -2, dz: 12.3 };
/** 뷰 큐브 면 글 원문(코어 표 — relabelCube가 바꿔 쓰므로 시험마다 되돌린다) */
const CUBE_KO = CUBE_FACES.map((f) => f.label);
const restoreCube = (): void => CUBE_FACES.forEach((f, i) => ((f as { label: string }).label = CUBE_KO[i]!));

/** 가짜 뷰어(가상 커서 붙잡기·측정 글 꼴·뷰 큐브 크기 — 앱이 쓰는 만큼) */
interface FakeViewer {
  canvas: HTMLCanvasElement;
  ks: { announce(a: unknown): void; messages?: Record<string, string> } | null;
  format: ((m: typeof MEASURE) => string[]) | null;
}
interface Shell {
  /** 가상 커서 알림 영역(keysnap.ts — data-i18n-skip) */
  live(): HTMLElement;
  /** 캔버스 글: 측정 글상자 두 줄과 뷰 큐브 면 여섯 */
  canvas(): string[];
  /** 지금 화면 언어의 가상 커서 알림 하나(코어가 앱이 준 틀로 만든 글) */
  announce(): void;
  /** 뷰어를 만든 뒤(app.ts ensureViewer 차례 — 뷰 큐브 면 글·측정 글 꼴·가상 커서 붙잡기) */
  ready(): void;
}
/**
 * 앱 껍데기: 생성자처럼 번역층보다 먼저 언어 알림 처리기를 달고(app.ts 원문), 뷰어를 만든 뒤 캔버스 글·가상 커서 붙잡기를 건다.
 * 232차: refreshFmt가 부르는 panel.redraw는 그린 패널들을 실제로 다시 그린다(앱의 패널 하나 — 지금 탭 본문·아래 띠를 새로). 전에는 아무것도 하지 않는 가짜였는데,
 * 셈 수(format.ts fmtCount — 정보 탭 파일 크기 바이트 등)가 화면 언어 꼴(독일어 「12.345」)이 되자 다시 그리지 않는 가짜 패널은 앞 언어 꼴을 남겨 앱과 달라졌다
 */
function shell(root: HTMLElement, host: HTMLElement, panels: Panel[] = []): Shell {
  const fv: FakeViewer & Record<string, unknown> = {
    canvas: h('canvas'),
    ks: null,
    format: null,
    keyboardSnap: { step: 8, bigStep: 40, keys: KEY_SNAP_KEYS },
    keyboardCursor: null,
    measureInferenceLock: null,
    viewCubeSize: 96,
    section: null,
    setKeyboardSnap: (o: FakeViewer['ks']) => (fv.ks = o),
    setMeasureFormat: (fn: FakeViewer['format']) => (fv.format = fn),
    setViewCubeSize: () => {},
  };
  host.append(h('div', { class: 'viewer-host' }, fv.canvas));
  const self: Record<string, unknown> = { viewer: null, cube: null, keySnap: null, doc: null, display: undefined, entMeasuring: false, panel: { redraw: () => panels.forEach((p) => p.redraw()) }, updateStatus: () => {}, syncSection: () => {}, refreshRecent: async () => {} };
  self.makeFmt = new Function('Fmt', 'numberLocale', MAKE_FMT).bind(self, Fmt, numberLocale);
  self.refreshFmt = new Function('measureLabelLines', 'translateUi', REFRESH_FMT).bind(self, measureLabelLines, translateUi);
  self.relabelCube = new Function('translateUi', RELABEL).bind(self, translateUi);
  root.addEventListener('languagechange', new Function(ON_LANG).bind(self) as () => void);
  let ks: ReturnType<typeof installKeySnap> | null = null;
  return {
    live: () => ks!.live,
    canvas: () => [...(fv.format?.(MEASURE) ?? []), ...CUBE_FACES.map((f) => f.label)],
    announce: () => fv.ks!.announce({ mode: 'select', reason: 'start', text: formatKeySnapMessage(keySnapMessages(fv.ks!.messages).start, ['1', '2']) }),
    ready: () => {
      self.viewer = fv;
      self.cube = { faces: CUBE_FACES, ko: [...CUBE_KO] };
      (self.relabelCube as () => void)();
      (self.refreshFmt as () => void)();
      ks = self.keySnap = installKeySnap(fv as unknown as Viewer3d, { tr: translateUi, pickThrough: () => false });
    },
  };
}

/** 겹친 것 고르기 목록 셋(picklist.ts pickRows — 부품 단위: 부품 전체·면·모서리, 바디 단위: 바디·선 형상·점 형상·PMI, 여러 개 고르기) */
function pickLists(): { rows: PickRow[]; multi: boolean }[] {
  const d = newDoc();
  d.selKey = bareKey;
  (d.vis.pmiIds as Set<string>).add('pmi-1');
  const P = (kind: string, id: string, raw = 0): Pick3d => ({ kind, id, index: raw, raw, point: [0, 0, 0] }) as unknown as Pick3d;
  const line = scene.lines?.[0]?.id;
  const host = (pickUnit: 'part' | 'body', multiPick = false) => ({ faceMode: false, multiPick, pickUnit });
  return [
    { rows: pickRows(d, [P('mesh', ids[0]!), P('mesh', ids[0]!, 1), P('mesh', ids[2]!), ...(line ? [P('edge', line)] : [])], host('part')), multi: false },
    { rows: pickRows(d, [P('mesh', ids[1]!), P('line', 'ln-1'), P('point', 'pt-1'), P('mesh', 'pmi-1')], host('body')), multi: false },
    { rows: pickRows(d, [P('mesh', ids[0]!), P('mesh', ids[2]!)], host('part', true)), multi: true },
  ];
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
    // 230차: 복사 알림 낱말 둘(측정 기록·PMI 표 CSV)은 원문 그대로 넘기고 그 알림을 앱 글 칸으로 — 알림의 앱 글 칸 기본은 오류 알림
    expect(COPY_WHAT).toEqual(["'측정 기록 CSV'", "'PMI 표 CSV'"]);
    expect(TOAST_SIG).toMatch(/, ui = kind === 'error'$/);
    // 언어 알림 처리기가 캔버스 글(뷰 큐브 면·측정 글 꼴 — refreshFmt)과 가상 커서 알림 틀을 다시 맞춘다
    expect(ON_LANG).toMatch(/this\.relabelCube\(\);[\s\S]*this\.refreshFmt\(\);[\s\S]*this\.keySnap\?\.sync\(\);/);
    expect(REFRESH_FMT).toContain('setMeasureFormat((m) => measureLabelLines(m, this.fmt, translateUi))');
  });

  it.each(LANGS)('%s: 뷰어 조각 칸·분해 막대·도구 막대·잠금 안내·알림을 그린 뒤, 메뉴 아홉·키보드 도움말을 하나씩 열고', async (code) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    history.replaceState(null, '', `/?lang=${code}`);
    const views = h('div');
    const root = h('div', {}, views);
    document.body.append(root);
    // 230차: 앱 생성자처럼 언어 알림 처리기를 번역층보다 먼저
    const sh = shell(root, views);
    const dispose = await installLocalization(root);
    const found: string[] = [];
    const anchors: HTMLElement[] = [];
    try {
      // 230차 (ㄴ): 뷰어를 만든 뒤 캔버스 글(측정 글상자·뷰 큐브 면)과 가상 커서 알림 하나
      sh.ready();
      sh.announce();
      // 230차 (ㄱ): 여는 중 덮개(단계마다 하나 — 숨은 카드를 처음 보이는 차례)
      views.append(...BUSY_STAGES.map(busy));
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
      // 230차: 복사 알림 넷(측정 기록·PMI 표 CSV — 클립보드 됨·안 됨)과 그림 저장 실패 오류 알림(코어 까닭)
      await copyToasts(box);
      box.append(toastEl(imageSaveFailed(GL_LOST), 'error'));
      await settle();
      // 그린 것이 비지 않았다(간섭 쌍 버튼 넷, 단면 막대 셋, 분해 손질 칸 셋, 도구 막대 둘, 잠금 안내 열씩, 알림 스물하나·버튼 열셋, 시작 화면 오류 줄 둘, 여는 중 덮개 아홉)
      expect(views.querySelectorAll('[data-pair]').length).toBe(4);
      expect(views.querySelectorAll('.section-bar:not([hidden])').length).toBe(3);
      expect(views.querySelectorAll('.explode-tweak').length).toBe(3);
      expect(views.querySelectorAll('nav.toolbar').length).toBe(2);
      expect(views.querySelectorAll('.status-sel .st-lock').length).toBe(10);
      expect(views.querySelectorAll('.mb-lock-hint').length).toBe(10);
      expect(views.querySelectorAll('.toast').length).toBe(21);
      expect(views.querySelectorAll('.start-error').length).toBe(2);
      // 덮개 단계 글은 늦게 넣은 뒤(157차) 글 마디 둘 — 단계와 「…」
      const stages = [...views.querySelectorAll('.busy:not([hidden]) .busy-stage')].map((s) => s.textContent ?? '');
      expect(stages).toHaveLength(9);
      expect(stages.every((s) => s.length > 1 && s.endsWith('…'))).toBe(true);
      if (code === 'ko') expect(stages).toEqual(BUSY_STAGES.map((s) => `${s}…`));
      const actLabels = [...box.querySelectorAll('.toast-act')].map((b) => b.textContent);
      expect(actLabels).toHaveLength(13);
      if (code === 'ko') expect(actLabels).toEqual([...[...FAILS, ...GONE].flatMap(() => ['다시 시도', '새로 고침']), '새로 고침']);
      found.push(...leaks(views, code));
      // 230차 (ㄴ): 캔버스 글(번역층이 비키는 칸 — 앱이 넣기 전에 옮김). 한국어 화면은 원문 그대로라 다른 언어만 센다
      const canvasText = sh.canvas();
      expect(canvasText).toHaveLength(8);
      if (code === 'ko') expect(canvasText.slice(2)).toEqual(CUBE_KO);
      else found.push(...canvasText.filter((s) => HANGUL.test(s)).map((s) => `canvas: ${s}`));
      expect(sh.live().textContent).not.toBe('');

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
        // 230차 (ㄷ): 겹친 것 고르기 목록 셋, (ㄹ): 209차 앞 메뉴(보기 설정·그리기 모드·내보내기)와 단면 보기·고르기
        ...pickLists().map((l, i): [string, () => void] => [`겹친 것 ${i}`, () => openPickList({ x: 8, y: 8 }, { ...l, choose: () => {} })]),
        ...(['sliders', 'shade', 'image', 'section', 'pick'] as const).map((t): [string, () => void] => [`도구 ${t}`, () => bars[0]!.el.querySelector<HTMLButtonElement>(`button[data-tool="${t}"]`)!.click()]),
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
        // 230차: 겹친 것 목록의 종류 줄(부품 전체·면·바디·선 형상·점 형상·PMI)과 메뉴 다섯의 항목
        for (const l of ['부품 전체', '평면', '바디', '선 형상', '점 형상', 'PMI', '고른 부품 보기', '그리기 모드…', '내보내기…', '와이어프레임', '숨은 모서리 점선', '분해 보기', 'PNG 크게·투명 배경…', 'OBJ — 고른 것', '보기 링크 복사', '여러 개 고르기'])
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
          '겹친 것 0: ',
          '겹친 것 1: ',
          '겹친 것 2: ',
          '도구 sliders: ',
          '도구 shade: ',
          '도구 image: ',
          '도구 section: ',
          '도구 pick: Alt',
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
      restoreCube();
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

/** (ㅁ) 견줄 글: 글 마디(빈칸뿐인 것 빼고)와 번역층이 옮기는 속성을 차례대로 — 번역층이 비키는 data-i18n-skip 칸(가상 커서 알림 영역)은 따로 본다 */
function texts(el: Element | null): string[] {
  const out: string[] = [];
  const walk = (e: Element): void => {
    if (e.matches('[data-i18n-skip]')) return;
    for (const a of ATTRS) {
      const v = e.getAttribute(a);
      if (v !== null) out.push(`${a}=${v}`);
    }
    for (const n of e.childNodes) {
      if (n instanceof Element) walk(n);
      else if (n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim()) out.push(n.nodeValue);
    }
  };
  if (el) walk(el);
  return out;
}

interface Drawn {
  views: HTMLElement;
  sh: Shell;
  done(): void;
}
type Shot = Record<'page' | 'menu' | 'canvas', string[]>;
const shot = (s: Drawn): Shot => ({ page: texts(s.views), menu: texts(document.querySelector('.menu')), canvas: s.sh.canvas() });

/**
 * (ㅁ) 그려진 채 언어를 바꿀 수 있는 상태를 앱 차례대로 그린다: 생성자가 만드는 도구 막대(번역층보다 먼저), 뷰어를 만든 뒤의 캔버스 글·가상 커서 알림,
 * 여는 중 덮개, 패널 본문(속성·레이어·정보·간섭 결과), 단면 막대, 분해 막대, 잠금 안내(상태 막대·측정 띠), 떠 있는 알림(받지 못한 조각·열기 오류·보기 링크·새 판·잠글 방향 없음·
 * 복사 넷·그림 저장 실패), 시작 화면 오류, 연 작업 메뉴(언어를 고르면 닫히는지 본다)
 */
async function switchable(code: string): Promise<Drawn> {
  history.replaceState(null, '', `/?lang=${code}`);
  const views = h('div');
  const root = h('div', {}, views);
  document.body.append(root);
  const panels: Panel[] = [];
  const sh = shell(root, views, panels);
  views.append(new Toolbar(toolHost(true)).el);
  const dispose = await installLocalization(root);
  sh.ready();
  views.append(busy(stageLabel('삼각화')));
  for (const tab of ['props', 'layers', 'info'] as const) views.append(panel(tab, undefined, panels));
  views.append(panel('tree', (d) => (d.interference = CHECKS[0]), panels));
  const bar = new SectionBar({ viewerRef: null, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {}, toast: () => {} });
  views.append(bar.el, bar.handle);
  bar.sync(SECTIONS[0]!);
  const c = new ExplodeControls(
    () => {},
    () => {},
    {},
  );
  views.append(h('div', { class: 'explode-opts' }, ...c.els));
  c.sync(null, 'all', true, TWEAKS[0]![0], null, TWEAKS[0]![1]);
  const d = newDoc();
  d.selKey = bareKey;
  LOCKS.forEach((lock, i) => views.append(status(d, lock), strip(lock, i < 6)));
  const box = h('div', { class: 'toasts' });
  views.append(box);
  for (const m of FAILS) box.append(toastEl(m, 'warn', { label: '다시 시도', run: () => {} }));
  for (const g of GONE) box.append(toastEl([OPEN_FAIL, friendlyError(g)], 'error', { label: '새로 고침', run: () => {} }));
  box.append(toastEl(LINK_OK!, 'info'), toastEl(SW![1]!, 'info', { label: SW![2]!, run: () => {} }));
  for (const touch of [false, true]) box.append(toastEl(new Function(`return ${LOCK_FAIL}`).call({ touch }) as string, 'warn'));
  await copyToasts(box);
  box.append(toastEl(imageSaveFailed(GL_LOST), 'error'));
  views.append(startError([OPEN_FAIL, friendlyError(GONE[0]!)]));
  const anchor = h('button', { type: 'button' });
  document.body.append(anchor);
  openMenu(anchor, ctxMenu(CTX[0]!), '작업 메뉴');
  sh.announce();
  await settle();
  return {
    views,
    sh,
    done: () => {
      closeMenu();
      dispose();
      restoreCube();
      anchor.remove();
      root.remove();
      history.replaceState(null, '', '/');
    },
  };
}

/** 언어 메뉴의 그 언어를 누르고, 화면 언어가 바뀐 뒤 번역층·앱 다시 그리기가 가라앉을 때까지(마감 5초 — 13번, i18ncollide213 switchTo 꼴) */
async function switchTo(code: string): Promise<void> {
  document.querySelector<HTMLButtonElement>(`.language-list [data-language="${code}"]`)!.click();
  const end = Date.now() + 5000;
  while (document.documentElement.lang !== code && Date.now() < end) await settle();
  let changed = false;
  const watch = new MutationObserver(() => (changed = true));
  watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  for (let quiet = 0; quiet < 5 && Date.now() < end; ) {
    changed = false;
    await settle();
    quiet = changed ? 0 : quiet + 1;
  }
  watch.disconnect();
  expect(document.documentElement.lang).toBe(code);
}

describe('230차: 그려진 채 언어를 바꾸면 모든 칸이 새 언어로 다시 옮겨진다(앞 언어 글이 남지 않음 — WCAG 3.1.2)', () => {
  beforeAll(async () => {
    // 언어 메뉴가 기다리지 않고 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
    await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
  });

  it('한국어·영어에서 시작해 다섯 번 바꾼 화면 = 처음부터 그 언어로 그린 화면(글·말풍선·이름·캔버스 글), 연 메뉴는 닫히고 가상 커서 알림 영역은 앞 언어 글을 비운다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base: Record<string, Shot> = {};
    for (const code of LANGS) {
      const s = await switchable(code);
      try {
        base[code] = shot(s);
      } finally {
        s.done();
      }
    }
    // 견줄 것이 비지 않았다: 언어마다 같은 칸 수, 한국어와 다른 칸이 많다, 연 메뉴와 캔버스 글이 있다
    for (const code of LANGS) expect(base[code]!.page.length, code).toBe(base.ko!.page.length);
    expect(base.en!.page.filter((t, i) => t !== base.ko!.page[i]).length).toBeGreaterThan(50);
    expect(base.ja!.menu.length).toBeGreaterThan(5);
    expect(base.de!.canvas).toHaveLength(8);
    const left: string[] = [];
    const chains: [string, string[]][] = [
      ['ko', ['en', 'ja', 'zh-CN', 'de', 'ko']],
      ['en', ['ja', 'zh-CN', 'de', 'ko', 'en']],
    ];
    for (const [start, order] of chains) {
      const s = await switchable(start);
      try {
        for (const code of order) {
          await switchTo(code);
          // 연 작업 메뉴는 언어를 고르면 닫힌다(언어 메뉴가 초점을 버튼으로 돌려 menu.ts focusin이 닫음 — 누르기 전 pointerdown도 닫는다). 그래서 견주지 않는다
          if (document.querySelector('.menu')) left.push(`${start}→${code} menu: 열린 채`);
          const live = s.sh.live().textContent ?? '';
          if (live) left.push(`${start}→${code} live: ${live}`);
          const now = shot(s);
          const b = base[code]!;
          for (const k of ['page', 'canvas'] as const) {
            if (now[k].length !== b[k].length) left.push(`${start}→${code} ${k}: ${now[k].length} ≠ ${b[k].length}칸`);
            now[k].forEach((t, i) => t !== b[k][i] && left.push(`${start}→${code} ${k}: ${t} ≠ ${b[k][i]}`));
          }
          // 새 언어로 다음 알림(다음 바꿈에서 비울 글)
          s.sh.announce();
        }
      } finally {
        s.done();
      }
    }
    expect(left).toEqual([]);
  });
});

// ───────────────────────── 231차 ─────────────────────────
// 230차가 코드로만 본 둘(개체 측정 덧그림 글·마우스 측정 말풍선)과 수 꼴(Fmt — 소수점·자리 구분): 앱 원문을 잘라 그린 뒤 230차 차례(switchTo)로 언어를 바꾸고 처음부터 그 언어로 그린 것과 견준다
const SHOW_ENTITIES = cut(/\n {2}private showEntities\(\): void \{\n([\s\S]*?)\n {2}\}\n/).replace(/new Map<[\s\S]*?>\(\)/, 'new Map()');
// refreshBar의 개체 측정 갈래(띠 글 — entpick.ts entityBar)와 글 칸 넣기(만든 글이 같으면 바꾸지 않는다 — 53차)
const ENT_BAR = cut(/\n\s*(if \(this\.ent\) t\.append\(\.\.\.this\.ent\.entityBar\(d\.ent, fm, this\.touch\)\);)\n/);
const BAR_PUT = cut(/\n(\s*const src = t\.innerHTML;\n\s*if \(src !== this\.barSrc\) \{\n[\s\S]*?\n\s*\})\n/);
const SHOW_HOVER = cut(/\n {2}private showHoverSnap\(\): void \{\n([\s\S]*?)\n {2}\}\n/).replace(/(\w)!\./g, '$1.');
// 생성자의 두 칸(상태 막대 status-snap·측정 띠 mb-hover — 커서 아래 스냅할 점)
const SNAP_MAKE = cut(/\n\s*(this\.statusSnap = h\('div', [^\n]*\);)\n/);
const HOVER_MAKE = cut(/\n\s*(this\.measureHoverEl = h\('span', [^\n]*\);)\n/);

const picked = (o: object): Picked => o as unknown as Picked;
/** 개체 측정 셋(앱 하나마다): 원 모서리 하나(덧그림 중심 점·Ø), 직선 모서리 하나(길이), 두 개체 결과(≈ 거리·각 — 띠 첫 줄 굵게·나머지 줄·두 개체 이름) */
const ENT_STATES: { picks: Picked[]; result: PickedMeasure | null }[] = [
  {
    picks: [
      picked({ meshId: 'm1', what: 'edge', title: '원 모서리', point: [617.25, 0, 0], entity: { type: 'circle', center: [0, 0, 0], radius: 617.25, normal: [0, 0, 1] }, edge: { meshId: 'm1', kind: 'circle', segStart: 0, segCount: 8, length: 3878.25, radius: 617.25, sweepDeg: 360, ends: [[617.25, 0, 0], [617.25, 0, 0]] } }),
    ],
    result: null,
  },
  {
    picks: [picked({ meshId: 'm1', what: 'edge', title: '직선 모서리', point: [0, 0, 0], entity: { type: 'line', a: [0, 0, 0], b: [2345.678, 0, 0] }, edge: { meshId: 'm1', kind: 'line', segStart: 8, segCount: 1, length: 2345.678, ends: [[0, 0, 0], [2345.678, 0, 0]] } })],
    result: null,
  },
  {
    picks: [
      picked({ meshId: 'm1', what: 'vertex', title: '평면', point: [0, 0, 0], entity: { type: 'point', point: [0, 0, 0] } }),
      picked({ meshId: 'm2', what: 'vertex', title: '원 모서리', point: [0, 1234.5678, 0], entity: { type: 'point', point: [0, 1234.5678, 0] } }),
    ],
    result: {
      lines: [
        { label: '평행 면 거리', unit: 'length', value: 1234.5678, approx: true },
        { label: '면 사이 각', unit: 'angle', value: 12.5 },
      ],
      annotations: [
        { kind: 'distance', a: [0, 0, 0], b: [0, 1234.5678, 0], line: 0 },
        { kind: 'angle', a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0], line: 1 },
      ],
      approx: true,
    } as unknown as PickedMeasure,
  },
];
/** 마우스 측정 미리 보기 스냅(코어 measureHoverSnap 꼴)과 한국어 화면 이름 — 끝점·잠근 중간점·잠근 축이 모서리와 만남·모서리에 수직(뷰어 조각 이름)·면 위 점·Tab 돌리기 차례 */
const HOVERS: [snap: object, ko: string][] = [
  [{ snap: 'endpoint' }, '끝점'],
  [{ snap: 'midpoint', locked: true }, '중간점 · 잠금'],
  [{ snap: 'axis', axis: 'x', locked: true, segment: {} }, '잠근 X축 · 모서리 위'],
  [{ snap: 'perpendicular', perpendicularDir: true }, '모서리에 수직'],
  [{ snap: null, face: {} }, '면 위 점'],
  [{ snap: 'endpoint', cycle: { index: 1, count: 4 } }, '끝점 2/4'],
];

interface Drawn231 {
  views: HTMLElement;
  /** 가짜 뷰어 셋이 받은 덧그림 글(캔버스) */
  annos(): string[];
  /** 가상 커서 알림 영역(Tab 돌리기 차례의 화면 언어 글) */
  live(): string;
  done(): void;
}
/** 앱 차례: 생성자처럼 언어 알림 처리기를 먼저(번역층보다 앞), 번역층을 건 뒤 개체 측정(수 꼴·덧그림·띠)과 마우스 측정 말풍선을 그린다 */
async function draw231(code: string): Promise<Drawn231> {
  history.replaceState(null, '', `/?lang=${code}`);
  const views = h('div');
  const root = h('div', {}, views);
  document.body.append(root);
  type Fake = { annos: { label: string }[] | null; viewCubeSize: number; section: null; setMeasureFormat(): void; setViewCubeSize(): void; setAnnotations(a: { label: string }[] | null): void };
  const fake = (): Fake => {
    const f: Fake = { annos: null, viewCubeSize: 96, section: null, setMeasureFormat: () => {}, setViewCubeSize: () => {}, setAnnotations: (a) => (f.annos = a) };
    return f;
  };
  const app = (viewer: object, doc: object): Record<string, unknown> => {
    const self: Record<string, unknown> = { viewer, doc, cube: null, keySnap: null, display: undefined, panel: { redraw: () => {} }, syncSection: () => {}, refreshRecent: async () => {}, updateStatus: () => {} };
    self.makeFmt = new Function('Fmt', 'numberLocale', MAKE_FMT).bind(self, Fmt, numberLocale);
    self.refreshFmt = new Function('measureLabelLines', 'translateUi', REFRESH_FMT).bind(self, measureLabelLines, translateUi);
    self.relabelCube = new Function('translateUi', RELABEL).bind(self, translateUi);
    root.addEventListener('languagechange', new Function(ON_LANG).bind(self) as () => void);
    return self;
  };
  const viewers: Fake[] = [];
  const ents = ENT_STATES.map((ent) => {
    const fv = fake();
    viewers.push(fv);
    const measureText = h('div', { class: 'mb-text' });
    views.append(h('div', { class: 'measure-bar measuring' }, measureText));
    const self = app(fv, { scene: { units: 'mm' }, ent });
    Object.assign(self, { ent: { pickedAnnotations, entityBar }, entMeasuring: true, touch: false, barSrc: '', measureText, paint: () => {} });
    self.showEntities = new Function(SHOW_ENTITIES).bind(self);
    // updateStatus → refreshBar(개체 측정 갈래만 — 띠 글 칸)
    self.updateStatus = new Function('h', `const d = this.doc;\nconst fm = this.fmt;\nconst t = h('div');\n${ENT_BAR}\n${BAR_PUT}`).bind(self, h);
    return self;
  });
  const hv = {
    ...fake(),
    canvas: h('canvas'),
    keyboardSnap: { step: 8, bigStep: 40, keys: KEY_SNAP_KEYS },
    keyboardCursor: null,
    measureMode: true,
    measurePointCount: 1,
    measureInferenceLock: null,
    measureHoverSnap: null as object | null,
    setKeyboardSnap: () => {},
  };
  views.append(h('div', { class: 'viewer-host' }, hv.canvas));
  const hs = app(hv, { scene: { units: 'mm' } });
  Object.assign(hs, { entMeasuring: false, tangents: null, guideLabelOf: guideSnapLabel, hoverSnapText: undefined, refreshLock: () => {} });
  const dispose = await installLocalization(root);
  for (const self of ents) (self.refreshFmt as () => void)();
  const ks = installKeySnap(hv as unknown as Viewer3d, { tr: translateUi, pickThrough: () => false });
  hs.keySnap = ks;
  const show = new Function('hoverSnapLabel', SHOW_HOVER).bind(hs, hoverSnapLabel) as () => void;
  for (const [snap] of HOVERS) {
    // 상태마다 두 칸 한 벌(앱은 한 벌을 바꿔 쓴다 — 여섯 상태를 한 화면에 두려고)
    new Function('h', `${SNAP_MAKE}\n${HOVER_MAKE}`).call(hs, h);
    views.append(hs.statusSnap as HTMLElement, hs.measureHoverEl as HTMLElement);
    hv.measureHoverSnap = snap;
    hs.hoverSnapText = undefined;
    show();
  }
  await settle();
  return {
    views,
    annos: () => viewers.flatMap((v) => (v.annos ?? []).map((a) => a.label)),
    live: () => ks.live.textContent ?? '',
    done: () => {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    },
  };
}

describe('231차: 개체 측정 덧그림 글·측정 띠 개체 측정 글·마우스 측정 말풍선은 언어를 바꾼 뒤 새 언어·새 수 꼴로 다시 그려진다(앞 언어 글·꼴이 남지 않음 — WCAG 3.1.2)', () => {
  beforeAll(async () => {
    // 언어 메뉴가 기다리지 않고 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
    await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
  });

  it('한국어·영어에서 시작해 다섯 번 바꾼 화면 = 처음부터 그 언어로 그린 화면(띠 글·말풍선·이름·덧그림 글), 처음 그린 화면은 파일 글 밖 한글 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    type Shot231 = Record<'page' | 'canvas', string[]>;
    const shot231 = (s: Drawn231): Shot231 => ({ page: texts(s.views), canvas: s.annos() });
    const base: Record<string, Shot231> = {};
    for (const code of LANGS) {
      const s = await draw231(code);
      try {
        base[code] = shot231(s);
        expect(leaks(s.views, code), code).toEqual([]);
        // 그린 것이 비지 않았다: 띠 글 셋, 말풍선 여섯 상태(두 칸씩), 덧그림 일곱(원 2·직선 1·결과 4)
        expect(s.views.querySelectorAll('.mb-text b.mb-value').length, code).toBe(3);
        if (code === 'ko') expect([...s.views.querySelectorAll('.status-snap')].map((e) => e.textContent)).toEqual(HOVERS.map(([, ko]) => ko));
        expect(s.views.querySelectorAll('.mb-hover:not([hidden])').length, code).toBe(HOVERS.length);
      } finally {
        s.done();
      }
    }
    for (const code of LANGS) expect(base[code]!.page.length, code).toBe(base.ko!.page.length);
    expect(base.en!.page.filter((t, i) => t !== base.ko!.page[i]).length).toBeGreaterThan(15);
    // 수 꼴: 덧그림 글은 수·단위·Ø·≈·°뿐이라 한국어·영어·일본어·중국어는 같고(「1,234.5」), 독일어만 넷이 다르다(「1.234,5」 — 빈 글 셋은 같음)
    expect(base.ko!.canvas).toHaveLength(7);
    for (const code of ['en', 'ja', 'zh-CN']) expect(base[code]!.canvas, code).toEqual(base.ko!.canvas);
    expect(base.de!.canvas.filter((t, i) => t !== base.en!.canvas[i])).toHaveLength(4);
    // 띠 글의 수도 독일어만 꼴이 다르다(그 칸이 다시 그려져야 하는 바꿈 — 중국어 → 독일어 → 한국어)
    expect(base.de!.page.filter((t) => /\d\.\d{3},\d/.test(t)).length).toBeGreaterThan(0);
    const left: string[] = [];
    const chains: [string, string[]][] = [
      ['ko', ['en', 'ja', 'zh-CN', 'de', 'ko']],
      ['en', ['ja', 'zh-CN', 'de', 'ko', 'en']],
    ];
    for (const [start, order] of chains) {
      const s = await draw231(start);
      try {
        for (const code of order) {
          await switchTo(code);
          const live = s.live();
          if (live) left.push(`${start}→${code} live: ${live}`);
          const now = shot231(s);
          const b = base[code]!;
          for (const k of ['page', 'canvas'] as const) {
            if (now[k].length !== b[k].length) left.push(`${start}→${code} ${k}: ${now[k].length} ≠ ${b[k].length}칸`);
            now[k].forEach((t, i) => t !== b[k][i] && left.push(`${start}→${code} ${k}: ${t} ≠ ${b[k][i]}`));
          }
        }
      } finally {
        s.done();
      }
    }
    expect(left).toEqual([]);
  });
});

// ───────────────────────── 232차 ─────────────────────────
// 231차가 표에 둔 셈 수 꼴(format.ts fmtCount — 59자리, 늘 ko-KR이었다): 대표 칸을 다섯 언어로 그려 천 단위 묶음 글자가 화면 언어 꼴인지(독일어 「.」, 나머지 「,」) 보고,
// 앱 언어 알림 처리기(app.ts 원문 — refreshFmt가 panel.redraw·updateStatus)로 다시 그린 칸이 바꾼 뒤 새 꼴인지 230차 차례(switchTo)로 견준다
// updateStatus의 문서 칸(상태 막대 왼쪽 — doc.ts docStatus: 파일 크기 말풍선·삼각형·부품 수)
const STATUS_DOC = cut(/\n(\s*for \(const it of docStatus\(d\)\) this\.statusDoc\.append\([^\n]*\);)\n/);
/** 큰 간섭 결과(패널 제품 탭 — panelview.ts interferenceView): 범위가 겹친 쌍 12,345·쌍 칩(교차 삼각형 쌍) 2,345·시간 1,500 ms */
const BIG: NonNullable<StepDoc['interference']> = { running: false, done: 0, total: 0, result: { pairs: [{ ...P1, count: 2345 }, P2], tested: 12345, ms: 1500 } };
/** 천 단위 묶음 글자 sep로 쓴 수(Intl을 거치지 않은 기대 — 「12,345」·「12.345」) */
const grouped = (n: number, sep: string): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
/** 글 안에 그 꼴의 수가 따로 있는가(앞뒤가 수·「.」·「,」가 아님 — 「9.64 KB」 같은 소수와 갈린다) */
const hasNum = (all: string, n: number, sep: string): boolean => new RegExp(`(?:^|[^\\d.,])${grouped(n, sep).replace(/\./g, '\\.')}(?:[^\\d.,]|$)`).test(all);
/** 화면 언어의 천 단위 묶음 글자(Intl 로캘 꼴 — display.ts numberLocale과 같은 언어) */
const GROUP: Record<string, string> = { ko: ',', en: ',', ja: ',', 'zh-CN': ',', de: '.' };

interface Drawn232 {
  /** 상태 막대 문서 칸·정보 탭 패널·제품 탭 패널(간섭 결과) 차례 */
  views: HTMLElement;
  done(): void;
}
/** 앱 차례: 생성자처럼 언어 알림 처리기를 먼저(번역층보다 앞) 달고 상태 막대 문서 칸을 두고, 번역층을 건 뒤 정보 탭·제품 탭(큰 간섭 결과) 패널을 그린다 */
async function draw232(code: string): Promise<Drawn232> {
  history.replaceState(null, '', `/?lang=${code}`);
  const statusDoc = h('div', { class: 'status-doc' });
  const views = h('div', {}, statusDoc);
  const root = h('div', {}, views);
  document.body.append(root);
  const panels: Panel[] = [];
  const self: Record<string, unknown> = { viewer: null, cube: null, keySnap: null, doc: newDoc(), display: undefined, entMeasuring: false, statusDoc, panel: { redraw: () => panels.forEach((p) => p.redraw()) }, syncSection: () => {}, refreshRecent: async () => {} };
  self.makeFmt = new Function('Fmt', 'numberLocale', MAKE_FMT).bind(self, Fmt, numberLocale);
  self.refreshFmt = new Function('measureLabelLines', 'translateUi', REFRESH_FMT).bind(self, measureLabelLines, translateUi);
  self.relabelCube = new Function('translateUi', RELABEL).bind(self, translateUi);
  self.updateStatus = new Function('h', 'docStatus', `const d = this.doc;\nthis.statusDoc.innerHTML = '';\n${STATUS_DOC}`).bind(self, h, docStatus);
  root.addEventListener('languagechange', new Function(ON_LANG).bind(self) as () => void);
  const dispose = await installLocalization(root);
  views.append(panel('info', undefined, panels), panel('tree', (d) => (d.interference = BIG), panels));
  await settle();
  return {
    views,
    done: () => {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    },
  };
}

describe('232차: 셈 수(fmtCount)의 천 단위 묶음은 화면 언어 꼴(독일어 「12.345」·나머지 「12,345」)이고, 언어를 바꾸면 다시 그린 칸이 새 꼴이다(앞 언어 꼴이 남지 않음 — WCAG 3.1.2)', () => {
  beforeAll(async () => {
    // 언어 메뉴가 기다리지 않고 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
    await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
  });

  it('다섯 언어로 처음 그린 대표 칸(상태 막대 파일 크기 말풍선·정보 탭 파일 크기 바이트·간섭 결과 셋)이 그 언어의 묶음 글자만 쓴다, 파일 글 밖 한글 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 견줄 수가 천 단위 묶음을 탄다(모형 STEP 글이 1,000바이트를 넘음)
    expect(bytes.length).toBeGreaterThan(999);
    const bad: string[] = [];
    for (const code of LANGS) {
      const s = await draw232(code);
      try {
        expect(leaks(s.views, code), code).toEqual([]);
        const [status, info, tree] = [...s.views.children];
        const sep = GROUP[code]!;
        const other = sep === '.' ? ',' : '.';
        const scopes: [string, Element | undefined, number[]][] = [
          ['상태 막대', status, [bytes.length]],
          ['정보 탭', info, [bytes.length]],
          ['간섭 결과', tree, [12345, 2345, 1500]],
        ];
        for (const [where, el, nums] of scopes) {
          const all = texts(el ?? null).join('\n');
          for (const n of nums) if (!hasNum(all, n, sep) || hasNum(all, n, other)) bad.push(`${code} ${where}: ${grouped(n, sep)} 꼴이어야 함(${hasNum(all, n, other) ? `${grouped(n, other)} 꼴` : '없음'})`);
        }
      } finally {
        s.done();
      }
    }
    expect(bad).toEqual([]);
  });

  it('한국어·영어에서 시작해 다섯 번 바꾼 화면 = 처음부터 그 언어로 그린 화면(상태 막대 문서 칸·정보 탭·간섭 결과 — 셈 수 꼴 포함)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const base: Record<string, string[]> = {};
    for (const code of LANGS) {
      const s = await draw232(code);
      try {
        base[code] = texts(s.views);
      } finally {
        s.done();
      }
    }
    for (const code of LANGS) expect(base[code]!.length, code).toBe(base.ko!.length);
    // 견줄 것이 비지 않았다: 영어와 독일어는 같은 셈 수를 다른 묶음 글자로 쓴 칸이 있다(「12,345」 ↔ 「12.345」 — 독일어로·독일어에서 바꿀 때 다시 그려야 하는 칸)
    const nums = (t: string, sep: string): string[] => (t.match(sep === ',' ? /\d{1,3}(?:,\d{3})+(?![\d,])/g : /\d{1,3}(?:\.\d{3})+(?![\d.])/g) ?? []).map((x) => x.replace(/[,.]/g, ''));
    const flip = base.en!.filter((t, i) => nums(t, ',').length > 0 && nums(t, ',').join() === nums(base.de![i]!, '.').join());
    expect(flip.length).toBeGreaterThan(2);
    const left: string[] = [];
    const chains: [string, string[]][] = [
      ['ko', ['en', 'ja', 'zh-CN', 'de', 'ko']],
      ['en', ['ja', 'zh-CN', 'de', 'ko', 'en']],
    ];
    for (const [start, order] of chains) {
      const s = await draw232(start);
      try {
        for (const code of order) {
          await switchTo(code);
          const now = texts(s.views);
          const b = base[code]!;
          if (now.length !== b.length) left.push(`${start}→${code}: ${now.length} ≠ ${b.length}칸`);
          now.forEach((t, i) => t !== b[i] && left.push(`${start}→${code}: ${t} ≠ ${b[i]}`));
        }
      } finally {
        s.done();
      }
    }
    expect(left).toEqual([]);
  });
});
