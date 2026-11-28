// @vitest-environment jsdom
/**
 * 234차(WCAG 2.5.8 대상 크기(최소) 24×24 CSS px — 재발 막기, SKP 235차와 같은 일): 누를 자리 42꼴의 감사 표(아래 TARGETS — README 개발 절 234차 문단과 같음).
 * (가) CSS 셈: styles.css 규칙을 환경 셋 — 넓은 화면 1280×800 마우스, 좁은 창 320×256 마우스(1280px 창 400%), 휴대폰 390×844 손가락 — 의 미디어 조건으로 골라
 *     꼴마다 폭·높이를 손셈한다(jsdom은 배치를 하지 않는다). 「크기」는 둘 다 24 이상, 예외는 그 조건(간격·브라우저 기본·같은 기능·글줄 안·숨김·대상 아님),
 *     「고르지 않음」(패널 크기 손잡이)은 지금 24 미만인지 — 고치면 표를 고쳐야 통과한다.
 * (나) DOM: 도구 막대·패널 다섯 탭(간섭 결과·부품별 보이기·PMI 표·저장된 보기)·패널 크기 손잡이·단면 막대와 손잡이·분해 손질 칸·메뉴·그림 저장 대화 상자·언어 메뉴를
 *     넓은 화면·휴대폰 꼴로 그려 누를 마디가 모두 표의 선택자에 드는지(새 누를 칸이 생기면 표에 더해야 통과), 두 꼴의 마디가 같은지(휴대폰 크기는 스타일시트가 바꾼다 —
 *     패널 touch는 아래 띠 안내 글만, 패널 크기 손잡이는 방향·이름만 바꾼다).
 * (다) 원문 셈: 앱 전체를 띄우지 않아 그리지 않는 app.ts 칸(제목 막대·시작 화면·측정 띠·격리 띠·분해 막대·알림·여는 중 덮개)까지 src/app의 누를 마디 만드는 자리마다
 *     열쇠(태그.첫 클래스 — 없으면 input[type=…]·태그)가 표에 있는지, 표 줄마다 DOM·원문·쪽 글 어딘가에 쓰이는지(낡은 줄 없음).
 * (라) 셈이 헛돌지 않음: 펼침 18×18(SKP 235차 고치기 전 꼴)·이름 버튼 최소 폭 없음(162차 꼴)·표 밖 새 버튼·새 원문 자리는 잡힌다.
 * 163차 a11ymedia 2.5.8 절(보통 규칙 24px·이름 버튼 최소 폭)과 touch.test(손가락 44px)는 그대로다.
 * src/app의 모든 .ts·styles.css·index.html·코어 viewer.ts(뷰 큐브 클래스)를 소스 글로 읽는다(ci-guard 12번 — 누를 마디를 만드는 줄·크기 규칙을 바꾸면 이 시험도).
 *
 * 236차(WCAG 2.1.1 키보드·2.4.7 초점 보임·2.5.7 끌기 움직임 — 재발 막기, NC 223차와 같은 일): 같은 42꼴 표의 꼴마다 키보드 길(아래 KBD — README 개발 절 236차 문단).
 * (가) 닿는 길(Tab 멈춤·화살표 무리·감싼 입력 칸·같은 일을 하는 다른 칸과 키 근거)·(나) 키로 누르기(브라우저 기본·앱 keydown 자리와 받는 키·굴림)·(다) 초점 보임(전역 바깥선·안쪽·
 *     바깥선을 끈 세 자리의 대신 표시 — 스타일시트 글)을 그린 DOM 두 꼴의 마디마다 견주고, 원문에서 Tab 멈춤을 빼는 자리·tabindex를 쓰는 파일이 표와 같은지 본다 — 표에 새 줄을 더하면 KBD에도 적어야 통과.
 * (라) 포인터 끌기(DRAGS): src/app에서 pointermove·포인터 붙잡기를 쓰는 파일마다 그 일과 키보드 길·한 점 대안 근거가 있는지, 3D 임의 돌리기·이동·확대는 키가 없다(고르지 않음 — 키를 더하면 표를 고친다).
 * 코어 viewer.ts·theme.ts(캔버스 초점·키)도 소스 글로 읽는다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GroupInfo, Viewer3d } from 'opencad-viewer3d';
import { createLanguageMenu } from 'opencad-site-kit/i18n/language-menu';
import { languages } from '../../site/i18n-core.mjs';
import { stepToScene, type StepMeta } from '../../src/scene';
import { createDoc, type PanelTab, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import type { InterferencePair } from '../../src/app/interference';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import * as PV from '../../src/app/panelview';
import * as PHYS from '../../src/app/propsview';
import { infoView } from '../../src/app/infoview';
import { pmiView } from '../../src/app/pmiview';
import { Fmt } from '../../src/app/display';
import { h } from '../../src/app/dom';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { PANEL_MIN, PanelResizer } from '../../src/app/resize';
import { SectionBar } from '../../src/app/sectionbar';
import { ExplodeControls } from '../../src/app/explodebar';
import { closeMenu, openMenu, type MenuItem } from '../../src/app/menu';
import { closeDialog, openDialog } from '../../src/app/dialog';
import { imageDialogBody } from '../../src/app/imagedlg';
import { cube, stepString, StepText } from '../stepText';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const CSS = read('src/app/styles.css');
const INDEX = read('index.html');
const SRC: [file: string, text: string][] = readdirSync(join(ROOT, 'src/app'))
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f): [string, string] => [f, read(`src/app/${f}`)]);
const srcOf = (file: string): string => SRC.find(([f]) => f === file)?.[1] ?? '';

// ───────────────────────── 스타일시트 규칙(환경마다) ─────────────────────────

type Env = 'wide' | 'narrow' | 'phone';
const ENVS: Record<Env, { pointer: 'fine' | 'coarse'; width: number; height: number }> = {
  wide: { pointer: 'fine', width: 1280, height: 800 },
  narrow: { pointer: 'fine', width: 320, height: 256 },
  phone: { pointer: 'coarse', width: 390, height: 844 },
};
const ENV_NAMES = Object.keys(ENVS) as Env[];

/** 미디어 조건 하나((이름: 값))가 그 환경에 맞는지 — 이 스타일시트가 쓰는 조건만(모르는 조건이면 멈춘다) */
function feature(f: string, env: Env): boolean {
  const m = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(f.trim());
  if (!m) throw new Error(`모르는 미디어 조건: ${f}`);
  const e = ENVS[env];
  const name = m[1]!;
  const v = m[2]!;
  if (name === 'max-width') return e.width <= parseFloat(v);
  if (name === 'min-width') return e.width >= parseFloat(v);
  if (name === 'max-height') return e.height <= parseFloat(v);
  if (name === 'pointer') return e.pointer === v;
  // 강제 색·움직임 줄이기·홈 화면 앱은 켜지 않은 화면
  if (name === 'forced-colors') return v === 'none';
  if (name === 'prefers-reduced-motion') return v === 'no-preference';
  if (name === 'display-mode') return v === 'browser';
  throw new Error(`모르는 미디어 조건: ${f}`);
}

/** 미디어 목록(쉼표 = 또는, and = 그리고, 앞 not = 뒤집기) */
function media(text: string, env: Env): boolean {
  return text.split(',').some((q) => {
    let s = q.trim();
    const not = s.startsWith('not ');
    if (not) s = s.slice(4);
    const ok = s
      .split(/\s+and\s+/)
      .filter((p) => p.trim() !== 'all')
      .every((p) => feature(p, env));
    return not ? !ok : ok;
  });
}

type Rules = Map<string, Record<string, string>>;
/** 스타일시트 규칙 차례대로(미디어 글 — 미디어 밖이면 null, 선택자 낱낱, 선언) */
const SHEET: { media: string | null; sels: string[]; decl: Record<string, string> }[] = (() => {
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.append(el);
  const out: { media: string | null; sels: string[]; decl: Record<string, string> }[] = [];
  const add = (mediaText: string | null, r: CSSStyleRule) => {
    const decl: Record<string, string> = {};
    for (let i = 0; i < r.style.length; i++) {
      const p = r.style[i]!;
      decl[p] = r.style.getPropertyValue(p);
    }
    out.push({ media: mediaText, sels: r.selectorText.split(',').map((x) => x.replace(/\s+/g, ' ').trim()), decl });
  };
  for (const r of [...el.sheet!.cssRules]) {
    if (r instanceof CSSStyleRule) add(null, r);
    else if (r instanceof CSSMediaRule) for (const s of [...r.cssRules]) if (s instanceof CSSStyleRule) add(r.media.mediaText, s);
  }
  el.remove();
  return out;
})();

/** 그 환경에 드는 규칙을 차례대로 덮은 선택자 → 선언(같은 선택자는 뒤 규칙이 앞을 덮는다) */
function rules(env: Env): Rules {
  const out: Rules = new Map();
  for (const r of SHEET) {
    if (r.media !== null && !media(r.media, env)) continue;
    for (const sel of r.sels) out.set(sel, { ...out.get(sel), ...r.decl });
  }
  return out;
}
const RULES: Record<Env, Rules> = { wide: rules('wide'), narrow: rules('narrow'), phone: rules('phone') };

/** 선언의 px 값(없거나 px 길이가 아니면 NaN — 100%·auto 등) */
const px = (R: Rules, sel: string, p: string): number => {
  const v = R.get(sel)?.[p]?.trim();
  return v && /^-?[\d.]+(px)?$/.test(v) ? parseFloat(v) : NaN;
};
/** 앞 선택자(더 좁은 규칙)부터 그 속성을 처음 둔 값 */
const pick = (R: Rules, sels: string[], p: string): number => {
  for (const s of sels) {
    const v = px(R, s, p);
    if (!Number.isNaN(v)) return v;
  }
  return NaN;
};
/** 줄임 꼴 네 값(위·오른쪽·아래·왼쪽 — jsdom은 낱 속성으로 펼치지 않는다, a11ymedia 꼴) */
const four = (v: string | undefined): [number, number, number, number] | null => {
  if (!v) return null;
  const n = v.trim().split(/\s+/).map((x) => parseFloat(x) || 0);
  return [n[0] ?? 0, n[1] ?? n[0] ?? 0, n[2] ?? n[0] ?? 0, n[3] ?? n[1] ?? n[0] ?? 0];
};
/** 좌우 여백 합 — 앞 선택자부터 처음 둔 것(뒤 규칙의 padding-inline이 덮으면 그것) */
const padX = (R: Rules, sels: string[]): number => {
  for (const s of sels) {
    const inl = R.get(s)?.['padding-inline'];
    if (inl) {
      const n = inl.trim().split(/\s+/).map((x) => parseFloat(x) || 0);
      return (n[0] ?? 0) + (n[1] ?? n[0] ?? 0);
    }
    const p = four(R.get(s)?.padding);
    if (p) return p[1] + p[3];
  }
  return 0;
};
const padY = (R: Rules, sel: string): number => {
  const p = four(R.get(sel)?.padding);
  return p ? p[0] + p[2] : 0;
};
const margin = (R: Rules, sel: string): [number, number, number, number] => four(R.get(sel)?.margin) ?? [0, 0, 0, 0];
/** 테두리 두께(줄임 꼴의 첫 길이 — var() 색이라 jsdom이 버렸으면 0: 크기를 작게 센다) */
const border = (R: Rules, sel: string): number => parseFloat(R.get(sel)?.border ?? '') || 0;
const atLeast = (...v: number[]): number => Math.max(...v.map((x) => (Number.isNaN(x) ? 0 : x)));
const or = (v: number, d: number): number => (Number.isNaN(v) ? d : v);

/** 본문 글 한 줄(html, body 13px/1.45 — 단추·입력 칸·이름 버튼은 글꼴을 물려받는다) */
const LINE = 13 * 1.45;
/** dom.ts icon 기본 크기(iconButton 단추의 아이콘) */
const ICON = 18;
/** 단추 안 가장 작은 내용(글자 하나 13px·몸체 아이콘 13) */
const LEAST = 13;
/** 브라우저 기본 확인 칸(Chrome·Safari·Firefox 13×13 — 마우스 화면에서 작성자는 크기를 두지 않는다) */
const UA_BOX = 13;
/** 패널·카드 폭을 따르는 칸(패널 최소 폭 — 24px를 훨씬 넘는다) */
const ROW = PANEL_MIN;
/** 패널 안 고르기·숫자 칸 폭: 패널 최소 폭 − 묶음 좌우 여백 20 − 이름 칸 96 − 틈 12(.prop-group .dlg-row) */
const DLG_COL = PANEL_MIN - 20 - 96 - 12;

/** 단추 폭: 최소 폭과 (좌우 여백 + 테두리 + 내용) 가운데 큰 것, 높이: 높이와 최소 높이 가운데 큰 것 */
const btnW = (R: Rules, sels: string[], content: number): number => atLeast(pick(R, sels, 'min-width'), padX(R, sels) + 2 * border(R, '.btn') + content);
const btnH = (R: Rules, sels: string[]): number => atLeast(pick(R, sels, 'height'), pick(R, sels, 'min-height'));
const box = (R: Rules, sel: string, w = 'width', hh = 'height'): [number, number] => [px(R, sel, w), px(R, sel, hh)];

/** 작성자가 크기를 둔 선언(브라우저 기본 꼴이면 없어야 한다) */
const authored = (R: Rules, sels: string[], props: string[]): string[] => sels.flatMap((s) => props.filter((p) => R.get(s)?.[p] !== undefined).map((p) => `${s} ${p}=${R.get(s)![p]}`));

/**
 * 레이어·PMI 표 줄 [보이기 확인 칸(13×13)][틈][이름 버튼(최소 폭 × 20.85)]과 간섭 쌍 줄의 간격 예외(163차):
 * 한 줄 안 두 가운데 사이(13/2 + 틈 + 최소 폭/2)와 위아래 줄 사이(가장 높은 칸 + 위아래 여백 + 아래 테두리 1)가 24 이상이면
 * 두 칸 가운데의 24px 원은 서로 겹치지 않고 이웃 칸에도 닿지 않는다
 */
function spacing(R: Rules): string[] {
  const out: string[] = [];
  const gap = px(R, 'span.check', 'gap');
  // PMI 표 규칙이 최소 폭을 두지 않으면 .link-btn 것(165차)
  const linkW = Math.min(atLeast(px(R, '.link-btn', 'min-width')), atLeast(pick(R, ['.pmi-grid .link-btn', '.link-btn'], 'min-width')));
  const linkH = LINE + padY(R, '.link-btn');
  const across = UA_BOX / 2 + gap + linkW / 2;
  if (!(across >= 24)) out.push(`확인 칸 ↔ 이름 버튼 ${across}`);
  for (const sel of ['table.grid td', '.vgrid-row', '.prop-row']) {
    const pitch = Math.max(UA_BOX, linkH) + padY(R, sel) + 1;
    if (!(pitch >= 24)) out.push(`${sel} 줄 사이 ${pitch}`);
  }
  return out;
}

const sectionNum = (R: Rules): [number, number] => box(R, '.section-num');

type Verdict = 'size' | 'spacing' | 'ua' | 'equivalent' | 'inline' | 'design' | 'hidden' | 'none' | 'core';
interface Target {
  /** 표 번호·이름 */
  name: string;
  /** DOM에서 맞출 선택자 */
  sel: string;
  /** 원문 셈 열쇠(태그.첫 클래스·input[type=…]·태그) — 없으면 DOM·쪽 글로만 본다 */
  keys: string[];
  /** 판정(마우스 둘·휴대폰이 다르면 환경마다) */
  verdict: Verdict | Record<Env, Verdict>;
  /** 셈한 폭·높이(px) */
  size?: (R: Rules) => [number, number];
  /** 예외 셈: 어긋난 것(빈 배열이면 맞음) */
  check?: (R: Rules) => string[];
  /** 원문 열쇠·DOM 밖에서 쓰이는지(포인터만 받는 칸·앱 전 쪽·코어) */
  seen?: () => boolean;
}
const mouse = (m: Verdict, phone: Verdict): Record<Env, Verdict> => ({ wide: m, narrow: m, phone });
const verdictOf = (t: Target, env: Env): Verdict => (typeof t.verdict === 'string' ? t.verdict : t.verdict[env]);

/** 원문의 누를 마디 만드는 자리 */
interface Site {
  at: string;
  key: string;
  attrs: string;
}
/** h('button'|'a'|'input'|'select'|'textarea'|'label', {…}) 자리마다 열쇠(첫 클래스 — 없으면 input[type=…]·태그)와 속성 글, iconButton( 자리는 button.btn(dom.ts 도우미) */
function scan(file: string, text: string): Site[] {
  const out: Site[] = [];
  const at = (i: number) => `${file}:${text.slice(0, i).split('\n').length}`;
  for (const m of text.matchAll(/(?<![\w$.])h\(\s*['"`](button|a|input|select|textarea|label)['"`]\s*,\s*\{/g)) {
    const start = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      if (text[end] === '{') depth++;
      else if (text[end] === '}' && --depth === 0) break;
    }
    const attrs = text.slice(start, end + 1);
    const cls = /\bclass:\s*['"`]([^'"`$]*)/.exec(attrs)?.[1]?.trim().split(/\s+/)[0];
    const type = /\btype:\s*'([a-z]+)'/.exec(attrs)?.[1];
    out.push({ at: at(m.index ?? 0), key: cls ? `${m[1]}.${cls}` : m[1] === 'input' && type ? `input[type=${type}]` : m[1]!, attrs });
  }
  for (const m of text.matchAll(/(?<![\w$.])iconButton\(/g)) {
    const i = m.index ?? 0;
    if (!/function\s+$/.test(text.slice(Math.max(0, i - 9), i))) out.push({ at: at(i), key: 'button.btn', attrs: '' });
  }
  return out;
}
const SITES = SRC.flatMap(([f, t]) => scan(f, t));
const sitesOf = (keys: string[]): Site[] => SITES.filter((s) => keys.includes(s.key));

/** 감사 표(.runtime/r234 표 — README 개발 절 234차 문단) */
const TARGETS: Target[] = [
  { name: '#1 제목 막대 단추', sel: '.title-actions .btn', keys: ['button.btn', 'a.btn'], verdict: 'size', size: (R) => [btnW(R, ['.title-actions .btn', '.btn'], ICON), btnH(R, ['.title-actions .btn', '.btn'])] },
  { name: '#2 도구 막대 단추', sel: '.toolbar .btn', keys: ['button.btn'], verdict: 'size', size: (R) => [btnW(R, ['.toolbar .btn', '.btn'], ICON), btnH(R, ['.toolbar .btn', '.btn'])] },
  { name: '#3 작은 단추', sel: '.btn.small', keys: ['button.btn'], verdict: 'size', size: (R) => [btnW(R, ['.btn.small', '.btn'], LEAST), btnH(R, ['.btn.small', '.btn'])] },
  { name: '#4 큰 단추(시작 화면)', sel: '.btn.large', keys: ['button.btn'], verdict: 'size', size: (R) => [btnW(R, ['.btn.large', '.btn'], ICON), btnH(R, ['.btn.large', '.btn'])] },
  { name: '#5 그 밖 단추(여는 중 취소·그림 저장)', sel: '.busy-actions .btn, .dlg-actions .btn', keys: ['button.btn'], verdict: 'size', size: (R) => [btnW(R, ['.btn'], LEAST), btnH(R, ['.btn'])] },
  {
    name: '#6 나무 도구 ⋯',
    sel: '.tree-more-btn',
    keys: ['button.btn'],
    verdict: mouse('hidden', 'size'),
    size: (R) => box(R, '.icon-btn'),
    // 손가락 휴대폰 시트에서만 보인다(51차)
    check: (R) => (R.get('.tree-more-btn')?.display === 'none' && R.get('.tree-tools > .tree-more-btn')?.display === undefined ? [] : ['보임']),
  },
  { name: '#7 아이콘 단추', sel: '.icon-btn', keys: ['button.icon-btn'], verdict: 'size', size: (R) => box(R, '.icon-btn') },
  { name: '#8 갈래 단추', sel: '.seg-btn', keys: ['button.seg-btn'], verdict: 'size', size: (R) => box(R, '.seg-btn', 'min-width', 'min-height') },
  {
    name: '#9 측정 종류',
    sel: '.mb-kind .seg-btn',
    keys: ['button.seg-btn'],
    verdict: 'size',
    size: (R) => [atLeast(px(R, '.seg-btn', 'min-width'), padX(R, ['.mb-kind .seg-btn', '.seg-btn']) + LEAST), pick(R, ['.mb-kind .seg-btn', '.seg-btn'], 'min-height')],
  },
  { name: '#10 패널 탭', sel: '.tab', keys: ['button.tab'], verdict: 'size', size: (R) => [atLeast(px(R, '.tab', 'min-width'), padX(R, ['.tab']) + LEAST), px(R, '.tab', 'height')] },
  {
    name: '#11 메뉴 항목',
    sel: '.menu-item',
    keys: ['button.menu-item'],
    verdict: 'size',
    size: (R) => [px(R, '.menu', 'min-width') - padX(R, ['.menu']) - 2 * border(R, '.menu'), px(R, '.menu-item', 'min-height')],
  },
  { name: '#12 언어 단추', sel: '.language-trigger', keys: [], verdict: 'size', size: (R) => [pick(R, ['.titlebar .language-trigger', '.language-trigger'], 'width'), pick(R, ['.titlebar .language-trigger', '.language-trigger'], 'height')] },
  {
    name: '#13 언어 목록 항목',
    sel: '.language-list button',
    keys: [],
    verdict: 'size',
    size: (R) => [px(R, '.language-list', 'width') - padX(R, ['.language-list']) - 2 * border(R, '.language-list'), pick(R, ['html .language-list button', '.language-list button'], 'min-height')],
  },
  { name: '#14 나무 줄', sel: '.tree-row', keys: [], verdict: 'size', size: (R) => [ROW, px(R, '.tree-row', 'min-height')] },
  { name: '#15 나무 펼침', sel: '.twisty', keys: ['button.twisty'], verdict: 'size', size: (R) => box(R, '.twisty') },
  { name: '#16 눈', sel: '.eye', keys: ['button.eye'], verdict: 'size', size: (R) => box(R, '.eye') },
  {
    name: '#17 띠 단추(측정 띠·고른 부품 카드·격리 띠)',
    sel: '.mb-btn',
    keys: ['button.mb-btn'],
    verdict: 'size',
    size: (R) => [atLeast(pick(R, ['.measure-bar .mb-btn', '.mb-btn'], 'min-width'), padX(R, ['.measure-bar .mb-btn', '.mb-btn']) + 2 * border(R, '.mb-btn') + LEAST), px(R, '.mb-btn', 'height')],
  },
  { name: '#18 띠 아이콘 단추', sel: '.mb-btn.icon', keys: ['button.mb-btn'], verdict: 'size', size: (R) => [px(R, '.mb-btn.icon', 'width'), px(R, '.mb-btn', 'height')] },
  { name: '#19 최근 문서 줄', sel: '.recent-open', keys: ['button.recent-open'], verdict: 'size', size: (R) => [ROW, px(R, '.recent-open', 'min-height')] },
  { name: '#20 모두 지우기', sel: '.recent-clear', keys: ['button.recent-clear'], verdict: 'size', size: (R) => [padX(R, ['.recent-clear']) + LEAST, px(R, '.recent-clear', 'min-height')] },
  { name: '#21 이름 거르기 칸', sel: 'label.tree-search', keys: ['label.tree-search'], verdict: 'size', size: (R) => [ROW, px(R, '.tree-search', 'height')] },
  {
    name: '#22 이름 거르기 입력',
    sel: '.tree-filter',
    keys: ['input.tree-filter'],
    verdict: 'size',
    // 칸 안(높이 100% — 감싼 라벨 높이 − 테두리), 폭은 라벨 − 여백 − 돋보기 15 − 틈
    size: (R) => [ROW - padX(R, ['.tree-search']) - 15 - atLeast(px(R, '.tree-search', 'gap')), px(R, '.tree-search', 'height') - 2 * border(R, '.tree-search')],
  },
  { name: '#23 단면 숫자 칸', sel: '.section-num', keys: ['input.section-num'], verdict: 'size', size: sectionNum },
  { name: '#24 분해 거리 칸', sel: '.explode-num', keys: ['input.explode-num'], verdict: 'size', size: (R) => box(R, '.explode-num') },
  { name: '#25 분해 거리 라벨', sel: '.explode-distance', keys: ['label.explode-distance'], verdict: 'size', size: (R) => box(R, '.explode-num') },
  {
    name: '#26 고르기·숫자 칸',
    sel: '.dlg-select, .dlg-input',
    keys: ['select.dlg-select', 'input.dlg-input'],
    verdict: 'size',
    size: (R) => [DLG_COL, Math.min(px(R, '.dlg-select', 'min-height'), px(R, '.dlg-input', 'min-height'))],
  },
  { name: '#27 대화 상자 줄 라벨', sel: 'label.dlg-row', keys: ['label.dlg-row'], verdict: 'size', size: (R) => [ROW, px(R, '.dlg-select', 'min-height')] },
  { name: '#28 단면 손잡이', sel: '.section-handle', keys: [], verdict: 'size', size: (R) => box(R, '.section-handle') },
  {
    name: '#29 끌어다 놓기 칸',
    sel: '.dropzone',
    keys: [],
    verdict: 'size',
    // 위아래 여백 + 올리기 아이콘 44
    size: (R) => [ROW, padY(R, '.dropzone') + 44],
    seen: () => /h\(\s*'div',\s*\{ class: 'dropzone' \}/.test(srcOf('app.ts')) && /\bdrop\.addEventListener\('click'/.test(srcOf('app.ts')),
  },
  {
    name: '#30 보이기 칸 라벨',
    sel: 'label.cb-hit',
    keys: ['label.cb-hit'],
    verdict: mouse('spacing', 'size'),
    size: (R) => [atLeast(px(R, '.cb-hit', 'min-width'), UA_BOX), atLeast(px(R, '.cb-hit', 'min-height'), UA_BOX)],
    check: spacing,
  },
  {
    name: '#31 확인 칸',
    sel: 'input[type=checkbox]',
    keys: ['input[type=checkbox]'],
    verdict: mouse('ua', 'size'),
    // 휴대폰은 감싼 라벨(.cb-hit·label.check — 44)이 누르는 자리
    size: (R) => [atLeast(Math.min(or(px(R, '.cb-hit', 'min-width'), UA_BOX), ROW), UA_BOX), atLeast(Math.min(or(px(R, '.cb-hit', 'min-height'), UA_BOX), or(px(R, 'label.check', 'min-height'), UA_BOX)), UA_BOX)],
    check: (R) => [...authored(R, ['input[type=checkbox]', 'span.check input', 'label.check input', '.cb-hit input'], ['width', 'height', 'min-width', 'min-height']), ...spacing(R)],
  },
  {
    name: '#32 부품별 보이기 라벨',
    sel: '.vgrid-row > label.check',
    keys: ['label.check'],
    verdict: 'size',
    // 줄 첫 칸의 위아래 여백 3(초점 테두리 자리 — 54차)
    size: (R) => [ROW, atLeast(px(R, 'label.check', 'min-height'), LINE + padY(R, '.vgrid-row > .check:first-child'))],
  },
  {
    name: '#33 표현 PMI 보이기 상자 라벨',
    sel: 'label.all-check',
    keys: ['label.check'],
    verdict: mouse('spacing', 'size'),
    size: (R) => [UA_BOX + atLeast(px(R, 'label.check', 'gap')) + LEAST, atLeast(px(R, 'label.check', 'min-height'), LINE)],
    // 24px 원이 위아래로 넘는 만큼(12 − 높이/2)이 아래 여백·위(묶음 제목과 겹친 여백) 안 — 이웃(제목·표 머리 줄·손가락 안내)은 누를 칸이 아니다
    check: (R) => {
      const reach = 12 - LINE / 2;
      const below = margin(R, '.all-check')[2];
      const above = Math.max(margin(R, '.all-check')[0], margin(R, '.prop-group h3')[2]);
      return reach <= below && reach <= above ? [] : [`넘는 ${reach} · 아래 ${below} · 위 ${above}`];
    },
  },
  {
    name: '#34 이름 버튼(레이어·PMI·간섭 쌍)',
    sel: '.link-btn',
    keys: ['button.link-btn'],
    verdict: mouse('spacing', 'size'),
    size: (R) => [atLeast(px(R, '.link-btn', 'min-width')), atLeast(px(R, '.link-btn', 'min-height'), LINE + padY(R, '.link-btn'))],
    check: spacing,
  },
  {
    name: '#35 단면 밀대',
    sel: '.section-slider',
    keys: ['input.section-slider'],
    verdict: mouse('equivalent', 'size'),
    size: (R) => [px(R, '.section-slider', 'min-width'), px(R, '.section-slider', 'height')],
    // 높이는 브라우저 기본(작성자는 폭만), 같은 막대 숫자 칸이 같은 일(위치)을 하고 그 칸은 24 이상
    check: (R) => [...authored(R, ['.section-slider'], ['height', 'min-height']), ...(Math.min(...sectionNum(R)) >= 24 ? [] : ['숫자 칸 24 미만'])],
  },
  {
    name: '#36 분해 밀대',
    sel: '.explode-slider',
    keys: ['input.explode-slider'],
    verdict: mouse('ua', 'size'),
    size: (R) => [px(R, '.explode-slider', 'min-width'), px(R, '.explode-slider', 'height')],
    check: (R) => authored(R, ['.explode-slider'], ['height', 'min-height']),
  },
  {
    name: '#37 패널 크기 손잡이',
    sel: '.panel-resizer',
    keys: [],
    // 고르지 않음: 24px로 넓히면 3D 보기 끝·나무 줄 펼침·탭 윗부분을 가로채고, 손가락 기기처럼 띠를 더하면 패널 안이 옮겨진다(README 남은 일 163·234차 줄)
    verdict: mouse('design', 'size'),
    size: (R) => [or(px(R, '.panel-resizer', 'width'), ROW), or(px(R, '.panel-resizer', 'height'), ROW)],
  },
  { name: '#38 탭 본문(초점만)', sel: '.panel-body', keys: [], verdict: 'none', check: (R) => (R.get('.panel-body')?.overflow === 'auto' ? [] : ['굴림 칸 아님']) },
  {
    name: '#39 숨은 파일 칸',
    sel: 'input[type=file]',
    keys: ['input[type=file]', 'input.explode-file'],
    verdict: 'hidden',
    check: () => {
      const s = sitesOf(['input[type=file]', 'input.explode-file']);
      return s.length && s.every((x) => /\bhidden: true\b/.test(x.attrs)) ? [] : s.map((x) => x.at);
    },
  },
  {
    name: '#40 내려받기 링크',
    sel: 'a[download]',
    keys: ['a'],
    verdict: 'none',
    check: () => {
      const s = sitesOf(['a']);
      return s.length && s.every((x) => /\bdownload:/.test(x.attrs)) ? [] : s.map((x) => x.at);
    },
  },
  {
    name: '#41 앱 전 소개 링크(index.html)',
    sel: '.boot a',
    keys: [],
    verdict: 'inline',
    seen: () => /<main class="boot">[\s\S]*<a /.test(INDEX),
    // 링크는 모두 소개 문단 안(「·」로 가름), 글줄(15px × 1.7 = 25.5)이 24 이상이라 줄을 바꾼 링크끼리도 두 원이 겹치지 않는다
    check: () => {
      const boot = /<main class="boot">([\s\S]*?)<\/main>/.exec(INDEX)?.[1] ?? '';
      const links = boot.match(/<a /g)?.length ?? 0;
      const inP = (boot.match(/<p>[\s\S]*?<\/p>/g) ?? []).join('').match(/<a /g)?.length ?? 0;
      const m = /\.boot\{[^}]*font:(\d+)px\/([\d.]+)/.exec(INDEX);
      return [...(links > 0 && inP === links ? [] : [`문단 밖 링크 ${links - inP}`]), ...(m && Number(m[1]) * Number(m[2]) >= 24 ? [] : [`글줄 ${m?.[0] ?? '없음'}`])];
    },
  },
  { name: '#42 뷰 큐브(코어)', sel: '.v3d-cube', keys: [], verdict: 'core', seen: () => read('node_modules/opencad-viewer3d/src/viewer.ts').includes("cube.className = 'v3d-cube'") },
];

// ───────────────────────── 그린 화면(jsdom) ─────────────────────────

/** 누를 마디: 단추·링크·입력·라벨·역할·tabindex, 역할·tabindex 없이 끌기만 받는 단면 손잡이(187차 — 꾸밈) */
const INTERACTIVE = [
  'button',
  'a[href]',
  'a[download]',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role=button]',
  '[role=tab]',
  '[role=treeitem]',
  '[role=radio]',
  '[role=checkbox]',
  '[role=switch]',
  '[role=slider]',
  '[role=menuitem]',
  '[role=menuitemradio]',
  '[role=menuitemcheckbox]',
  '[role=option]',
  '[role=separator][tabindex]',
  '[tabindex]',
  '.section-handle',
].join(', ');

const tagOf = (el: Element): string => `${el.localName}${[...el.classList].map((c) => `.${c}`).join('')}`;
/** 마디마다 맞는 표 줄(없으면 빠진 것) */
function covered(els: Element[]): { found: string[]; missing: string[]; rows: Set<Target> } {
  const rows = new Set<Target>();
  const found: string[] = [];
  const missing: string[] = [];
  for (const el of els) {
    const hit = TARGETS.filter((t) => el.matches(t.sel));
    for (const t of hit) rows.add(t);
    if (hit.length) found.push(`${tagOf(el)} → ${hit.map((t) => t.name).join(' | ')}`);
    else missing.push(tagOf(el));
  }
  return { found, missing, rows };
}

/** filecells209 모형: 뿌리 'asm' 아래 이름 없는 부품(입체 둘·이름 없는 속성)과 부품 「블록」, 레이어 배정 둘 */
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
  w.place(root, w.product(stepString('블록'), [cube(w, 10, [40, 0, 0], '').solid], mm), w.ax2([0, 0, 0]), '');
  w.textProperty(pd, '', '', 'ACME', mm);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'','',(#${a.solid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'L1','',(#${b.solid})`);
  return w.bytes('');
}
const BYTES = model();
const SCENE = stepToScene(BYTES, { name: 'a.stp' });
const META = SCENE.meta as unknown as StepMeta;
const GROUPS: GroupInfo[] = [...new Set(SCENE.meshes.map((m) => m.group ?? ''))].map((name) => ({ name, visible: true, count: SCENE.meshes.filter((m) => m.group === name).length }));
const BARE = `0/${META.products[0]!.children.findIndex((n) => n.name !== '블록')}`;
const IDS = SCENE.meshes.map((m) => m.id);
const PAIR: InterferencePair = { a: IDS[0]!, b: IDS[2]!, count: 3, trisA: [], trisB: [] };

/** 고른 부품이 있고 뿌리·그 부품을 펼친 채, 간섭 결과 쌍 하나 */
function stepDoc(): StepDoc {
  const d = createDoc('a.stp', BYTES.length, { scene: SCENE, ms: 1 });
  d.density = 7850;
  d.selKey = BARE;
  d.expanded = new Set(['0', BARE]);
  d.interference = { running: false, done: 0, total: 0, result: { pairs: [PAIR], tested: 2, ms: 1 } };
  return d;
}

/** PMI 탭: 표현 PMI 하나(보이기 상자·이름 버튼), 면에 이어진 의미 PMI 하나(이름 버튼), 저장된 보기 하나 */
const PMI_META = {
  products: [],
  pmi: {
    presentations: [{ id: 'pmi1', name: '', type: 'ANNOTATION_OCCURRENCE', stepId: 21 }],
    semantic: [{ kind: 'dimension', type: 'DIMENSIONAL_SIZE', name: 'D1', value: '10', stepId: 22, faces: [7] }],
    views: [{ id: 23, name: 'V1', target: [0, 0, 0], dir: [0, 0, 1], up: [0, 1, 0], distance: 10, projection: 'orthographic', height: 10 }],
  },
};
const pmiDoc = (): StepDoc => createDoc('p.stp', 1, { scene: { meshes: [], lines: [], meta: PMI_META }, ms: 1 } as unknown as ParseResult);

function panelHost(d: StepDoc, touch: boolean): PanelHost {
  const t: Record<string, unknown> = {
    measuring: false,
    measureKind: 'points',
    touch,
    multiPick: false,
    fmt: new Fmt('mm'),
    isVisible: () => true,
    groups: () => GROUPS,
    setDensity: (v: number | null) => (d.density = v),
  };
  return new Proxy(t, { get: (o, k) => (k in o ? o[k as string] : () => {}) }) as unknown as PanelHost;
}

/** 패널 하나(나무 조각·정보 탭·PMI 탭·물리 속성은 앱이 뷰어를 만들 때 넣는다 — 시험은 모듈을 바로 넣는다, filecells209 꼴) */
function panelOf(d: StepDoc, tab: PanelTab, touch: boolean): HTMLElement {
  const p = Object.assign(new Panel(panelHost(d, touch)), { phys: PHYS, kit: { ...TV, ...PV, infoView, pmiView } });
  p.show(d);
  p.setTab(tab);
  return p.el;
}

const noop = (): void => {};
const TOOL_HOST: ToolbarHost = {
  hasDoc: true, hasSelection: true, projection: 'perspective', renderMode: 'shadedEdges', gridOn: true, cubeOn: false, axesOn: true,
  measuring: false, panelOpen: false, pickUnit: 'part', multiPick: false, sectionAxis: null, sectionOn: false, hiddenEdges: false,
  profiles: false, partColors: false, ambientOcclusion: false, explodeOpen: false,
  fit: noop, fitSelection: noop, setView: noop, goHome: noop, setHome: noop, setProjection: noop, setRenderMode: noop, toggleHiddenEdges: noop,
  toggleProfiles: noop, togglePartColors: noop, toggleAmbientOcclusion: noop, toggleExplode: noop, toggleGrid: noop, toggleCube: noop,
  toggleAxes: noop, toggleMeasure: noop, setPickUnit: noop, toggleMultiPick: noop, setSectionAxis: noop, savePng: noop, exportItems: () => [], togglePanel: noop,
};
/** 명령·켜고 끄기·하나 고르기·쓸 수 없음(앞 구분선) 항목 */
const MENU: MenuItem[] = [
  { label: '전체 보기', run: noop },
  { label: '격자', toggle: true, checked: true, run: noop },
  { label: '원근', checked: false, run: noop },
  { label: '고르기 풀기', disabled: true, sep: true, run: noop },
];
const SNAP = { snapshotSize: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 800 * scale, height: 600 * scale, scale }) } as unknown as Pick<Viewer3d, 'snapshotSize'>;

/** 주요 화면을 그려 누를 마디를 모은다(touch: 휴대폰 꼴 — 패널 host.touch·좁은 화면 손잡이) */
function screens(touch: boolean): Element[] {
  const root = h('div');
  document.body.append(root);
  const tb = new Toolbar(TOOL_HOST);
  const panels = (['tree', 'props', 'layers', 'info'] as PanelTab[]).map((tab) => panelOf(stepDoc(), tab, touch));
  panels.push(panelOf(pmiDoc(), 'pmi', touch));
  root.append(tb.el, ...panels);
  // 패널 크기 손잡이(app.ts처럼 패널 첫 자식)
  const narrow = { matches: touch, addEventListener: noop } as unknown as MediaQueryList;
  panels[0]!.prepend(new PanelResizer(root, panels[0]!, h('div'), narrow, null).el);
  const bar = new SectionBar({ viewerRef: null, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: noop, toast: noop });
  const explode = new ExplodeControls(noop, noop, {});
  root.append(bar.el, bar.handle, h('div', { class: 'explode-opts' }, ...explode.els));
  const lang = createLanguageMenu(languages, 'ko', async () => {});
  root.append(lang.element);
  const els = [...document.body.querySelectorAll(INTERACTIVE)];
  // 메뉴(문서 body에 붙는다)와 그림 저장 대화 상자 — 연 동안 그 안 마디
  openMenu(tb.el.querySelector<HTMLElement>('button')!, MENU, '메뉴');
  els.push(...document.querySelector('.menu')!.querySelectorAll(INTERACTIVE));
  closeMenu();
  const dlg = openDialog('그림 저장', imageDialogBody(SNAP, { scale: 1, transparent: false, overlays: true }, noop));
  els.push(...dlg.el.querySelectorAll(INTERACTIVE));
  dlg.close();
  lang.dispose();
  root.remove();
  return els;
}

afterEach(() => {
  closeMenu();
  closeDialog();
  document.body.innerHTML = '';
});

describe('234차: 누를 자리 감사 표 — CSS 셈(넓은 화면 1280 마우스·320px 마우스 창·휴대폰 390 손가락)', () => {
  it('셈의 바탕: 본문 글 13px/1.45(단추·입력 칸은 물려받음), 아이콘 18, 환경마다 미디어 조건으로 고른 규칙이 다르다', () => {
    expect(CSS).toMatch(/\nhtml,\nbody \{[^}]*\n {2}font: 13px\/1\.45 var\(--font\);/);
    expect(CSS).toMatch(/\nbutton,\ninput,\nselect \{\n {2}font: inherit;/);
    expect(srcOf('dom.ts')).toMatch(/export function icon\(name: IconName, size = 18\)/);
    expect(RULES.wide.get('.btn')?.['min-height']).toBeUndefined();
    expect(RULES.phone.get('.btn')?.['min-height']).toBe('44px');
    expect(RULES.narrow.get('.tab')?.['padding-inline']).toBe('8px');
    expect(RULES.wide.get('.tab')?.['padding-inline']).toBeUndefined();
    expect(RULES.narrow.get('.panel-resizer')?.height).toBe('14px');
    expect(TARGETS).toHaveLength(42);
  });

  it('「크기」 꼴은 폭·높이 모두 24px 이상', () => {
    const bad: string[] = [];
    for (const t of TARGETS)
      for (const env of ENV_NAMES) {
        if (verdictOf(t, env) !== 'size') continue;
        const [w, hh] = t.size!(RULES[env]);
        if (!(w >= 24 && hh >= 24)) bad.push(`${env} ${t.name} ${w}×${hh}`);
      }
    expect(bad).toEqual([]);
  });

  it('예외 꼴은 그 조건을 지킨다 — 간격(두 가운데 사이·줄 사이·여백)·브라우저 기본(작성자 크기 없음)·같은 기능·글줄 안·숨김·대상 아님', () => {
    const bad: string[] = [];
    for (const t of TARGETS)
      for (const env of ENV_NAMES) {
        const v = verdictOf(t, env);
        if (v === 'size' || v === 'design' || v === 'core') continue;
        // 간격 꼴은 정말 24 미만(24를 넘으면 「크기」로 옮긴다)
        if (v === 'spacing' && !(Math.min(...t.size!(RULES[env])) < 24)) bad.push(`${env} ${t.name}: 24 이상`);
        if (!t.check) bad.push(`${env} ${t.name}: 셈 없음`);
        for (const m of t.check?.(RULES[env]) ?? []) bad.push(`${env} ${t.name}: ${m}`);
      }
    expect(bad).toEqual([]);
  });

  it('고르지 않음은 패널 크기 손잡이 하나 — 넓은 화면 옆 8px·좁은 마우스 창 시트 14px(지금 24 미만, 고치면 표를 고친다), 손가락 기기는 24px', () => {
    const design = TARGETS.filter((t) => ENV_NAMES.some((e) => verdictOf(t, e) === 'design'));
    expect(design.map((t) => t.sel)).toEqual(['.panel-resizer']);
    const t = design[0]!;
    expect(t.size!(RULES.wide)).toEqual([8, ROW]);
    expect(t.size!(RULES.narrow)).toEqual([ROW, 14]);
    expect(t.size!(RULES.phone)).toEqual([ROW, 24]);
  });

  it('표 요약: 마우스 화면 24px 미만 8꼴 — 예외 7(간격 3·브라우저 기본 3·글줄 안 1)·고친 것 0·고르지 않음 1, 휴대폰은 앱 전 소개 링크(글줄 안)뿐', () => {
    const under = (env: Env) => TARGETS.filter((t) => ['spacing', 'ua', 'equivalent', 'inline', 'design'].includes(verdictOf(t, env))).map((t) => t.sel);
    const MOUSE = ['label.cb-hit', 'input[type=checkbox]', 'label.all-check', '.link-btn', '.section-slider', '.explode-slider', '.panel-resizer', '.boot a'];
    expect(under('wide')).toEqual(MOUSE);
    expect(under('narrow')).toEqual(MOUSE);
    expect(under('phone')).toEqual(['.boot a']);
  });
});

describe('234차: 그린 화면의 누를 마디가 모두 표에 든다(넓은 화면·휴대폰 꼴)', () => {
  it('도구 막대·패널 다섯 탭·패널 크기 손잡이·단면 막대와 손잡이·분해 손질 칸·메뉴·그림 저장 대화 상자·언어 메뉴 — 빠진 마디 0, 두 꼴의 마디가 같고, 표 줄마다 쓰인다', () => {
    const wide = covered(screens(false));
    const phone = covered(screens(true));
    expect(wide.missing).toEqual([]);
    expect(phone.missing).toEqual([]);
    expect(phone.found).toEqual(wide.found);
    // 그린 것이 비지 않았다: 원문 열쇠가 없는 줄(공용 도구·역할·tabindex·끌기 손잡이로만 누를 마디)과 표·탭·대화 상자 칸이 DOM에서 맞았다
    const seenInDom = TARGETS.filter((t) => wide.rows.has(t)).map((t) => t.name.split(' ')[0]);
    for (const n of ['#2', '#3', '#5', '#6', '#7', '#8', '#10', '#11', '#12', '#13', '#14', '#15', '#16', '#21', '#22', '#23', '#24', '#25', '#26', '#27', '#28', '#30', '#31', '#32', '#33', '#34', '#35', '#37', '#38'])
      expect(seenInDom, n).toContain(n);
    // 낡은 줄 없음: 표 줄마다 원문 열쇠·그린 DOM·쪽 글(포인터만 받는 칸·앱 전 쪽·코어) 어딘가에 쓰인다
    const keys = new Set(SITES.map((s) => s.key));
    expect(TARGETS.filter((t) => !t.keys.some((k) => keys.has(k)) && !wide.rows.has(t) && !t.seen?.()).map((t) => t.name)).toEqual([]);
  });
});

describe('234차: 원문의 누를 마디 만드는 자리도 모두 표에 든다(앱 전체를 띄우지 않아 그리지 않는 app.ts 칸까지)', () => {
  it('src/app의 h(button·a·input·select·textarea·label)·iconButton 자리마다 열쇠가 표에 있고, 누를 마디를 createElement로 만드는 자리는 없다', () => {
    const keys = new Set(TARGETS.flatMap((t) => t.keys));
    expect(SITES.filter((s) => !keys.has(s.key)).map((s) => `${s.at} ${s.key}`)).toEqual([]);
    // 원문 셈이 비지 않았다(app.ts 칸 — 제목 막대 링크·시작 화면·측정 띠·최근 문서·분해 밀대·숨은 파일 칸·내려받기)
    const appKeys = new Set(SITES.filter((s) => s.at.startsWith('app.ts:')).map((s) => s.key));
    for (const k of ['a.btn', 'button.btn', 'button.mb-btn', 'button.seg-btn', 'button.icon-btn', 'button.recent-open', 'button.recent-clear', 'input.explode-slider', 'input[type=file]', 'a']) expect([...appKeys], k).toContain(k);
    expect(SRC.filter(([, t]) => /createElement\(\s*['"`](button|a|input|select|textarea|label)['"`]/.test(t)).map(([f]) => f)).toEqual([]);
  });
});

describe('234차: 셈이 헛돌지 않는다', () => {
  it('펼침 18×18(SKP 235차 고치기 전 꼴)은 「크기」 셈이, 이름 버튼 최소 폭이 없으면(162차 꼴) 간격 셈이 잡는다', () => {
    const twisty = TARGETS.find((t) => t.sel === '.twisty')!;
    const small: Rules = new Map(RULES.wide);
    small.set('.twisty', { ...RULES.wide.get('.twisty'), width: '18px', height: '18px' });
    expect(twisty.size!(small)).toEqual([18, 18]);
    const link = TARGETS.find((t) => t.sel === '.link-btn')!;
    const bare: Rules = new Map(RULES.wide);
    const o = { ...RULES.wide.get('.link-btn') };
    delete o['min-width'];
    bare.set('.link-btn', o);
    expect(link.check!(bare)).toEqual(['확인 칸 ↔ 이름 버튼 12.5']);
    expect(link.check!(RULES.wide)).toEqual([]);
  });

  it('표 밖 새 버튼(DOM)·새 원문 자리(태그.클래스)는 잡힌다', () => {
    expect(covered([h('button', { type: 'button', class: 'new-target' })]).missing).toEqual(['button.new-target']);
    const keys = new Set(TARGETS.flatMap((t) => t.keys));
    expect(
      scan('x.ts', "const b = h('button', { type: 'button', class: 'new-target' });\nconst c = h(\n  'input',\n  { type: 'range' },\n);")
        .map((s) => s.key)
        .filter((k) => !keys.has(k)),
    ).toEqual(['button.new-target', 'input[type=range]']);
  });
});

// ───────────────────────── 236차: 누를 자리마다 키보드 길(WCAG 2.1.1·2.4.7·2.5.7) ─────────────────────────

/**
 * (가) 닿는 길 — tab: 제 칸이 Tab 멈춤, rove: 화살표로 도는 무리 안(탭·라디오·도구 막대·나무·메뉴 — 멈춤 하나), label: 감싼 입력 칸이 Tab 멈춤,
 * alt: 제 칸은 키를 받지 않고 같은 일을 하는 다른 칸·키(via·viaEv), none: 누를 일 없음(숨은 파일 칸·내려받기·속성·정보 밖 탭 본문)
 */
type Reach = 'tab' | 'rove' | 'label' | 'alt' | 'none';
/** (나) 누르기 — native: 브라우저 기본 조작(button·a[href]·input·select), keys: 앱 keydown(keys), scroll: 브라우저 굴림 키(keys.ts controlOf가 앱 키로 보내지 않음), label: 감싼 칸, none: 키를 받지 않는 칸 */
type Press = 'native' | 'keys' | 'scroll' | 'label' | 'none';
/** (다) 초점 — global: 전역 :focus-visible 바깥선, inset: 그 칸 :focus-visible 안쪽(outline-offset 음수), replace: 바깥선을 끄고 다른 표시(REPLACED), inner: 라벨 안 입력 칸, core: 코어 캔버스, none: 초점을 받지 않음 */
type Focus = 'global' | 'inset' | 'replace' | 'inner' | 'core' | 'none';
interface Kbd {
  reach: Reach[];
  press: Press;
  focus: Focus;
  /** press keys: 처리 자리(파일·그 자리 글)와 받는 키(그 뒤 2,000자 안에 따옴표 리터럴로) */
  keys?: { file: string; at: string; keys: string[] };
  /** reach alt: 같은 일을 하는 표 줄(선택자 — Tab·무리로 닿는 줄)과 키 근거(파일·정규식) */
  via?: string[];
  viaEv?: [file: string, re: RegExp][];
  /** (라) 이 칸에서 받는 포인터 끌기(DRAGS 이름) */
  drag?: string;
}
const kb = (reach: Reach | Reach[], press: Press, focus: Focus, more: Partial<Kbd> = {}): Kbd => ({ reach: typeof reach === 'string' ? [reach] : reach, press, focus, ...more });
const TAB = kb('tab', 'native', 'global');
const ROVE = kb('rove', 'native', 'global');
const LABEL = kb('label', 'label', 'inner');
const CORE_VIEWER = 'node_modules/opencad-viewer3d/src/viewer.ts';
/** 근거 글(src/app 파일 이름 또는 저장소 경로) */
const textOf = (file: string): string => (file.includes('/') ? read(file) : srcOf(file));

/** 감사 표 42꼴의 키보드 길(.runtime/r236 표 — README 개발 절 236차 문단). 열쇠는 TARGETS 번호 — 표에 새 줄을 더하면 여기에도 적어야 통과한다 */
const KBD: Record<string, Kbd> = {
  '#1': TAB,
  '#2': ROVE,
  '#3': TAB,
  '#4': TAB,
  '#5': TAB,
  '#6': TAB,
  '#7': TAB,
  // 단면 축·분해 방식·방향은 라디오 무리, 옮기기·스냅·손질 파일·되돌리기는 낱 단추 — 초점은 갈래 묶음 안쪽(55차)
  '#8': kb(['tab', 'rove'], 'native', 'inset'),
  '#9': kb('rove', 'native', 'inset'),
  '#10': kb('rove', 'native', 'inset'),
  '#11': kb('rove', 'native', 'replace'),
  '#12': TAB,
  '#13': kb('rove', 'native', 'inset'),
  '#14': kb('rove', 'keys', 'inset', { keys: { file: 'treeview.ts', at: "item.addEventListener('keydown'", keys: ['Enter', ' ', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'] } }),
  // 펼침은 Tab 멈춤이 아니다(aria-hidden) — 줄의 →·←가 펼치고 접는다
  '#15': kb('alt', 'none', 'none', {
    via: ['.tree-row'],
    viaEv: [
      ['treeview.ts', /k === 'ArrowRight' && r\.hasChildren\) \(r\.open \? focusAt\(i \+ 1\) : toggle\(r\)\)/],
      ['treeview.ts', /k === 'ArrowLeft' && \(r\.open \|\| parent\[i\]! >= 0\)\) \(r\.open \? toggle\(r\)/],
    ],
  }),
  // 눈은 줄과 같은 tabindex(treeview.ts setActive — 멈춤 줄에서 Tab 한 번)
  '#16': ROVE,
  '#17': TAB,
  '#18': TAB,
  '#19': TAB,
  '#20': TAB,
  '#21': LABEL,
  '#22': kb('tab', 'native', 'replace'),
  '#23': TAB,
  '#24': TAB,
  '#25': LABEL,
  '#26': TAB,
  '#27': LABEL,
  // 단면 손잡이는 꾸밈(187차 — aria-hidden), 같은 값을 밀대(#35)·숫자 칸(#23 — Enter 바로 적용)이 나른다
  '#28': kb('alt', 'none', 'none', {
    via: ['.section-slider', '.section-num'],
    viaEv: [['sectionbar.ts', /this\.num\.addEventListener\('keydown', \(e\) => \{\s*if \(e\.key === 'Enter'\)/]],
    drag: '단면 손잡이 끌기',
  }),
  // 끌어다 놓기 칸(div — 누르기만)은 안의 「파일 열기」(#4)·Ctrl·⌘+O가 같은 일
  '#29': kb('alt', 'none', 'none', {
    via: ['.btn.large'],
    viaEv: [
      ['keys.ts', /\(k\.key === 'o' \|\| k\.key === 'O'\)\) return 'open'/],
      ['app.ts', /class: 'btn primary large', 'aria-keyshortcuts': 'Control\+O Meta\+O'/],
    ],
    drag: '파일 끌어다 놓기',
  }),
  '#30': LABEL,
  '#31': TAB,
  '#32': LABEL,
  '#33': LABEL,
  // Enter·Space는 강조 켜고 끄기(detail 0) — 두 번 누르기(맞춰 보기)는 키로 강조한 뒤 고른 부품 카드 「맞춰 보기」·도구 막대 「고른 부품 보기」
  '#34': TAB,
  '#35': kb('tab', 'native', 'global', { drag: '밀대 손잡이 끌기' }),
  '#36': kb('tab', 'native', 'global', { drag: '밀대 손잡이 끌기' }),
  '#37': kb('tab', 'keys', 'replace', { keys: { file: 'resize.ts', at: 'private key(e: KeyboardEvent)', keys: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Home'] }, drag: '패널 크기 끌기' }),
  // 속성·정보 탭은 본문이 Tab 멈춤(굴림 칸), 다른 탭은 본문 안 칸이 멈춤
  '#38': kb(['tab', 'none'], 'scroll', 'inset'),
  '#39': kb('none', 'none', 'none'),
  '#40': kb('none', 'none', 'none'),
  '#41': TAB,
  // 뷰 큐브(코어 캔버스): 정해진 방향은 1~7(코어)·Home 홈 뷰·「표준 뷰」 메뉴 — 캔버스 초점은 코어 테마(안쪽 2px)
  '#42': kb('alt', 'none', 'core', {
    via: ['.toolbar .btn'],
    viaEv: [
      [CORE_VIEWER, /else if \(VIEW_KEYS\[e\.key\]\) this\.setView/],
      ['toolbar.ts', /label: '홈 뷰', hint: 'Home'/],
      ['toolbar.ts', /\.\.\.VIEW_MENU\.map\(/],
      ['node_modules/opencad-viewer3d/src/theme.ts', /':where\(canvas\.v3d-gl\):focus-visible\{outline:2px solid/],
      [CORE_VIEWER, /canvas\.tabIndex = 0;/],
    ],
    drag: '3D 돌리기',
  }),
};
const kbdOf = (t: Target): Kbd | undefined => KBD[t.name.split(' ')[0]!];

/** (라) 포인터 끌기·누르고 있기와 키보드 길·한 점 포인터 대안(2.5.7). verdict design = 키가 없다(새 키 배정 — 고르지 않음, README 남은 일 236차 줄) */
interface Drag {
  name: string;
  /** 받는 자리(파일 — src/app 이름 또는 저장소 경로, 정규식) */
  at: [file: string, re: RegExp];
  key: string;
  keyEv: [file: string, re: RegExp][];
  tap: string;
  verdict: 'alt' | 'design';
}
const DRAGS: Drag[] = [
  { name: '패널 크기 끌기', at: ['resize.ts', /addEventListener\('pointermove', \(e\) => this\.move\(e\)\)/], key: '화살표 ±16·Home', keyEv: [['resize.ts', /const grow = n \? 'ArrowUp' : 'ArrowLeft';/]], tap: '한 번 누르기 기본 ↔ 가장 큼(173차)·두 번 누르기 기본', verdict: 'alt' },
  {
    name: '단면 손잡이 끌기',
    at: ['sectionbar.ts', /this\.handle\.addEventListener\('pointermove'/],
    key: '단면 밀대 화살표·숫자 칸 Enter',
    keyEv: [
      ['sectionbar.ts', /type: 'range', class: 'section-slider'/],
      ['sectionbar.ts', /type: 'number', class: 'section-num'/],
    ],
    tap: '밀대 트랙 누르기·숫자 칸',
    verdict: 'alt',
  },
  {
    name: '밀대 손잡이 끌기',
    at: ['app.ts', /type: 'range', class: 'explode-slider'/],
    key: '화살표·Home·End·Page(브라우저 기본 — 앱 키로 보내지 않음)',
    keyEv: [['keys.ts', /\(k\.control === 'range' \|\| k\.control === 'scroll'\) && RANGE_KEYS\.has\(k\.key\)\) return null/]],
    tap: '트랙 누르기(브라우저 기본)',
    verdict: 'alt',
  },
  {
    name: '분해 손질 옮기기',
    at: ['explodedrag.ts', /t\.addEventListener\('pointermove', move, true\)/],
    key: '작업 메뉴 「거리로 옮기기…」(Enter) → 거리 칸, Ctrl·⌘+Z',
    keyEv: [['explodetool.ts', /label: '거리로 옮기기…', hint: 'Enter'/]],
    tap: '같은 작업 메뉴(오른쪽 누르기·길게 누르기·고른 부품 카드 「작업」)',
    verdict: 'alt',
  },
  { name: '정밀 조준', at: ['aim.ts', /this\.listen\('pointermove'/], key: '가상 커서(화살표·Enter)', keyEv: [['keysnap.ts', /v\.setKeyboardSnap\(\{/]], tap: '그냥 누르기', verdict: 'alt' },
  { name: '파일 끌어다 놓기', at: ['app.ts', /window\.addEventListener\('drop'/], key: 'Ctrl·⌘+O', keyEv: [['keys.ts', /\(k\.key === 'o' \|\| k\.key === 'O'\)\) return 'open'/]], tap: '「파일 열기」', verdict: 'alt' },
  {
    name: '나무 줄 길게 누르기 메뉴',
    at: ['treeview.ts', /item\.addEventListener\('pointerdown', \(ev\) => holdStart\(ev, menu\)\)/],
    key: 'Shift+F10·메뉴 키(줄 contextmenu), 고른 부품 카드 「작업」(같은 메뉴)',
    keyEv: [
      ['treeview.ts', /item\.addEventListener\('contextmenu'/],
      ['app.ts', /'aria-label': '작업 메뉴', 'aria-haspopup': 'menu'/],
    ],
    tap: '오른쪽 누르기·「작업」',
    verdict: 'alt',
  },
  { name: '겹친 것 목록 올림 미리 강조', at: ['ctxmenu.ts', /el\.addEventListener\('pointermove'/], key: '목록 줄 초점(같은 미리 강조)', keyEv: [['ctxmenu.ts', /el\.addEventListener\('focusin', \(e\) => show\(e\.target as Element\)\)/]], tap: '— (끌기 아님)', verdict: 'alt' },
  { name: '3D 보기 스냅 미리 보기·화살표 임자', at: ['app.ts', /this\.hostEl\.addEventListener\('pointermove'/], key: '가상 커서', keyEv: [['keysnap.ts', /v\.setKeyboardSnap\(\{/]], tap: '— (끌기 아님)', verdict: 'alt' },
  { name: '접선 잠금 버림', at: ['tangent.ts', /canvas\.addEventListener\('pointermove'/], key: 'Shift 뗌(shiftUp)', keyEv: [['tangent.ts', /shiftUp\(v: TangentViewer\): boolean/]], tap: '— (끌기 아님)', verdict: 'alt' },
  {
    name: '측정 점 찍기·고르기',
    at: [CORE_VIEWER, /clickCount/],
    key: '가상 커서 Enter·Tab 후보·X·Y·Z·L 잠금(「키보드로 3D 보기 다루기」 창)',
    keyEv: [
      ['keysnap.ts', /rows\.push\(\['X · Y · Z · L'/],
      ['app.ts', /openDialog\('키보드로 3D 보기 다루기'/],
    ],
    tap: '누르기',
    verdict: 'alt',
  },
  {
    name: '3D 돌리기',
    at: [CORE_VIEWER, /'orbit'/],
    key: '정해진 방향만 — 1~7·「표준 뷰」 메뉴·Home 홈 뷰·면 「정면으로 보기」(임의 각 키 없음)',
    keyEv: [
      [CORE_VIEWER, /else if \(VIEW_KEYS\[e\.key\]\) this\.setView/],
      ['toolbar.ts', /label: '홈 뷰', hint: 'Home'/],
    ],
    tap: '뷰 큐브 누르기 26방향·「표준 뷰」 메뉴',
    verdict: 'design',
  },
  { name: '3D 이동', at: [CORE_VIEWER, /'pan'/], key: '정해진 자리만 — F 전체 보기·「고른 부품 보기」·면 정면(임의 이동 키 없음)', keyEv: [[CORE_VIEWER, /if \(e\.key === 'f' \|\| e\.key === 'F'\) this\.fit\(\)/]], tap: '같은 정해진 자리', verdict: 'design' },
  { name: '3D 확대', at: [CORE_VIEWER, /onWheel/], key: '정해진 배율만 — F·「고른 부품 보기」(임의 배율 키 없음)', keyEv: [[CORE_VIEWER, /if \(e\.key === 'f' \|\| e\.key === 'F'\) this\.fit\(\)/]], tap: '마우스 휠(끌지 않음)', verdict: 'design' },
];
/** pointermove·포인터 붙잡기를 쓰는 파일(끌기·누르고 있기·올림 미리 보기를 받는 자리 — 새 파일이 생기면 DRAGS에 적어야 통과) */
const pointerFiles = (src: [string, string][]): string[] => src.filter(([, t]) => /'pointermove'|setPointerCapture\(|setPointerClaim\(/.test(t)).map(([f]) => f);

/** 스타일시트 규칙 글(주석 뺌 — 감싼 @media 머리·선택자·본문). 초점 규칙은 var() 값을 jsdom이 버릴 수 있어 글로 본다 */
function blocksOf(css: string): { media: string | null; sels: string[]; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { media: string | null; sels: string[]; body: string }[] = [];
  const stack: { head: string; from: number }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[{}]/g)) {
    const i = m.index ?? 0;
    if (m[0] === '{') stack.push({ head: text.slice(last, i).trim(), from: i + 1 });
    else {
      const b = stack.pop();
      if (b && !b.head.startsWith('@'))
        out.push({ media: stack.find((s) => s.head.startsWith('@media'))?.head ?? null, sels: b.head.split(',').map((s) => s.replace(/\s+/g, ' ').trim()), body: text.slice(b.from, i) });
    }
    last = i + 1;
  }
  return out;
}
type Block = ReturnType<typeof blocksOf>[number];
const BLOCKS = blocksOf(CSS);
const OUTLINE_OFF = /(^|;)\s*outline:\s*(none|0)\s*(;|$)/;
/** 바깥선을 끄는 규칙의 선택자(미디어 안이면 머리와 함께) */
const offRules = (bs: Block[]): string[] => bs.filter((b) => OUTLINE_OFF.test(b.body)).flatMap((b) => b.sels.map((s) => `${b.media ? `${b.media} ` : ''}${s}`));
/** 상태 가짜 클래스를 뺀 바탕 선택자(그 마디에 맞춰 본다) */
const baseOf = (s: string): string => s.replace(/:(focus-visible|focus-within|focus|hover)/g, '').trim();
/** 미디어 밖에서 바깥선을 끄는 자리, :focus-visible 바깥선을 안쪽으로 그리는 자리 */
const OFF_BASES = [...new Set(BLOCKS.filter((b) => b.media === null && OUTLINE_OFF.test(b.body)).flatMap((b) => b.sels.map(baseOf)))];
const INSET_BASES = [...new Set(BLOCKS.filter((b) => b.media === null && /outline-offset:\s*-\d/.test(b.body) && b.sels.every((s) => s.endsWith(':focus-visible'))).flatMap((b) => b.sels.map(baseOf)))];
/** 그 선택자를 품은 규칙 본문(media를 주면 그 글을 품은 미디어 안, 없으면 미디어 밖) */
const ruleBody = (sel: string, media: string | null = null): string =>
  BLOCKS.filter((b) => b.sels.includes(sel) && (media === null ? b.media === null : !!b.media?.includes(media)))
    .map((b) => b.body)
    .join(';');
/** 바깥선을 끈 자리마다 대신 보이는 표시(164차 감사 — 메뉴 항목 안쪽 그림자, 거르기 칸 감싼 테두리, 넓은 화면 손잡이 막대·좁은 창 안쪽 바깥선) */
const REPLACED: Record<string, () => string[]> = {
  '.panel-resizer': () => [
    ...(/background:\s*var\(--accent\)/.test(ruleBody('.panel-resizer:focus-visible::after')) ? [] : ['막대 강조색 없음']),
    ...(/outline:\s*2px solid var\(--accent\)/.test(ruleBody('.panel-resizer:focus-visible', 'max-width: 759.98px')) ? [] : ['좁은 창 바깥선 없음']),
  ],
  '.tree-filter': () => {
    const b = ruleBody('.tree-search:focus-within');
    return /border-color:\s*var\(--accent\)/.test(b) && /box-shadow:\s*0 0 0 1px var\(--accent\)/.test(b) ? [] : ['감싼 칸 강조색 테두리 없음'];
  },
  '.menu-item': () => (/box-shadow:\s*inset 0 0 0 2px var\(--accent\)/.test(ruleBody('.menu-item:focus-visible')) ? [] : ['안쪽 강조색 그림자 없음']),
};

const isNative = (el: Element): boolean => /^(button|input|select|textarea|summary)$/.test(el.localName) || (el.localName === 'a' && el.hasAttribute('href'));
/** 라벨이 맡은 입력 칸 */
const labelled = (el: Element): HTMLElement | null => (el as HTMLLabelElement).control ?? el.querySelector<HTMLElement>('input, select, textarea, button');

/** 마디가 실제로 닿는 길(표의 (가)와 견준다) */
function reachOf(el: Element): Reach {
  if (el.localName === 'label') {
    const c = labelled(el);
    return c && c.tabIndex >= 0 ? 'label' : 'alt';
  }
  const role = el.getAttribute('role') ?? '';
  if (/^(tab|radio|treeitem|menuitem|menuitemradio|menuitemcheckbox)$/.test(role) && el.parentElement?.closest('[role=tablist], [role=radiogroup], [role=tree], [role=menu]')) return 'rove';
  if (el.localName === 'button' && el.parentElement?.getAttribute('role') === 'toolbar') return 'rove';
  // 나무 줄의 눈은 줄과 같은 tabindex(treeview.ts setActive)
  if (el.matches('.eye') && el.closest('[role=treeitem]')) return 'rove';
  return (el as HTMLElement).tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true' ? 'tab' : 'alt';
}

/** 마디마다 맞는 표 줄의 (가)(나)(다)와 어긋난 것 */
function kbdIssues(els: Element[]): string[] {
  const out: string[] = [];
  for (const el of els)
    for (const t of TARGETS.filter((x) => el.matches(x.sel))) {
      const k = kbdOf(t);
      const at = `${tagOf(el)} ${t.name}`;
      if (!k) {
        out.push(`${at}: 키보드 판정 없음`);
        continue;
      }
      const r = reachOf(el);
      if (!(k.reach.includes(r) || (r === 'alt' && k.reach.includes('none')))) out.push(`${at}: 닿는 길 ${r}`);
      const press = { native: isNative(el), label: el.localName === 'label', keys: !isNative(el) && el.hasAttribute('role'), scroll: el.getAttribute('role') === 'tabpanel', none: r === 'alt' }[k.press];
      if (!press) out.push(`${at}: 누르기 ${k.press}`);
      const off = OFF_BASES.some((b) => el.matches(b));
      const inset = INSET_BASES.some((b) => el.matches(b));
      const focus = { global: !off && !inset, inset: inset && !off, replace: off, inner: (labelled(el)?.tabIndex ?? -1) >= 0, core: true, none: r === 'alt' }[k.focus];
      if (!focus) out.push(`${at}: 초점 ${k.focus}`);
    }
  return out;
}

describe('236차: 누를 자리 42꼴의 키보드 길 — 그린 DOM(넓은 화면·휴대폰 꼴)', () => {
  it('표 줄마다 키보드 판정이 있고, 그린 마디마다 닿는 길·키로 누르기·초점 꼴이 판정과 같다', () => {
    expect(TARGETS.filter((t) => !kbdOf(t)).map((t) => t.name)).toEqual([]);
    expect(Object.keys(KBD)).toEqual(TARGETS.map((t) => t.name.split(' ')[0]));
    const els = [...screens(false), ...screens(true)];
    expect(kbdIssues(els)).toEqual([]);
    // 그린 것에 닿는 길 넷(Tab·무리·라벨·대신 — 펼침·단면 손잡이)이 모두 들었다
    expect([...new Set(els.map(reachOf))].sort()).toEqual(['alt', 'label', 'rove', 'tab']);
    expect(els.filter((el) => reachOf(el) === 'alt').map(tagOf).sort()).toContain('div.section-handle');
  });

  it('원문: Tab 멈춤을 빼거나 옮기는 자리(tabindex·aria-hidden)는 무리·대신·없음 줄뿐이고, tabindex를 쓰는 파일은 일곱, 링크는 모두 href·download가 있다', () => {
    const odd = SITES.filter((s) => /\btabindex:|'aria-hidden': 'true'/.test(s.attrs));
    // 나무 눈·패널 탭(roving tabindex)·메뉴 항목(tabindex −1 — 화살표로 옮김)·나무 펼침(줄의 →·←)·숨은 파일 칸 둘
    expect(odd.map((s) => s.key).sort()).toEqual(['button.eye', 'button.menu-item', 'button.tab', 'button.twisty', 'input.explode-file', 'input[type=file]']);
    for (const s of odd) {
      const rows = TARGETS.filter((t) => t.keys.includes(s.key));
      expect(rows.length, s.at).toBeGreaterThan(0);
      for (const t of rows) expect(kbdOf(t)!.reach.some((r) => r !== 'tab'), `${s.at} ${t.name}`).toBe(true);
    }
    // 그 밖의 칸은 기본 Tab 멈춤(무리 칸은 keynav.ts·treeview.ts·panel.ts가 tabIndex를 옮긴다 — resize.ts 손잡이·panel.ts 탭 본문은 0)
    expect(SRC.filter(([, t]) => /\btabindex\b|\btabIndex\b/.test(t)).map(([f]) => f)).toEqual(['app.ts', 'explodetool.ts', 'keynav.ts', 'menu.ts', 'panel.ts', 'resize.ts', 'treeview.ts']);
    expect(SITES.filter((s) => s.key === 'a' || s.key.startsWith('a.')).every((s) => /\b(href|download):/.test(s.attrs))).toBe(true);
  });

  it('앱 keydown 칸(나무 줄·패널 크기 손잡이)은 그 자리에서 받는 키를 모두 처리하고, 대신 줄은 Tab·무리로 닿는 줄과 키 근거가 원문에 있다', () => {
    for (const [n, k] of Object.entries(KBD)) {
      if (k.press === 'keys') {
        const text = srcOf(k.keys!.file);
        const i = text.indexOf(k.keys!.at);
        expect(i, n).toBeGreaterThan(-1);
        expect(text, n).toContain("addEventListener('keydown'");
        const body = text.slice(i, i + 2000);
        for (const key of k.keys!.keys) expect(body, `${n} ${key}`).toContain(`'${key}'`);
      }
      if (k.reach.includes('alt')) {
        expect(k.via?.length, n).toBeGreaterThan(0);
        for (const sel of k.via!) {
          const row = TARGETS.find((t) => t.sel === sel);
          expect(row, `${n} ${sel}`).toBeDefined();
          expect(kbdOf(row!)!.reach.some((r) => r === 'tab' || r === 'rove'), `${n} ${sel}`).toBe(true);
        }
        for (const [file, re] of k.viaEv ?? []) expect(textOf(file), `${n} ${file}`).toMatch(re);
      }
    }
  });

  it('패널 크기 손잡이는 Tab 멈춤 separator — 넓은 화면 ←·→·좁은 화면 ↑·↓ 16px, Home 기본, End는 받지 않는다(고르지 않음 — README 남은 일 236차 줄)', () => {
    for (const narrowOn of [false, true]) {
      const root = h('div');
      const panel = h('div');
      document.body.append(root, panel);
      const r = new PanelResizer(root, panel, h('div'), { matches: narrowOn, addEventListener: noop } as unknown as MediaQueryList, null);
      panel.prepend(r.el);
      const prop = narrowOn ? '--sheet-h' : '--panel-w';
      const key = (k: string): boolean => r.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      expect([r.el.tabIndex, r.el.getAttribute('role'), r.el.getAttribute('aria-valuenow')]).toEqual([0, 'separator', '0']);
      // jsdom은 배치를 하지 않아 지금 크기 0 — 한 칸 키우면 가장 작은 크기(넓은 화면 240·시트 120)
      expect(key(narrowOn ? 'ArrowUp' : 'ArrowLeft')).toBe(false);
      expect(root.style.getPropertyValue(prop)).toBe(narrowOn ? '120px' : '240px');
      expect(key('End')).toBe(true);
      expect(root.style.getPropertyValue(prop)).toBe(narrowOn ? '120px' : '240px');
      expect(key('Home')).toBe(false);
      expect(root.style.getPropertyValue(prop)).toBe('');
    }
  });
});

describe('236차: 초점 보임(스타일시트 글 — 164차 감사)', () => {
  it('전역 바깥선 2px 강조색, 바깥선을 끈 자리는 셋(넓은 화면 손잡이·거르기 칸·메뉴 항목)이고 모두 대신 보이는 표시가 있다, 안쪽 바깥선 자리는 다섯', () => {
    expect(ruleBody(':focus-visible')).toMatch(/outline:\s*2px solid var\(--accent\);\s*outline-offset:\s*1px/);
    expect(offRules(BLOCKS)).toEqual(['.panel-resizer:focus-visible', '.tree-filter', '.menu-item:hover', '.menu-item:focus-visible']);
    expect(OFF_BASES).toEqual(Object.keys(REPLACED));
    for (const [sel, f] of Object.entries(REPLACED)) expect(f(), sel).toEqual([]);
    expect(INSET_BASES).toEqual(['.seg-btn', '.tab', '.panel-body', '.tree-row', '.language-list button']);
  });
});

describe('236차: 포인터 끌기(WCAG 2.5.7)와 키보드 길', () => {
  it('pointermove·포인터 붙잡기를 쓰는 src/app 파일 여덟이 모두 DRAGS에 있고, 일마다 받는 자리·키 근거가 원문에 있다', () => {
    expect(pointerFiles(SRC)).toEqual([...new Set(DRAGS.map((d) => d.at[0]).filter((f) => !f.includes('/')))].sort());
    expect(pointerFiles(SRC)).toHaveLength(8);
    for (const d of DRAGS) {
      expect(textOf(d.at[0]), d.name).toMatch(d.at[1]);
      for (const [file, re] of d.keyEv) expect(textOf(file), `${d.name} ${file}`).toMatch(re);
    }
    // 표 줄의 끌기 이름은 DRAGS에 있다
    for (const [n, k] of Object.entries(KBD)) if (k.drag) expect(DRAGS.map((d) => d.name), n).toContain(k.drag);
  });

  it('3D 임의 돌리기·이동·확대는 키가 없다(고르지 않음 — 새 키 배정, 코어 orbitBy·zoomBy는 있고 화면 이동 함수는 없음): 앱이 그 함수를 부르면 표를 고친다', () => {
    expect(DRAGS.filter((d) => d.verdict === 'design').map((d) => d.name)).toEqual(['3D 돌리기', '3D 이동', '3D 확대']);
    expect(SRC.filter(([, t]) => /\.(orbitBy|zoomBy|panBy)\(/.test(t)).map(([f]) => f)).toEqual([]);
    const core = read(CORE_VIEWER);
    expect([/\n {2}orbitBy\(dYaw: number, dPitch: number\): void/.test(core), /\n {2}zoomBy\(factor: number\): void/.test(core), /\bpanBy\(/.test(core)]).toEqual([true, true, false]);
  });

  it('표 요약: (가) Tab 21·무리 7·Tab 또는 무리 1·Tab 또는 없음 1·라벨 6·대신 4·없음 2 — 키보드 길 없는 누를 칸 0, (나) 기본 27·앱 키 2·굴림 1·라벨 6·키 없음 6, (다) 전역 21·안쪽 6·바꿈 3·안 칸 6·코어 1·초점 없음 5, (라) 끌기 6꼴', () => {
    const count = (f: (k: Kbd) => string): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const k of Object.values(KBD)) out[f(k)] = (out[f(k)] ?? 0) + 1;
      return out;
    };
    expect(count((k) => k.reach.join('|'))).toEqual({ tab: 21, rove: 7, 'tab|rove': 1, 'tab|none': 1, label: 6, alt: 4, none: 2 });
    expect(count((k) => k.press)).toEqual({ native: 27, keys: 2, scroll: 1, label: 6, none: 6 });
    expect(count((k) => k.focus)).toEqual({ global: 21, inset: 6, replace: 3, inner: 6, core: 1, none: 5 });
    expect(Object.entries(KBD).filter(([, k]) => k.drag).map(([n]) => n)).toEqual(['#28', '#29', '#35', '#36', '#37', '#42']);
  });
});

describe('236차: 키보드 셈이 헛돌지 않는다', () => {
  it('Tab 멈춤을 잃은 단추·나무 밖 나무 줄·새 바깥선 끄기·새 pointermove 파일은 잡힌다', () => {
    expect(kbdIssues([h('button', { type: 'button', class: 'recent-open', tabindex: '-1' })])).toEqual(['button.recent-open #19 최근 문서 줄: 닿는 길 alt']);
    expect(kbdIssues([h('div', { class: 'tree-row', role: 'treeitem' })])).toEqual(['div.tree-row #14 나무 줄: 닿는 길 alt']);
    expect(offRules(blocksOf(`${CSS}\n.recent-open:focus-visible { outline: none; }`))).toHaveLength(5);
    expect(pointerFiles([...SRC, ['zz.ts', "el.addEventListener('pointermove', f)"]])).toContain('zz.ts');
  });
});
