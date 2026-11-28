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
// 223차: 레이어 탭 본문(과 아래 띠·간섭 검사 묶음)은 나무 조각(panelview.ts — panel.ts에서 옮김)이 그린다
import * as PV from '../../src/app/panelview';
import { SectionBar, type SectionBarHost } from '../../src/app/sectionbar';
import type { SectionState, Viewer3d } from 'opencad-viewer3d';

// TOUCH_CSS: 다른 판의 스타일시트로 같은 시험을 돌려 볼 때(앞 판에서 실패하는지 확인용)
const css = readFileSync(process.env.TOUCH_CSS || join(__dirname, '../../src/app/styles.css'), 'utf8');

/** 매체 조건 글이 이 꼴인 규칙(선택자·매체·선언) */
function mediaRules(media: RegExp): { sel: string; media: string; style: CSSStyleDeclaration }[] {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  const out: { sel: string; media: string; style: CSSStyleDeclaration }[] = [];
  for (const r of [...el.sheet!.cssRules]) {
    if (!(r instanceof CSSMediaRule) || !media.test(r.media.mediaText)) continue;
    for (const s of [...r.cssRules]) if (s instanceof CSSStyleRule) for (const sel of s.selectorText.split(',').map((x) => x.trim())) out.push({ sel, media: r.media.mediaText, style: s.style });
  }
  el.remove();
  return out;
}

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
      // 메뉴 항목은 최소 높이(171차 — 이름이 두 줄이면 따라 커진다)
      ['.menu-item', 'min-height', null],
      ['.btn.small', 'height', null],
      ['.btn.large', 'height', null],
      ['.icon-btn', 'height', 'width'],
      // 갈래 단추는 최소 높이(55차 — 글만 키우면 단추가 따라 커진다)
      ['.seg-btn', 'min-height', 'min-width'],
      ['.tab', 'height', null],
      ['.tree-row', 'min-height', null],
      ['.twisty', 'height', 'width'],
      ['.eye', 'height', 'width'],
      ['.tree-search', 'height', null],
      ['.link-btn', 'min-height', 'min-width'],
      ['.cb-hit', 'min-height', 'min-width'],
      ['label.check', 'min-height', null],
      ['.mb-btn', 'height', null],
      ['.mb-kind .seg-btn', 'min-height', null],
      ['.mb-btn.icon', 'height', 'width'],
      ['.measure-bar .mb-btn', 'height', 'min-width'],
      // 격리 띠 「격리 풀기」(179차 — 480px 미만은 아이콘만이라 폭도 손가락 크기로)
      ['.iso-bar .mb-btn', 'height', 'min-width'],
      ['.section-slider', 'height', null],
      ['.section-num', 'height', null],
      ['.explode-slider', 'height', null],
      ['.explode-bar .seg-btn', 'min-height', 'min-width'],
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
    // 55차부터 이 두 규칙은 마우스 기기에도(400% 확대한 320px 창 — WCAG 1.4.10) 들어 손가락 기기 조건 없이 폭 조건만이다
    const r = [...all, ...mediaRules(/^\(max-width:\s*(359|374)\.98px\)$/)].filter((x) => /max-width:\s*359\.98px/.test(x.media));
    const bar = r.find((x) => x.sel === '.toolbar')!;
    expect(parseFloat(bar.style.getPropertyValue('gap'))).toBe(0);
    expect(7 * 44 + 2 * px(bar.style.getPropertyValue('padding-inline'))).toBeLessThanOrEqual(320);
    expect(r.find((x) => x.sel === '.toolbar .tool-sep')!.style.getPropertyValue('display')).toBe('none');
    // 375px보다 좁으면 제목 막대 앱 이름 글은 화면 읽기용으로만(아이콘만 보임)
    const brand = [...all, ...mediaRules(/^\(max-width:\s*374\.98px\)$/)].find((x) => x.sel === '.brand > span' && /max-width:\s*374\.98px/.test(x.media));
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
    // 쉼표로 묶은 규칙도(179차 — 격리 띠 단추와 함께 둔다)
    const find = (sel: string, media: RegExp) => rules.find((x) => x.sel.split(',').map((s) => s.trim()).includes(sel) && media.test(x.media))?.style;
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

  it('132차: 나무 줄은 손가락 기기에서 글 고르기·iOS 말풍선을 끈다(길게 누르기는 작업 메뉴 — 3D 보기 .viewer-host와 같게), 마우스 화면은 그대로', () => {
    expect(last.get('.tree-row')?.['user-select']).toBe('none');
    // jsdom CSSOM은 -webkit- 접두 속성을 버리므로 원문 규칙으로 본다(손가락 기기 규칙은 두 칸 들여 씀, 매체 조건 없는 규칙은 줄 맨 앞)
    const coarse = /^ {2}\.tree-row \{\s*min-height: 44px;([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(coarse).toMatch(/-webkit-touch-callout: none;/);
    expect(coarse).toMatch(/-webkit-user-select: none;/);
    const plain = /^\.tree-row \{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(plain).toMatch(/min-height: 28px;/);
    expect(plain).not.toMatch(/user-select|touch-callout/);
  });

  it('165차: 손가락 규칙이 클래스 하나로 44px를 주는 칸을 보통 규칙이 더 구체적인 선택자로 다시 작게 두지 않는다(PMI 표 이름 단추 — .pmi-grid .link-btn이 최소 폭 44px를 덮었다)', () => {
    // 칸(클래스 하나) → 손가락 규칙이 44px 이상으로 두는 크기 속성
    const sized = new Map<string, string[]>();
    for (const [sel, o] of last) if (/^\.[\w-]+$/.test(sel)) sized.set(sel, Object.keys(o).filter((p) => /^(min-)?(width|height)$/.test(p) && px(o[p]) >= 44));
    expect(sized.get('.link-btn')).toEqual(['min-width', 'min-height']);
    const el = document.createElement('style');
    el.textContent = css;
    document.head.append(el);
    const bad: string[] = [];
    for (const r of [...el.sheet!.cssRules]) {
      if (!(r instanceof CSSStyleRule)) continue;
      for (const sel of r.selectorText.split(',').map((x) => x.trim())) {
        // 가상 요소(::before 등)는 칸 크기가 아니다. 마지막 칸(결합자 뒤)이 그 클래스를 품고 선택자가 클래스 하나보다 구체적이면 매체 조건 없는 규칙이 손가락 규칙을 이긴다
        if (sel.includes('::')) continue;
        const tail = sel.split(/[\s>+~]+/).at(-1)!;
        for (const [cls, props] of sized) {
          if (sel === cls || !new RegExp(`\\${cls}(?![\\w-])`).test(tail)) continue;
          // 손가락 규칙에 같은 선택자·같은 속성이 있으면(.toolbar .btn 높이·.mb-btn.icon 폭 등) 그것이 뒤에 와서 이긴다
          for (const p of props) if (r.style.getPropertyValue(p) && !last.get(sel)?.[p]) bad.push(`${sel} ${p}: ${r.style.getPropertyValue(p)}`);
        }
      }
    }
    el.remove();
    expect(bad).toEqual([]);
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
    // PMI 탭 본문은 나무 조각(54차 — pmiview.ts 가상 목록)이 그린다: 앱처럼 넣는다(223차: 레이어 탭 본문 panelview.ts도)
    panel.kit = { treeView, groupGrid, pmiView, ...PV };
    document.body.append(panel.el);
    panel.show(d);
    panel.setOpen(true);
    panel.setTab('layers');
    const lab = panel.el.querySelector<HTMLLabelElement>('tbody label.cb-hit')!;
    const cb = lab.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(cb.getAttribute('aria-label')).toBe('\u{2068}L1\u{2069} 레이어 보이기');
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

  it('56차: 도구 막대 이름표는 그 언어의 이름표가 다 들어가는 폭보다 좁으면 숨긴다(오른쪽 단추가 화면 밖으로 밀리지 않게)', () => {
    // 헤드리스 Chrome 1280px에서 잰 도구 막대 길이(이름표를 다 보일 때): 한국어 1,247·중국어 1,279·영어 1,515·일본어 1,537·독일어 1,719px —
    // 전에는 920px 이하에서만 숨겨 1024px 한국어와 1280px 영어·일본어·독일어에서 측정·내보내기·패널 단추가 화면 밖이었다
    const need: [string, number][] = [['.toolbar .btn-label', 1247], [':lang(zh) .toolbar .btn-label', 1279], [':lang(en) .toolbar .btn-label', 1515],
      [':lang(ja) .toolbar .btn-label', 1537], [':lang(de) .toolbar .btn-label', 1719]];
    const rules = mediaRules(/max-width/);
    for (const [sel, width] of need) {
      // 폭 하나로만 거는 규칙 가운데 가장 넓은 것(휴대폰 규칙 "(max-width: 759.98px), (pointer: coarse) and …"은 따로)
      const hides = rules.filter((r) => r.sel === sel && /^\(max-width:\s*[\d.]+px\)$/.test(r.media) && r.style.getPropertyValue('position') === 'absolute' && /rect\(0/.test(r.style.getPropertyValue('clip')));
      expect(hides.length, sel).toBeGreaterThan(0);
      const max = Math.max(...hides.map((r) => parseFloat(r.media.match(/max-width:\s*([\d.]+)px/)![1]!)));
      // 다 들어가는 폭보다 넓은 데까지 숨기되(글꼴 차이 여유), 그보다 훨씬 넓은 화면에서는 이름표를 보인다
      expect(max, sel).toBeGreaterThanOrEqual(width + 10);
      expect(max, sel).toBeLessThan(width + 120);
    }
  });
});

/**
 * 123차: 단면 막대의 위치 숫자 칸은 축 좌표(면 단면은 법선 방향 위치)라 장면이 원점을 걸치면 음수를 쳐 넣는다. `inputmode="decimal"` 자판은
 * 음수 기호를 약속하지 않아(HTML inputmode — 소수 자판은 "may or may not show a minus key") 휴대폰·태블릿에서 원점 아래쪽 위치를 쳐 넣지 못할 수 있었다.
 * 그래서 inputmode를 두지 않고 type="number"에 맞춰 브라우저가 고르는 자판에 맡긴다(분해 거리 칸도 음수 기호·쌍반점을 쳐야 하는 꼴은 숫자 자판을 두지 않음).
 * jsdom에는 화면 자판이 없어 속성과 칸 → 단면 위치 길만 본다
 */
describe('123차: 단면 막대 위치 숫자 칸의 손가락 자판', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const bar = () => {
    const calls: [number, unknown][] = [];
    const viewer = { section: null, canvas: document.createElement('canvas'), setSectionPosition: (p: number, o?: unknown) => calls.push([p, o]) } as unknown as Viewer3d;
    const host: SectionBarHost = { viewerRef: viewer, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {} };
    const b = new SectionBar(host);
    document.body.append(b.el);
    return { b, calls, num: b.el.querySelector<HTMLInputElement>('.section-num')! };
  };

  it('칸은 type="number"이고 inputmode를 두지 않는다(소수 자판 decimal은 음수 기호가 없을 수 있음)', () => {
    const { num } = bar();
    expect([num.type, num.getAttribute('inputmode')]).toEqual(['number', null]);
  });

  it('원점을 걸친 단면의 음수 위치를 칸에 보이고, 쳐 넣은 음수 위치로 옮긴다', () => {
    const { b, calls, num } = bar();
    b.sync({ axis: 'z', flip: false, position: -12.5, min: -40, max: 10, t: 0.55 } as SectionState);
    expect([b.el.hidden, num.value]).toEqual([false, '-12.5']);
    num.value = '-30';
    num.dispatchEvent(new Event('change'));
    expect(calls).toEqual([[-30, { world: true }]]);
  });
});
