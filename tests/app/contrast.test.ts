// @vitest-environment jsdom
/**
 * 색 대비(54차 — WCAG 1.4.3 글 4.5:1·큰 글 3:1, 1.4.11 비글 요소 3:1): styles.css의 밝은·어두운 테마 색 토큰을 읽어
 * 글 색 × 바탕(앱 바탕·막대·도구·패널·카드·입력 칸·3D 보기, 반투명 누름·강조 바탕은 섞은 색) 대비를 셈하고,
 * 강조색 글·채움·입력 칸 경계·눌린 단추·숨긴 줄 규칙이 그 토큰을 쓰는지 본다.
 * 실제 화면의 모든 글·아이콘 대비는 헤드리스 Chrome으로 쟀다(README 개발 절 — 계산된 색, 조상 겹침).
 * CONTRAST_CSS: 다른 판의 스타일시트로 돌려 볼 때(앞 판에서 실패하는지 확인용)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(process.env.CONTRAST_CSS || join(__dirname, '../../src/app/styles.css'), 'utf8');

type Rgba = [number, number, number, number];

/** 테마 블록(:root, :root[data-theme='dark'])의 --이름: 값 */
function tokens(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`no block ${selector}`);
  const body = css.slice(m.index + m[0].length, css.indexOf('\n}', m.index));
  const out: Record<string, string> = {};
  for (const t of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[t[1]!] = t[2]!.trim();
  return out;
}
const LIGHT = tokens(/^:root \{/m);
const DARK = { ...LIGHT, ...tokens(/^:root\[data-theme='dark'\] \{/m) };

function rgba(s: string): Rgba {
  const t = s.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)).concat(1) as Rgba;
  m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  throw new Error(`색 못 읽음: ${s}`);
}
const over = (top: Rgba, bot: Rgba): Rgba => [0, 1, 2].map((i) => top[i]! * top[3] + bot[i]! * (1 - top[3])).concat(1) as Rgba;
const lum = (c: Rgba): number => {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: Rgba, b: Rgba): number => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** 테마의 바탕들(반투명 바탕은 그것이 놓이는 바탕에 섞는다) */
function surfaces(T: Record<string, string>): Record<string, Rgba> {
  const c = (k: string) => rgba(T[k]!);
  const s: Record<string, Rgba> = {
    app: c('--bg-app'),
    bar: c('--bg-bar'),
    tool: c('--bg-tool'),
    panel: c('--bg-panel'),
    input: c('--bg-input'),
    card: c('--card'),
    view: c('--bg-view'),
  };
  s.hoverCard = over(c('--bg-hover'), s.card!);
  s.hoverPanel = over(c('--bg-hover'), s.panel!);
  s.softPanel = over(c('--accent-soft'), s.panel!);
  s.softTool = over(c('--accent-soft'), s.tool!);
  s.softBar = over(c('--accent-soft'), s.bar!);
  s.softCard = over(c('--accent-soft'), s.card!);
  return s;
}

const THEMES: [string, Record<string, string>][] = [
  ['light', LIGHT],
  ['dark', DARK],
];

function below(T: Record<string, string>, fg: string, bgs: string[], need: number): string[] {
  const S = surfaces(T);
  const out: string[] = [];
  for (const b of bgs) {
    const r = contrast(over(rgba(T[fg]!), S[b]!), S[b]!);
    if (r < need) out.push(`${fg} on ${b} ${r.toFixed(2)}`);
  }
  return out;
}

describe('색 토큰 대비(두 테마)', () => {
  const PLAIN = ['app', 'bar', 'tool', 'panel', 'input', 'card', 'view', 'hoverCard', 'hoverPanel'];
  const SOFT = ['softPanel', 'softTool', 'softBar', 'softCard'];

  it.each(THEMES)('%s: 본문·흐린 글은 모든 바탕(마우스 올린 바탕 포함), 옅은 글은 가만한 바탕에서 4.5:1 넘음', (_n, T) => {
    const still = PLAIN.filter((b) => !b.startsWith('hover'));
    expect([...below(T, '--text', [...PLAIN, ...SOFT], 4.5), ...below(T, '--text-dim', PLAIN, 4.5), ...below(T, '--text-faint', still, 4.5)]).toEqual([]);
  });

  it.each(THEMES)('%s: 강조색 글(--accent-fg)은 옅은 강조 바탕 위에서도 4.5:1 넘음', (_n, T) => {
    expect(below(T, '--accent-fg', [...PLAIN, ...SOFT], 4.5)).toEqual([]);
  });

  it.each(THEMES)('%s: 채움(--accent-fill) 위 글(--accent-text) 4.5:1, 올려 둔(brightness 0.92) 채움 위도', (_n, T) => {
    const fill = rgba(T['--accent-fill']!);
    const text = rgba(T['--accent-text']!);
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
    const dim = fill.map((v, i) => (i < 3 ? v * 0.92 : v)) as Rgba;
    expect(contrast(text, dim)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEMES)('%s: 채움(고른 갈래 단추의 표시)은 놓이는 바탕과 3:1 넘음(1.4.11)', (_n, T) => {
    expect(below(T, '--accent-fill', ['bar', 'tool', 'panel', 'card', 'view'], 3)).toEqual([]);
  });

  it.each(THEMES)('%s: 입력 칸 경계(--border-input)·초점 테두리(--accent)는 바탕과 3:1 넘음(1.4.11)', (_n, T) => {
    const bgs = ['app', 'bar', 'tool', 'panel', 'input', 'card', 'view'];
    expect([...below(T, '--border-input', bgs, 3), ...below(T, '--accent', bgs, 3)]).toEqual([]);
  });

  it.each(THEMES)('%s: 3D 보기 좌표축 글자(코어 테마 변수 --v3d-axis-*)가 보기 바탕과 4.5:1 넘음', (_n, T) => {
    const view = rgba(T['--bg-view']!);
    for (const k of ['--v3d-axis-x', '--v3d-axis-y', '--v3d-axis-z']) {
      expect(T[k], k).toBeTruthy();
      expect(contrast(over(rgba(T[k]!), view), view), k).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** 미디어 조건 없는 규칙: 선택자 → 선언(뒤 규칙이 앞을 덮는다) */
function plainRules(): Map<string, Record<string, string>> {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  const out = new Map<string, Record<string, string>>();
  for (const r of [...el.sheet!.cssRules]) {
    if (!(r instanceof CSSStyleRule)) continue;
    for (const sel of r.selectorText.split(',').map((x) => x.trim())) {
      const o = out.get(sel) ?? {};
      for (let i = 0; i < r.style.length; i++) o[r.style[i]!] = r.style.getPropertyValue(r.style[i]!);
      out.set(sel, o);
    }
  }
  el.remove();
  return out;
}

/** 이 미디어 조건(정확히 같은 글)의 규칙 */
function mediaRules(media: string): Map<string, Record<string, string>> {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  const out = new Map<string, Record<string, string>>();
  for (const r of [...el.sheet!.cssRules]) {
    if (!(r instanceof CSSMediaRule) || r.media.mediaText.replace(/\s+/g, '') !== media.replace(/\s+/g, '')) continue;
    for (const s of [...r.cssRules]) {
      if (!(s instanceof CSSStyleRule)) continue;
      for (const sel of s.selectorText.split(',').map((x) => x.trim())) {
        const o = out.get(sel) ?? {};
        for (let i = 0; i < s.style.length; i++) o[s.style[i]!] = s.style.getPropertyValue(s.style[i]!);
        out.set(sel, o);
      }
    }
  }
  el.remove();
  return out;
}

describe('규칙이 대비 토큰을 쓰는지', () => {
  const R = plainRules();
  const get = (sel: string, p: string) => R.get(sel)?.[p] ?? '';

  it('강조색으로 쓰는 글·글자 기호는 --accent-fg(옅은 강조 바탕 위 #1f6fd1·#3d95f0은 4.5:1 아래)', () => {
    for (const sel of ['.btn.on:not(:disabled)', '.chip', '.menu-check', '.iso-label', '.section-face', '.recent-clear', '.drop-hint', '.section-bar .icon-btn.on']) {
      expect(get(sel, 'color'), sel).toBe('var(--accent-fg)');
    }
  });

  it('글을 얹는 채움은 --accent-fill, 올려 둔 주 단추는 어둡게(밝게 하면 밝은 테마의 흰 글 4.3:1)', () => {
    expect(get('.btn.primary', 'background')).toBe('var(--accent-fill)');
    expect(get('.seg-btn.on', 'background')).toBe('var(--accent-fill)');
    const f = /brightness\(([\d.]+)\)/.exec(get('.btn.primary:hover:not(:disabled)', 'filter'));
    expect(Number(f?.[1])).toBeLessThanOrEqual(1);
  });

  it('입력 칸·고르기 칸·거르기 칸 경계는 --border-input', () => {
    for (const sel of ['.tree-search', '.dlg-select', '.dlg-input', '.section-num', '.explode-num']) {
      expect(get(sel, 'border') || get(sel, 'border-color'), sel).toContain('var(--border-input)');
    }
  });

  it('눌린 단추는 강조색 테두리(옅은 강조 바탕만으로는 막대와 1.2:1), 단면 막대 아이콘 단추는 안쪽 테두리', () => {
    expect(get('.btn.on:not(:disabled)', 'border-color')).toBe('var(--accent)');
    expect(get('.section-bar .icon-btn.on', 'box-shadow')).toContain('var(--accent)');
  });

  it('숨긴 마디·끈 줄은 반투명(opacity) 대신 흐린·옅은 글 색(반투명이면 글이 2.1~3.4:1)', () => {
    // 나무 줄은 마우스를 올리면 바탕이 바뀌어 흐린 글 색, 표 줄은 옅은 글 색
    for (const [sel, col] of [
      ['.tree-row.hidden-node .tree-name', 'var(--text-dim)'],
      ['.tree-row.hidden-node .tree-name-gen', 'var(--text-dim)'],
      ['.tree-row.hidden-node .tree-name .dim', 'var(--text-dim)'],
      ['table.grid tr.off td', 'var(--text-faint)'],
      ['.vgrid-row.off > *', 'var(--text-faint)'],
    ]) {
      expect(get(sel!, 'opacity'), sel).toBe('');
      expect(get(sel!, 'color'), sel).toBe(col);
    }
    expect(get('input::placeholder', 'color')).toBe('var(--text-faint)');
  });
});

describe('53차가 남긴 것', () => {
  it('부품별 보이기 표: 줄 첫 칸(넘침 자름) 안쪽 여백이 확인 칸 초점 테두리(2px + 틈 1px)를 담고, 바깥 여백으로 자리는 그대로', () => {
    const R = plainRules();
    // 초점 테두리 굵기(줄임 꼴 outline: 2px solid var(--accent) — var()가 있으면 jsdom이 낱 속성으로 펼치지 않는다)와 틈
    const fv = R.get(':focus-visible') ?? {};
    const ring = parseFloat(fv['outline-width'] || fv.outline || '0') + parseFloat(fv['outline-offset'] ?? '0');
    expect(ring).toBe(3);
    const cell = R.get('.vgrid-row > label.check:first-child') ?? {};
    const [pt, , pb, pl] = (cell.padding ?? '').split(/\s+/).map(parseFloat);
    const [mt, , mb, ml] = (cell.margin ?? '').split(/\s+/).map(parseFloat);
    expect(pl).toBeGreaterThanOrEqual(ring);
    expect(pt).toBeGreaterThanOrEqual(ring);
    expect(pb).toBeGreaterThanOrEqual(ring);
    expect([ml, mt, mb]).toEqual([-pl!, -pt!, -pb!]);
  });

  it('좁은 창(마우스) 시트: 손잡이 띠가 패널 안으로 들어오는 몫이 탭 위 띠(패널 머리 위 여백) 안 — 탭을 덮지 않는다', () => {
    const N = mediaRules('(max-width: 759.98px)');
    const rz = N.get('.panel-resizer')!;
    const inside = parseFloat(rz.height!) + parseFloat(rz.top!);
    expect(inside).toBeGreaterThan(0);
    expect(parseFloat(N.get('.panel-head')?.['padding-top'] ?? '0')).toBeGreaterThanOrEqual(inside);
    // 손잡이 막대(::after)는 그 띠 안에 보이고, 입력 칸 경계 색(패널 바탕과 3:1 넘음)
    const bar = N.get('.panel-resizer::after')!;
    const top = parseFloat(bar.top!) + parseFloat(rz.top!);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + parseFloat(bar.height!)).toBeLessThanOrEqual(inside);
    expect(bar.background).toBe('var(--border-input)');
  });
});
