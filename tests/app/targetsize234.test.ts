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
