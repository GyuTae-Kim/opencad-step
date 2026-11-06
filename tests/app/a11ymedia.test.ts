// @vitest-environment jsdom
/**
 * 55차 WCAG 크기·간격·움직임 규칙(styles.css): 강제 색(forced-colors: active — Windows 고대비 등), 움직임 줄이기(prefers-reduced-motion: reduce — 2.3.3),
 * 다시 흐르기(1.4.10 — 1280px 창 400% = 320×256), 글만 키우기(1.4.4 — 갈래 단추·상태 막대가 글을 따라 커짐), 갈래 단추 초점.
 * 실제 화면은 헤드리스 Chrome으로 쟀다(README 개발 절 — 상태를 끈/켠 화소, Tab 초점 화소, 잘림·닿음, 카메라 프레임).
 * A11Y_CSS: 다른 판의 스타일시트로 돌려 볼 때(앞 판에서 실패하는지 확인용)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(process.env.A11Y_CSS || join(__dirname, '../../src/app/styles.css'), 'utf8');

type Rules = Map<string, Record<string, string>>;

/** 미디어 조건(정확히 같은 글, 공백 무시 — null이면 미디어 조건 없는 규칙)의 규칙: 선택자 → 선언(뒤 규칙이 앞을 덮는다) */
function rules(media: string | null): Rules {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  const out: Rules = new Map();
  const add = (r: CSSStyleRule) => {
    for (const sel of r.selectorText.split(',').map((x) => x.trim())) {
      const o = out.get(sel) ?? {};
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i]!;
        o[p] = r.style.getPropertyValue(p) + (r.style.getPropertyPriority(p) ? ' !important' : '');
      }
      out.set(sel, o);
    }
  };
  for (const r of [...el.sheet!.cssRules]) {
    if (media === null && r instanceof CSSStyleRule) add(r);
    if (media !== null && r instanceof CSSMediaRule && r.media.mediaText.replace(/\s+/g, '') === media.replace(/\s+/g, ''))
      for (const s of [...r.cssRules]) if (s instanceof CSSStyleRule) add(s);
  }
  el.remove();
  return out;
}

const PLAIN = rules(null);
const FORCED = rules('(forced-colors: active)');
/** 선언 값(줄임 꼴 border·outline·background 안의 값도 — jsdom은 var()·시스템 색이 든 줄임 꼴을 낱 속성으로 펼치지 않을 수 있다) */
const val = (R: Rules, sel: string, ...props: string[]) => props.map((p) => R.get(sel)?.[p] ?? '').join(' ');

describe('강제 색(forced-colors: active)', () => {
  it('켬·고름 단추(눌린 도구 단추·고른 갈래 단추·방향 잠금·단면 막대 아이콘 단추)는 시스템 고른 색으로 채운다', () => {
    for (const sel of ['.btn.on:not(:disabled)', '.seg-btn.on', '.mb-btn.mb-lock.on', '.section-bar .icon-btn.on']) {
      expect(val(FORCED, sel, 'background', 'background-color'), sel).toContain('Highlight');
      expect(val(FORCED, sel, 'color'), sel).toBe('HighlightText');
      expect(val(FORCED, sel, 'border-color'), sel).toContain('Highlight');
      // 강제 색이 글 뒤에 까는 바탕 색 받침이 고른 색 채움 위 글을 가리지 않게(밝은 고대비에서 흰 상자로 보였다)
      expect(val(FORCED, sel, 'forced-color-adjust'), sel).toBe('none');
    }
    // 초점 테두리: 채움 안쪽(갈래 단추)은 고른 글 색, 바깥(도구 단추 등)은 강제 글 색
    expect(val(FORCED, '.seg-btn.on:focus-visible', 'outline-color')).toBe('HighlightText');
    expect(val(FORCED, '.btn.on:not(:disabled):focus-visible', 'outline-color')).toBe('CanvasText');
  });

  it('고른 탭만 밑줄(강제 색은 투명한 밑줄도 글 색으로 그리므로 다른 탭은 바탕 색)', () => {
    expect(val(FORCED, '.tab', 'border-bottom-color')).toBe('Canvas');
    expect(val(FORCED, '.tab.active', 'border-bottom-color')).toBe('Highlight');
  });

  it('보통 색에서 바탕·안쪽 그림자로 보이던 켬·고름 규칙은 모두 강제 색 규칙이 있다', () => {
    // 고른 줄 위 칩의 바탕(겹침 피하기)과 끄는 동안의 손잡이 막대(:hover와 함께)는 표시가 아니거나 같은 규칙 안
    const covered: Record<string, string> = { 'tr.sel td': 'tr.sel td:first-child' };
    const skip = new Set(['.tree-row.sel .chip']);
    const missing: string[] = [];
    for (const [sel, o] of PLAIN) {
      if (!/\.(on|sel|part-sel|active)\b/.test(sel) || skip.has(sel)) continue;
      if (!Object.keys(o).some((p) => p.startsWith('background') || p === 'box-shadow')) continue;
      if (!FORCED.has(covered[sel] ?? sel)) missing.push(sel);
    }
    expect(missing).toEqual([]);
  });

  it('고른 줄(나무·PMI 표·이름 단추·표 줄)은 왼쪽 테두리 막대, 테두리만큼 왼쪽 여백을 줄여 자리는 그대로', () => {
    for (const sel of ['.tree-row.sel', '.tree-row.part-sel', '.vgrid-row.sel', '.link-btn.sel', 'tr.sel td:first-child']) {
      expect(val(FORCED, sel, 'border-left', 'border-left-color'), sel).toContain('Highlight');
    }
    expect(val(FORCED, '.tree-row.part-sel', 'border-left-style')).toBe('dashed');
    // 나무 줄: 보통 왼쪽 여백 6px + 깊이 × 16px에서 테두리 3px를 뺀다
    expect(PLAIN.get('.tree-row')?.padding).toContain('calc(6px + var(--depth, 0) * 16px)');
    expect(val(FORCED, '.tree-row.sel', 'padding-left')).toBe('calc(3px + var(--depth, 0) * 16px)');
    // PMI 표 줄(왼쪽 여백 4px)·이름 단추(4px)
    expect(PLAIN.get('.vgrid-row')?.padding).toBe('3px 4px');
    expect(val(FORCED, '.vgrid-row.sel', 'padding-left')).toBe('1px');
    expect(PLAIN.get('.link-btn')?.padding).toBe('1px 4px');
    expect(val(FORCED, '.link-btn.sel', 'padding-left')).toBe('2px');
  });

  it('보통 색에서 바깥선을 끄고 그림자·막대·감싼 칸으로 보이던 초점은 강제 색에서 바깥선', () => {
    const noOutline = [...PLAIN].filter(([sel, o]) => /:focus/.test(sel) && /none/.test(o.outline ?? o['outline-style'] ?? '')).map(([sel]) => sel);
    expect(noOutline.sort()).toEqual(['.menu-item:focus-visible', '.panel-resizer:focus-visible']);
    for (const sel of noOutline) expect(val(FORCED, sel, 'outline', 'outline-color'), sel).toContain('Highlight');
    // 거르기 칸(글 칸은 바깥선 없음, 감싼 칸의 테두리 색이 바뀜 — 강제 색에서는 같은 색)
    expect(PLAIN.get('.tree-filter')?.outline).toBe('none');
    expect(val(FORCED, '.tree-search:focus-within', 'outline', 'outline-color')).toContain('Highlight');
  });

  it('바탕색으로만 보이던 그림: 진행 막대(바닥 테두리·채움 고른 색), 거르기 맞은 줄 점, 좁은 화면 시트 손잡이 막대', () => {
    expect(val(FORCED, '.busy-bar', 'border')).toContain('CanvasText');
    expect(val(FORCED, '.busy-fill', 'background', 'background-color')).toContain('Highlight');
    expect(val(FORCED, '.tree-row.match .tree-name::before', 'background', 'background-color')).toContain('CanvasText');
    const narrow = rules('(forced-colors: active) and (max-width: 759.98px)');
    expect(val(narrow, '.panel-resizer::after', 'background', 'background-color')).toContain('CanvasText');
  });
});

describe('움직임 줄이기(prefers-reduced-motion: reduce)', () => {
  it('모든 요소와 ::before·::after의 전환·애니메이션을 0초로, 부드러운 굴림 끔', () => {
    const R = rules('(prefers-reduced-motion: reduce)');
    for (const sel of ['*', '*::before', '*::after']) {
      const o = R.get(sel) ?? {};
      expect(o['transition-duration'], sel).toBe('0s !important');
      expect(o['animation-duration'], sel).toBe('0s !important');
      expect(o['scroll-behavior'], sel).toBe('auto !important');
    }
    // 끌 것이 실제로 있는지(시험이 헛돌지 않게): 진행 막대 채움·패널 손잡이 막대의 전환
    expect(PLAIN.get('.busy-fill')?.transition).toContain('width');
    expect(PLAIN.get('.panel-resizer::after')?.transition).toContain('background');
  });
});

describe('다시 흐르기(1280px 창 400% — 320×256)와 글만 키우기', () => {
  it('높이 320px 이하 마우스 기기: 앱을 480px 높이로 두고 쪽을 세로로만 굴린다', () => {
    const R = rules('(pointer: fine) and (max-height: 320px)');
    // 굴림 칸은 body 하나(html도 굴리면 세로 막대가 둘 생겨 도구 막대 자리가 15px 더 줄었다)
    expect(R.get('body')?.['overflow-y']).toBe('auto');
    expect(R.has('html')).toBe(false);
    expect(parseFloat(R.get('#app.app')?.['min-height'] ?? '0')).toBeGreaterThanOrEqual(480);
    // 보통은 쪽이 굴러가지 않는다(당겨서 새로 고침 막기와 함께)
    expect(PLAIN.get('html')?.overflow).toBe('hidden');
  });

  it('폭 360px 미만은 마우스 기기도 도구 막대 틈·구분선을 빼고, 폭 375px 미만은 앱 이름을 아이콘만', () => {
    const T = rules('(max-width: 359.98px)');
    expect(T.get('.toolbar')?.gap).toBe('0');
    expect(T.get('.toolbar .tool-sep')?.display).toBe('none');
    // 패널 탭 좌우 틈 12 → 8px(손가락 기기와 같게)
    expect(PLAIN.get('.tab')?.padding?.replace(/^0px/, '0')).toBe('0 12px');
    expect(T.get('.tab')?.['padding-inline']).toBe('8px');
    const B = rules('(max-width: 374.98px)');
    expect(B.get('.brand-icon')?.display).toBe('block');
    for (const sel of ['.brand b', '.brand > span']) expect(B.get(sel)?.clip, sel).toBe('rect(0 0 0 0)');
  });

  it('갈래 단추·상태 막대는 높이를 못 박지 않고 최소 높이(글만 키우면 따라 커진다), 갈래 단추 초점은 안쪽', () => {
    const coarse = rules('(pointer: coarse)');
    for (const [R, sel] of [
      [PLAIN, '.seg-btn'],
      [PLAIN, '.mb-kind .seg-btn'],
      [coarse, '.seg-btn'],
      [coarse, '.mb-kind .seg-btn'],
      [coarse, '.explode-bar .seg-btn'],
      [PLAIN, '.statusbar'],
    ] as [Rules, string][]) {
      expect(R.get(sel)?.height, sel).toBeUndefined();
      expect(parseFloat(R.get(sel)?.['min-height'] ?? '0'), sel).toBeGreaterThan(0);
    }
    // 도움말 안의 긴 낱말(STEP 엔터티 이름)도 줄을 바꾼다(글만 키우면 패널 폭을 넘었다)
    expect(PLAIN.get('.hint')?.['overflow-wrap']).toBe('anywhere');
    // 묶음(.seg)은 둥근 모서리로 넘침을 자른다 — 바깥으로 그린 초점 테두리가 잘리지 않게 안쪽으로
    expect(PLAIN.get('.seg')?.overflow).toBe('hidden');
    expect(parseFloat(PLAIN.get('.seg-btn:focus-visible')?.['outline-offset'] ?? '0')).toBeLessThanOrEqual(-2);
    expect(PLAIN.get('.seg-btn.on:focus-visible')?.['outline-color']).toBe('var(--accent-text)');
  });
});
