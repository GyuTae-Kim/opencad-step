// @vitest-environment jsdom
/**
 * 손가락 기기 누르는 자리(50차): styles.css의 `(pointer: coarse)` 규칙이 누를 것을 44×44 CSS px 이상으로 두는지
 * (WCAG 2.5.5 누르는 자리 크기(강화) 44px — 2.5.8(최소) 24px은 패널 손잡이 띠), 그리고 레이어·PMI 표의 작은 확인 칸을 44px 라벨로 감쌌는지.
 * jsdom에는 배치·매체 조건이 없으므로 스타일시트를 CSSOM으로 읽어 손가락 기기 규칙의 선언 값을 본다(실제 크기는 헤드리스 휴대폰 흉내로 쟀다 — README 개발 절)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { groupGrid, treeView } from '../../src/app/treeview';
import { pmiView } from '../../src/app/pmiview';

// TOUCH_CSS: 다른 판의 스타일시트로 같은 시험을 돌려 볼 때(앞 판에서 실패하는지 확인용)
const css = readFileSync(process.env.TOUCH_CSS || join(__dirname, '../../src/app/styles.css'), 'utf8');

/** 매체 조건이 손가락 기기(pointer: coarse — not 빼고)를 고르는 규칙의 선택자 → 선언(뒤 규칙이 앞을 덮는다) */
function coarseRules(): { all: { sel: string; media: string; style: CSSStyleDeclaration }[]; last: Map<string, Record<string, string>> } {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  const all: { sel: string; media: string; style: CSSStyleDeclaration }[] = [];
  const last = new Map<string, Record<string, string>>();
  for (const r of [...el.sheet!.cssRules]) {
    if (!(r instanceof CSSMediaRule)) continue;
    const media = r.media.mediaText;
    if (!/pointer:\s*coarse/.test(media) || /^not /.test(media)) continue;
    for (const s of [...r.cssRules]) {
      if (!(s instanceof CSSStyleRule)) continue;
      for (const sel of s.selectorText.split(',').map((x) => x.trim())) {
        all.push({ sel, media, style: s.style });
        const o = last.get(sel) ?? {};
        for (let i = 0; i < s.style.length; i++) o[s.style[i]!] = s.style.getPropertyValue(s.style[i]!);
        last.set(sel, o);
      }
    }
  }
  el.remove();
  return { all, last };
}

const px = (v: string | undefined) => (v && /^[\d.]+px$/.test(v.trim()) ? parseFloat(v) : NaN);

describe('손가락 기기 규칙(styles.css)', () => {
  const { all, last } = coarseRules();

  it('누를 것마다 높이와(줄처럼 폭이 넓은 것이 아니면) 폭이 44px 이상', () => {
    // [선택자, 높이 속성, 폭 속성(없으면 폭은 줄·칸 폭 그대로)]
    const want: [string, string, string | null][] = [
      ['.btn', 'min-height', 'min-width'],
      ['.toolbar .btn', 'height', 'min-width'],
      ['.title-actions .btn', 'height', 'min-width'],
      ['.titlebar .language-trigger', 'height', 'width'],
      ['html .language-list button', 'min-height', null],
      ['.menu-item', 'height', null],
      ['.btn.small', 'height', null],
      ['.btn.large', 'height', null],
      ['.icon-btn', 'height', 'width'],
      ['.seg-btn', 'height', 'min-width'],
      ['.tab', 'height', null],
      ['.tree-row', 'min-height', null],
      ['.twisty', 'height', 'width'],
      ['.eye', 'height', 'width'],
      ['.tree-search', 'height', null],
      ['.link-btn', 'min-height', 'min-width'],
      ['.cb-hit', 'min-height', 'min-width'],
      ['label.check', 'min-height', null],
      ['.mb-btn', 'height', null],
      ['.mb-kind .seg-btn', 'height', null],
      ['.mb-btn.icon', 'height', 'width'],
      ['.measure-bar .mb-btn', 'height', 'min-width'],
      ['.section-slider', 'height', null],
      ['.section-num', 'height', null],
      ['.explode-slider', 'height', null],
      ['.explode-bar .seg-btn', 'height', 'min-width'],
      ['.explode-bar > .icon-btn', 'height', 'width'],
      ['.explode-num', 'height', null],
      ['.dlg-select', 'min-height', null],
      ['.recent .recent-del', 'height', 'width'],
      ['.recent-open', 'min-height', null],
    ];
    const short: string[] = [];
    for (const [sel, hp, wp] of want) {
      const o = last.get(sel) ?? {};
      // 높이를 이 선택자에 두지 않은 것(mb-btn.icon·measure-bar 카드 단추)은 .mb-btn 높이를 물려받는다
      const hv = px(o[hp]) || px(last.get('.mb-btn')?.height);
      if (!(hv >= 44)) short.push(`${sel} ${hp}=${o[hp]}`);
      if (wp && !(px(o[wp]) >= 44)) short.push(`${sel} ${wp}=${o[wp]}`);
    }
    expect(short).toEqual([]);
  });

  it('손가락 기기 규칙이 누를 것에 44px보다 작은 크기를 주지 않는다(패널 손잡이 띠 24px — 2.5.8, 칸 안 확인 칸 그림만 예외)', () => {
    const allow = new Map([
      ['.panel-resizer', 24],
      ['.cb-hit input', 20],
    ]);
    const bad: string[] = [];
    for (const { sel, media, style } of all) {
      if (!/btn|button|tab|seg|item|trigger|resizer|num|select|input|slider|twisty|eye|row|search|link|check|recent/.test(sel)) continue;
      // 화면 읽기용으로만 남긴 글(1px·clip — 좁은 도구 막대의 단추 이름 등)은 누를 것이 아니다
      if (style.getPropertyValue('clip')) continue;
      for (const p of ['height', 'min-height', 'width', 'min-width']) {
        const v = px(style.getPropertyValue(p));
        if (Number.isNaN(v)) continue;
        if (v < (allow.get(sel) ?? 44)) bad.push(`${media} ${sel} ${p}: ${v}px`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('패널 손잡이: 시트는 24px 띠가 탭을 덮지 않는다(3D 보기 쪽 10px + 탭 위 14px 띠), 옆 패널은 24px 폭', () => {
    const narrow = all.filter((x) => x.sel === '.panel-resizer' && /max-width:\s*759\.98px/.test(x.media));
    expect(narrow).toHaveLength(1);
    const top = px(narrow[0]!.style.getPropertyValue('top').replace('-', ''));
    const hh = px(narrow[0]!.style.getPropertyValue('height'));
    expect(hh).toBeGreaterThanOrEqual(24);
    // 손잡이가 패널 안으로 들어오는 몫(높이 − 위로 나간 몫)이 탭 위 띠 높이를 넘지 않는다
    const head = all.find((x) => x.sel === '.panel-head' && /max-width:\s*759\.98px/.test(x.media));
    expect(hh - top).toBeLessThanOrEqual(px(head!.style.getPropertyValue('padding-top')));
    // 옆 패널: 24px 폭, 패널 안으로 들어오는 몫이 패널 왼쪽 띠(padding) 안 — 탭·나무 줄 접기 단추를 덮지 않는다
    const side = all.find((x) => x.sel === '.panel-resizer' && !/max-width/.test(x.media))!;
    const sw = px(side.style.getPropertyValue('width'));
    expect(sw).toBeGreaterThanOrEqual(24);
    const pad = all.find((x) => x.sel === '.panel' && !/max-width/.test(x.media))!;
    expect(sw - px(side.style.getPropertyValue('left').replace('-', ''))).toBeLessThanOrEqual(px(pad.style.getPropertyValue('padding-left')));
    // 시트에서는 그 띠를 없앤다(손잡이는 위쪽)
    expect(parseFloat(all.find((x) => x.sel === '.panel' && /max-width:\s*759\.98px/.test(x.media))!.style.getPropertyValue('padding-left'))).toBe(0);
  });

  it('320px 휴대폰: 도구 막대 일곱 단추(44px)가 틈·구분선 없이 한 줄(양옆 2px)', () => {
    const r = all.filter((x) => /max-width:\s*359\.98px/.test(x.media));
    const bar = r.find((x) => x.sel === '.toolbar')!;
    expect(parseFloat(bar.style.getPropertyValue('gap'))).toBe(0);
    expect(7 * 44 + 2 * px(bar.style.getPropertyValue('padding-inline'))).toBeLessThanOrEqual(320);
    expect(r.find((x) => x.sel === '.toolbar .tool-sep')!.style.getPropertyValue('display')).toBe('none');
    // 375px보다 좁으면 제목 막대 앱 이름 글은 화면 읽기용으로만(아이콘만 보임)
    const brand = all.find((x) => x.sel === '.brand > span' && /max-width:\s*374\.98px/.test(x.media));
    expect(brand!.style.getPropertyValue('clip')).toMatch(/rect/);
  });

  it('51차: 메뉴의 단축키 글은 손가락 기기에서 숨기고, 구분선 위아래 틈은 2px', () => {
    expect(last.get('.menu kbd')?.display).toBe('none');
    expect(last.get('.menu-sep')?.margin).toBe('2px 6px');
    // 마우스 화면 규칙(매체 조건 없음)은 그대로 단축키 글을 보인다
    const el = document.createElement('style');
    el.textContent = css;
    document.head.append(el);
    const plain = [...el.sheet!.cssRules].filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === '.menu kbd');
    el.remove();
    expect(plain).toHaveLength(1);
    expect(plain[0]!.style.getPropertyValue('display')).toBe('');
  });

  it('51차: 휴대폰 시트의 나무 도구 줄은 "⋯" 단추가 있을 때만 그 단추 하나로(거르기 칸 오른쪽 칸), 넓은 화면은 "⋯"를 숨긴다', () => {
    const sheet = all.filter((x) => /max-width:\s*759\.98px/.test(x.media));
    const get = (sel: string) => sheet.find((x) => x.sel === sel)?.style;
    expect(get('.tree-tools:has(> .tree-more-btn) > .btn:not(.tree-more-btn)')?.getPropertyValue('display')).toBe('none');
    expect(get('.tree-tools > .tree-more-btn')?.getPropertyValue('display')).toBe('inline-flex');
    expect(get('.prop-group:has(> .tree-tools > .tree-more-btn) > .tree-search')?.getPropertyValue('grid-column')).toBe('1');
    const tools = get('.prop-group:has(> .tree-tools > .tree-more-btn) > .tree-tools');
    expect([tools?.getPropertyValue('grid-column'), tools?.getPropertyValue('grid-row')]).toEqual(['2', '2']);
    // 간섭 검사 묶음의 .tree-tools("⋯" 없음)는 건드리지 않는다 — 규칙마다 "⋯"가 있을 때만
    for (const x of sheet) if (/tree-tools/.test(x.sel) && x.sel !== '.tree-tools > .tree-more-btn') expect(x.sel).toMatch(/:has\(> (\.tree-tools > )?\.tree-more-btn\)/);
    const el = document.createElement('style');
    el.textContent = css;
    document.head.append(el);
    const plain = [...el.sheet!.cssRules].find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === '.tree-more-btn');
    el.remove();
    expect(plain?.style.getPropertyValue('display')).toBe('none');
  });

  it('52차: 패널 탭은 좌우 틈 8px(폭 44px 이상, 줄지 않아 글이 이웃 탭에 붙지 않음) — 넓은 화면(마우스)은 12px 그대로', () => {
    const tab = last.get('.tab')!;
    expect([tab.padding?.replace(/^0px/, '0'), px(tab['min-width']), px(tab.height)]).toEqual(['0 8px', 44, 44]);
    // 줄지 않는다(min-width가 44px라 줄면 "Eigenschaften"·"プロパティ" 글이 탭보다 넓어져 이웃 글에 붙었다 — 넘치면 줄을 굴린다)
    expect(tab['flex-shrink'] ?? tab.flex).toMatch(/^(0|none)/);
    const el = document.createElement('style');
    el.textContent = css;
    document.head.append(el);
    const plain = [...el.sheet!.cssRules].find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === '.tab');
    el.remove();
    expect(plain?.style.getPropertyValue('padding').replace(/^0px/, '0')).toBe('0 12px');
  });

  it('52차: 좁은 휴대폰 측정 띠 — "다시 재기"도 아이콘만(44px), 결과는 한 줄로 흐르고, 정밀 조준 중에는 측정 종류를 숨긴다', () => {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.append(el);
    const rules: { media: string; sel: string; style: CSSStyleDeclaration }[] = [];
    for (const r of [...el.sheet!.cssRules])
      if (r instanceof CSSMediaRule) for (const s of [...r.cssRules]) if (s instanceof CSSStyleRule) rules.push({ media: r.media.mediaText, sel: s.selectorText, style: s.style });
    el.remove();
    const find = (sel: string, media: RegExp) => rules.find((x) => x.sel === sel && media.test(x.media))?.style;
    // 479.98px 이하: 측정 중이든 아니든 띠 단추 이름 글은 숨긴다(이름은 aria-label·title)
    expect(find('.measure-bar .mb-btn > span', /^\(max-width:\s*479\.98px\)$/)?.getPropertyValue('display')).toBe('none');
    expect(px(last.get('.measure-bar .mb-btn')?.['min-width'])).toBe(44);
    const text = find('.measure-bar.measuring .mb-text', /^\(max-width:\s*759\.98px\)$/)!;
    expect([text.getPropertyValue('flex-direction'), text.getPropertyValue('flex-wrap'), text.getPropertyValue('flex-basis')]).toEqual(['row', 'wrap', '100%']);
    const aim = rules.find((x) => /aim-reticle/.test(x.sel))!;
    expect(aim.media).toMatch(/pointer:\s*coarse/);
    expect(aim.media).toMatch(/max-width:\s*479\.98px/);
    expect(aim.sel).toBe('.view:has(.aim-reticle:not([hidden])) .measure-bar > .mb-kind');
    expect(aim.style.getPropertyValue('display')).toBe('none');
  });

  it('51차: 375~389px 일본어·중국어 제목 막대는 아이콘을 빼고 앱 이름 전체를 보인다', () => {
    const r = all.filter((x) => /min-width:\s*375px/.test(x.media) && /max-width:\s*389\.98px/.test(x.media));
    expect(r.map((x) => x.sel).sort()).toEqual([':lang(ja) .brand-icon', ':lang(zh) .brand-icon']);
    for (const x of r) expect(x.style.getPropertyValue('display')).toBe('none');
  });

  it('휴대폰 시트 처음 높이는 손가락 기기에서 50%(끌어 바꾼 높이는 앱 뿌리의 --sheet-h가 덮는다)', () => {
    const r = all.find((x) => x.sel === ':root' && /max-width:\s*759\.98px/.test(x.media));
    expect(r!.style.getPropertyValue('--sheet-h').trim()).toBe('50%');
    // 51차: 높이 640px 이하(320×568·360×640)는 60% — 고른 것 띠까지 있으면 반 높이로는 나무 줄이 하나도 안 보였다
    const short = all.filter((x) => x.sel === ':root' && /max-height:\s*640px/.test(x.media));
    expect(short).toHaveLength(1);
    expect(short[0]!.media).toMatch(/max-width:\s*759\.98px/);
    expect(short[0]!.style.getPropertyValue('--sheet-h').trim()).toBe('60%');
  });
});

describe('레이어·PMI 표의 보이기 칸', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('확인 칸은 라벨(cb-hit)로 감싸 라벨을 눌러도 켜고 끄며, 이름 단추(강조)는 라벨 밖', () => {
    const calls: string[] = [];
    const host = new Proxy(
      { measuring: false, measureKind: 'points', touch: true, multiPick: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [], setLayerVisible: (i: number, on: boolean) => calls.push(`layer ${i} ${on}`), setPmiVisible: (id: string | null, on: boolean) => calls.push(`pmi ${id} ${on}`) } as Record<string, unknown>,
      { get: (t, k) => (k in t ? t[k as string] : () => calls.push(String(k))) },
    ) as unknown as PanelHost;
    const meta = { products: [], layers: [{ name: 'L1', meshIds: ['m1'] }], pmi: { presentations: [{ id: 'p1', name: '치수 1', type: 'annotation_curve_occurrence', stepId: 9 }] } };
    const d = createDoc('l.stp', 1, { scene: { meshes: [], lines: [], meta }, ms: 1 } as unknown as ParseResult);
    const panel = new Panel(host);
    // PMI 탭 본문은 나무 조각(54차 — pmiview.ts 가상 목록)이 그린다: 앱처럼 넣는다
    panel.kit = { treeView, groupGrid, pmiView };
    document.body.append(panel.el);
    panel.show(d);
    panel.setOpen(true);
    panel.setTab('layers');
    const lab = panel.el.querySelector<HTMLLabelElement>('tbody label.cb-hit')!;
    const cb = lab.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(cb.getAttribute('aria-label')).toBe('L1 레이어 보이기');
    expect(lab.querySelector('.link-btn')).toBeNull();
    expect(lab.parentElement!.querySelector(':scope > .link-btn')!.textContent).toBe('L1');
    expect(cb.checked).toBe(true);
    lab.click();
    expect(cb.checked).toBe(false);
    expect(calls).toContain('layer 0 false');
    panel.setTab('pmi');
    const plab = panel.el.querySelector<HTMLLabelElement>('.pmi-grid label.cb-hit')!;
    expect(plab.querySelector('.link-btn')).toBeNull();
    plab.click();
    expect(calls).toContain('pmi p1 false');
  });
});

/**
 * 52차: 탭을 누르면 탭 줄을 새로 만들어 굴린 자리가 0으로 돌아갔다 — 좁은 화면에서 넘치는 탭 줄(51차 판 375px 영어·독일어·일본어 등)의 끝 탭을 누르면
 * 그 탭이 줄 밖으로 사라졌다. jsdom에는 배치가 없어 탭 폭 80px, 탭 줄 폭 262px(320px 시트), 줄 왼쪽 6px로 흉내 낸다
 */
describe('패널 탭 줄: 고른 탭을 보이게', () => {
  const W = 80, LEFT = 6, CW = 262;
  const saved = (['offsetLeft', 'offsetWidth', 'clientWidth'] as const).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ?? Object.getOwnPropertyDescriptor(Element.prototype, k)] as const);
  afterEach(() => {
    for (const [k, d] of saved) if (d) Object.defineProperty(k === 'clientWidth' ? Element.prototype : HTMLElement.prototype, k, d);
    document.body.innerHTML = '';
  });

  it('끝 탭을 고르면 그 탭 오른쪽 끝이 줄 오른쪽 끝에 오게 굴리고(번역 뒤 폭 — 마이크로태스크), 첫 탭이면 0, 닫았다 열어도 맞춘다', async () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains('tabs')) return LEFT;
        return this.classList.contains('tab') ? LEFT + W * [...this.parentElement!.children].indexOf(this) : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('tab') ? W : 0; } });
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get(this: Element) { return this.classList.contains('tabs') ? CW : 0; } });
    const host = new Proxy({ measuring: false, measureKind: 'points', touch: true, multiPick: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [] } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => {}),
    }) as unknown as PanelHost;
    const meta = { products: [], layers: [{ name: 'L1', meshIds: ['m1'] }], pmi: { presentations: [{ id: 'p1', name: '치수 1', type: 'annotation_curve_occurrence', stepId: 9 }] } };
    const d = createDoc('l.stp', 1, { scene: { meshes: [], lines: [], meta }, ms: 1 } as unknown as ParseResult);
    const panel = new Panel(host);
    document.body.append(panel.el);
    const strip = panel.el.querySelector<HTMLElement>('.tabs')!;
    let sl = 0;
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, get: () => sl, set: (v: number) => (sl = v) });
    panel.show(d);
    panel.setOpen(true);
    expect([...strip.children].map((t) => t.id)).toEqual(['tab-tree', 'tab-props', 'tab-layers', 'tab-pmi', 'tab-info']);
    await Promise.resolve();
    expect(sl).toBe(0);
    panel.setTab('info');
    // 탭 줄을 새로 만든 뒤(번역층이 글을 바꾼 다음) 굴린다
    await Promise.resolve();
    expect(sl).toBe(4 * W + W - CW);
    panel.setTab('tree');
    await Promise.resolve();
    expect(sl).toBe(0);
    // 닫혀 있는 동안 고른 탭이 바뀌어도 열 때 맞춘다
    panel.setOpen(false);
    panel.setTab('pmi');
    sl = 0;
    await Promise.resolve();
    expect(sl).toBe(0);
    panel.setOpen(true);
    expect(sl).toBe(3 * W + W - CW);
  });

  it('영어·독일어 정보 탭은 낱말 하나 "Info"(앱 안내 글이 부르는 이름과 같게)', async () => {
    const { translate } = await import('../../site/i18n.mjs');
    expect(translate('정보', 'en').trim()).toBe('Info');
    expect(translate('정보', 'de').trim()).toBe('Info');
    expect(translate('해석기 경고 {0}개 — 패널의 "정보" 탭에서 볼 수 있습니다.', 'en')).toContain('"Info" tab');
    expect(translate('해석기 경고 {0}개 — 패널의 "정보" 탭에서 볼 수 있습니다.', 'de')).toContain('Info-Tab');
  });
});
