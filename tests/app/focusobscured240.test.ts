// @vitest-environment jsdom
/**
 * 240차(WCAG 2.4.11 초점이 가려지지 않음(최소) — 재발 막기): 키보드 초점을 받은 칸은 앱이 만든 다른 내용(떠 있는 띠·알림·덮개 등)에 통째로 가려지지 않는다
 * (일부만 가려지면 최소 기준 통과, 사용자가 연 내용이 가리는 것은 초점을 옮기지 않고 닫을 수 있으면 예외 — 리드가 적어 둔 기준). 190차가 같은 감사를 한 번 했다(a11ymedia 190~192차 묶음).
 * - 떠 있는 칸 표(FLOATS — README 개발 절 240차 문단): 스타일시트에서 position fixed·absolute·sticky·z-index·scroll-padding·scroll-margin을 둔 규칙의 선택자, 앱 원문의 인라인 자리(menu.ts 닻),
 *   코어가 만드는 칸(viewer.ts 감싸개·그림판·뷰 큐브, theme.ts 캔버스)이 모두 표에 든다(표 밖에 새 떠 있는 칸이 생기면 실패, 낡은 줄도 실패). 칸마다 판정의 근거 원문.
 * - 고친 것: 알림 칸(z 7)이 휴대폰 위 띠 묶음의 줄·작은 휴대폰 단면 막대 줄·좁은 화면 시작 화면 최근 문서 줄을 통째로 덮었다 —
 *   키보드 초점이 든 단면 막대·위 띠 묶음은 알림 칸 위로(z 8 — 190차 측정 띠 꼴), 시작 화면(굴림 칸)은 알림이 덮는 높이(--toast-band — dom.ts pushToast가 넣고 뺄 때 잼)만큼
 *   scroll-padding-bottom을 두어 Tab이 간 줄을 알림 위로 굴린다(알림이 없으면 변수가 없어 0 — 보통 화면 그대로). 손셈은 고치기 전 통째 → 고친 뒤 보임.
 * jsdom은 배치를 하지 않아 상자 자리는 스타일시트 값 손셈과 가짜 자리(getBoundingClientRect)로 본다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, pushToast } from '../../src/app/dom';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? tsFiles(`${dir}/${f}`) : f.endsWith('.ts') ? [`${dir}/${f}`] : []));
}
const SRC: [file: string, text: string][] = tsFiles('src').map((f) => [f, read(f)]);
const CSS = read('src/app/styles.css');
const CORE_VIEWER = 'node_modules/opencad-viewer3d/src/viewer.ts';
const CORE_THEME = 'node_modules/opencad-viewer3d/src/theme.ts';
const textOf = (file: string): string => (file === 'src/app/styles.css' ? CSS : (SRC.find(([f]) => f === file)?.[1] ?? read(file)));

/** 스타일시트 규칙(주석 뺌 — 감싼 @media 머리·선택자 낱낱·선언 이름과 값 — hover239 꼴) */
function blocksOf(css: string): { media: string | null; sels: string[]; decl: [string, string][] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { media: string | null; sels: string[]; decl: [string, string][] }[] = [];
  const stack: { head: string; from: number }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[{}]/g)) {
    const i = m.index ?? 0;
    if (m[0] === '{') stack.push({ head: text.slice(last, i).trim(), from: i + 1 });
    else {
      const b = stack.pop();
      if (b && !b.head.startsWith('@'))
        out.push({
          media: stack.find((s) => s.head.startsWith('@media'))?.head ?? null,
          sels: b.head.split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
          decl: text
            .slice(b.from, i)
            .split(';')
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d): [string, string] => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
        });
    }
    last = i + 1;
  }
  return out;
}
const BLOCKS = blocksOf(CSS);
/** 그 미디어 머리(없으면 미디어 밖)에서 그 선택자가 둔 선언 값 — 뒤 규칙이 앞을 덮는다 */
function val(sel: string, prop: string, media: string | null = null): string | undefined {
  let v: string | undefined;
  for (const b of BLOCKS) if (b.media === media && b.sels.includes(sel)) for (const [p, x] of b.decl) if (p === prop) v = x;
  return v;
}
const num = (v: string | undefined): number => parseFloat(v ?? '');
const z = (sel: string): number => num(val(sel, 'z-index'));
/** 떠 있는 칸 선언: 흐름 밖 자리·쌓임 차례·굴림 칸이 비켜 둘 자리 */
const floating = (p: string, v: string): boolean => (p === 'position' && /^(fixed|absolute|sticky)\b/.test(v)) || p === 'z-index' || p.startsWith('scroll-padding') || p.startsWith('scroll-margin');

// ───────────────────────── 감사 표 ─────────────────────────

/** 통째(고침) · 일부(최소 기준 통과) · 예외(사용자가 연 내용 — Esc) · 없음(밑에 초점 칸 없음·비침) · 대상 아님(배치·숨은 글·자기 칸 꾸밈) */
type Verdict = 'fixed' | 'partial' | 'user' | 'none' | 'layout';
interface Float {
  id: string;
  name: string;
  /** 이 칸의 스타일시트 선택자(인라인·코어 칸이면 비움) */
  sels: string[];
  /** 밑에 깔리는 초점 칸(236차 KBD 번호 — targetsize234) */
  under: string;
  verdict: Verdict;
  why: string;
  proof: [file: string, re: RegExp][];
}
const HIDDEN_TEXT = [
  '.sr-only',
  '.title-actions .btn.link .btn-label',
  '.toolbar .btn-label',
  ':lang(zh) .toolbar .btn-label',
  ':lang(en) .toolbar .btn-label',
  ':lang(ja) .toolbar .btn-label',
  ':lang(de) .toolbar .btn-label',
  '.title-actions .btn:not(.primary) .btn-label',
  '.titlebar .title-actions .btn-label',
  '.brand b',
  '.brand > span',
];
const FLOATS: Float[] = [
  {
    id: 'F1',
    name: '3D 보기 바탕(viewer-host·코어 감싸개·캔버스)',
    sels: ['.viewer-host'],
    under: '— (이것이 3D 보기 캔버스 초점 칸 — KBD #42 초점 core)',
    verdict: 'none',
    why: '맨 밑(z 없음) — 덮는 쪽이 아님',
    proof: [
      [CORE_VIEWER, /wrap\.style\.cssText = 'position:absolute;inset:0;overflow:hidden;/],
      [CORE_THEME, /export const CANVAS_CSS = 'position:absolute;inset:0;/],
    ],
  },
  {
    id: 'F2',
    name: '코어 그림판(.v3d-overlay — 측정 글상자·표식)',
    sels: [],
    under: '3D 보기 캔버스',
    verdict: 'partial',
    why: '투명 그림판에 칠한 글상자·표식만 — 캔버스 대부분이 보임',
    proof: [[CORE_VIEWER, /overlay\.style\.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'/]],
  },
  {
    id: 'F3',
    name: '코어 뷰 큐브(.v3d-cube — 위·오른쪽 8px)',
    sels: [],
    under: '3D 보기 캔버스(큐브는 Tab 멈춤 아님 — KBD #42 키 길 alt)',
    verdict: 'partial',
    why: '캔버스 오른쪽 위 구석만, 앱 띠(z 3 이상)는 모두 큐브 위',
    proof: [[CORE_VIEWER, /cube\.style\.cssText = `position:absolute;top:\$\{CUBE_INSET\}px;right:\$\{CUBE_INSET\}px;/]],
  },
  {
    id: 'F4',
    name: '정밀 조준 층·십자선(손가락 길게 누르는 동안)',
    sels: ['.aim-layer', '.aim-reticle'],
    under: '3D 보기 캔버스',
    verdict: 'none',
    why: '층은 투명·누르기 없음·화면 읽기에서 숨음, 십자선 48px만',
    proof: [['src/app/app.ts', /this\.aimLayer = h\('div', \{ class: 'aim-layer', 'aria-hidden': 'true' \}\);/]],
  },
  {
    id: 'F5',
    name: '단면 손잡이(44×44 — 끌기만, 화면 읽기에서 숨음)',
    sels: ['.section-handle'],
    under: '3D 보기 캔버스(손잡이는 초점 칸 아님 — KBD #28 alt)',
    verdict: 'partial',
    why: '캔버스 한 조각',
    proof: [['src/app/sectionbar.ts', /h\('div', \{ class: 'section-handle', title: '끌어서 단면 옮기기', hidden: true, 'aria-hidden': 'true' \}\)/]],
  },
  {
    id: 'F6',
    name: '시작 화면(3D 보기 전체 — 불투명)',
    sels: ['.start'],
    under: '3D 보기 캔버스 — 시작 화면이 보이는 동안(문서 없음) inert',
    verdict: 'none',
    why: '덮인 캔버스는 초점을 받지 않음(시작 화면 숨김과 같은 조건)',
    proof: [['src/app/app.ts', /this\.startEl\.hidden = !!d;\n\s*\/\/[^\n]*\n\s*this\.hostEl\.inert = !d;/]],
  },
  {
    id: 'F7',
    name: '여는 중 덮개(3D 보기 전체 — 바탕 70% + 흐림)',
    sels: ['.busy'],
    under: '캔버스·시작 화면 칸(#4·#3·#19·#20·#7)·측정 띠(z 4)',
    verdict: 'user',
    why: '사용자가 파일을 열어 생김 — Esc가 여는 중 취소(초점 그대로), 30% 비침',
    proof: [['src/app/app.ts', /case 'escape':[\s\S]{0,300}?if \(this\.loading\) \{\s*this\.cancel\(\);/]],
  },
  {
    id: 'F8',
    name: '끌어다 놓기 표시(파일을 끄는 동안)',
    sels: ['.drop-hint'],
    under: '캔버스·측정 띠·시작 화면',
    verdict: 'none',
    why: '12% 물들임(비침)·누르기 없음 — 놓거나 떠나면 거둠',
    proof: [['src/app/app.ts', /this\.dropEl = h\('div', \{ class: 'drop-hint', hidden: true, 'aria-hidden': 'true' \}/]],
  },
  {
    id: 'F9',
    name: '단면 막대(넓은 화면 왼쪽 위, 휴대폰 흐름 두세 줄)',
    sels: ['.section-bar'],
    under: '캔버스, 작은 휴대폰 고른 부품 카드(#17·#18 — 320×568 58px 중 50px)',
    verdict: 'partial',
    why: '카드 8px 남음 — 카드에 초점이 들면 190차 z 7로 위(F12)',
    proof: [['src/app/styles.css', /\.section-bar \{\n {2}position: absolute;\n {2}z-index: 6;/]],
  },
  {
    id: 'F10',
    name: '위 띠 묶음(분해·격리 띠 — 휴대폰은 단면 막대 아래 굴림 칸)',
    sels: ['.top-bars'],
    under: '캔버스·태블릿 단면 막대 아래 12px(일부), 휴대폰 고른 부품 카드·측정 띠(#9·#17·#18 — 375×812 카드를 분해 띠가 통째)',
    verdict: 'fixed',
    why: '190차 — 초점이 든 측정 띠를 위 띠 묶음 위로(F12)',
    proof: [['src/app/styles.css', /\.measure-bar:has\(:focus-visible\) \{\s*z-index: 7;/]],
  },
  {
    id: 'F11',
    name: '측정 띠·고른 부품 카드(3D 보기 아래 가운데)',
    sels: ['.measure-bar'],
    under: '캔버스 — 단면 막대·위 띠(z 6)·알림(z 7)보다 밑이라 그 칸들을 덮지 않음',
    verdict: 'partial',
    why: '캔버스 아래 가운데 한 조각',
    proof: [['src/app/styles.css', /\.measure-bar \{\n {2}position: absolute;\n {2}left: 50%;\n {2}bottom: 10px;\n {2}z-index: 4;/]],
  },
  {
    id: 'F12',
    name: '초점 든 띠(측정 띠 190차 · 단면 막대·위 띠 묶음 240차)',
    sels: ['.measure-bar:has(:focus-visible)', '.section-bar:has(:focus-visible)', '.top-bars:has(:focus-visible)'],
    under: '그 띠가 덮는 다른 띠·알림 조각(초점은 올린 띠 안)',
    verdict: 'none',
    why: 'F10·F13의 고침 규칙 자신',
    proof: [['src/app/styles.css', /\.section-bar:has\(:focus-visible\),\n\.top-bars:has\(:focus-visible\) \{\n {2}z-index: 8;\n\}/]],
  },
  {
    id: 'F13',
    name: '알림 칸(3D 보기 아래 — 측정 띠가 보이면 띠 위 6px)',
    sels: ['.toasts'],
    under: '캔버스·측정 띠(일부), 시작 화면 최근 문서 줄(#19·#7·#20 — 좁은 화면), 휴대폰 위 띠 묶음 줄(#36·#8·#24·#7·#17), 작은 휴대폰 단면 막대 줄(#35·#8·#23·#7)',
    verdict: 'fixed',
    why: '240차 — 초점 든 단면 막대·위 띠 묶음은 z 8(F12), 시작 화면은 scroll-padding-bottom = 알림이 덮는 높이(--toast-band)',
    proof: [
      ['src/app/styles.css', /\.start \{[^}]*scroll-padding-bottom: var\(--toast-band, 0px\);/],
      ['src/app/dom.ts', /view\.style\.setProperty\('--toast-band', `\$\{Math\.ceil\(band\)\}px`\);/],
    ],
  },
  {
    id: 'F14',
    name: '분해 끌기 거리 카드(부품을 누른 채 끄는 동안 커서 옆)',
    sels: ['.explode-dist'],
    under: '캔버스(끄는 동안 초점은 그대로)',
    verdict: 'user',
    why: '사용자가 끄는 동안만 — Esc가 그 끌기만 취소, 손을 떼면 거둠',
    proof: [
      ['src/app/app.ts', /if \(action === 'escape' && this\.tweakTool\?\.dragging\) \{/],
      ['src/app/explodetool.ts', /h\('div', \{ class: `explode-dist\$\{snap \? ' snapped' : ''\}`, 'aria-hidden': 'true' \}/],
    ],
  },
  {
    id: 'F15',
    name: '패널 크기 손잡이(넓은 화면 패널 왼쪽, 시트 위)',
    sels: ['.panel-resizer'],
    under: '나무 줄(#14 — 넓은 화면 마우스 왼쪽 4px), 3D 보기 캔버스 끝 — 탭(#10)·시트 줄은 밑이 아님',
    verdict: 'partial',
    why: '시트는 흐름 안(3D 보기를 줄임 — 덮지 않음), 손잡이가 패널로 드는 만큼 패널 머리 위 띠·왼쪽 띠를 따로 둠(53·164차)',
    proof: [['src/app/styles.css', /\.panel-resizer \{\n {2}position: absolute;\n {2}z-index: 5;/]],
  },
  { id: 'F16', name: '손잡이 안 2px 막대', sels: ['.panel-resizer::after'], under: '—', verdict: 'layout', why: '자기 칸 안 꾸밈', proof: [['src/app/styles.css', /\.panel-resizer::after \{\n {2}content: '';/]] },
  { id: 'F17', name: '가상 목록 줄(나무·부품별 보이기 표)', sels: ['.vlist > *'], under: '—', verdict: 'layout', why: '줄 높이가 같아 서로 겹치지 않는 배치', proof: [['src/app/styles.css', /\.vlist > \* \{\n {2}position: absolute;/]] },
  {
    id: 'F18',
    name: '메뉴(연 자리 — 세로 굴림)',
    sels: ['.menu'],
    under: '연 버튼 둘레(초점은 메뉴 안)',
    verdict: 'user',
    why: '사용자가 연 내용 — Esc·Tab이 닫고 연 버튼으로(188차)',
    proof: [['src/app/menu.ts', /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*closeMenu\(\);/]],
  },
  {
    id: 'F19',
    name: '오른쪽 누르기 메뉴 닻(인라인 1×1)',
    sels: [],
    under: '—',
    verdict: 'layout',
    why: '보이지 않는 기준점',
    proof: [['src/app/menu.ts', /anchor\.style\.cssText = `position:fixed;[^`]*width:1px;height:1px;pointer-events:none`;/]],
  },
  {
    id: 'F20',
    name: '언어 목록(사이트 키트)',
    sels: ['.language-list'],
    under: '제목 막대 칸',
    verdict: 'user',
    why: '사용자가 연 목록 — Esc로 닫힘',
    proof: [['node_modules/opencad-site-kit/i18n/language-menu.ts', /if \(!menu\.hidden && event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); close\(true\);/]],
  },
  {
    id: 'F21',
    name: '떠 있는 언어 단추(제목 막대가 없을 때만)',
    sels: ['.language-control-floating'],
    under: '앱 전 소개(위 여백 32px — 단추 밑 칸 없음)',
    verdict: 'none',
    why: '앱은 늘 제목 막대에 둠',
    proof: [
      ['src/app/i18n.ts', /const host = root\.querySelector\('\.titlebar, \.topbar, header'\);/],
      ['src/app/i18n.ts', /if \(!control\.element\.isConnected\) \{ control\.element\.classList\.add\('language-control-floating'\);/],
    ],
  },
  { id: 'F22', name: '숨은 글(화면 읽기 이름·좁은 창에서 숨긴 단추 이름)', sels: HIDDEN_TEXT, under: '—', verdict: 'layout', why: '1px·clip — 보이지 않음', proof: [['src/app/styles.css', /\.sr-only \{\n {2}position: absolute !important;/]] },
  {
    id: 'F23',
    name: '대화 상자(모달 — 맨 위 층)',
    sels: [],
    under: '뒤 칸(154차 inert)',
    verdict: 'user',
    why: '사용자가 연 내용 — Esc로 닫고 연 버튼으로',
    proof: [
      ['src/app/dialog.ts', /el\.addEventListener\('cancel', \(\) => done\(\)\);/],
      ['src/app/dialog.ts', /if \(typeof el\.showModal === 'function'\) el\.showModal\(\);/],
    ],
  },
];

describe('240차: 떠 있는 칸 감사 표(WCAG 2.4.11 — 표 밖 새 떠 있는 칸이면 실패)', () => {
  it('스타일시트의 떠 있는 칸 선택자(position fixed·absolute·sticky·z-index·scroll-padding·scroll-margin) 32가 표와 같고, 앱 인라인 자리·코어 칸도 표에 든다', () => {
    const got = new Set<string>();
    for (const b of BLOCKS) if (b.decl.some(([p, v]) => floating(p, v))) for (const s of b.sels) got.add(s);
    const table = FLOATS.flatMap((f) => f.sels);
    expect(new Set(table).size).toBe(table.length);
    expect([...got].sort()).toEqual([...table].sort());
    expect(got.size).toBe(32);
    // 앱 원문 인라인 자리(cssText·style.position·zIndex): 메뉴 닻 하나(F19)
    const inline = SRC.flatMap(([f, t]) => (t.match(/position:\s*(?:fixed|absolute|sticky)|\.style\.position\s*=|\bzIndex\b/g) ?? []).map(() => f));
    expect(inline).toEqual(['src/app/menu.ts']);
    // 코어가 만드는 떠 있는 칸: viewer.ts 감싸개·그림판·뷰 큐브(F1·F2·F3), theme.ts 캔버스(F1) — 코어를 올려 늘면 표를 다시 본다
    expect([CORE_VIEWER, CORE_THEME].map((f) => read(f).match(/position:(?:absolute|fixed|sticky)/g)?.length ?? 0)).toEqual([3, 1]);
    expect(read(CORE_VIEWER)).not.toMatch(/cube\.tabIndex|cube\.setAttribute\('tabindex'/);
  });

  it('칸마다 판정 근거 원문 — 통째 2(고침 있음)·일부 6·예외 5·없음 6·대상 아님 4', () => {
    for (const f of FLOATS) for (const [file, re] of f.proof) expect(textOf(file), `${f.id} ${file}`).toMatch(re);
    const count = (v: Verdict) => FLOATS.filter((f) => f.verdict === v).map((f) => f.id);
    expect(count('fixed')).toEqual(['F10', 'F13']);
    expect(count('partial')).toEqual(['F2', 'F3', 'F5', 'F9', 'F11', 'F15']);
    expect(count('user')).toEqual(['F7', 'F14', 'F18', 'F20', 'F23']);
    expect(count('none')).toEqual(['F1', 'F4', 'F6', 'F8', 'F12', 'F21']);
    expect(count('layout')).toEqual(['F16', 'F17', 'F19', 'F22']);
    // 비침·누르기 없음 칸(F4·F8): 층은 바탕 없음, 끌어다 놓기는 강조색 12% 물들임
    expect([val('.aim-layer', 'pointer-events'), val('.aim-layer', 'background'), val('.drop-hint', 'pointer-events')]).toEqual(['none', undefined, 'none']);
    expect(val('.drop-hint', 'background')).toBe('color-mix(in srgb, var(--accent) 12%, transparent)');
    // 숨은 글(F22): absolute를 둔 규칙마다 1px·clip
    for (const b of BLOCKS.filter((x) => x.sels.some((s) => HIDDEN_TEXT.includes(s)) && x.decl.some(([p, v]) => floating(p, v)))) {
      const d = Object.fromEntries(b.decl);
      expect([d.width, d.height, d.clip], b.sels.join(', ')).toEqual(['1px', '1px', 'rect(0 0 0 0)']);
    }
  });

  it('쌓임 차례는 미디어 조건으로 바뀌지 않는다(z-index는 모두 미디어 밖) — 시작 화면·손잡이 3 < 측정 띠 4 < 덮개·크기 손잡이 5 < 띠 6 < 알림 7 < 초점 든 단면 막대·위 띠 묶음 8', () => {
    expect(BLOCKS.filter((b) => b.media !== null && b.decl.some(([p]) => p === 'z-index')).map((b) => b.sels.join(', '))).toEqual([]);
    expect(['.start', '.section-handle', '.measure-bar', '.busy', '.panel-resizer', '.drop-hint', '.section-bar', '.top-bars', '.toasts', '.explode-dist', '.aim-layer'].map(z)).toEqual([3, 3, 4, 5, 5, 6, 6, 6, 7, 7, 8]);
    // 3D 보기 자식이 한 판에서 견줘진다: 3D 보기·작업 영역·패널은 자리 기준만(z 없음 — 쌓임 맥락 아님)
    for (const sel of ['.view', '.workspace', '.panel']) expect([val(sel, 'position'), val(sel, 'z-index')], sel).toEqual(['relative', undefined]);
  });

  it('시트(휴대폰)·옆 패널의 크기 손잡이(F15)는 탭·나무 줄을 덮지 않는다 — 패널로 드는 만큼 머리 위·왼쪽에 띠(넓은 화면 마우스는 줄 왼쪽 4px만 — 일부)', () => {
    const narrow = '@media (max-width: 759.98px)';
    const coarse = '@media (pointer: coarse)';
    const coarseNarrow = '@media (pointer: coarse) and (max-width: 759.98px)';
    // 좁은 마우스 창 시트: 위 −7 + 높이 14 = 7 = 머리 위 띠 7
    expect(num(val('.panel-resizer', 'top', narrow)) + num(val('.panel-resizer', 'height', narrow))).toBe(num(val('.panel-head', 'padding-top', narrow)));
    // 손가락 휴대폰 시트: 위 −10 + 높이 24 = 14 = 머리 위 띠 14
    expect(num(val('.panel-resizer', 'top', coarseNarrow)) + num(val('.panel-resizer', 'height', coarseNarrow))).toBe(num(val('.panel-head', 'padding-top', coarseNarrow)));
    // 손가락 옆 패널: 왼쪽 −9 + 폭 24 = 15 = 패널 왼쪽 띠 15
    expect(num(val('.panel-resizer', 'left', coarse)) + num(val('.panel-resizer', 'width', coarse))).toBe(num(val('.panel', 'padding-left', coarse)));
    // 넓은 화면 마우스: 왼쪽 −4 + 폭 8 = 패널 안 4px(나무 줄은 패널 폭 — 일부)
    expect(num(val('.panel-resizer', 'left')) + num(val('.panel-resizer', 'width'))).toBe(4);
    // 시트는 흐름(작업 영역 세로 flex — 3D 보기를 줄이고 덮지 않음)
    expect([val('.workspace', 'flex-direction', narrow), val('.panel', 'position', narrow)]).toEqual(['column', undefined]);
  });
});

// ───────────────────────── 고친 것(통째로 가리던 셋) ─────────────────────────

/** 알림 하나 높이: 위아래 여백 + 테두리 + 닫기 단추(마우스 26·손가락 44 — 글 한 줄 18.85보다 큼) */
const toastH = (touch: boolean): number => {
  const pad = (val('.toast', 'padding') ?? '').split(/\s+/).map(parseFloat);
  return pad[0]! + (pad[2] ?? pad[0]!) + 2 * num(val('.toast', 'border')) + num(touch ? val('.icon-btn', 'height', '@media (pointer: coarse)') : val('.icon-btn', 'height'));
};
/** 알림 n개가 3D 보기 아래에서 덮는 띠 [아래, 위](3D 보기 아래 끝에서 잰 거리) */
const band = (n: number, touch: boolean, bottom = num(val('.toasts', 'bottom'))): [number, number] => [bottom, bottom + n * toastH(touch) + (n - 1) * num(val('.toasts', 'gap'))];
/** [ㄱ, ㄴ]이 [ㄷ, ㄹ] 안에 통째로 드는가 */
const inside = (a: [number, number], b: [number, number]): boolean => a[0] >= b[0] && a[1] <= b[1];

describe('240차: 알림 칸이 통째로 덮던 셋(고치기 전 손셈) → 고친 뒤 보임', () => {
  it('알림 하나 높이 마우스 44·손가락 62, 띠는 3D 보기 아래 12px부터(둘·셋은 틈 6) — 폭 min(560, 보기 − 24)', () => {
    expect([toastH(false), toastH(true)]).toEqual([44, 62]);
    expect([band(1, true), band(2, true), band(3, true), band(3, false)]).toEqual([
      [12, 74],
      [12, 142],
      [12, 210],
      [12, 156],
    ]);
    expect(val('.toasts', 'width')).toBe('min(560px, calc(100% - 24px))');
  });

  it('(가) 좁은 화면 시작 화면: 알림이 최근 문서 줄을 옆으로 다 덮고(375px), 굴림 칸 안 이미 보이는 줄(아래 20~68)은 통째 — scroll-padding-bottom = 알림 띠로 그 줄을 알림 위로 굴림', () => {
    // 옆: 알림 폭 = 375 − 24 = 351(12~363), 시작 카드 = 375 − 32(여백 16 × 2), 최근 문서 줄 = 카드 − 테두리 1 − 안쪽 10(양쪽) → 27~348 ⊂ 12~363
    const W = 375;
    const toastX: [number, number] = [(W - Math.min(560, W - 24)) / 2, (W + Math.min(560, W - 24)) / 2];
    const padX = num((val('.start', 'padding') ?? '').split(/\s+/)[1]);
    const inset = num(val('.recent', 'border')) + num((val('.recent', 'padding') ?? '').split(/\s+/)[1]);
    const row: [number, number] = [padX + inset, W - padX - inset];
    expect([toastX, row]).toEqual([
      [12, 363],
      [27, 348],
    ]);
    expect(inside(row, toastX)).toBe(true);
    // 넓은 화면(카드 620 > 알림 560)은 줄 양끝이 남음(일부): 줄 폭 620 − 22 = 598 > 560
    expect(num(val('.start-card', 'max-width')) - 2 * inset).toBeGreaterThan(560);
    // 세로: 손가락 줄 48px, 알림 하나 띠 12~74 — 고치기 전 scroll-padding 없음(굴림 칸 안에 이미 보이는 줄은 굴리지 않음) → 아래 20~68 줄은 통째
    const rowH = num(val('.recent-open', 'min-height', '@media (pointer: coarse)'));
    expect(rowH).toBe(48);
    const before: [number, number] = [20, 20 + rowH];
    expect(inside(before, band(1, true))).toBe(true);
    // 고친 뒤: 3D 보기에 알림이 덮는 높이를 두고(dom.ts — 아래 시험) 시작 화면이 그만큼 scroll-padding-bottom — Tab이 오면 그 줄 아래 끝을 띠 위 끝에 맞춰 굴린다.
    // 굴릴 자리: 끝 줄 아래 안내 글(위 6 + 12px 글 17.4)·카드 아래 여백 10 + 테두리 1·사실 목록(16 + 18.85 × 3 + 6 × 2 + 6)·시작 화면 아래 여백 24 = 148.95
    expect(val('.start', 'scroll-padding-bottom')).toBe('var(--toast-band, 0px)');
    const room = 6 + 12 * 1.45 + num((val('.recent', 'padding') ?? '').split(/\s+/)[2]) + 1 + num((val('.start-facts', 'margin') ?? '').split(/\s+/)[0]) + 3 * 13 * 1.45 + 2 * 6 + 6 + num((val('.start', 'padding') ?? '').split(/\s+/)[0]);
    expect(Math.round(room * 100) / 100).toBe(148.95);
    const after = (n: number, touch: boolean): [number, number] => {
      const top = band(n, touch)[1];
      const b = Math.min(top, room);
      return [b, b + (touch ? rowH : num(val('.recent-open', 'min-height')))];
    };
    // 손가락 알림 하나·둘은 다 비킴, 마우스 셋은 끝 줄 7px만 겹침(일부), 손가락 셋(210)이 겹친 띠만 끝 줄이 통째일 수 있음(남은 일)
    expect([1, 2].map((n) => after(n, true)[0] >= band(n, true)[1])).toEqual([true, true]);
    expect(inside(after(3, false), band(3, false))).toBe(false);
    expect(inside(after(3, true), band(3, true))).toBe(true);
  });

  it('(나) 휴대폰 위 띠 묶음·(다) 작은 휴대폰 단면 막대: 알림(z 7)이 띠 한 줄을 통째로 덮음 → 키보드 초점이 든 띠는 z 8로 알림 위(초점이 없으면 지금 차례)', () => {
    // a11ymedia 191·192차 손셈 자리(손가락 44px): 375×812 3D 보기 345, 단면 막대 세 줄 8~160 → 위 띠 묶음 168~, 분해 띠 줄 밀대 173~221·방식 225~271·방향 277~323
    const V = 345;
    const card = V - 10 - 58;
    const overBar = V - card + 6;
    // 고른 부품 카드가 보이면 알림 바닥 = max(68, 띠 위 6px — 239차 --toast-over-bar), 없으면 12
    const withCard = band(1, true, Math.max(68, overBar)).map((d) => V - d).reverse() as [number, number];
    const noCard = band(1, true).map((d) => V - d).reverse() as [number, number];
    expect([withCard, noCard]).toEqual([
      [209, 271],
      [271, 333],
    ]);
    expect([inside([225, 271], withCard), inside([277, 323], noCard)]).toEqual([true, true]);
    // 320×568 3D 보기 178, 단면 막대 세 줄 축·숫자 13~59·뒤집기·끄기 61~105·밀대 107~155 — 카드가 없으면 알림 104~166가 밀대 줄 통째(단면 막대는 굴림 칸 아님)
    const small = band(1, true).map((d) => 178 - d).reverse() as [number, number];
    expect(small).toEqual([104, 166]);
    expect(inside([107, 155], small)).toBe(true);
    // 옆: 띠는 왼쪽 8에서 보기 − 100·104까지, 알림은 12~(보기 − 12) — 띠 줄이 알림 폭 안(그래서 통째), 알림 오른쪽(✕ 자리)은 띠 밖으로 남음
    // 고친 뒤: 초점 든 단면 막대·위 띠 묶음 z 8 > 알림 7·끌기 거리 카드 7 — 조준 층(8)과 같지만 DOM 뒤라 위. 초점이 없으면 6(지금 차례). 측정 띠는 190차 7 그대로(알림이 띠 위로 비킴 — 239차)
    for (const sel of ['.section-bar:has(:focus-visible)', '.top-bars:has(:focus-visible)']) {
      expect(z(sel), sel).toBeGreaterThan(z('.toasts'));
      expect(z(sel), sel).toBeGreaterThan(z('.explode-dist'));
      expect(z(sel), sel).toBe(z('.aim-layer'));
    }
    expect([z('.section-bar'), z('.top-bars')]).toEqual([6, 6]);
    expect(z('.measure-bar:has(:focus-visible)')).toBeGreaterThan(z('.top-bars'));
    expect(z('.measure-bar:has(:focus-visible)')).toBeLessThanOrEqual(z('.toasts'));
    // 자리·크기는 그대로(z만), 초점이 든 때만(:focus-within 아님 — 누른 버튼은 초점 표시가 없어 지금처럼)
    const rule = BLOCKS.find((b) => b.sels.includes('.top-bars:has(:focus-visible)'));
    expect([rule?.media, rule?.sels, rule?.decl]).toEqual([null, ['.section-bar:has(:focus-visible)', '.top-bars:has(:focus-visible)'], [['z-index', '8']]]);
    expect(BLOCKS.some((b) => b.sels.some((s) => /^\.(section-bar|top-bars|measure-bar):focus-within$/.test(s)))).toBe(false);
  });
});

// ───────────────────────── 알림이 덮는 높이(dom.ts) ─────────────────────────

/** 3D 보기(아래 끝 V)와 그 안 알림 칸 — 알림 칸은 아래 bottom에서 알림 수만큼 위로 자란다(가짜 자리 — jsdom은 배치를 하지 않음) */
function stage(V: number, bottom: number, each: number, gap = 6) {
  const view = h('section', { class: 'view' });
  const box = h('div', { class: 'toasts' });
  view.append(box);
  document.body.append(view);
  const rect = (top: number, bot: number): DOMRect => ({ top, bottom: bot, left: 0, right: 0, width: 0, height: bot - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  view.getBoundingClientRect = () => rect(0, V);
  box.getBoundingClientRect = () => {
    const n = box.children.length;
    return rect(V - bottom - (n ? n * each + (n - 1) * gap : 0), V - bottom);
  };
  const toast = (msg: string) => h('div', { class: 'toast info', role: 'status' }, h('span', {}, msg));
  return { view, box, toast, band: () => view.style.getPropertyValue('--toast-band') };
}

describe('240차: 알림 칸이 3D 보기 아래에서 덮는 높이를 3D 보기의 --toast-band로(dom.ts pushToast — 넣고 뺄 때)', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('넣으면 3D 보기 아래 끝 − 알림 칸 위 끝, 빼면 다시 재고, 다 빠지면 지운다(scroll-padding 0 — 보통 화면 그대로)', () => {
    const s = stage(689, 12, 62);
    expect(s.band()).toBe('');
    const a = pushToast(s.box, s.toast('하나'), 3);
    expect(s.band()).toBe('74px');
    const b = pushToast(s.box, s.toast('둘'), 3);
    expect(s.band()).toBe('142px');
    a();
    expect(s.band()).toBe('74px');
    b();
    expect(s.band()).toBe('');
  });

  it('한도(셋)로 빼거나 시간이 다 되어 닫혀도 다시 잰다, 담는 칸이 없으면(시험의 따로 선 알림 칸) 아무것도 하지 않는다', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = stage(345, 74, 62);
    for (const m of ['하나', '둘', '셋', '넷']) pushToast(s.box, s.toast(m), 3, 3500);
    expect(s.box.children).toHaveLength(3);
    expect(s.band()).toBe(`${74 + 3 * 62 + 2 * 6}px`);
    vi.advanceTimersByTime(3500);
    expect(s.box.children).toHaveLength(0);
    expect(s.band()).toBe('');
    const lone = h('div', { class: 'toasts' });
    expect(() => pushToast(lone, s.toast('홀로'), 3)()).not.toThrow();
  });

  it('앱: 알림 칸과 시작 화면이 같은 3D 보기의 자식이라(app.ts viewEl) 시작 화면이 그 변수를 물려받는다 — 변수를 두는 곳은 dom.ts, 쓰는 곳은 시작 화면 규칙뿐', () => {
    const app = textOf('src/app/app.ts');
    const kids = /\n {4}this\.viewEl = h\('section', \{[^}]*\}, ([^;]*)\);/.exec(app)?.[1]?.split(',').map((x) => x.trim()) ?? [];
    expect(kids).toContain('this.startEl');
    expect(kids).toContain('this.toasts');
    expect(app).toContain('pushToast(this.toasts, t, 3, ms');
    expect(SRC.filter(([, t]) => t.includes('--toast-band')).map(([f]) => f)).toEqual(['src/app/dom.ts']);
    expect(BLOCKS.filter((b) => b.decl.some(([, v]) => v.includes('--toast-band'))).map((b) => b.sels.join(', '))).toEqual(['.start']);
  });
});
