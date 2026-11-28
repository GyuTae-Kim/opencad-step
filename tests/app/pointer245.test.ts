// @vitest-environment jsdom
/**
 * 245차(WCAG 2.5.2 Pointer Cancellation — 재발 막기): 한 포인터로 하는 기능이 누르는 순간(pointerdown·mousedown·touchstart)에 끝나면 안 된다 —
 * ① 누르는 순간에는 끝내지 않음(결과는 click·pointerup에서), ② 떼기 전에 밖으로 빼면 취소, ③ 끝난 뒤 되돌릴 수 있음(다시 누름·되돌리기), ④ 꼭 누르는 순간이어야 함
 * (끌기 시작·누른 채 하는 몸짓) 가운데 하나면 통과(리드가 적어 둔 기준). 듣기 자리가 아니거나 누름을 기록만 하는 자리·키보드·코어(node_modules) 안 사건은 셈 밖.
 * 바깥 누름으로 메뉴를 닫는 것은 다시 열면 되니 ③ — 닫으며 값을 버리거나 일을 실행·취소하면 셈 안.
 * - 감사 표(ROWS — README 개발 절 245차 문단): src 전체 .ts에서 누름 사건 꼴(따옴표 든 'pointerdown'·'mousedown'·'touchstart', 속성 꼴 onpointerdown 등)을
 *   파일마다 세어 표 14줄의 자리 수와 같다 — 새 자리면 표에 하는 일·판정·근거를 적어야 통과(없어진 자리도 실패). 줄마다 근거 원문(누름 줄·결과가 나는 짝 처리·되돌리기 코드).
 * - 245차 결과: 누르는 순간 끝나고 되돌리기도 없는 자리 0(고친 것 0). 누르는 순간 결과가 생기는 자리는 둘 — 측정 띠 방향 잠금 단추(손가락·펜 — 다시 누르면 반대 ③,
 *   정밀 조준 중 둘째 손가락은 click이 오지 않아 누름에서 받음 ④)·바깥 누름 메뉴 닫기(③ — 닫으며 버리는 값 0: onClose는 겹친 것 목록 미리 강조 되돌리기 하나).
 * - 실제 메뉴(menu.ts — jsdom): 바깥 pointerdown은 닫기만(명령 0), 항목 명령은 click에서만.
 * src를 소스 글로 읽는다(ci-guard 12번 — 누름 사건 줄·짝 처리 줄을 바꾸면 이 시험도). 236차 targetsize234 DRAGS가 나무 줄 누름 줄을 함께 근거로 쓴다(그 시험 글도 읽어 견줌).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeMenu, menuOpen, openMenu, openMenuAt, type MenuItem } from '../../src/app/menu';

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
/** 줄머리 주석(/** … *\/·//)을 뺀 코드(244차 status244와 같은 꼴) */
const codeOf = (t: string): string => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');

/** 누름 사건 꼴: 따옴표 든 사건 이름(addEventListener·보내는 사건·사건 꼴 글)과 속성 꼴(onpointerdown 등 — h()·.on… = ) */
const PRESS = /['"`](?:pointerdown|mousedown|touchstart)['"`]|\bon(?:pointerdown|mousedown|touchstart)\b/g;
const countPress = (t: string): number => [...codeOf(t).matchAll(PRESS)].length;

const AIM = 'src/app/aim.ts';
const APP = 'src/app/app.ts';
const DOM = 'src/app/dom.ts';
const MENU = 'src/app/menu.ts';
const CTX = 'src/app/ctxmenu.ts';
const RESIZE = 'src/app/resize.ts';
const SECT = 'src/app/sectionbar.ts';
const TAN = 'src/app/tangent.ts';
const TREE = 'src/app/treeview.ts';

// ───────────────────────── 감사 표 ─────────────────────────

/** click ① 누름에는 결과 없음(짝 처리에서) · reverse ② 밖으로 빼면 취소 · undo ③ 되돌릴 수 있음 · essential ④ 꼭 누르는 순간 · out 셈 밖 */
type Verdict = 'click' | 'reverse' | 'undo' | 'essential' | 'out';
interface Row {
  id: string;
  /** 자리(파일:줄 — 245차 main) */
  at: string;
  what: string;
  verdict: Verdict;
  /** 누름 사건 꼴 자리 수(파일 → 수) */
  sites: Record<string, number>;
  /** 근거 원문(파일·정규식 — 누름 줄과 결과가 나는 짝 처리·되돌리기) */
  proof: [file: string, re: RegExp][];
}
const ROWS: Row[] = [
  {
    id: 'P1',
    at: 'aim.ts:96',
    what: '코어에 보낼 합성 사건 꼴 만들기(buttons 값) — 듣기 아님',
    verdict: 'out',
    sites: { [AIM]: 1 },
    proof: [[AIM, /const down = type === 'pointerdown' \|\| type === 'pointermove';/]],
  },
  {
    id: 'P2',
    at: 'aim.ts:138',
    what: '정밀 조준(캔버스 부모 캡처): 손가락 기록·시계 시작만 — 조준(350 ms)·작업 메뉴(500 ms)는 누른 채, 점 찍기는 뗄 때(P3), 움직이면 시계 거둠',
    verdict: 'click',
    sites: { [AIM]: 1 },
    proof: [
      [AIM, /this\.listen\('pointerdown', \(e\) => this\.onDown\(e\)\);/],
      [AIM, /this\.listen\('pointerup', \(e\) => this\.onUp\(e, false\)\);\n {4}this\.listen\('pointercancel', \(e\) => this\.onUp\(e, true\)\);/],
      [AIM, /this\.timer = setTimeout\(\(\) => this\.start\(id\), AIM_HOLD_MS\);/],
      [AIM, /this\.timer = setTimeout\(\(\) => this\.hold\(id\), HOLD_MENU_MS\);/],
      [AIM, /p\.moved = true;\n {6}this\.stopTimer\(\);/],
    ],
  },
  {
    id: 'P3',
    at: 'aim.ts:226',
    what: '진짜 손가락 pointerup 안에서 십자선 자리 누르기를 코어에 보냄 — 측정 점·고르기는 뗄 때, 취소(pointercancel)면 보내지 않음',
    verdict: 'click',
    sites: { [AIM]: 1 },
    proof: [
      [AIM, /private onUp\(e: PointerEvent, cancel: boolean\): void \{/],
      [AIM, /if \(cancel\) return;\n {4}e\.stopPropagation\(\);\n {4}if \(aimed && this\.opts\.enabled\(\)\) \{[\s\S]{0,120}this\.relay\('pointerdown', id, at, AIM_POINTER_TYPE\);\n {6}this\.relay\('pointerup', id, at, AIM_POINTER_TYPE\);/],
    ],
  },
  {
    id: 'P4',
    at: 'aim.ts:301',
    what: '둘째 손가락이 닿으면 코어가 잊은 첫 손가락을 다시 눌린 것으로 — 두 손가락 확대·이동(누른 채 하는 몸짓)',
    verdict: 'essential',
    sites: { [AIM]: 1 },
    proof: [
      [AIM, /if \(this\.presses\.size\) \{\n {6}this\.stopTimer\(\);\n {6}this\.rejoin\(\);/],
      [AIM, /if \(p\) this\.relay\('pointerdown', id, p\);/],
    ],
  },
  {
    id: 'P5',
    at: 'app.ts:475',
    what: '측정 띠 방향 잠금 단추(손가락·펜): 누르는 순간 잠금 걸기·풀기 — 다시 누르면 반대(③), 정밀 조준 중 둘째 손가락은 click이 오지 않음(④), 같은 누름 click은 1초 안 거름',
    verdict: 'undo',
    sites: { [APP]: 1 },
    proof: [
      [APP, /this\.measureLock\.addEventListener\('pointerdown', \(e\) => \{\n {6}if \(e\.pointerType === 'mouse'\) return;\n {6}e\.preventDefault\(\);\n {6}lockPressedAt = performance\.now\(\);\n {6}this\.toggleMeasureLock\(\);/],
      [APP, /정밀 조준 중 다른 손가락으로 누르면 둘째 손가락이라 click이 오지 않으므로 손가락·펜은 누르는 순간에 받는다/],
      [APP, /this\.measureLock\.addEventListener\('click', \(\) => \{\n {6}if \(performance\.now\(\) - lockPressedAt < 1000\) return;\n {6}this\.toggleMeasureLock\(\);/],
      [APP, /if \(v\.measureInferenceLock\) this\.unlockMeasure\(v\);\n {4}else if \(!this\.lockNow\(v\)\) this\.lockFailed\(\);/],
      [APP, /title: '지금 방향 잠그기\(다시 누르면 풀기\)'/],
      // 단추는 점 1개이거나 잠겼을 때 보인다 — 잠금은 첫 점 뒤에만 서서(두 점째·지우기에 풀림) 누름에서 단추가 숨지 않는다(밑 칸 click 꼴 없음)
      [APP, /this\.measureLock\.hidden = !\(v\.measurePointCount === 1 \|\| locked\);/],
    ],
  },
  {
    id: 'P6',
    at: 'app.ts:1102',
    what: '3D 보기 겉: 누른 시각·오른쪽 누름 자리 기록만 — 작업 메뉴는 contextmenu(5화소 넘게 끌면 열지 않음), 첫 측정 점 띠 맞춤은 pointerup',
    verdict: 'click',
    sites: { [APP]: 1 },
    proof: [
      [APP, /this\.hostEl\.addEventListener\('pointerdown', \(e\) => \{\n {6}downAt = e\.timeStamp;\n {6}if \(e\.button === 2\) rightDown = \{ x: e\.clientX, y: e\.clientY \};\n {4}\}\);/],
      [APP, /if \(!d \|\| Math\.hypot\(e\.clientX - d\.x, e\.clientY - d\.y\) > 5\) return;\n {6}this\.contextMenuAt\(e\.clientX, e\.clientY\);/],
      [APP, /this\.hostEl\.addEventListener\('pointerup', \(\) => v\.measureMode && this\.refreshBar\(\)\);/],
    ],
  },
  {
    id: 'P7',
    at: 'dom.ts:96',
    what: '알림을 포인터로 눌렀다는 표시만(닫을 때 초점을 글 칸 대신 home으로 — 166차)',
    verdict: 'out',
    sites: { [DOM]: 1 },
    proof: [
      [DOM, /t\.addEventListener\('pointerdown', \(\) => \(pressed = true\)\);\n {2}t\.addEventListener\('keydown', \(\) => \(pressed = false\)\);/],
      [DOM, /const close = \(\): void => drop\(t, pressed\);/],
    ],
  },
  {
    id: 'P8',
    at: 'menu.ts:190',
    what: '메뉴를 닫을 때 바깥 누름 듣기 떼기',
    verdict: 'out',
    sites: { [MENU]: 1 },
    proof: [[MENU, /const close = \(\) => \{\n {4}sized\?\.disconnect\(\);\n {4}document\.removeEventListener\('pointerdown', onDown, true\);/]],
  },
  {
    id: 'P9',
    at: 'menu.ts:198',
    what: '바깥 누름(문서 캡처)에 메뉴 닫기 — 다시 열면 됨(③), 닫으며 버리는 값 0(onClose는 겹친 것 목록 미리 강조 되돌리기 하나), 항목 명령은 click',
    verdict: 'undo',
    sites: { [MENU]: 1 },
    proof: [
      [MENU, /document\.addEventListener\('pointerdown', onDown, true\);/],
      [MENU, /if \(!el\.contains\(t\) && !anchor\.contains\(t\) && !\(e\.type === 'focusin' && t === current\?\.spot\)\) closeMenu\(\);/],
      [MENU, /b\.addEventListener\('click', \(\) => \{/],
      [CTX, /'겹친 것 고르기', pv && \(\(\) => shown && pv\(null\)\)\);/],
      [CTX, /목록이 닫힐 때 지금 고른 것의 강조로 되돌린다\(줄을 고르면 그 고르기보다 먼저 — 고른 것·패널·상태 줄은 처음부터 그대로\)/],
    ],
  },
  {
    id: 'P10',
    at: 'resize.ts:55',
    what: '패널 크기 손잡이: 끌기 시작(포인터 잡기·active)·기다리던 한 번 누르기 거둠 — 크기는 끌며 바뀌고 뗄 때 저장, 끌지 않은 누르기는 뗀 뒤',
    verdict: 'essential',
    sites: { [RESIZE]: 1 },
    proof: [
      [RESIZE, /this\.el\.addEventListener\('pointerdown', \(e\) => this\.down\(e\)\);\n {4}this\.el\.addEventListener\('pointermove', \(e\) => this\.move\(e\)\);\n {4}this\.el\.addEventListener\('pointerup', \(e\) => this\.up\(e\)\);/],
      [RESIZE, /this\.apply\(d\.size \+ \(d\.start - pos\), false\);/],
      [RESIZE, /\}, TAP_WAIT_MS\);\n {6}return;\n {4}\}\n {4}this\.apply\(this\.size\(\), true\);/],
    ],
  },
  {
    id: 'P11',
    at: 'sectionbar.ts:77',
    what: '단면 손잡이: 끌기 시작(포인터 잡기·dragging 모양) — 평면 옮기기는 끄는 동안',
    verdict: 'essential',
    sites: { [SECT]: 1 },
    proof: [
      [SECT, /this\.handle\.addEventListener\('pointerdown', \(e\) => \{/],
      [SECT, /if \(dx \|\| dy\) host\.viewerRef\?\.moveSectionByPixels\(dx, dy\);/],
    ],
  },
  {
    id: 'P12',
    at: 'tangent.ts:636',
    what: '캔버스 누름에 같은 누름 Shift+Tab 되돌리기 기억 버림(접선 잠금은 그대로 — 코어 0.120.0 shiftUndo와 같은 차례)',
    verdict: 'out',
    sites: { [TAN]: 1 },
    proof: [
      [TAN, /const drop = \(\): void => void \(this\.undo = null\);/],
      [TAN, /canvas\.addEventListener\('pointerdown', drop\);/],
    ],
  },
  {
    id: 'P13',
    at: 'treeview.ts:247',
    what: '문서 누름(캡처)에 다른 손가락의 나무 길게 누르기 시계 거둠·heldUp 지움',
    verdict: 'out',
    sites: { [TREE]: 1 },
    proof: [[TREE, /'pointerdown',\n {6}\(e\) => \{\n {8}heldUp = -1;\n {8}if \(e\.pointerId !== hold\?\.id\) dropHold\(\);/]],
  },
  {
    id: 'P14',
    at: 'treeview.ts:494',
    what: '나무 줄: 손가락 하나면 길게 누르기 시계만 — 고르기·두 번 누르기 맞춰 보기는 click, 500 ms 뒤 작업 메뉴는 누른 채, 움직이면 거둠, 길게 누르기를 뗀 click은 거름',
    verdict: 'click',
    sites: { [TREE]: 1 },
    proof: [
      [TREE, /item\.addEventListener\('pointerdown', \(ev\) => holdStart\(ev, menu\)\);/],
      [TREE, /if \(ev\.detail === 2\) fit\(\);\n {6}else if \(ev\.detail <= 1\) select\(!isSel\(\)\);/],
      [TREE, /\}, HOLD_MENU_MS\);\n {2}hold = p;/],
      [TREE, /if \(hold\.open && !\(Math\.hypot\(hold\.x - hold\.x0, hold\.y - hold\.y0\) < AIM_SLOP_PX\)\) dropHold\(\);/],
      [TREE, /if \(!holdTaken\(e\)\) return;\n {8}e\.preventDefault\(\);\n {8}e\.stopPropagation\(\);/],
    ],
  },
];

describe('245차: 누름 사건 자리 감사 표(WCAG 2.5.2)', () => {
  it('src의 누름 사건 꼴 14자리가 파일마다 표 14줄의 자리 수와 같다(새 자리면 표에 넣어야 통과) — ① 4·② 0·③ 2·④ 3·셈 밖 5, 실패 0', () => {
    const got: Record<string, number> = {};
    for (const [f, t] of SRC) {
      const n = countPress(t);
      if (n) got[f] = n;
    }
    const want: Record<string, number> = {};
    for (const r of ROWS) for (const [k, n] of Object.entries(r.sites)) want[k] = (want[k] ?? 0) + n;
    expect(got).toEqual(want);
    const sum = ROWS.reduce((s, r) => s + Object.values(r.sites).reduce((a, b) => a + b, 0), 0);
    expect([ROWS.length, sum, Object.keys(want).length]).toEqual([14, 14, 8]);
    const by = (v: Verdict): string[] => ROWS.filter((r) => r.verdict === v).map((r) => r.id);
    expect([by('click'), by('reverse'), by('undo'), by('essential'), by('out')]).toEqual([['P2', 'P3', 'P6', 'P14'], [], ['P5', 'P9'], ['P4', 'P10', 'P11'], ['P1', 'P7', 'P8', 'P12', 'P13']]);
    // mousedown·touchstart는 없다(포인터 사건 하나로) — 새로 생기면 위 셈과 함께 걸린다
    expect(SRC.filter(([, t]) => /mousedown|touchstart/.test(codeOf(t))).map(([f]) => f)).toEqual([]);
  });

  it('셈이 비지 않는다(대조): 새 듣기 줄·다른 따옴표·속성 꼴은 세고, 줄머리 주석·다른 사건은 세지 않는다', () => {
    expect(countPress("el.addEventListener('pointerdown', f);")).toBe(1);
    expect(countPress('el.addEventListener("touchstart", f, { passive: true });')).toBe(1);
    expect(countPress("h('div', { onpointerdown: f }); el.onmousedown = g;")).toBe(2);
    expect(countPress("// 'pointerdown'에서 닫는다\n/** 'mousedown' */\nel.addEventListener('pointerup', f);\nel.addEventListener('click', f);")).toBe(0);
    // app.ts에 누름 듣기 하나를 더하면 표 셈이 어긋난다
    expect(countPress(`${textOf(APP)}\nx.addEventListener('pointerdown', () => go());`)).toBe(countPress(textOf(APP)) + 1);
  });

  it('줄마다 근거 원문(누름 줄·결과가 나는 짝 처리·되돌리기), 바깥 누름 닫기의 onClose는 겹친 것 목록 하나(화면 점 메뉴를 여는 자리 5)', () => {
    for (const r of ROWS) {
      expect(r.proof.length, r.id).toBeGreaterThan(0);
      for (const [file, re] of r.proof) expect(re.test(textOf(file)), `${r.id} ${file} ${re}`).toBe(true);
    }
    // 화면 점 메뉴(openMenuAt)를 여는 자리: 닫힐 때 부를 onClose를 주는 것은 겹친 것 목록 하나 — 새 자리면 닫으며 버리는 값이 없는지 보고 여기에
    const opens = SRC.flatMap(([f, t]) => [...codeOf(t).matchAll(/(?<!function )\bopenMenuAt\(/g)].map(() => f));
    expect(opens).toEqual([APP, CTX, CTX, CTX, CTX]);
    expect(textOf(APP)).toContain("openMenuAt(clientX, clientY, items, '작업 메뉴', undefined, owner)");
    // 236차 targetsize234 DRAGS(나무 줄 길게 누르기 메뉴)가 P14와 같은 누름 줄을 근거로 쓴다
    expect(read('tests/app/targetsize234.test.ts')).toContain("at: ['treeview.ts', /item\\.addEventListener\\('pointerdown', \\(ev\\) => holdStart\\(ev, menu\\)\\)/],");
  });
});

// ───────────────────────── 실제 메뉴 ─────────────────────────

const press = (el: Element): boolean => el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
const added: Element[] = [];
function button(): HTMLButtonElement {
  const b = document.createElement('button');
  document.body.append(b);
  added.push(b);
  return b;
}
afterEach(() => {
  closeMenu();
  for (const el of added.splice(0)) el.remove();
});

describe('245차: 실제 메뉴 — 바깥 누름은 닫기만, 명령은 click(P9)', () => {
  it('단추 아래 메뉴: 바깥 pointerdown에 닫히고(연 단추 펼침 false) 명령은 돌지 않으며, 다시 열면 같은 항목', () => {
    const ran: string[] = [];
    const items: MenuItem[] = [
      { label: '하나', run: () => ran.push('하나') },
      { label: '둘', run: () => ran.push('둘') },
    ];
    const anchor = button();
    const outside = button();
    openMenu(anchor, items, '시험 메뉴');
    expect([menuOpen(), anchor.getAttribute('aria-expanded')]).toEqual([true, 'true']);
    expect(press(outside)).toBe(true);
    expect([menuOpen(), anchor.getAttribute('aria-expanded'), ran]).toEqual([false, 'false', []]);
    openMenu(anchor, items, '시험 메뉴');
    expect([...document.querySelectorAll('.menu .menu-label')].map((e) => e.textContent)).toEqual(['하나', '둘']);
  });

  it('화면 점 메뉴: 바깥 pointerdown은 onClose 한 번·명령 0, 항목 pointerdown에는 그대로 열려 있고 명령은 그 항목 click에서 한 번', () => {
    const ran: string[] = [];
    let closed = 0;
    const items: MenuItem[] = [{ label: '맞춰 보기', run: () => ran.push('맞춰 보기') }];
    const outside = button();
    openMenuAt(10, 10, items, '작업 메뉴', () => closed++);
    press(outside);
    expect([menuOpen(), closed, ran]).toEqual([false, 1, []]);
    openMenuAt(10, 10, items, '작업 메뉴', () => closed++);
    const item = document.querySelector<HTMLButtonElement>('.menu .menu-item')!;
    press(item);
    expect([menuOpen(), closed, ran]).toEqual([true, 1, []]);
    item.click();
    expect([menuOpen(), closed, ran]).toEqual([false, 2, ['맞춰 보기']]);
  });
});
