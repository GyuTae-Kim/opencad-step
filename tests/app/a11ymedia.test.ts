// @vitest-environment jsdom
/**
 * 55차 WCAG 크기·간격·움직임 규칙(styles.css): 강제 색(forced-colors: active — Windows 고대비 등), 움직임 줄이기(prefers-reduced-motion: reduce — 2.3.3),
 * 다시 흐르기(1.4.10 — 1280px 창 400% = 320×256), 글만 키우기(1.4.4 — 갈래 단추·상태 막대가 글을 따라 커짐), 갈래 단추 초점,
 * 마우스 화면 누르는 칸 크기(163차 — 2.5.8 최소 24px 또는 간격: 확인 칸 옆 이름 단추 최소 폭),
 * 글 간격(171차 — 1.4.12: 높이를 못 박은 글 칸의 줄 높이 1.5배 한 줄 손셈, 이름이 줄을 바꿀 수 있는 메뉴 항목은 최소 높이),
 * 다시 흐르기 폭(179차 — 1.4.10 320px: 창 폭을 따르는 칸의 손셈, 좁은 화면 격리 띠 「격리 풀기」는 아이콘만),
 * 초점 가려지지 않음(190차 — 2.4.11: 키보드 초점이 든 측정 띠는 위 띠 묶음 위로), 위 띠 쌓기(191차 — 휴대폰 단면 막대와 위 띠 묶음을 3D 보기 흐름에 쌓는 자리 손셈),
 * 위 띠 굴림(192차 — 휴대폰 위 띠 묶음이 단면 막대 아래 남은 높이로 줄고 넘친 띠는 묶음 안에서 굴림: 작은 3D 보기 높이 손셈),
 * 동작 버튼 알림 줄 바꿈(195차 — 1.4.10 320×256: 480px 미만에서 긴 글은 첫 줄을 채우고 버튼·✕는 다음 줄, 알림 높이·잘림 손셈),
 * 분해 띠 갈래 묶음 줄 바꿈(196차 — 1.4.10: 휴대폰 블록에서 띠 안보다 넓은 긴 번역 묶음은 버튼을 다음 줄로, 다섯 언어 × 휴대폰 네 폭·320px 마우스 폭 손셈).
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
    const skip = new Set(['.tree-row.sel .chip', '.vgrid-row.sel .chip']);
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

describe('마우스 화면 누르는 칸(163차 — WCAG 2.5.8 최소 24×24 CSS px 또는 간격, 손가락 기기 44px는 touch.test.ts)', () => {
  it('보통 규칙의 단추·칸은 24px 이상, 확인 칸 옆 이름 단추는 최소 폭 24px라 이름이 한두 글자여도 두 칸의 24px 원이 겹치지 않는다', () => {
    const n = (sel: string, p: string) => parseFloat(PLAIN.get(sel)?.[p] ?? '');
    const want: [string, string][] = [
      ['.btn', 'height'],
      ['.btn.small', 'height'],
      ['.icon-btn', 'width'],
      ['.icon-btn', 'height'],
      ['.seg-btn', 'min-width'],
      ['.seg-btn', 'min-height'],
      ['.tab', 'height'],
      ['.menu-item', 'min-height'],
      ['.tree-row', 'min-height'],
      ['.twisty', 'width'],
      ['.twisty', 'height'],
      ['.eye', 'width'],
      ['.eye', 'height'],
      ['.mb-btn', 'height'],
      ['.recent-clear', 'min-height'],
      ['.recent-open', 'min-height'],
      ['.tree-search', 'height'],
      ['.section-num', 'height'],
      ['.explode-num', 'height'],
      ['.dlg-select', 'min-height'],
      ['.language-trigger', 'height'],
    ];
    expect(want.filter(([s, p]) => !(n(s, p) >= 24)).map(([s, p]) => `${s} ${p}=${PLAIN.get(s)?.[p]}`)).toEqual([]);
    // 레이어·PMI 표 줄은 [보이기 확인 칸(브라우저 기본 13×13)][이름 단추] — 이름 단추는 높이 20.85px(13px × 1.45 + 위아래 1px)라 간격 예외로 맞춘다:
    // 두 가운데 사이(13/2 + 틈 + 이름 폭/2)가 24px 이상이어야 두 24px 원이 겹치지 않는다. 최소 폭이 0이면 이름 「0」(폭 16px)은 20.5px, 「L1」(23px)도 24px 미만이었다
    const gap = n('span.check', 'gap');
    expect(gap).toBe(6);
    // PMI 표 규칙이 최소 폭을 두지 않으면 .link-btn 것(165차 — 두면 손가락 규칙의 44px를 덮었다)
    for (const sel of ['.link-btn', '.pmi-grid .link-btn']) expect(13 / 2 + gap + (n(sel, 'min-width') || n('.link-btn', 'min-width')) / 2, sel).toBeGreaterThanOrEqual(24);
    // 높이는 그대로(레이어·PMI·간섭 표 줄이 줄마다 3px 높아지지 않게) — 위아래 줄 가운데 사이는 표 줄 여백으로 27.85px
    expect(PLAIN.get('.link-btn')?.['min-height']).toBeUndefined();
  });
});

describe('글 간격(171차 — WCAG 1.4.12: 줄 높이를 글자 크기의 1.5배·글자 간격 0.12배·낱말 간격 0.16배로 덮는 사용자 스타일)', () => {
  const coarse = rules('(pointer: coarse)');
  const narrow = rules('(max-width: 767px)');
  /** 선언의 px 값(없으면 NaN) */
  const num = (R: Rules, sel: string, p: string) => parseFloat(R.get(sel)?.[p] ?? '');
  /** 위아래 여백 합(줄임 꼴은 첫 값이 위 — 이 칸들은 한두 값 꼴이라 위 = 아래) */
  const padY = (R: Rules, sel: string) => 2 * (parseFloat(R.get(sel)?.['padding-top'] ?? R.get(sel)?.padding ?? '0') || 0);

  it('높이를 못 박은 글 칸은 글이 한 줄(줄을 바꾸지 않는 단추·이름, 한 줄 입력 칸)이고 줄 높이 1.5배 한 줄(글자 크기 × 1.5 + 위아래 여백·테두리)이 그 높이 안에 든다', () => {
    // [규칙, 선택자, 글자 크기(규칙에 없으면 물려받는 값 — 본문 13px, 제목 막대는 앱 이름 15px, 단면 막대 12px, 손가락 거르기 입력 칸 16px), 위아래 테두리 합]
    const boxes: [Rules, string, number, number][] = [
      [PLAIN, '.btn', 13, 2],
      [PLAIN, '.btn.large', 13, 2],
      [PLAIN, '.btn.small', 13, 2],
      [PLAIN, '.titlebar', 15, 1],
      [PLAIN, '.toolbar .btn', 13, 2],
      [PLAIN, '.mb-btn', 13, 2],
      [PLAIN, '.tab', 13, 2],
      [PLAIN, '.tree-search', 13, 2],
      [PLAIN, '.explode-num', 13, 2],
      [PLAIN, '.section-num', 12, 2],
      [coarse, '.toolbar .btn', 13, 2],
      [coarse, '.btn.small', 13, 2],
      [coarse, '.btn.large', 13, 2],
      [coarse, '.tab', 13, 2],
      [coarse, '.tree-search', 16, 2],
      [coarse, '.title-actions .btn', 13, 2],
      [coarse, '.mb-btn', 13, 2],
      [coarse, '.explode-num', 13, 2],
      [coarse, '.section-num', 13, 2],
      [narrow, '.titlebar', 15, 1],
    ];
    const over = boxes.flatMap(([R, sel, inherited, border]) => {
      const hh = num(R, sel, 'height');
      const size = num(R, sel, 'font-size') || num(PLAIN, sel, 'font-size') || inherited;
      const line = size * 1.5 + padY(R, sel) + border;
      return hh >= line ? [] : [`${sel} ${hh}px < ${line}px`];
    });
    expect(over).toEqual([]);
    // 한 줄인 까닭: 단추·띠 단추·탭·앱 이름·문서 이름은 줄을 바꾸지 않는다(넘치면 단추가 넓어지거나 말줄임 — 문서 이름은 말풍선에 전체), 나머지는 한 줄 입력 칸
    for (const sel of ['.btn', '.mb-btn', '.tab', '.brand', '.doc-name']) expect(PLAIN.get(sel)?.['white-space'], sel).toBe('nowrap');
  });

  it('이름이 줄을 바꿀 수 있는 메뉴 항목은 높이를 못 박지 않고 최소 높이 — 좁은 창에서 간격을 넓혀 두 줄(39px)이 되면 항목이 따라 커져 이웃 항목 글과 겹치지 않는다', () => {
    // 메뉴 항목 이름은 줄 바꿈을 막지 않는다(메뉴 폭은 창 폭 − 16px까지 — 320px 창의 이름 자리 258px에 넓힌 간격의 영어·독일어 이름이 들지 않음)
    expect(PLAIN.get('.menu-item')?.['white-space']).toBeUndefined();
    expect(PLAIN.get('.menu-label')?.['white-space']).toBeUndefined();
    for (const [R, sel, min] of [
      [PLAIN, '.menu-item', 30],
      [coarse, '.menu-item', 44],
    ] as [Rules, string, number][]) {
      expect(R.get(sel)?.height, sel).toBeUndefined();
      expect(num(R, sel, 'min-height'), sel).toBe(min);
    }
    // 보통 글 간격의 한 줄(13px × 1.45 = 18.85px)은 최소 높이 안이라 항목 높이는 그대로(30px·손가락 44px — 두 줄 13px × 1.5 × 2 = 39px는 마우스 30px를 넘었다)
    expect(13 * 1.45 + padY(PLAIN, '.menu-item')).toBeLessThan(30);
  });
});

describe('다시 흐르기 폭(179차 — WCAG 1.4.10: 폭 320 CSS px = 1280px 창 400%, 마우스 — 쪽은 가로로 굴러가지 않고 넘치면 잘린다)', () => {
  const narrow = rules('(max-width: 759.98px)');
  const phone = rules('(max-width: 759.98px), (pointer: coarse) and (max-height: 499.98px)');
  const tiny = rules('(max-width: 479.98px)');
  const small = rules('(max-width: 420px)');
  const title = rules('(max-width: 767px)');
  /** 선언의 px 값(없으면 NaN) */
  const num = (R: Rules, sel: string, p: string) => parseFloat(R.get(sel)?.[p] ?? '');
  /** padding 줄임 꼴 → [위, 오른쪽, 아래, 왼쪽] px(스타일시트 글 그대로 — jsdom은 낱 속성으로 펼치지 않는다) */
  const box = (R: Rules, sel: string): [number, number, number, number] => {
    const v = (R.get(sel)?.padding ?? '').trim().split(/\s+/).map((x) => parseFloat(x) || 0);
    return [v[0] ?? 0, v[1] ?? v[0] ?? 0, v[2] ?? v[0] ?? 0, v[3] ?? v[1] ?? v[0] ?? 0];
  };

  it('창 폭을 따르는 칸은 320px 창 안에 놓이고, 제목 막대는 아이콘만으로 한 줄에 든다', () => {
    // 대화 상자 288px(본문 254px — 키 도움말 키 칸 nowrap 「Tab · Shift+Tab」 고정 폭 12px 132px + 할 일 칸 가장 긴 낱말 독일어 「Standardansichten」 ≈ 110px), 알림 칸 296px
    expect(css).toMatch(/\n\.dlg \{\n {2}width: min\(420px, calc\(100vw - 32px\)\);/);
    expect(css).toMatch(/\n\.toasts \{[^}]*\n {2}width: min\(560px, calc\(100% - 24px\)\);/);
    expect(PLAIN.get('.key-help th')?.['white-space']).toBe('nowrap');
    expect(320 - 32 - 2 - 2 * 16).toBeGreaterThanOrEqual(132 + 110);
    // 대화 상자 줄은 이름 칸 96px부터 이름 폭까지, 값 칸은 남은 폭으로 줄어든다(긴 값은 고르기 칸 안 말줄임 — 목록을 열면 전체)
    expect(PLAIN.get('.dlg-row')?.['grid-template-columns']).toBe('minmax(96px, auto) minmax(0, 1fr)');
    expect(num(PLAIN, '.dlg-select', 'min-width')).toBe(0);
    expect(PLAIN.get('.dlg-select')?.['max-width']).toBe('100%');
    // 메뉴·언어 목록은 창 폭 − 16px까지(메뉴는 menu.ts가 왼쪽 8px 안으로), 측정 띠는 3D 보기 폭 − 16px, 위 띠 묶음(분해·격리)은 − 104px(뷰 큐브 76px 자리), 단면 띠는 − 100px
    expect(num(PLAIN, '.menu', 'min-width')).toBe(180);
    for (const sel of ['.menu', '.language-list']) expect(PLAIN.get(sel)?.['max-width'], sel).toBe('calc(100vw - 16px)');
    expect(PLAIN.get('.measure-bar')?.['max-width']).toBe('calc(100% - 16px)');
    expect(phone.get('.top-bars')?.['max-width']).toBe('calc(100% - 104px)');
    expect(narrow.get('.section-bar')?.['max-width']).toBe('calc(100% - 100px)');
    // 제목 막대: 좌우 여백 + 앱 아이콘(20 + 2) + 버튼 다섯(아이콘 18 + 좌우 여백 + 테두리 2, 사이 틈) + 언어 단추 + 칸 사이 틈 둘 — 세로 막대 15px가 있어도 들어간다
    const [, padR, , padL] = box(narrow, '.titlebar');
    const [, btnR, , btnL] = box(small, '.title-actions .btn');
    const row = padL + padR + 22 + 5 * (18 + btnL + btnR + 2) + 4 * num(small, '.title-actions', 'gap') + num(title, '.language-control', 'width') + 2 * num(narrow, '.titlebar', 'gap');
    expect(row).toBe(254);
    expect(row).toBeLessThanOrEqual(320 - 15);
  });

  it('격리 띠: 480px 미만 화면에서는 「격리 풀기」도 아이콘만(52차 측정 띠·고른 부품 카드 꼴) — 320px 창의 띠 안 200px에 이름표·이름·버튼이 들어가 버튼이 띠 밖 뷰 큐브 위로 나가지 않는다', () => {
    // 이름 글은 숨기고(화면 읽기 이름은 말풍선 글 「격리 풀기 (I)」 — 네 언어 사전에 있음), 폭은 측정 띠 단추와 같은 38px·좌우 여백 0(손가락 기기 44px는 touch.test.ts)
    expect(tiny.get('.iso-bar .mb-btn > span')?.display).toBe('none');
    expect(num(tiny, '.iso-bar .mb-btn', 'min-width')).toBe(38);
    expect(box(tiny, '.iso-bar .mb-btn')).toEqual([0, 0, 0, 0]);
    expect(num(tiny, '.measure-bar .mb-btn', 'min-width')).toBe(38);
    // 띠 안 폭 = 3D 보기 320 − 위 띠 묶음 자리 104 − 좌우 여백 − 테두리 1 × 2
    const keep = Number(/^calc\(100% - (\d+)px\)$/.exec(phone.get('.top-bars')?.['max-width'] ?? '')?.[1]);
    const [, padR, , padL] = box(PLAIN, '.iso-bar');
    const inner = 320 - keep - padL - padR - 2;
    expect(inner).toBe(200);
    // 이름표(줄지 않음)는 가장 긴 독일어 「Rest abblenden」(600 12px ≈ 83px). 버튼 이름 글을 보이면 「Isolierung aufheben」 버튼 ≈ 156px라
    // 83 + 틈 8 × 2 + 156 = 255px — 띠 밖으로 55px 나가 뷰 큐브(x 236~312)를 38px 덮고 이름 칸은 0px였다. 아이콘만이면 이름 칸 63px
    const gap = num(PLAIN, '.iso-bar', 'gap');
    expect(inner - 83 - 2 * gap - 156).toBeLessThan(0);
    expect(inner - 83 - 2 * gap - num(tiny, '.iso-bar .mb-btn', 'min-width')).toBeGreaterThanOrEqual(60);
    // 넓은 화면은 그대로: 보통 규칙의 띠 단추는 이름 글과 좌우 여백 12px, 격리 띠 이름은 한 줄 말줄임
    expect(box(PLAIN, '.mb-btn')[1]).toBe(12);
    expect(PLAIN.has('.iso-bar .mb-btn > span')).toBe(false);
    expect(PLAIN.get('.iso-text')?.['text-overflow']).toBe('ellipsis');
  });

  it('195차: 480px 미만 화면의 동작 버튼이 있는 알림은 글이 한 줄에 들지 않으면 버튼·✕를 다음 줄로 — 320px 창에서 버튼·✕가 글 칸을 62~130px로 좁혀 3D 보기보다 높아진 알림의 위가 잘리지 않는다', () => {
    // 동작 버튼(보기 링크의 「파일로 내보내기」·「새로 고침」)이 있는 알림만 줄을 바꾸고, 글 칸은 글 폭(바탕 auto — 보통 규칙 flex 1은 바탕 0%라 줄을 나누지 않음)에서
    // 첫 줄의 아이콘 16 + 틈 8 뒤 폭까지 — 글이 길면 첫 줄을 채워 버튼·✕(문서 차례 그대로 — Tab 차례와 같음)가 다음 줄, 짧으면(알림 폭이 내용 폭) 한 줄 그대로
    const A = '.toast:has(.toast-act)';
    expect(tiny.get(A)?.['flex-wrap']).toBe('wrap');
    expect([tiny.get(`${A} > span`)?.['flex-basis'], tiny.get(`${A} > span`)?.['max-width']]).toEqual(['auto', 'calc(100% - 24px)']);
    // 넓은 화면·동작 버튼 없는 알림은 그대로(한 줄, 글 칸은 남은 폭)
    expect(PLAIN.get('.toast')?.['flex-wrap']).toBeUndefined();
    for (const sel of [A, `${A} > span`]) expect(PLAIN.has(sel), sel).toBe(false);
    expect(tiny.has('.toast')).toBe(false);
    // 320px 창 알림 안 폭 = 알림 칸(3D 보기 − 24) − 좌우 여백 − 테두리 1 × 2
    const keep = Number(/\n\.toasts \{[^}]*\n {2}width: min\(560px, calc\(100% - (\d+)px\)\);/.exec(css)?.[1]);
    const [pT, pR, pB, pL] = box(PLAIN, '.toast');
    const inner = 320 - keep - pL - pR - 2;
    expect(inner).toBe(274);
    const gap = num(PLAIN, '.toast', 'gap');
    const close = num(PLAIN, '.icon-btn', 'width');
    const icon = 16; // app.ts toast(): icon(…, 16)
    const lead = Number(/^calc\(100% - (\d+)px\)$/.exec(tiny.get(`${A} > span`)?.['max-width'] ?? '')?.[1]);
    expect(lead).toBe(icon + gap);
    // 보기 링크 알림(손질을 못 담음 — 두 문장 + 「파일로 내보내기」)의 글 폭·버튼 폭 어림(13px 글: 한글·가나·한자 13px, 라틴 6.5px / 12px 버튼 글 + 좌우 여백 8 + 테두리)
    const langs: [string, number, number][] = [
      ['ko', 1150, 105],
      ['en', 1430, 106],
      ['de', 1580, 146],
      ['ja', 1460, 126],
      ['zh-CN', 970, 78],
    ];
    const lineH = 13 * 1.45;
    const lines = (w: number, col: number) => Math.ceil(w / (col * 0.9)); // 줄 끝 빈자리 어림 10%
    const frame = pT + pB + 2;
    // 고치기 전: 아이콘·글·버튼·✕가 한 줄 — 글 칸 = 안 폭 − 아이콘 − 틈 셋 − 버튼 − ✕
    const colBefore = langs.map(([, , act]) => inner - icon - 3 * gap - act - close);
    expect(colBefore).toEqual([103, 102, 62, 82, 130]);
    const hBefore = langs.map(([, w], i) => Math.round(Math.max(lines(w, colBefore[i]!) * lineH, close) + frame));
    // 고친 뒤: 글 칸이 첫 줄(안 폭 − 아이콘 − 틈), 버튼·✕는 다음 줄(줄 틈 + max(버튼 24, ✕ 26))
    const colAfter = inner - lead;
    expect(colAfter).toBe(250);
    const hAfter = langs.map(([, w]) => Math.round(lines(w, colAfter) * lineH + gap + Math.max(24, close) + frame));
    expect([hBefore, hAfter]).toEqual([
      [263, 320, 565, 395, 188],
      [165, 184, 203, 184, 146],
    ]);
    // 3D 보기(넘침 숨김) 아래에서 위로 쌓여 넘친 위쪽은 잘린다(알림 칸은 굴리지 않음): 320×256 창(앱 480px — 작업 영역 370, 시트를 열면 3D 보기 206),
    // 알림 칸 bottom 12px(고른 부품 카드가 보이면 68px)
    const cut = (h: number[], V: number, bottom: number) => h.map((x) => Math.max(0, x - (V - bottom)));
    const views: [number, number][] = [
      [370, 12],
      [370, 68],
      [206, 12],
      [206, 68],
    ];
    expect(views.map(([V, b]) => cut(hBefore, V, b))).toEqual([
      [0, 0, 207, 37, 0],
      [0, 18, 263, 93, 0],
      [69, 126, 371, 201, 0],
      [125, 182, 427, 257, 50],
    ]);
    expect(views.map(([V, b]) => cut(hAfter, V, b))).toEqual([
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 9, 0, 0],
      [27, 46, 65, 46, 8],
    ]);
    // 짧은 글(「새 버전이 있습니다.」 어림 115 + 「새로 고침」 69)은 한 줄에 들어 줄을 바꾸지 않는다(글 칸 한도 250 안)
    expect(icon + gap + 115 + gap + 69 + gap + close).toBeLessThanOrEqual(inner);
    expect(115).toBeLessThanOrEqual(colAfter);
  });

  it('196차: 휴대폰·좁은 창 분해 띠의 갈래 묶음과 화면 방향 칸은 띠 안보다 넓으면(긴 번역) 버튼을 다음 줄로 — 위 띠 묶음(192차 굴림 상자) 안에서 가로로 굴리지 않는다', () => {
    const coarse = rules('(pointer: coarse)');
    const coarseNarrow = rules('(pointer: coarse) and (max-width: 759.98px)');
    // 휴대폰 블록에서만: 분해 띠 안 갈래 묶음(.seg — 방식·장면 축·화면 방향·손질·되돌리기)과 화면 방향 칸(이름표 「화면」 + 묶음)은 줄을 바꾸고 띠 안 폭까지,
    // 분해 띠 버튼은 줄 남은 폭을 채운다(한 줄에 든 묶음은 남는 폭이 없어 그대로 — 손질 버튼은 inline-flex라 늘어나면 아이콘·글을 가운데로)
    for (const sel of ['.explode-bar .seg', '.explode-screen']) expect([phone.get(sel)?.['flex-wrap'], phone.get(sel)?.['max-width']], sel).toEqual(['wrap', '100%']);
    expect([phone.get('.explode-bar .seg-btn')?.['flex-grow'], phone.get('.explode-bar .seg-btn')?.['justify-content']]).toEqual(['1', 'center']);
    // 넓은 화면·태블릿(휴대폰 조건 밖)은 그대로: 묶음·화면 방향 칸은 줄을 바꾸지 않는 한 줄이고, 묶음 사이 줄 바꿈(갈래·방향·손질 칸 — 이미 있음)만
    for (const R of [PLAIN, narrow, coarse, coarseNarrow]) {
      expect(R.has('.explode-bar .seg')).toBe(false);
      expect(R.get('.explode-screen')?.['flex-wrap']).toBeUndefined();
      expect(R.get('.explode-bar .seg-btn')?.['flex-grow']).toBeUndefined();
    }
    expect(PLAIN.get('.seg')?.['flex-wrap']).toBeUndefined();
    for (const sel of ['.explode-opts', '.explode-axes', '.explode-tweak']) expect([PLAIN.get(sel)?.['flex-wrap'], PLAIN.get(sel)?.['max-width']], sel).toEqual(['wrap', '100%']);
    // 위 띠 묶음은 세로 굴림 상자(192차 — overflow-x를 따로 두지 않아 auto로 셈해짐): 띠 안보다 넓은 낱칸은 묶음 안 가로 굴림이 된다
    expect([phone.get('.top-bars')?.['overflow-y'], phone.get('.top-bars')?.['overflow-x']]).toEqual(['auto', undefined]);
    // 띠 안 폭 = 3D 보기 폭(세로 휴대폰 — 시트는 아래) − 위 띠 묶음 자리 104 − 분해 띠 좌우 여백 − 테두리 1 × 2
    const keep = Number(/^calc\(100% - (\d+)px\)$/.exec(phone.get('.top-bars')?.['max-width'] ?? '')?.[1]);
    const [, ePadR, , ePadL] = box(PLAIN, '.explode-bar');
    const inner = (W: number) => W - keep - ePadL - ePadR - 2;
    expect([320, 360, 375, 414].map(inner)).toEqual([200, 240, 255, 294]);
    // 버튼: 손가락(P — 최소 44×44·좌우 여백 10·13px)·마우스(M — 최소 28·26·좌우 여백 6·12px), 묶음 테두리·버튼 사이 선, 손질 버튼의 아이콘·글 틈, 화면 방향 칸 틈·이름표 글 크기
    const segLine = parseFloat(val(PLAIN, '.seg', 'border', 'border-width', 'border-top-width'));
    const sep = Number(/\n\.seg-btn \+ \.seg-btn \{\n {2}border-left: (\d+)px solid/.exec(css)?.[1]);
    const [, cPadR, , cPadL] = box(coarse, '.explode-bar .seg-btn');
    const [, mPadR, , mPadL] = box(PLAIN, '.seg-btn');
    const mFont = Number(/\n\.seg-btn \{[^}]*\n {2}font: 600 (\d+)px var\(--font\);/.exec(css)?.[1]);
    type Dev = { min: number; minH: number; pad: number; font: number; latin: number };
    // 글 폭 어림(195차 꼴): 버튼 글(600) 라틴·빈칸 0.54em(13px 7·12px 6.5px), 한글·가나·한자 1em
    const P: Dev = { min: num(coarse, '.explode-bar .seg-btn', 'min-width'), minH: num(coarse, '.explode-bar .seg-btn', 'min-height'), pad: cPadL + cPadR, font: num(coarse, '.explode-bar .seg-btn', 'font-size'), latin: 7 };
    const M: Dev = { min: num(PLAIN, '.seg-btn', 'min-width'), minH: num(PLAIN, '.seg-btn', 'min-height'), pad: mPadL + mPadR, font: mFont, latin: 6.5 };
    expect([segLine, sep, P.min, P.minH, P.pad, P.font, M.min, M.minH, M.pad, M.font]).toEqual([1, 1, 44, 44, 20, 13, 28, 26, 12, 12]);
    const iconGap = num(PLAIN, '.explode-tweak .seg-btn', 'gap');
    const scrGap = num(PLAIN, '.explode-screen', 'gap');
    const labFont = num(PLAIN, '.explode-screen-label', 'font-size');
    expect([iconGap, scrGap, labFont]).toEqual([4, 4, 12]);
    const textW = (s: string, cjk: number, latin: number) => [...s].reduce((a, ch) => a + (ch <= 'ɏ' ? latin : cjk), 0);
    // 낱칸 글은 사전 값(한국어는 원문). [글, 아이콘 폭] — explodebar.ts: 옮기기·스냅 lineIcon 16, 손질 파일 ⋯ icon('more', 16), 되돌리기·다시 하기 icon('reset', 14)
    type Btn = [string, number];
    const LANGS = ['ko', 'en', 'de', 'ja', 'zh-CN'];
    const groups = (lang: string): [string, Btn[], string?][] => {
      const d = (lang === 'ko' ? {} : JSON.parse(readFileSync(join(__dirname, `../../site/locales/${lang}.json`), 'utf8'))) as Record<string, string>;
      const t = (k: string) => d[k] ?? k;
      return [
        ['방식', [[t('단계별'), 0], [t('한꺼번에'), 0]]],
        ['장면 축', [[t('사방'), 0], ['X', 0], ['Y', 0], ['Z', 0]]],
        ['화면 방향', [[t('가로'), 0], [t('세로'), 0], [t('가로세로'), 0]], t('화면')],
        ['손질', [[t('옮기기'), 16], [t('스냅'), 16], ['', 16]]],
        ['되돌리기', [[t('되돌리기'), 14], [t('다시 하기'), 14]]],
      ];
    };
    const btnW = ([s, icon]: Btn, D: Dev) => Math.max(D.min, D.pad + icon + (s && icon ? iconGap : 0) + textW(s, D.font, D.latin));
    /** 줄을 바꾼 묶음: 안 너비 c에 버튼을 차례로 채운 줄 폭들(줄 머리 버튼도 앞 버튼이 있으면 사이 선 그대로) */
    const rows = (ws: number[], c: number): number[] => {
      const out: number[] = [];
      ws.forEach((w, i) => {
        const x = w + (i ? sep : 0);
        const n = out.length - 1;
        if (n >= 0 && out[n]! + x <= c) out[n] = out[n]! + x;
        else out.push(x);
      });
      return out;
    };
    const wraps = phone.get('.explode-bar .seg')?.['flex-wrap'] === 'wrap' && phone.get('.explode-screen')?.['flex-wrap'] === 'wrap';
    const labLine = labFont * 1.45; // 이름표 줄 높이(본문 1.45)
    const devs: [string, number, Dev][] = [
      ['P320', 320, P],
      ['P360', 360, P],
      ['P375', 375, P],
      ['P414', 414, P],
      ['M320', 320, M],
    ];
    const over: string[] = [];
    const grow: Record<string, number[]> = {};
    const undoGrow: string[] = [];
    let widest = -Infinity;
    for (const [name, W, D] of devs) {
      const c = inner(W);
      grow[name] = LANGS.map((lang) => {
        let dH = 0;
        for (const [g, btns, label] of groups(lang)) {
          const ws = btns.map((b) => btnW(b, D));
          const seg = ws.reduce((a, b) => a + b, 0) + sep * (ws.length - 1) + 2 * segLine;
          // 이름표는 12px 보통 글(라틴 6·그 밖 12px)
          const lab = label === undefined ? 0 : textW(label, labFont, 6);
          const one = label === undefined ? seg : lab + scrGap + seg;
          if (one > c) over.push(`${name} ${lang} ${g} +${Math.round(one - c)}`);
          // 줄 바꿈이면 묶음은 안 너비(띠 안 − 테두리)에 버튼을 채우고, 넘치는 화면 방향 칸은 이름표 줄 아래 묶음 — 아니면 한 줄 그대로
          const r = wraps ? rows(ws, c - 2 * segLine) : [seg - 2 * segLine];
          const labRow = wraps && label !== undefined && one > c;
          const after = Math.max(...r) + 2 * segLine;
          widest = Math.max(widest, (label === undefined ? after : labRow ? Math.max(lab, after) : lab + scrGap + after) - c);
          const h = (r.length - 1) * D.minH + (labRow ? labLine + scrGap : 0);
          if (g === '되돌리기') {
            if (h) undoGrow.push(`${name} ${lang} +${Math.round(h)}`);
          } else dH += h;
        }
        return Math.round(dH);
      });
    }
    // 고치기 전(한 줄): 띠 안보다 넓은 낱칸 = 위 띠 묶음 안 가로 굴림(독일어 손질 묶음이 가장 넓음 — 휴대폰 44px 버튼은 마우스보다 넓다)
    expect(over).toEqual([
      'P320 en 화면 방향 +9',
      'P320 de 방식 +11',
      'P320 de 화면 방향 +19',
      'P320 de 손질 +68',
      'P320 de 되돌리기 +26',
      'P320 ja 손질 +6',
      'P360 de 손질 +28',
      'P375 de 손질 +13',
      'M320 de 손질 +26',
    ]);
    // 고친 뒤: 가장 넓은 줄도 띠 안(가로 굴림 없음)
    expect(widest).toBeLessThanOrEqual(0);
    // 띠가 높아지는 양(px — 늘 보이는 칸, 언어 차례 ko·en·de·ja·zh-CN): 줄 하나 = 버튼 최소 높이(P 44·M 26), 화면 방향 이름표 줄 = 17.4 + 틈 4.
    // 192차 굴림 상자 안이라 늘어난 만큼 세로로 굴려 닿는다. 되돌리기 묶음(손질이 있을 때)은 따로
    expect(grow).toEqual({
      P320: [0, 21, 109, 44, 0],
      P360: [0, 0, 44, 0, 0],
      P375: [0, 0, 44, 0, 0],
      P414: [0, 0, 0, 0, 0],
      M320: [0, 0, 26, 0, 0],
    });
    expect(undoGrow).toEqual(['P320 de +44']);
  });
});

/**
 * 190차(WCAG 2.4.11 초점 가려지지 않음(최소)): 3D 보기 위 띠는 굴리지 않는 3D 보기 안에 겹쳐 놓여(같은 z면 뒤 칸이 위) 굴림 상자의 scroll-padding으로는 비키지 않는다.
 * 휴대폰(손가락·760px 미만)은 단면 막대가 두 줄 이상(축·숫자 칸·버튼 44px 줄 + 밀대 44px 줄)인데 위 띠 묶음(분해·격리 띠)은 넓은 화면 한 줄 막대에 맞춘 56px에 놓여
 * 밀대 줄을 통째로 덮을 수 있고, 덮은 띠는 Esc로 닫히지 않는다. 190차는 키보드 초점이 든 단면 막대·측정 띠(고른 부품 카드)만 위 띠 묶음 위로 올렸다(손가락으로는 덮인 채).
 * 191차(1.4.10·2.4.11·손가락 누름): 휴대폰은 단면 막대와 위 띠 묶음을 3D 보기 흐름에 차례로 놓아(다른 자식은 모두 absolute) 위 띠 묶음이 단면 막대 실제 높이 아래에 온다.
 * 단면 막대를 덮는 칸이 없어 초점 z는 측정 띠(더 아래까지 내려온 분해 띠가 덮는 고른 부품 카드)만 남는다.
 * 192차(1.4.10·2.4.11): 그렇게 내려온 분해 띠(어림 264px)가 작은 3D 보기 밖으로 잘려 손가락으로 누를 수 없고 Tab 초점이 3D 보기를 굴렸다 — 휴대폰은 3D 보기를 세로 flex로 두어
 * 위 띠 묶음(굴림 상자)이 단면 막대 아래 남은 높이로 줄고 넘친 띠는 묶음 안에서 굴린다
 */
describe('초점 가려지지 않음·위 띠 쌓기·굴림(190~192차 — WCAG 2.4.11·1.4.10: 3D 보기 위 띠가 서로와 키보드 초점 칸을 통째로 덮지 않고 보기 밖으로 잘리지 않음)', () => {
  const narrow = rules('(max-width: 759.98px)');
  const coarse = rules('(pointer: coarse)');
  const coarseNarrow = rules('(pointer: coarse) and (max-width: 759.98px)');
  const phone = rules('(max-width: 759.98px), (pointer: coarse) and (max-height: 499.98px)');
  const px = (R: Rules, sel: string, ...p: string[]) => parseFloat(val(R, sel, ...p));
  const pad = (R: Rules, sel: string): [number, number, number, number] => {
    const v = (R.get(sel)?.padding ?? '').trim().split(/\s+/).map((x) => parseFloat(x) || 0);
    return [v[0] ?? 0, v[1] ?? v[0] ?? 0, v[2] ?? v[0] ?? 0, v[3] ?? v[1] ?? v[0] ?? 0];
  };
  /** 테두리 굵기(줄임 꼴 border에 var()가 있으면 jsdom이 낱 속성으로 펼치지 않을 수 있다) */
  const line = (R: Rules, sel: string) => px(R, sel, 'border', 'border-width', 'border-top-width');
  const z = (sel: string) => parseFloat(PLAIN.get(sel)?.['z-index'] ?? '');
  const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
  /** 3D 보기 자식 차례(app.ts viewEl) — 같은 z면 뒤 칸이 위에 그려진다 */
  const kids = /\n {4}this\.viewEl = h\('section', \{[^}]*\}, ([^;]*)\);/.exec(app)?.[1]?.split(',').map((s) => s.trim()) ?? [];
  const STACK = '.view:has(.section-bar:not([hidden])) .top-bars';

  it('191차: 휴대폰은 단면 막대와 위 띠 묶음을 3D 보기 흐름에 쌓아 위 띠 묶음이 단면 막대 실제 높이(두 줄·세 줄·가로 한 줄) 아래에 온다 — 넓은 화면·태블릿은 지금 자리(56px)', () => {
    // 3D 보기 자식(app.ts 원문 차례): 단면 막대·위 띠 묶음 밖은 모두 absolute(어느 미디어 조건도 position을 바꾸지 않음) — 흐름에는 둘만, 단면 막대가 앞
    expect(kids).toEqual(['this.hostEl', 'this.aimLayer', 'this.sectionBar.handle', 'this.startEl', 'this.busyEl', 'this.dropEl', 'this.sectionBar.el', 'topBars', 'this.measureBar', 'this.toasts']);
    const out = ['.viewer-host', '.aim-layer', '.section-handle', '.start', '.busy', '.drop-hint', '.measure-bar', '.toasts'];
    for (const sel of out) expect(PLAIN.get(sel)?.position, sel).toBe('absolute');
    for (const R of [narrow, coarse, coarseNarrow, phone]) for (const sel of out) expect(R.get(sel)?.position, sel).toBeUndefined();
    // 넓은 화면·태블릿(휴대폰 조건 밖): 둘 다 absolute, 위 띠 묶음은 단면 막대가 보이면 56px(마우스 한 줄 막대 10 + 38 + 틈 8) — 760px 미만·손가락 블록에 자리 규칙 없음
    expect([PLAIN.get('.section-bar')?.position, PLAIN.get('.top-bars')?.position]).toEqual(['absolute', 'absolute']);
    expect([px(PLAIN, '.section-bar', 'top'), px(PLAIN, '.top-bars', 'top'), px(PLAIN, STACK, 'top')]).toEqual([10, 10, 56]);
    for (const R of [narrow, coarse, coarseNarrow]) {
      expect(R.has(STACK)).toBe(false);
      for (const sel of ['.section-bar', '.top-bars']) expect(R.get(sel)?.position, sel).toBeUndefined();
    }
    // 휴대폰(760px 미만·손가락 가로): 둘 다 relative — top·left는 흐름 자리에서 옮기는 값이라 단면 막대는 위·왼 8(가로는 10) 그대로이고, 단면 막대가 숨으면
    // (전역 [hidden] — 흐름에서 빠짐) 위 띠 묶음은 흐름 자리 0 + 10px로 지금 자리. 단면 막대 폭은 내용에 맞춤(absolute 때 줄어든 폭과 같은 셈 — jsdom은 fit-content를 버려 글로 봄)
    expect([phone.get('.section-bar')?.position, phone.get('.top-bars')?.position]).toEqual(['relative', 'relative']);
    expect(PLAIN.get('[hidden]')?.display).toBe('none !important');
    expect(phone.get('.top-bars')?.top).toBeUndefined();
    expect(css).toMatch(/\n {2}\.section-bar \{\n {4}position: relative;\n {4}width: fit-content;\n {2}\}/);
    const stack = px(phone, STACK, 'top');
    expect(stack).toBe(16);
    // 단면 막대 높이 손셈(손가락 44px — 760px 미만은 줄을 바꾸고 밀대는 차례 9·폭 100%로 따로 한 줄, 브라우저 기본 밀대 바깥 여백 2px씩):
    // 한 줄(가로·태블릿) = 테두리·위아래 여백 + 밀대 줄, 두 줄 = 첫 줄(축 갈래 44 + 테두리 2) + 줄 틈 + 밀대 줄, 세 줄(375~414px — 「뒤집기」·「단면 끄기」가 둘째 줄) = + 줄 틈 + 버튼 44
    expect(narrow.get('.section-bar')?.['flex-wrap']).toBe('wrap');
    expect(narrow.get('.section-slider')?.['order']).toBe('9');
    expect(val(narrow, '.section-slider', 'flex', 'flex-basis')).toContain('100%');
    const [padT, , padB] = pad(PLAIN, '.section-bar');
    const b = line(PLAIN, '.section-bar');
    const row1 = Math.max(px(coarse, '.seg-btn', 'min-height') + 2 * line(PLAIN, '.seg'), px(coarse, '.section-num', 'height'), px(coarse, '.icon-btn', 'height'));
    const sliderRow = 2 + px(coarse, '.section-slider', 'height') + 2;
    const gap = px(narrow, '.section-bar', 'row-gap');
    const one = 2 * b + padT + padB + sliderRow;
    const two = one + row1 + gap;
    const three = two + gap + px(coarse, '.icon-btn', 'height');
    expect([one, two, three]).toEqual([58, 106, 152]);
    // 위 띠 묶음 윗끝 = 흐름 자리(단면 막대 상자 높이) + 16, 단면 막대 아래 끝 = top + 높이 → 틈은 줄 수와 상관없다(세로 8 — 넓은 화면 56 − 10 − 38과 같음, 가로 6 — 띠 묶음 안 틈)
    const top = px(narrow, '.section-bar', 'top');
    for (const H of [two, three]) expect(H + stack - (top + H), String(H)).toBe(56 - 10 - 38);
    expect(one + stack - (px(PLAIN, '.section-bar', 'top') + one)).toBe(px(PLAIN, '.top-bars', 'gap'));
    // 고치기 전(56px)은 세 줄 막대(8~160)의 둘째 줄(61~105 — 「뒤집기」·「단면 끄기」)·밀대 줄(107~155)이 위 띠 묶음 안에 들었다 — 이제 위 띠 묶음은 168px부터
    expect([top + three, three + stack]).toEqual([160, 168]);
    // 옆: 위 띠 묶음은 단면 막대와 같은 왼쪽 8px(흐름 자리 0에서 옮김)
    expect(px(phone, '.top-bars', 'left')).toBe(px(narrow, '.section-bar', 'left'));
    // 쌓는 차례(z): 단면 막대·위 띠 묶음 6(흐름이라 서로 겹치지 않음), 측정 띠(고른 부품 카드) 4, 알림 칸 7, 조준 십자선 8 — 그대로
    expect([z('.section-bar'), z('.top-bars'), z('.measure-bar'), z('.toasts'), z('.aim-layer')]).toEqual([6, 6, 4, 7, 8]);
  });

  it('키보드 초점이 든 측정 띠(고른 부품 카드)는 위 띠 묶음 위로(알림 칸은 뒤에 놓여 그 위, 조준 십자선 그대로) — 191차: 단면 막대는 덮이지 않아 초점 z를 두지 않는다', () => {
    const sel = '.measure-bar:has(:focus-visible)';
    expect(z(sel)).toBeGreaterThan(z('.top-bars'));
    expect(z(sel)).toBeLessThanOrEqual(z('.toasts'));
    expect(z(sel)).toBeLessThan(z('.aim-layer'));
    // 자리·크기는 그대로(z만), 미디어 조건 없이 모든 폭
    expect(Object.keys(PLAIN.get(sel) ?? {})).toEqual(['z-index']);
    // 191차: 휴대폰은 흐름 쌓기로 단면 막대를 덮는 띠가 없고, 태블릿 손가락 한 줄 막대는 위 띠 묶음과 아래 12px만 겹쳐(일부 — 2.4.11 최소) 190차의 단면 막대 초점 z를 뺐다
    expect([...PLAIN.keys()].some((s) => /^\.section-bar:has\(/.test(s))).toBe(false);
    // 초점이 든 때만(:focus-within은 쓰지 않음 — 손가락·마우스로 누른 버튼에는 초점 표시가 없어 지금처럼)
    expect([...PLAIN.keys()].some((s) => /^\.(section|measure)-bar:focus-within$/.test(s))).toBe(false);
    expect([z('.section-bar'), z('.top-bars'), z('.measure-bar')]).toEqual([6, 6, 4]);
  });

  it('192차: 휴대폰은 3D 보기를 세로 flex로 두어 위 띠 묶음이 단면 막대 아래 남은 높이(3D 보기 아래 끝까지)로 줄고 넘친 띠는 묶음 안에서 굴린다 — 작은 3D 보기 밖으로 잘리지 않음', () => {
    // 3D 보기: 휴대폰 조건에서만 세로 flex — 흐름 자식은 단면 막대·위 띠 묶음 둘(191차 시험 — 나머지는 absolute에 위·아래 자리를 적어 자리 그대로), 넓은 화면·태블릿·760px 미만·손가락 블록은 block 그대로
    expect([phone.get('.view')?.display, phone.get('.view')?.['flex-direction']]).toEqual(['flex', 'column']);
    for (const R of [PLAIN, narrow, coarse, coarseNarrow]) expect(R.get('.view')?.display).toBeUndefined();
    // 위 띠 묶음은 세로 굴림 상자: flex 자동 최소 높이가 0이라 남은 높이까지 준다(% 최대 높이는 3D 보기 전체 높이 기준이라 단면 막대가 보이면 그 높이만큼 넘쳐 쓰지 않음).
    // 그 안 분해·격리 띠는 넘침 규칙이 없어(자동 최소 높이 = 내용) 줄지 않고 넘친 만큼 묶음 안에서 굴린다. 넓은 화면은 넘침 그대로
    expect(phone.get('.top-bars')?.['overflow-y']).toBe('auto');
    expect(phone.get('.top-bars')?.['max-height']).toBeUndefined();
    for (const sel of ['.top-bars', '.explode-bar', '.iso-bar']) expect([PLAIN.get(sel)?.overflow, PLAIN.get(sel)?.['overflow-y']], sel).toEqual([undefined, undefined]);
    // 아래 바깥 여백 = 흐름 자리에서 옮긴 top(단면 막대가 숨으면 10, 보이면 16): 흐름은 막대 높이 + 묶음 높이 + 여백 ≤ 3D 보기 높이 → 그려진 아래 끝 ≤ 3D 보기 아래 끝
    // (위 여백만 빼는 꼴 — 보이는 높이는 191차와 같고 잘리던 만큼이 굴림으로 닿는다)
    const top0 = px(PLAIN, '.top-bars', 'top');
    const top1 = px(phone, STACK, 'top');
    const mb0 = px(phone, '.top-bars', 'margin-bottom');
    const mb1 = px(phone, STACK, 'margin-bottom');
    expect([mb0, mb1]).toEqual([top0, top1]);
    expect([top0, top1]).toEqual([10, 16]);
    for (const sel of ['.top-bars', STACK]) expect(PLAIN.get(sel)?.['margin-bottom'], sel).toBeUndefined();
    // 띠 높이(손가락 44px): 분해 띠 = 테두리 + 위아래 여백 + 첫 줄(밀대 44 + 브라우저 기본 바깥 여백 2 × 2) + 줄 틈 + 아래 칸 줄(방식·방향·화면 방향·손질 —
    // 띠 안쪽이 방향 줄보다 좁은 세로 휴대폰은 네 줄, 가로 524px 보기는 세 줄: 갈래 44 + 테두리 2, 틈 6), 격리 띠 = 테두리 + 여백 + 버튼 44, 둘 다면 묶음 틈 6
    const [eT, , eB] = pad(PLAIN, '.explode-bar');
    const seg = px(coarse, '.explode-bar .seg-btn', 'min-height') + 2 * line(PLAIN, '.seg');
    const explode = (rows: number) =>
      2 * line(PLAIN, '.explode-bar') + eT + eB + (2 + px(coarse, '.explode-slider', 'height') + 2) + px(PLAIN, '.explode-bar', 'gap') + rows * seg + (rows - 1) * px(PLAIN, '.explode-opts', 'gap');
    const [iT, , iB] = pad(PLAIN, '.iso-bar');
    const iso = 2 * line(PLAIN, '.iso-bar') + iT + iB + px(coarse, '.mb-btn', 'height');
    const both = explode(4) + px(PLAIN, '.top-bars', 'gap') + iso;
    expect([explode(4), explode(3), iso, both]).toEqual([264, 212, 54, 324]);
    // 3D 보기 높이 V 어림(191차 손셈 — 화면 높이 − 제목·도구·상태 막대 122px에서 시트 위 50%, 높이 640px 이하 40%, 가로 844×390은 옆 패널이라 268)과
    // 단면 막대 높이 H(위 시험 손셈 — 세로 세 줄 152, 가로 한 줄 58, 0은 막대 숨김)
    const cases: [string, number, number, number][] = [
      ['320×568', 178, 152, explode(4)],
      ['360×640', 207, 152, explode(4)],
      ['375×812', 345, 152, explode(4)],
      ['414×896', 387, 152, explode(4)],
      ['844×390', 268, 58, explode(3)],
      ['360×640 막대 숨김·분해+격리', 207, 0, both],
    ];
    const got = cases.map(([name, V, H, C]) => {
      const [top, mb] = H ? [top1, mb1] : [top0, mb0];
      // 고치기 전(191차): 묶음은 내용 높이 그대로 H + top부터 — 3D 보기(넘침 숨김) 밖은 잘려 누를 수 없고 굴릴 수도 없다
      const cut = Math.max(0, H + top + C - V);
      // 고친 뒤: flex가 묶음을 남은 높이로 줄이고(0 아래로는 줄지 않음) 숨은 만큼은 묶음 안 굴림으로 닿는다 — 보이는 높이는 전과 같고 잘리던 만큼이 그대로 굴림
      const h = Math.max(0, Math.min(C, V - H - mb));
      expect(C - h, name).toBe(cut);
      // 묶음 상자가 3D 보기 안 → 잘린 칸에 Tab 초점이 가면 브라우저가 가장 가까운 굴림 상자(묶음)를 굴린다(초점 칸이 묶음 창 안에 들면 3D 보기는 굴리지 않음)
      expect(H + top + h, name).toBeLessThanOrEqual(V);
      return [name, cut, h];
    });
    expect(got).toEqual([
      ['320×568', 254, 10],
      ['360×640', 225, 39],
      ['375×812', 87, 177],
      ['414×896', 45, 219],
      ['844×390', 18, 194],
      ['360×640 막대 숨김·분해+격리', 127, 197],
    ]);
  });
});
