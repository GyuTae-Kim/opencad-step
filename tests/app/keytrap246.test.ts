// @vitest-environment jsdom
/**
 * 246차(WCAG 2.1.2 No Keyboard Trap — 재발 막기): 키보드로 초점이 들어간 칸에서는 키보드만으로 나올 수 있어야 한다 — 보통 키(Tab·Shift+Tab,
 * 대화 상자·메뉴·팝업은 Esc)로 나오거나, 보통 키가 아니면 그 길을 화면에 알려 둔다(리드가 적어 둔 기준). 셈 안: Tab·Shift+Tab을 가로채 다른 일에 쓰는 칸,
 * 초점을 잃으면(blur·focusout) 도로 가져오는 칸, 모달 상자의 가두기, 3D 보기가 키를 받는 동안, 나무 보기(roving tabindex), inert 칸, 메뉴 Tab.
 * 셈 밖: 마우스로만 여는 것, 키를 가로채지 않는 보통 입력란, 코어(node_modules) 안 키 처리(보고만), 줄머리 주석·사건 이름이 아닌 낱말(inertia).
 * - 감사 표(ROWS — README 개발 절 246차 문단): src 전체 .ts에서 넷 갈래 — Tab(따옴표 든 'Tab'), 초점 잃음(hover239와 같은 꼴: addEventListener·listen·on에 넘긴
 *   'blur'·'focusout'과 `for (… of [...]) ….addEventListener(` 묶음, 속성 꼴 onblur·onfocusout), 모달·inert(\binert\b·aria-modal·showModal), 키 사건(따옴표 든
 *   'keydown'·'keyup'·'keypress', 속성 꼴 onkeydown 등) — 을 파일마다 세어 표 줄의 자리 수와 같다(새 자리면 키·하는 일·나오는 길·판정을 표에 적어야 통과, 없어진 자리도 실패).
 *   줄마다 근거 원문(그 키만 받고 나머지는 넘기는 줄·Tab을 막지 않는 줄·나오는 키), 초점 잃음 처리 본문에 초점 옮기기 없음.
 * - 246차 결과: 나올 수 없는 칸 0(고친 것 0). Tab을 늘 받는 칸은 3D 보기 가상 커서(같은 자리 후보 돌리기) 하나 — Esc로 커서를 끄면(측정 점이 있으면 첫 Esc가 지우고
 *   다음 Esc) Tab이 나가고, 켤 때 알림 끝 「끄기 Esc」·도움말 Esc 줄·aria-keyshortcuts Escape가 그 길을 말한다. 마우스 Tab 돌리기는 Esc로 푼다(도움말 줄).
 * - 실제 사건(jsdom): 메뉴 Tab·Shift+Tab·Esc, keynav 묶음(roving) Tab·rescue, 대화 상자(모달 동안 앱 키는 Esc만), 알림 focusout, 실제 코어 가상 커서.
 * src를 소스 글로 읽는다(ci-guard 12번 — 키 처리·초점 잃음·inert 줄을 바꾸면 이 시험도). 239차 hover239(blur·focusout 사건 셈)·240차 focusobscured240(inert 근거)와 같은지
 * 그 시험 글도 읽어 견준다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDialog, dialogOpen, openDialog } from '../../src/app/dialog';
import { stepEdgeIndex } from '../../src/app/doc';
import { pushToast } from '../../src/app/dom';
import { installKeyNav } from '../../src/app/keynav';
import { routeKey } from '../../src/app/keys';
import { installKeySnap, keyHelpBody, keyHelpRows } from '../../src/app/keysnap';
import { closeMenu, menuOpen, openMenu, type MenuItem } from '../../src/app/menu';
import { circleCenters, measureSnapOptions } from '../../src/app/snap';
import { stepToScene } from '../../src/index';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
/** src 아래 .ts 전부(저장소 기준 경로, 이름 차례) */
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? tsFiles(`${dir}/${f}`) : f.endsWith('.ts') ? [`${dir}/${f}`] : []));
}
const SRC: [file: string, text: string][] = tsFiles('src').map((f) => [f, read(f)]);
const textOf = (file: string): string => SRC.find(([f]) => f === file)?.[1] ?? '';
/** 줄머리 주석(/** … *\/·//)을 뺀 코드(244차 status244·245차 pointer245와 같은 꼴) */
const codeOf = (t: string): string => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');

type Fam = 'tab' | 'lose' | 'modal' | 'key';
const FAMS: Fam[] = ['tab', 'lose', 'modal', 'key'];
/** 초점 잃음 묶음 꼴(239차 hover239 LOOP와 같은 꼴 — 이름 묶음을 한 번에 다는 자리) */
const LOOP = /for \(const \w+ of \[((?:\s*['"]\w+['"],?)+)\s*\]\)\s*[\w.?]+\.addEventListener\(/g;
const COUNT: Record<Fam, (code: string) => number> = {
  tab: (c) => [...c.matchAll(/['"`]Tab['"`]/g)].length,
  lose: (c) =>
    [...c.matchAll(/\b(?:addEventListener|listen|on)\(\s*['"`](?:blur|focusout)['"`]|\bon(?:blur|focusout)\b/g)].length +
    [...c.matchAll(LOOP)].reduce((n, m) => n + [...m[1]!.matchAll(/['"](?:blur|focusout)['"]/g)].length, 0),
  modal: (c) => [...c.matchAll(/\binert\b|aria-modal|showModal/g)].length,
  key: (c) => [...c.matchAll(/['"`](?:keydown|keyup|keypress)['"`]|\bon(?:keydown|keyup|keypress)\b/g)].length,
};

const APP = 'src/app/app.ts';
const DIALOG = 'src/app/dialog.ts';
const DOM = 'src/app/dom.ts';
const EBAR = 'src/app/explodebar.ts';
const ETOOL = 'src/app/explodetool.ts';
const KEYNAV = 'src/app/keynav.ts';
const KEYS = 'src/app/keys.ts';
const KSNAP = 'src/app/keysnap.ts';
const MENU = 'src/app/menu.ts';
const PANEL = 'src/app/panel.ts';
const PHYS = 'src/app/physics.ts';
const PROPS = 'src/app/propsview.ts';
const RESIZE = 'src/app/resize.ts';
const SECT = 'src/app/sectionbar.ts';
const SNAP = 'src/app/snap.ts';
const TAN = 'src/app/tangent.ts';
const TREE = 'src/app/treeview.ts';

// ───────────────────────── 감사 표 ─────────────────────────

/** pass 나올 수 있음(보통 키 — 가로채면 Esc 등 안내된 키) · out 셈 밖(처리 아님·keyup·표시만) — 나올 수 없는 칸(fail)은 0이라 갈래가 없다 */
type Verdict = 'pass' | 'out';
interface Row {
  id: string;
  /** 자리(파일:줄 — 246차 main) */
  at: string;
  keys: string;
  what: string;
  /** 나오는 길(보통 키, 다른 키면 그 안내 자리) */
  exit: string;
  verdict: Verdict;
  /** 갈래마다 자리 수(파일 → 수) */
  sites: Partial<Record<Fam, Record<string, number>>>;
  /** 근거 원문(글은 그대로 품는지, 정규식은 맞는지) */
  proof: [file: string, p: string | RegExp][];
}
const ROWS: Row[] = [
  // Tab 처리
  {
    id: 'T1',
    at: 'menu.ts:175·192·200',
    keys: 'Tab·Shift+Tab·Esc·↑↓·Home·End(문서 캡처)',
    what: '메뉴: Tab은 닫고 초점이 메뉴 안이었으면 연 단추(화면 점 메뉴는 연 때 초점 자리)로 돌려준 뒤 기본 이동은 막지 않음(188차)',
    exit: 'Tab·Shift+Tab(연 자리의 다음·앞 칸), Esc(닫고 연 곳으로)',
    verdict: 'pass',
    sites: { tab: { [MENU]: 1 }, key: { [MENU]: 2 } },
    proof: [
      [MENU, /\} else if \(e\.key === 'Tab'\) \{\s*(?:\/\/[^\n]*\s*)*const had = el\.contains\(document\.activeElement\);\s*closeMenu\(\);\s*if \(had\) back\(\);\s*\}/],
      [MENU, /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*closeMenu\(\);\s*back\(\);/],
      [MENU, 'const back = () => opener?.isConnected && opener.focus({ preventScroll: true });'],
      [MENU, "document.addEventListener('keydown', onKey, true);"],
    ],
  },
  {
    id: 'T2',
    at: 'tangent.ts:740',
    keys: 'Shift+Tab(곡선 위 Shift 누름 바로 뒤, 캔버스, 가상 커서 꺼짐)',
    what: '앱 접선 잠금을 되돌려 코어 마우스 Tab 돌리기에 넘김 — 코어가 받으면 멈추고, 못 받으면 잠금을 다시 걸고 막지 않음(122차)',
    exit: 'V2(Esc로 돌리기 풀기·마우스 옮김), 못 받은 Shift+Tab은 브라우저 이동',
    verdict: 'pass',
    sites: { tab: { [TAN]: 1 } },
    proof: [
      [TAN, /ev\.key !== 'Tab' \|\| !ev\.shiftKey \|\| \(ev\.target && ev\.target !== v\.canvas\) \|\| v\.keyboardCursor/],
      [TAN, /if \(v\.handleKey\(ev\)\) \{\s*this\.forget\(\);\s*this\.undone = true;\s*ev\.stopPropagation\(\);\s*return 2;\s*\}\s*if \(this\.lockTangent\(v, t\)\) return 0;/],
      [APP, /const r = ev \? t\.key\(v, ev\) : \+t\.shiftUp\(v\);\s*if \(r\) this\.refreshLock\(\);\s*return r > 1;/],
    ],
  },
  {
    id: 'T3',
    at: 'keysnap.ts:158',
    keys: '(값)',
    what: '캔버스 aria-keyshortcuts 값에 Tab·Shift+Tab·Escape — 키 처리 아님',
    exit: '—',
    verdict: 'out',
    sites: { tab: { [KSNAP]: 1 } },
    proof: [[KSNAP, "for (const k of ['Tab', 'Shift+Tab', 'Escape']) out.add(k);"]],
  },
  // 초점 잃음(blur·focusout)
  {
    id: 'B1',
    at: 'app.ts:1145',
    keys: '캔버스 focus·blur',
    what: '잠금 안내 글 맞추기(refreshLock) — 초점을 가져오지 않음',
    exit: '—(초점 그대로)',
    verdict: 'pass',
    sites: { lose: { [APP]: 1 } },
    proof: [[APP, "for (const t of ['focus', 'blur']) v.canvas.addEventListener(t, () => this.refreshLock());"]],
  },
  {
    id: 'B2',
    at: 'app.ts:3069',
    keys: '창 blur',
    what: '앱 접선 Shift 잠금 풀기·스냅 이름 다시 — 초점을 가져오지 않음',
    exit: '—',
    verdict: 'pass',
    sites: { lose: { [APP]: 1 } },
    proof: [[APP, /window\.addEventListener\('blur', \(\) => \{\s*this\.tangentShift\(false\);\s*this\.scheduleHoverSnap\(\);\s*\}\);/]],
  },
  {
    id: 'B3',
    at: 'dom.ts:122',
    keys: '알림 focusout',
    what: '닫힘 시간 멈춤 표시(inside)만 — 밖으로 가면 시간을 다시 셈(160차), 초점을 가져오지 않음',
    exit: '—',
    verdict: 'pass',
    sites: { lose: { [DOM]: 1 } },
    proof: [[DOM, "on('focusout', (e) => (inside = t.contains((e as FocusEvent).relatedTarget as Node | null)));"]],
  },
  {
    id: 'B4',
    at: 'explodebar.ts:303',
    keys: '분해 거리 칸 blur',
    what: '보일 값으로 되돌리고 오류 뗌(242차) — 떠날 때의 change도 초점이 칸 밖이면 되돌리기만(칸 다시 고르기는 칸에 초점이 있을 때 — Enter)',
    exit: '—',
    verdict: 'pass',
    sites: { lose: { [EBAR]: 1 } },
    proof: [
      [EBAR, /this\.distInput\.addEventListener\('blur', \(\) => \{\s*if \(this\.distInput\.value !== this\.distShown\) this\.distInput\.value = this\.distShown;\s*this\.valid\(\);\s*\}\);/],
      [EBAR, /\} else if \(document\.activeElement === this\.distInput\) this\.distInput\.select\(\);\s*else \{\s*this\.distInput\.value = this\.distShown;/],
    ],
  },
  {
    id: 'B5',
    at: 'explodetool.ts:747',
    keys: '창 blur(끄는 동안)',
    what: 'Alt 뗀 것으로(altTo(false)) — 초점을 가져오지 않음',
    exit: '—',
    verdict: 'pass',
    sites: { lose: { [ETOOL]: 1 } },
    proof: [[ETOOL, /const blur = \(\): void => this\.altTo\(false\);\s*window\.addEventListener\('keydown', key, true\);\s*window\.addEventListener\('keyup', key, true\);\s*window\.addEventListener\('blur', blur\);/]],
  },
  // 모달·inert
  {
    id: 'M1',
    at: 'app.ts:3289',
    keys: 'inert',
    what: '문서 전 시작 화면 뒤 캔버스 칸을 inert — 문서를 열면 같은 차례에 풀고 3D 보기로 초점, 한 번 든 문서는 비지 않아(this.doc = 한 곳) 다시 걸리지 않음',
    exit: '— (inert 동안 그 안 초점 없음)',
    verdict: 'pass',
    sites: { modal: { [APP]: 1 } },
    proof: [[APP, /this\.startEl\.hidden = !!d;\s*\/\/[^\n]*\s*this\.hostEl\.inert = !d;\s*if \(fromStart\) this\.viewer\?\.canvas\.focus\(\{ preventScroll: true \}\);/]],
  },
  {
    id: 'M2',
    at: 'dialog.ts:65',
    keys: 'showModal(모달 상자)',
    what: '브라우저 모달(뒤 문서 inert, Tab은 상자 안 — 앱 가두기 코드 없음). 모달 동안 앱 키는 Esc만',
    exit: 'Esc(브라우저 cancel·앱 Esc → 닫기), 닫기 단추, 배경 누르기 — 닫으면 연 단추로',
    verdict: 'pass',
    sites: { modal: { [DIALOG]: 2 } },
    proof: [
      [DIALOG, /if \(typeof el\.showModal === 'function'\) el\.showModal\(\);\s*else el\.setAttribute\('open', ''\);/],
      [DIALOG, "el.addEventListener('cancel', () => done());"],
      [DIALOG, "if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true });"],
      [KEYS, "if (k.modal && k.key !== 'Escape') return null;"],
      [APP, /\(ev\) => \{\s*if \(dialogOpen\(\)\) return;/],
    ],
  },
  // 3D 보기가 키를 받는 동안(코어 몫은 실제 코어 시험으로 — 아래, V3 코어 걷기는 앱 원문이 없어 progress 표에만)
  {
    id: 'V1',
    at: '코어 가상 커서(keyboardKey next·prev) — 앱 keysnap.ts installKeySnap',
    keys: '커서가 켜진 동안 Tab·Shift+Tab(늘 받음)',
    what: '같은 자리 후보 돌리기',
    exit: 'Esc로 커서 끄기(측정 점·끌어온 점·편 뷰 큐브가 있으면 첫 Esc가 지우고 다음 Esc) — 켤 때 알림 끝 「끄기 Esc」(화면 밖 알림 영역), 도움말 Esc 줄, aria-keyshortcuts Escape',
    verdict: 'pass',
    sites: {},
    proof: [
      [KSNAP, "if (ks.keys.exit.length) rows.push([lab('exit').join(' · '), '측정 지우기 — 지울 것이 없으면 커서 끄기']);"],
      [KSNAP, "const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'data-i18n-skip': '' });"],
    ],
  },
  {
    id: 'V2',
    at: '코어 마우스 미리 보기 Tab 돌리기(tabCycleKey) — 앱 snap.ts measureSnapOptions',
    keys: '두 점 측정·커서 꺼짐·마우스 자리 후보 둘 이상일 때 Tab·Shift+Tab',
    what: '그 자리 후보 돌리기(후보 하나·없으면 받지 않음)',
    exit: 'Esc로 풀면 Tab은 브라우저 이동, 마우스를 옮겨도 풂 — 도움말 안내 줄에 Esc(푼 뒤 Tab이 나간다는 말은 없음 — 보고만)',
    verdict: 'pass',
    sites: {},
    proof: [
      [SNAP, 'tabCycle: true,'],
      [KSNAP, 'Tab · Shift+Tab으로 후보를 돌리고, 누르면 보이는 후보를 찍습니다(Esc는 돌리기를 풀고 첫 후보로)'],
    ],
  },
  {
    id: 'V4',
    at: 'app.ts:3046(창 캡처)',
    keys: 'Shift+Tab(T2)·숫자·Enter(분해 거리)·화살표(방향 잠금)·X·Y·Z·L',
    what: '측정·분해 키 — Tab·Esc는 받지 않음',
    exit: '—(Tab 그대로)',
    verdict: 'pass',
    sites: {},
    proof: [
      [APP, /if \(this\.tangentShift\(ev\) \|\| ev\.ctrlKey \|\| ev\.metaKey \|\| ev\.altKey \|\| ev\.key === 'Shift'\) return;\s*if \(\s*this\.tweakTool\?\.key\(ev\.key, ev\.target\) \|\|/],
      [ETOOL, 'if (!TYPE_START.test(key)) return false;'],
      [ETOOL, "return key === 'Enter' && !usesEnter(target) && this.enterDistance();"],
      [KSNAP, 'const k = e.target === v.canvas && on && !e.defaultPrevented && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) ? lockKeyOf(e) : null;'],
    ],
  },
  {
    id: 'V5',
    at: 'app.ts:3040(창 버블 onKey)',
    keys: '수식 없는 Tab(문서 있음)',
    what: "routeKey → 'viewer' → 코어 handleKey — 코어는 캔버스 밖 Tab을 받지 않고 Tab은 걷기·보기 키가 아님, 모달이면 routeKey null",
    exit: '—(Tab 그대로)',
    verdict: 'pass',
    sites: {},
    proof: [
      [KEYS, "return 'viewer';"],
      [APP, /case 'viewer':\s*(?:\/\/[^\n]*\s*)*v\?\.handleKey\(ev\);/],
    ],
  },
  // 키 사건 자리(K10 = T1 메뉴)
  {
    id: 'K1',
    at: 'app.ts:3040',
    keys: 'routeKey 표(V5)',
    what: '창 keydown(버블) → onKey — 막힌 사건은 보지 않음',
    exit: '—',
    verdict: 'pass',
    sites: { key: { [APP]: 1 } },
    proof: [
      [APP, "window.addEventListener('keydown', (ev) => this.onKey(ev));"],
      [APP, /private onKey\(ev: KeyboardEvent\): void \{\s*if \(ev\.defaultPrevented\) return;\s*const action = routeKey\(/],
    ],
  },
  {
    id: 'K2',
    at: 'app.ts:3046',
    keys: 'V4',
    what: '창 keydown(캡처) — 대화 상자가 열린 동안은 아무것도 받지 않음',
    exit: '—',
    verdict: 'pass',
    sites: { key: { [APP]: 1 } },
    proof: [[APP, /window\.addEventListener\(\s*'keydown',\s*\(ev\) => \{\s*if \(dialogOpen\(\)\) return;/]],
  },
  {
    id: 'K3',
    at: 'app.ts:3064',
    keys: 'Shift 뗌(keyup)',
    what: '접선 잠금 풀기 — keyup',
    exit: '—',
    verdict: 'out',
    sites: { key: { [APP]: 1 } },
    proof: [[APP, /window\.addEventListener\('keyup', \(ev\) => \{\s*if \(ev\.key !== 'Shift'\) return;/]],
  },
  {
    id: 'K4',
    at: 'dom.ts:97',
    keys: '아무 키',
    what: '알림을 키로 다뤘다는 표시(pressed = false)만',
    exit: '—',
    verdict: 'out',
    sites: { key: { [DOM]: 1 } },
    proof: [[DOM, "t.addEventListener('keydown', () => (pressed = false));"]],
  },
  {
    id: 'K5',
    at: 'explodebar.ts:284',
    keys: 'Enter·Esc(분해 거리 칸)',
    what: 'Enter 걸기, Esc는 칸만(쳐 넣던 것 버리고 blur — keynav rescue가 3D 보기로)',
    exit: 'Tab 그대로, Esc',
    verdict: 'pass',
    sites: { key: { [EBAR]: 1 } },
    proof: [
      [EBAR, /this\.distInput\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.key === 'Enter'\) \{/],
      [EBAR, /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*this\.distInput\.value = this\.distShown;\s*this\.distInput\.blur\(\);/],
    ],
  },
  {
    id: 'K6',
    at: 'explodetool.ts:742·745·746·749·750',
    keys: 'Alt(끄는 동안)',
    what: '메뉴 막대가 뜨지 않게 Alt만 막고 다시 봄',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [ETOOL]: 5 } },
    proof: [
      [ETOOL, "if (ev.key !== 'Alt' || !this.g) return;"],
      [ETOOL, "this.altTo(ev.type === 'keydown');"],
      [ETOOL, /window\.removeEventListener\('keydown', key, true\);\s*window\.removeEventListener\('keyup', key, true\);/],
    ],
  },
  {
    id: 'K7',
    at: 'keynav.ts:158·166',
    keys: '탭 ←·→·Home·End, 라디오 화살표, 도구 막대 ←·→·메뉴 단추 ↓',
    what: 'roving — 묶음마다 Tab 멈춤 하나, Shift·수식 붙으면 넘기고 Tab은 차례가 없어(moveIndex −1) 막지 않음',
    exit: 'Tab·Shift+Tab(묶음 밖)',
    verdict: 'pass',
    sites: { key: { [KEYNAV]: 2 } },
    proof: [
      [KEYNAV, 'if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;'],
      [KEYNAV, /const j = moveIndex\(g\.kind, e\.key, g\.items\.indexOf\(t\), g\.items\.length\);\s*if \(j < 0\) return;\s*e\.preventDefault\(\);/],
      [KEYNAV, "root.addEventListener('keydown', onKey);"],
    ],
  },
  {
    id: 'K8',
    at: 'keynav.ts:161·169',
    keys: '모든 키(캡처)',
    what: '띠·막대·패널 안 키 뒤 초점이 body로 떨어졌을 때만 돌려줌 — Tab이 다른 칸으로 옮긴 초점은 그대로',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [KEYNAV]: 2 } },
    proof: [
      [KEYNAV, 'if (now && now !== document.body && (now !== a || usable(a))) return;'],
      [KEYNAV, "root.addEventListener('keydown', rescue, true);"],
    ],
  },
  {
    id: 'K9',
    at: 'keysnap.ts:287',
    keys: '커서가 켜진 동안 Shift+F10·ContextMenu',
    what: '커서 자리 작업 메뉴(그 메뉴는 T1로 나옴)',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [KSNAP]: 1 } },
    proof: [[KSNAP, /v\.canvas\.addEventListener\('keydown', \(e\) => \{\s*const c = v\.keyboardCursor;\s*if \(!c \|\| !host\.menuAt \|\| !\(\(e\.key === 'F10' && e\.shiftKey\) \|\| e\.key === 'ContextMenu'\)/]],
  },
  {
    id: 'K11',
    at: 'panel.ts:384',
    keys: '값이 있을 때 Esc(나무 거르기 칸)',
    what: '거르기 지우기',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [PANEL]: 1 } },
    proof: [[PANEL, "if (ev.key === 'Escape' && input.value) {"]],
  },
  {
    id: 'K12',
    at: 'resize.ts:60',
    keys: '←·→(좁으면 ↑·↓)·Home(패널 크기 손잡이)',
    what: '크기 바꾸기·처음 크기',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [RESIZE]: 1 } },
    proof: [[RESIZE, "if (e.key !== grow && e.key !== shrink && e.key !== 'Home') return;"]],
  },
  {
    id: 'K13',
    at: 'sectionbar.ts:54',
    keys: 'Enter·Esc(단면 위치 칸)',
    what: 'Enter 걸기, Esc는 칸 것(전파만 멈춤)',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [SECT]: 1 } },
    proof: [[SECT, "if (e.key === 'Escape') e.stopPropagation();"]],
  },
  {
    id: 'K14',
    at: 'treeview.ts:364',
    keys: 'Ctrl·⌘+F(창)',
    what: '나무 거르기 칸으로(칸에서 한 번 더면 브라우저 찾기)',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [TREE]: 1 } },
    proof: [
      [TREE, "window.addEventListener('keydown', (ev) => void findToFilter(ev));"],
      [TREE, "|| !(ev.ctrlKey || ev.metaKey) || (ev.key !== 'f' && ev.key !== 'F')) return false;"],
    ],
  },
  {
    id: 'K15',
    at: 'treeview.ts:368',
    keys: '↓(거르기 칸)',
    what: '첫 나무 줄로',
    exit: 'Tab 그대로',
    verdict: 'pass',
    sites: { key: { [TREE]: 1 } },
    proof: [[TREE, /o\.filter\.addEventListener\('keydown', \(ev\) => \{\s*if \(ev\.key !== 'ArrowDown'\) return;/]],
  },
  {
    id: 'K16',
    at: 'treeview.ts:496',
    keys: 'Enter·Space·←·→·↑·↓·Home·End(나무 줄 — roving tabindex)',
    what: '고르기·맞춰 보기·펼침·옮김 — 그 밖의 키는 넘김. 나무의 Tab 멈춤은 고른 줄과 그 줄 눈 단추 둘(펼침 단추 −1)',
    exit: 'Tab·Shift+Tab(나무 밖)',
    verdict: 'pass',
    sites: { key: { [TREE]: 1 } },
    proof: [
      [TREE, /else if \(k === 'Home' \|\| k === 'End'\) focusAt\(k === 'Home' \? 0 : rows\.length - 1\);\s*else return;\s*ev\.preventDefault\(\);/],
      [TREE, "const tab = i === active ? '0' : '-1';"],
      [TREE, "tabindex: '-1', 'aria-hidden': 'true', disabled: !r.hasChildren"],
    ],
  },
];

/** 초점 잃음 처리 본문(파일·시작 글·끝 글) — 그 안에 .focus( 가 없다(초점을 도로 가져오지 않음) */
const NO_FOCUS: [file: string, from: string, to: string][] = [
  [APP, 'private refreshLock(): void {', 'private dropLockFail(): void {'],
  [APP, "window.addEventListener('blur', () => {", '// 끌어다 놓기'],
  [DOM, "on('focusout'", 'timer = setTimeout(close, ms);'],
  [EBAR, "this.distInput.addEventListener('blur', () => {", 'const field: DistField = {'],
  [ETOOL, 'const blur = (): void => this.altTo(false);', 'private altTo(down: boolean): void {'],
];

const sitesOf = (f: Fam): Record<string, number> => {
  const want: Record<string, number> = {};
  for (const r of ROWS) for (const [k, n] of Object.entries(r.sites[f] ?? {})) want[k] = (want[k] ?? 0) + n;
  return want;
};

describe('246차: 키보드 함정 감사 표(WCAG 2.1.2)', () => {
  it('src의 넷 갈래(Tab 3·초점 잃음 5·모달·inert 3·키 사건 23) 자리가 파일마다 표 줄의 자리 수와 같다(새 자리면 표에 넣어야 통과) — 나올 수 없는 칸 0', () => {
    for (const f of FAMS) {
      const got: Record<string, number> = {};
      for (const [file, t] of SRC) {
        const n = COUNT[f](codeOf(t));
        if (n) got[file] = n;
      }
      expect([f, got]).toEqual([f, sitesOf(f)]);
    }
    expect(FAMS.map((f) => Object.values(sitesOf(f)).reduce((a, b) => a + b, 0))).toEqual([3, 5, 3, 23]);
    expect([ROWS.length, Object.keys(sitesOf('key')).length]).toEqual([29, 11]);
    const by = (v: Verdict): string[] => ROWS.filter((r) => r.verdict === v).map((r) => r.id);
    expect(by('out')).toEqual(['T3', 'K3', 'K4']);
    expect(by('pass')).toHaveLength(26);
    expect(new Set(ROWS.map((r) => r.id)).size).toBe(ROWS.length);
  });

  it('셈이 비지 않는다(대조): 새 줄·다른 따옴표·속성 꼴·이름 묶음은 세고, 줄머리 주석·inertia·떼기·다른 사건은 세지 않는다', () => {
    const c = (f: Fam, s: string): number => COUNT[f](codeOf(s));
    expect(c('tab', "if (e.key === 'Tab') go();\nswitch (k) { case \"Tab\": break; }")).toBe(2);
    expect(c('tab', "// 'Tab'으로 나간다\nif (e.key === 'Shift+Tab' || e.code === 'KeyT') go();")).toBe(0);
    expect(c('lose', "el.addEventListener('blur', f); on(\"focusout\", g); el.onblur = h;\nfor (const t of ['focus', 'blur']) el.addEventListener(t, f);")).toBe(4);
    expect(c('lose', "/** 'blur' */\nel.addEventListener('focus', f);\nel.removeEventListener('blur', f);\nel.blur();")).toBe(0);
    expect(c('modal', "el.inert = true; d.showModal(); h('div', { 'aria-modal': 'true' });")).toBe(3);
    expect(c('modal', '// inert\nconst inertia = inertiaText(1);')).toBe(0);
    expect(c('key', "el.addEventListener('keydown', f); el.onkeyup = g; x.addEventListener(\"keypress\", h);")).toBe(3);
    expect(c('key', "// 'keydown'\nel.addEventListener('pointerdown', f);")).toBe(0);
    // app.ts에 Tab 처리 하나를 더하면 표 셈이 어긋난다
    expect(c('tab', `${textOf(APP)}\nif (ev.key === 'Tab') ev.preventDefault();`)).toBe(c('tab', textOf(APP)) + 1);
  });

  it('줄마다 근거 원문, 초점 잃음 처리 본문에 초점 옮기기 없음 — hover239 사건 셈·focusobscured240 inert 근거와 같고, physics·propsview의 inert 꼴 낱말은 모두 inertia', () => {
    for (const r of ROWS) {
      expect(r.proof.length, r.id).toBeGreaterThan(0);
      for (const [file, p] of r.proof) {
        const t = textOf(file);
        expect(typeof p === 'string' ? t.includes(p) : p.test(t), `${r.id} ${file} ${p}`).toBe(true);
      }
    }
    for (const [file, from, to] of NO_FOCUS) {
      const t = textOf(file);
      const i = t.indexOf(from);
      const j = i < 0 ? -1 : t.indexOf(to, i);
      expect([file, from, i >= 0 && j > i]).toEqual([file, from, true]);
      expect(t.slice(i, j), `${file} ${from}`).not.toMatch(/\.focus\(/);
    }
    // M1: 문서는 한 번 들면 비지 않는다(시작 화면 뒤 inert가 다시 걸리지 않음)
    expect([...codeOf(textOf(APP)).matchAll(/this\.doc = /g)]).toHaveLength(1);
    // 239차 hover239 SITES의 blur·focusout 수 = 이 표의 초점 잃음 자리
    const hover: Record<string, number> = {};
    for (const m of read('tests/app/hover239.test.ts').matchAll(/'(src\/app\/[\w.]+)': \{ events: \[([^\]]*)\]/g)) {
      const n = [...m[2]!.matchAll(/'(?:blur|focusout)'/g)].length;
      if (n) hover[m[1]!] = n;
    }
    expect(hover).toEqual(sitesOf('lose'));
    // 240차 focusobscured240이 같은 inert 줄을 근거로 쓴다
    expect(read('tests/app/focusobscured240.test.ts')).toContain('this\\.hostEl\\.inert = !d;');
    // 리드 grep(inert)에 걸리는 physics.ts 5줄·propsview.ts 4줄은 모두 관성(inertia) 낱말 — inert 칸이 아니다
    for (const f of [PHYS, PROPS]) {
      const words = [...textOf(f).matchAll(/\w*inert\w*/g)].map((m) => m[0]);
      expect([f, words.length > 0, words.every((w) => w.startsWith('inertia'))]).toEqual([f, true, true]);
    }
  });
});

// ───────────────────────── 실제 키 사건 ─────────────────────────

const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(e);
  return e;
};
const added: Element[] = [];
function button(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  document.body.append(b);
  added.push(b);
  return b;
}
let restore: (() => void) | null = null;
afterEach(() => {
  closeMenu();
  closeDialog();
  restore?.();
  restore = null;
  for (const el of added.splice(0)) el.remove();
});

describe('246차: 실제 키 사건 — 나오는 길', () => {
  it('메뉴(T1): 항목의 Tab·Shift+Tab은 막지 않고(브라우저가 연 자리의 다음·앞 칸으로) 메뉴를 닫아 초점을 연 단추로, Esc는 막고 닫아 연 단추로', () => {
    const items: MenuItem[] = [
      { label: '하나', run: () => {} },
      { label: '둘', run: () => {} },
    ];
    for (const shiftKey of [false, true]) {
      const anchor = button();
      openMenu(anchor, items, '시험 메뉴');
      const item = document.activeElement as HTMLElement;
      expect(item.getAttribute('role')).toBe('menuitem');
      const e = key(item, 'Tab', { shiftKey });
      expect([e.defaultPrevented, menuOpen(), document.activeElement === anchor, anchor.getAttribute('aria-expanded')]).toEqual([false, false, true, 'false']);
    }
    const anchor = button();
    openMenu(anchor, items, '시험 메뉴');
    const e = key(document.activeElement!, 'Escape');
    expect([e.defaultPrevented, menuOpen(), document.activeElement === anchor]).toEqual([true, false, true]);
  });

  it('도구 막대·탭·라디오 묶음(K7·K8 — roving): Tab·Shift+Tab은 막지 않고 초점도 그대로(브라우저가 묶음 밖으로), 화살표만 묶음 안에서 옮기며, rescue는 Tab이 옮긴 초점을 되가져오지 않는다', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.innerHTML =
      '<div role="toolbar"><button type="button">가</button><button type="button">나</button></div>' +
      '<div role="tablist"><button type="button" role="tab" aria-selected="true">탭 1</button><button type="button" role="tab" aria-selected="false">탭 2</button></div>' +
      '<div role="radiogroup"><button type="button" role="radio" aria-checked="true">점</button><button type="button" role="radio" aria-checked="false">개체</button></div>' +
      '<button type="button" class="after">뒤 칸</button>';
    document.body.append(root);
    const off = installKeyNav(root);
    try {
      const after = root.querySelector<HTMLButtonElement>('.after')!;
      for (const sel of ['[role=toolbar] button', '[role=tab]', '[role=radio]']) {
        const first = root.querySelector<HTMLElement>(sel)!;
        first.focus();
        for (const shiftKey of [false, true]) {
          const e = key(first, 'Tab', { shiftKey });
          expect([sel, shiftKey, e.defaultPrevented, document.activeElement === first]).toEqual([sel, shiftKey, false, true]);
        }
        // 브라우저가 Tab으로 묶음 밖 칸에 초점을 옮긴 꼴 — rescue(다음 차례)는 되가져오지 않는다
        key(first, 'Tab');
        after.focus();
        vi.runOnlyPendingTimers();
        expect([sel, document.activeElement === after]).toEqual([sel, true]);
        // 대조: 화살표는 묶음 안에서 옮기고 막는다
        first.focus();
        const a = key(first, 'ArrowRight');
        expect([sel, a.defaultPrevented, document.activeElement !== first]).toEqual([sel, true, true]);
        vi.runOnlyPendingTimers();
      }
    } finally {
      vi.useRealTimers();
      off();
      root.remove();
    }
  });

  it('대화 상자(M2): 모달 동안 앱 키는 Tab·Shift+Tab을 받지 않고(브라우저 몫) Esc만 닫기로 — 닫기 단추·cancel(브라우저 Esc)로 닫으면 연 단추로 초점', () => {
    expect(routeKey({ key: 'Tab', hasDoc: true, modal: true })).toBeNull();
    expect(routeKey({ key: 'Tab', shift: true, hasDoc: true, modal: true })).toBeNull();
    expect(routeKey({ key: 'Escape', hasDoc: true, modal: true })).toBe('escape');
    const opener = button();
    for (const how of ['cancel', 'close'] as const) {
      opener.focus();
      const d = openDialog('시험 상자', [document.createElement('p')]);
      const close = d.el.querySelector<HTMLButtonElement>('.dlg-close')!;
      close.focus();
      expect([how, key(close, 'Tab').defaultPrevented, dialogOpen()]).toEqual([how, false, true]);
      if (how === 'cancel') d.el.dispatchEvent(new Event('cancel', { cancelable: true }));
      else close.click();
      expect([how, dialogOpen(), d.el.isConnected, document.activeElement === opener]).toEqual([how, false, false, true]);
    }
  });

  it('알림(B3·K4 — dom.ts pushToast): 알림 안 단추에서 Tab은 막지 않고, 초점이 밖으로 가도 되가져오지 않으며 시간이 다 되어 빠질 때도 밖 초점은 그대로', () => {
    vi.useFakeTimers();
    try {
      const box = document.createElement('div');
      const t = document.createElement('div');
      const close = document.createElement('button');
      t.append(close);
      document.body.append(box);
      added.push(box);
      const outside = button();
      const home = button();
      pushToast(box, t, 3, 5000, () => home);
      close.focus();
      expect(key(close, 'Tab').defaultPrevented).toBe(false);
      outside.focus();
      expect(document.activeElement).toBe(outside);
      vi.advanceTimersByTime(5000);
      expect([box.contains(t), document.activeElement === outside]).toEqual([false, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('3D 보기 가상 커서(V1 — 실제 코어, 앱처럼 측정 붙잡기): 켜진 동안 Tab·Shift+Tab은 같은 자리 후보 돌리기로 받고, Esc로 커서를 끄면(측정 점이 있으면 첫 Esc가 지우고 다음 Esc) 막지 않는다 — 켤 때 알림·도움말이 끄는 키를 말한다', () => {
    const w = new StepText();
    w.product('c', [cube(w, 10).solid], w.context());
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    const sc = stepToScene(w.bytes());
    v.setScene(sc);
    v.setView('front', false);
    v.fit(false);
    v.renderNow();
    const ex = stepEdgeIndex(sc);
    v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true));
    const ks = installKeySnap(v, { tr: (s) => s, pickThrough: () => false });
    const tab = (shiftKey = false): boolean => key(v.canvas, 'Tab', { shiftKey }).defaultPrevented;
    // 고르기 모드: 커서가 꺼져 있으면 Tab은 브라우저 것, 켜진 동안은 겹친 고르기 후보 돌리기
    expect([tab(), tab(true)]).toEqual([false, false]);
    key(v.canvas, 'ArrowUp');
    expect(v.keyboardCursor).not.toBeNull();
    expect(ks.live.textContent).toContain('끄기 Esc');
    expect([tab(), tab(true)]).toEqual([true, true]);
    key(v.canvas, 'Escape');
    expect(v.keyboardCursor).toBeNull();
    expect([tab(), tab(true)]).toEqual([false, false]);
    // 두 점 측정: 첫 점을 찍은 뒤 첫 Esc는 측정을 지우고(커서 그대로) 다음 Esc가 커서를 끈다
    v.setMeasureMode(true);
    key(v.canvas, 'ArrowUp');
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(1);
    expect([tab(), tab(true)]).toEqual([true, true]);
    key(v.canvas, 'Escape');
    expect([v.measurePointCount, !!v.keyboardCursor, tab()]).toEqual([0, true, true]);
    key(v.canvas, 'Escape');
    expect(v.keyboardCursor).toBeNull();
    expect([tab(), tab(true)]).toEqual([false, false]);
    // 도움말 키 표의 Esc 줄·마우스 Tab 돌리기 안내 줄(V2)
    expect(keyHelpRows(v.keyboardSnap!).find(([, what]) => what === '측정 지우기 — 지울 것이 없으면 커서 끄기')?.[0]).toContain('Esc');
    expect(keyHelpBody(v).map((e) => e.textContent).join(' ')).toContain('(Esc는 돌리기를 풀고 첫 후보로)');
  });
});
