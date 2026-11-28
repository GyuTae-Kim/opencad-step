// @vitest-environment jsdom
/**
 * 색 대비(54차 — WCAG 1.4.3 글 4.5:1·큰 글 3:1, 1.4.11 비글 요소 3:1): styles.css의 밝은·어두운 테마 색 토큰을 읽어
 * 글 색 × 바탕(앱 바탕·막대·도구·패널·카드·입력 칸·3D 보기, 반투명 누름·강조 바탕은 섞은 색) 대비를 셈하고,
 * 강조색 글·채움·입력 칸 경계·눌린 단추·숨긴 줄 규칙이 그 토큰을 쓰는지 본다.
 * 164차: 바깥선을 끈 초점(메뉴 항목·거르기 칸·패널 손잡이)의 대신 표시가 강조색으로 바탕과 3:1 넘는지 — 좁은 창 시트 손잡이는 막대 색 바꿈만으로는 모자라 바깥선.
 * 197차: 고른 줄(옅은 강조 바탕) 위 칩 — PMI 의미 표 고른 줄의 면 수 칩(누름 바탕 위 흐린 글)이 바탕 두 겹 위라 4.5:1 아래였다(나무 줄처럼 패널 바탕).
 * 198차: 끈 줄(숨긴 레이어·끈 표현 PMI — 옅은 글)의 이름 버튼은 마우스 올림·고름 바탕 위에서 옅은 글이 4.5:1 아래였다(그 상태일 때만 흐린 글 — 54차 나무 숨긴 마디 꼴).
 * 203차: 빠듯한 짝 셋(처음 화면 읽기 오류·진행 막대 채움·정밀 조준 십자선)을 짝으로 — 어두운 테마의 십자선은 노란 선이 흰 테두리와 1.1:1이었다(테두리를 카드 색으로).
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
  it('부품별 보이기 표·PMI 표: 줄 첫 칸(넘침 자름) 안쪽 여백이 확인 칸 초점 테두리(2px + 틈 1px)를 담고, 바깥 여백으로 자리는 그대로', () => {
    const R = plainRules();
    // 초점 테두리 굵기(줄임 꼴 outline: 2px solid var(--accent) — var()가 있으면 jsdom이 낱 속성으로 펼치지 않는다)와 틈
    const fv = R.get(':focus-visible') ?? {};
    const ring = parseFloat(fv['outline-width'] || fv.outline || '0') + parseFloat(fv['outline-offset'] ?? '0');
    expect(ring).toBe(3);
    // label.check(부품별 보이기)·span.check(PMI 표 — 54차)
    const cell = R.get('.vgrid-row > .check:first-child') ?? {};
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

describe('초점 표시(164차 — WCAG 2.4.7·1.4.11)', () => {
  it.each(THEMES)('%s: 바깥선을 끈 초점은 강조색 표시가 바탕과 3:1 넘고, 좁은 창 시트 손잡이는 막대 색 바꿈(전후 3:1 아래) 대신 띠 안쪽 바깥선', (_n, T) => {
    const P = plainRules();
    const N = mediaRules('(max-width: 759.98px)');
    const S = surfaces(T);
    const acc = rgba(T['--accent']!);
    const decl = (o: Record<string, string> | undefined, ...ps: string[]) => ps.map((p) => o?.[p] ?? '').join(' ');
    // 메뉴 항목: 누름 바탕(카드 위) 안쪽 강조색 2px 그림자
    const menu = decl(P.get('.menu-item:focus-visible'), 'box-shadow');
    for (const w of ['inset', '2px', 'var(--accent)']) expect(menu).toContain(w);
    expect(contrast(acc, S.hoverCard!)).toBeGreaterThanOrEqual(3);
    // 거르기 칸(글 칸은 바깥선 없음): 감싼 칸 경계가 강조색 + 바깥 1px 그림자(패널 위)
    expect(decl(P.get('.tree-search:focus-within'), 'border-color', 'box-shadow')).toMatch(/var\(--accent\).*var\(--accent\)/);
    expect(contrast(acc, S.panel!)).toBeGreaterThanOrEqual(3);
    // 넓은 화면 패널 손잡이: 투명하던 2px 막대가 강조색(패널 경계선·패널 바탕 위)
    expect(decl(P.get('.panel-resizer:focus-visible::after'), 'background', 'background-color')).toContain('var(--accent)');
    for (const c of [rgba(T['--border']!), S.panel!]) expect(contrast(acc, c)).toBeGreaterThanOrEqual(3);
    // 좁은 창 시트 손잡이: 막대가 입력 칸 경계 색 → 강조색으로만 바뀌면 바뀌기 전과 후가 3:1 아래(밝게 1.34·어둡게 1.29)라
    // 띠 안쪽에 강조색 2px 바깥선(탭·나무 줄·강제 색 손잡이 규칙과 같은 꼴) — 위 변은 3D 보기 바탕, 아래 변은 탭 위 띠의 패널 바탕 위
    expect(decl(N.get('.panel-resizer::after'), 'background')).toBe('var(--border-input)');
    expect(contrast(rgba(T['--border-input']!), acc)).toBeLessThan(3);
    const fv = N.get('.panel-resizer:focus-visible');
    expect(decl(fv, 'outline', 'outline-width', 'outline-style', 'outline-color')).toMatch(/2px.*solid.*var\(--accent\)/);
    expect(parseFloat(fv?.['outline-offset'] ?? '0')).toBeLessThanOrEqual(-2);
    for (const c of [S.view!, S.panel!]) expect(contrast(acc, c)).toBeGreaterThanOrEqual(3);
  });
});

describe('고른 줄 위 칩(197차 — WCAG 1.4.3)', () => {
  it.each(THEMES)('%s: 나무·PMI 의미 표 고른 줄 위 칩은 패널 바탕 — 면 수 칩(누름 바탕)을 옅은 강조 바탕에 겹치면 흐린 글이 4.5:1 아래', (_n, T) => {
    const R = plainRules();
    const S = surfaces(T);
    const dim = rgba(T['--text-dim']!);
    // 면 수 칩(.chip.dim-chip — pmiview.ts 의미 줄 이름 옆)은 누름 바탕: 고른 줄(.vgrid-row.sel — 옅은 강조 바탕) 위에 겹치면 밝게 4.27·어둡게 3.98
    expect(R.get('.chip.dim-chip')?.background).toBe('var(--bg-hover)');
    expect(contrast(dim, over(rgba(T['--bg-hover']!), S.softPanel!))).toBeLessThan(4.5);
    for (const sel of ['.tree-row.sel .chip', '.vgrid-row.sel .chip']) expect(R.get(sel)?.background, sel).toBe('var(--bg-panel)');
    // 패널 바탕 위 칩 글(흐린 글·강조색 글)과 고른 줄 바탕 위 흐린 글(나무 줄 .dim)은 4.5:1 넘음
    expect([...below(T, '--text-dim', ['panel', 'softPanel'], 4.5), ...below(T, '--accent-fg', ['panel'], 4.5)]).toEqual([]);
  });
});

describe('끈 줄 이름 버튼(198차 — WCAG 1.4.3)', () => {
  it.each(THEMES)('%s: 끈 줄 이름 버튼은 마우스 올림·고름 바탕 위에서만 흐린 글 — 옅은 글은 그 바탕 위 4.5:1 아래, 보통은 옅은 글 그대로', (_n, T) => {
    const R = plainRules();
    // 이름 버튼(레이어 표 td 안·표현 PMI 표 칸 span.check 안 — 끈 줄 규칙의 대상이 아니라 그 안)은 글 색을 물려받고 상태가 바탕을 바꾼다
    expect(R.get('.link-btn')?.color).toBe('inherit');
    expect(R.get('.link-btn:hover')?.background).toBe('var(--bg-hover)');
    expect(R.get('.link-btn.sel')?.background).toBe('var(--accent-soft)');
    for (const sel of ['table.grid tr.off td', '.vgrid-row.off > *']) expect(R.get(sel)?.color, sel).toBe('var(--text-faint)');
    // 옅은 글: 누름 바탕(마우스) 위 밝게 4.43·어둡게 4.33, 옅은 강조 바탕(고름 — 마우스를 함께 올려도 .sel 바탕) 위 4.31·4.00
    expect(below(T, '--text-faint', ['hoverPanel', 'softPanel'], 4.5)).toHaveLength(2);
    for (const sel of ['table.grid tr.off .link-btn:hover', 'table.grid tr.off .link-btn.sel', '.vgrid-row.off .link-btn:hover', '.vgrid-row.off .link-btn.sel']) {
      expect(R.get(sel)?.color, sel).toBe('var(--text-dim)');
    }
    expect(below(T, '--text-dim', ['hoverPanel', 'softPanel'], 4.5)).toEqual([]);
    // 보통 끈 줄 이름 버튼(가만한 패널 바탕)은 옅은 글 그대로(5.06·5.37 — 위 토큰 묶음)
    for (const sel of ['table.grid tr.off .link-btn', '.vgrid-row.off .link-btn']) expect(R.get(sel)?.color, sel).toBeUndefined();
  });
});

describe('빠듯한 대비 짝(203차 — WCAG 1.4.3·1.4.11)', () => {
  it.each(THEMES)('%s: 처음 화면 읽기 오류 글 4.5:1, 진행 막대 채움 3:1(홈·카드 위), 정밀 조준 십자선 3:1(보기 바탕, 카드 색 테두리 위 어느 바탕에서도)', (n, T) => {
    const R = plainRules();
    const S = surfaces(T);
    const c = (k: string): Rgba => rgba(T[k]!);
    // 처음 화면 읽기 오류(.start-error — 바탕 없이 .start 앱 바탕 위 글, 244차부터 알림은 같은 글의 오류 알림이 함): 밝게 4.53·어둡게 6.30
    expect([R.get('.start-error')?.color, R.get('.start')?.background]).toEqual(['var(--danger)', 'var(--bg-app)']);
    expect(R.get('.start-error')?.border).toContain('var(--danger)');
    expect(contrast(c('--danger'), S.app!)).toBeGreaterThanOrEqual(4.5);
    // 진행 막대(홈 6px에 안쪽 여백이 없어 채움의 위·아래 가장자리는 카드에 닿는다): 홈 위 3.95·3.22, 카드 위 4.94·4.16(홈 × 카드는 백분율 글이 같은 값을 나름)
    expect([R.get('.busy-bar')?.background, R.get('.busy-fill')?.background, R.get('.busy-card')?.background]).toEqual(['var(--border-soft)', 'var(--accent)', 'var(--card)']);
    for (const b of [over(c('--border-soft'), S.card!), S.card!]) expect(contrast(c('--accent'), b)).toBeGreaterThanOrEqual(3);
    // 정밀 조준 십자선(aim.ts — 색 선 1.5px를 3.5px 테두리가 감쌈): 색 선은 보기 바탕과 3.93·10.33
    expect(R.get('.aim-reticle')?.color).toBe('var(--aim)');
    expect(contrast(c('--aim'), S.view!)).toBeGreaterThanOrEqual(3);
    // 202차까지 흰 테두리(#ffffff 0.85): 어두운 테마의 노란 선과 1.08(밝게 4.24) — 밝은 부품 위에서는 테두리도 선도 3:1 아래
    expect(contrast(c('--aim'), over([255, 255, 255, 0.85], S.view!)) < 3).toBe(n === 'dark');
    // 테두리는 카드 색(단면 손잡이 점 .sh-dot 꼴): 그 위 색 선이 보기·검은·흰 모형 어디서나 3:1 넘음(밝게 4.24·3.03·4.29, 어둡게 9.17·9.96·5.58)
    const halo = R.get('.aim-reticle .aim-halo');
    expect([halo?.stroke, halo?.['stroke-opacity']]).toEqual(['var(--card)', '0.85']);
    const ring = [...c('--card').slice(0, 3), Number(halo!['stroke-opacity'])] as Rgba;
    for (const bg of [S.view!, [0, 0, 0, 1], [255, 255, 255, 1]] as Rgba[]) expect(contrast(c('--aim'), over(ring, bg)), bg.join()).toBeGreaterThanOrEqual(3);
  });
});
