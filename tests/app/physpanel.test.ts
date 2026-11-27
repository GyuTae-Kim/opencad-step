// @vitest-environment jsdom
/**
 * 속성 탭 물리 속성 묶음과 미룬 질량 속성: 워커가 적분하는 동안 부피·질량·무게중심·관성은 "계산 중…", 정확도 줄에는 끝낸 입체 수.
 * 값이 오면(onProps) 그 묶음만 다시 그려 한 번에 구한 문서와 같은 글을 보이고, 멈추면(stopped) 삼각형 값과 안내를 보인다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepToScene, stepToSceneDeferred, type StepMeta } from '../../src/scene';
import { infoView } from '../../src/app/infoview';
import { applyDocProps, createDoc, type StepDoc } from '../../src/app/doc';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as PHYS from '../../src/app/physics';
import { Fmt } from '../../src/app/display';
import { cube, cylinder, StepText } from '../stepText';
import { translate } from '../../site/i18n.mjs';
import { installLocalization } from '../../src/app/i18n';

function twoParts(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, w.product('cyl', [cylinder(w, 5, 20)], mm), w.ax2([0, 0, 0]), 'c');
  w.place(root, w.product('box', [cube(w, 10).solid], mm), w.ax2([40, 0, 0]), 'b');
  return w.bytes();
}

function host(d: StepDoc): PanelHost {
  return new Proxy({ measuring: false, measureKind: 'points', touch: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [], setDensity: (v: number | null) => (d.density = v) } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => {}),
  }) as unknown as PanelHost;
}

/** 물리 속성 계산은 뷰어 조각에 들어 있어(53차) 앱이 뷰어를 만들 때 패널에 넣는다 — 시험은 모듈을 바로 넣는다 */
const panelOf = (h: PanelHost): Panel => Object.assign(new Panel(h), { phys: PHYS });

const rows = (el: HTMLElement) => Object.fromEntries([...el.querySelectorAll('.prop-row')].map((r) => [r.querySelector('.k')?.textContent, r.querySelector('.v')?.textContent]));

describe('물리 속성: 질량 속성을 기다리는 동안 "계산 중"', () => {
  const bytes = twoParts();

  it('계산 중 → 값이 오면 그 묶음만 다시 그려 한 번에 구한 문서와 같은 글', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    doc.density = 7850;
    const panel = panelOf(host(doc));
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    let r = rows(panel.el);
    expect(r['부피']).toBe('계산 중…');
    expect(r['질량']).toBe('계산 중…');
    expect(r['무게중심']).toBe('계산 중…');
    expect(r['주 관성 모멘트']).toBe('계산 중…');
    expect(r['정확도']).toBe('곡면 적분 계산 중(입체 0/2)');
    // 계산 중 글은 번역된다(값 칸에 translate="no"가 없다)
    expect(panel.el.querySelector('.prop-row.pending .v')?.getAttribute('translate')).toBeNull();
    // 해석 덮개(.busy — 3D 보기를 덮는 절대 위치 막)와 같은 이름을 쓰지 않는다(쓰면 그 줄이 패널을 덮는다)
    expect(panel.el.querySelector('.busy')).toBeNull();
    expect(translate('계산 중…', 'en')).not.toBe('계산 중…');
    expect(translate('곡면 적분 계산 중(입체 1/2)', 'en')).toMatch(/1\/2/);
    // 겉넓이·외형 크기는 질량 속성과 상관없어 바로 보인다
    expect(r['겉넓이']).toMatch(/\d/);
    const density = panel.el.querySelector('input.dlg-input');
    // 입체 하나가 끝남: 아직 계산 중이면 수 글만 고친다(재질 칸은 그대로)
    job.run(0);
    while (job.done < 1) job.run(0);
    applyDocProps(doc, { results: job.take(), done: job.done, total: job.total, finished: false, timedOut: 0, ms: 1 });
    panel.onProps();
    r = rows(panel.el);
    expect(r['정확도']).toBe('곡면 적분 계산 중(입체 1/2)');
    expect(panel.el.querySelector('input.dlg-input')).toBe(density);
    // 다 끝남
    job.run();
    applyDocProps(doc, { results: job.take(), done: job.done, total: job.total, finished: true, timedOut: 0, ms: 1 });
    panel.onProps();
    r = rows(panel.el);
    const inlineDoc = createDoc('a.stp', 1, { scene: stepToScene(bytes, { name: 'a.stp' }), ms: 1 });
    inlineDoc.density = 7850;
    const p2 = panelOf(host(inlineDoc));
    document.body.append(p2.el);
    p2.show(inlineDoc);
    p2.setTab('props');
    const want = rows(p2.el);
    expect(r).toEqual(want);
    expect(r['정확도']).toBe('정확(B-rep 곡면 적분)');
    expect(panel.el.querySelector('.prop-row.pending')).toBeNull();
    panel.el.remove();
    p2.el.remove();
  });

  it('고른 부품의 값이 먼저 오면 다른 부품이 계산 중이어도 그 값을 보인다', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    // 첫 입체(원기둥)를 고른다
    doc.items = { ids: [def.scene.meshes[0]!.id], label: '몸체 1개' };
    const panel = panelOf(host(doc));
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    expect(rows(panel.el)['부피']).toBe('계산 중…');
    while (job.done < 1) job.run(0);
    applyDocProps(doc, { results: job.take(), done: job.done, total: job.total, finished: false, timedOut: 0, ms: 1 });
    panel.onProps();
    const r = rows(panel.el);
    expect(r['부피']).toMatch(/^1[,.]?570[.,]79/);
    expect(r['정확도']).toBe('정확(B-rep 곡면 적분)');
    expect(doc.props.state).toBe('running');
    panel.el.remove();
  });

  it('멈추면(다른 파일) 기다리던 입체는 삼각형 값(≈)과 멈춤 안내', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: def.props!.tables(), solids: def.props!.total } });
    const panel = panelOf(host(doc));
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    applyDocProps(doc, 'stopped');
    panel.onProps();
    const r = rows(panel.el);
    expect(r['부피']).toMatch(/^≈ /);
    expect(r['정확도']).toBe('근삿값(화면용 삼각형)');
    expect(panel.el.textContent).toContain('다른 파일을 여느라 곡면 적분을 멈췄습니다');
    expect((def.scene.meta as unknown as StepMeta).faceTables!.every((t) => !t.props)).toBe(true);
    panel.el.remove();
  });

  it('값이 다 오거나 멈춰 묶음을 다시 그려도 재질 고르기·밀도 칸의 초점은 새 묶음의 같은 칸으로(139차)', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    const panel = panelOf(host(doc));
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    const pick = () => panel.el.querySelector<HTMLElement>('select.dlg-select')!;
    const sel0 = pick();
    sel0.focus();
    // 입체 하나가 끝남(아직 계산 중 — 수 글만 고침): 칸 그대로
    while (job.done < 1) job.run(0);
    applyDocProps(doc, { results: job.take(), done: job.done, total: job.total, finished: false, timedOut: 0, ms: 1 });
    panel.onProps();
    expect(pick()).toBe(sel0);
    expect(document.activeElement).toBe(sel0);
    // 다 끝남(묶음을 다시 그림): 새 재질 고르기 칸에
    job.run();
    applyDocProps(doc, { results: job.take(), done: job.done, total: job.total, finished: true, timedOut: 0, ms: 1 });
    panel.onProps();
    expect(pick()).not.toBe(sel0);
    expect(document.activeElement).toBe(pick());
    panel.el.remove();
    // 밀도 칸에 초점이 있는 채 멈춤(다른 파일): 새 밀도 칸에
    const def2 = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const doc2 = createDoc('a.stp', 1, { scene: def2.scene, ms: 1, props: { tables: def2.props!.tables(), solids: def2.props!.total } });
    const p2 = panelOf(host(doc2));
    document.body.append(p2.el);
    p2.show(doc2);
    p2.setTab('props');
    const in0 = p2.el.querySelector<HTMLElement>('input.dlg-input')!;
    in0.focus();
    applyDocProps(doc2, 'stopped');
    p2.onProps();
    const in1 = p2.el.querySelector<HTMLElement>('input.dlg-input')!;
    expect(in1).not.toBe(in0);
    expect(document.activeElement).toBe(in1);
    p2.el.remove();
  });
});

/**
 * 155차(WCAG 3.3.1 오류 알아보기·4.1.3 상태 알림): 밀도 직접 입력 칸에 0·음수·읽지 못한 글을 넣으면 전에는 골라 둔 재질·밀도를 말없이 지웠다
 * (질량·관성 줄이 사라지고 칸은 빈 칸 — 무엇이 틀렸는지 알리는 글·aria-invalid 없음). 이제 걸지 않고 칸을 보이던 값으로 되돌린 뒤 알림 칸에 경고로 까닭을 알린다
 * (분해 거리 칸 43차 꼴 — 알림 종류 warn·5초). 빈 칸은 전처럼 밀도를 지운다(「고르지 않음」과 같은 뜻). 브라우저는 type=number의 읽지 못한 글을 빈 글로 돌리고
 * validity.badInput을 세운다(jsdom은 늘 거짓이라 칸의 validity를 덮어 흉내) — 0은 min=0(포함)이라 브라우저 검증도 맞다고 본다
 */
describe('155차: 밀도 칸에 받지 않는 값', () => {
  const MSG = '밀도를 바꾸지 않았습니다 — 0보다 큰 수를 쳐 넣으십시오(g/cm³).';

  it('0·음수·읽지 못한 글은 밀도를 지우지 않고 칸을 되돌려 경고로 알리고, 바른 값은 걸고 빈 칸은 전처럼 지운다', () => {
    const doc = createDoc('a.stp', 1, { scene: stepToScene(twoParts(), { name: 'a.stp' }), ms: 1 });
    doc.density = 7850;
    const set: (number | null)[] = [];
    const told: unknown[][] = [];
    const base = { measuring: false, measureKind: 'points', touch: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [] };
    const target: Record<string, unknown> = {
      ...base,
      setDensity: (v: number | null) => {
        set.push(v);
        doc.density = v;
      },
      toast: (...a: unknown[]) => told.push(a),
    };
    const ph = new Proxy(target, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as PanelHost;
    const panel = panelOf(ph);
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    const inp = panel.el.querySelector<HTMLInputElement>('input.dlg-input')!;
    expect(inp.value).toBe('7.85');
    const put = (v: string, bad = false) => {
      inp.value = v;
      if (bad) Object.defineProperty(inp, 'validity', { value: { badInput: true }, configurable: true });
      inp.dispatchEvent(new Event('change'));
      if (bad) delete (inp as { validity?: unknown }).validity;
    };
    put('0');
    expect([set, doc.density, inp.value, told]).toEqual([[], 7850, '7.85', [[MSG, 'warn', 5000]]]);
    put('-2');
    expect([set, doc.density, inp.value, told.length]).toEqual([[], 7850, '7.85', 2]);
    // 「abc」·「-」·「1e」처럼 읽지 못한 글: 브라우저가 값을 빈 글로 돌리고 badInput — 빈 칸(지우기)과 가른다
    put('', true);
    expect([set, doc.density, inp.value, told.length]).toEqual([[], 7850, '7.85', 3]);
    put('2.5');
    expect([set, doc.density, told.length]).toEqual([[2500], 2500, 3]);
    put('');
    expect([set, doc.density, told.length]).toEqual([[2500, null], null, 3]);
    panel.el.remove();
  });

  it('알림 글은 네 언어로 옮긴다(같은 사전의 「밀도」·「…지 않았습니다 — …쳐 넣으십시오」 꼴)', () => {
    expect(translate(MSG, 'en')).toBe('The density was not changed — type a number greater than 0 (g/cm³).');
    for (const l of ['ja', 'zh-CN', 'de']) expect(translate(MSG, l)).not.toMatch(/[가-힣]/);
  });
});

/**
 * 167차(WCAG 1.3.1 정보와 관계 — SKP 171차와 같은 꼴, H40 설명 목록): 속성 탭(부품 속성·물리 속성)과 정보 탭의 이름 | 값 두 칸 줄은
 * `div.prop-row > span.k + span.v`라 화면 읽기에 이름과 값이 짝 없는 두 글이었다. 이제 묶음마다 dl 하나 안에 줄(div.prop-row — 클래스 그대로)마다
 * dt.k(이름)·dd.v(값) — 안내 글·재질 고르기·밀도 칸은 dl 밖. 파일 글 칸(fileSpan)도 같은 dt·dd(ftext·translate="no"·말풍선 그대로)
 */
describe('167차: 이름·값 줄은 묶음마다 dl 하나 안의 dt(이름)·dd(값)', () => {
  /** 묶음(section) 안 이름·값 줄의 꼴 */
  const shape = (sec: Element) => {
    const dls = [...sec.children].filter((c) => c.tagName === 'DL');
    const rows = [...sec.querySelectorAll('.prop-row')];
    const cell = (c: Element) => `${c.tagName.toLowerCase()}.${c.classList.contains('k') ? 'k' : c.classList.contains('v') ? 'v' : '?'}`;
    return {
      dls: dls.length,
      inDl: rows.every((r) => r.parentElement === dls[0]),
      onlyRows: dls.every((dl) => [...dl.children].every((c) => c.classList.contains('prop-row'))),
      cells: [...new Set(rows.map((r) => [...r.children].map(cell).join(' ')))],
    };
  };
  const OK = { dls: 1, inDl: true, onlyRows: true, cells: ['dt.k dd.v'] };
  const titled = (root: Element, t: string) => [...root.querySelectorAll<HTMLElement>('section.prop-group')].find((s) => s.querySelector('h3')?.textContent === t)!;

  it('속성 탭: 부품 속성(파일 글 값 포함)·물리 속성(계산 중·정확도 줄 포함), 안내 글·재질 칸은 dl 밖. 정보 탭 묶음마다도. 스타일은 dl·dd 기본 여백을 지운다', () => {
    const def = stepToSceneDeferred(twoParts(), { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    doc.density = 7850;
    doc.selKey = '0/1';
    const panel = panelOf(host(doc));
    document.body.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    const part = titled(panel.el, '부품 속성');
    expect(shape(part)).toEqual(OK);
    // 파일 글 값(이름): dd가 곧 파일 글 칸 — 번역하지 않음·말풍선 그대로
    const name = part.querySelector('.prop-row')!;
    expect(name.querySelector('dt')!.textContent).toBe('이름');
    const dd = name.querySelector('dd')!;
    expect([dd.className, dd.getAttribute('translate'), dd.title]).toEqual(['ftext v', 'no', dd.textContent]);
    expect(['cyl', 'box']).toContain(dd.textContent);
    const phys = titled(panel.el, '물리 속성');
    expect(shape(phys)).toEqual(OK);
    // 계산 중 줄·정확도 줄도 같은 dl 안(줄 클래스 그대로 — onProps가 '.prop-row.pending.acc .v'로 찾는다)
    expect(phys.querySelector('dl > .prop-row.pending.acc > dd.v')!.textContent).toBe('곡면 적분 계산 중(입체 0/2)');
    expect(rows(phys)['부피']).toBe('계산 중…');
    expect([...phys.children].map((c) => c.tagName)).toEqual(['H3', 'DL', 'LABEL', 'LABEL', 'P']);
    panel.el.remove();
    // 정보 탭(뷰어 조각): 줄이 있는 묶음마다 dl 하나, 경고 묶음은 dl 없음
    const inline = createDoc('a.stp', 1, { scene: stepToScene(twoParts(), { name: 'a.stp' }), ms: 1 });
    const secs = infoView(inline, new Fmt('mm'));
    const withRows = secs.filter((s) => s.querySelector('.prop-row'));
    expect(withRows.map((s) => s.querySelector('h3')!.textContent)).toEqual(expect.arrayContaining(['문서', '단위', '통계']));
    for (const s of withRows) expect(shape(s), s.querySelector('h3')!.textContent!).toEqual(OK);
    expect(secs.filter((s) => !s.querySelector('.prop-row')).every((s) => !s.querySelector('dl'))).toBe(true);
    const file = withRows[0]!.querySelector('dd')!;
    expect([file.className, file.getAttribute('translate'), file.textContent]).toEqual(['ftext v', 'no', 'a.stp']);
    // 스타일: UA 기본 여백(dl 위아래 1em·dd 앞 40px)을 지워 모양 그대로
    const css = readFileSync(join(__dirname, '../../src/app/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.prop-group dl')).toMatch(/\bmargin: 0;/);
    expect(rule('.prop-row .v')).toMatch(/\bmargin: 0;/);
  });
});

/**
 * 208차(WCAG 3.1.2 — 빠진 번역): 파일에 이름·설명이 없는 STEP 속성(PROPERTY_DEFINITION)은 해석기가 이름 칸에 앱 낱말 「속성」을 넣었고, 속성 줄이 그 이름을
 * 파일 글 칸(kData — fileSpan·translate="no")에 두어 다른 언어 화면에서도 한국어로 남았다. 이제 해석기는 빈 이름을 넘기고(파일 글만 데이터에), 앱이 넣는
 * 자리 이름은 번역층이 옮기는 dt(같은 파일 partinfo.ts의 「회전 · 없음」 꼴) — 값과 이름 있는 속성의 이름은 지금처럼 파일 글
 */
describe('208차: 이름 없는 STEP 속성 줄의 자리 이름 「속성」은 화면 글(다섯 언어)', () => {
  function withProps(): Uint8Array {
    const w = new StepText();
    const mm = w.context('mm');
    const p = w.product('part', [cube(w, 10).solid], mm);
    w.textProperty(p.pd, '', '', 'ACME', mm);
    w.textProperty(p.pd, 'user defined attribute', 'Supplier', 'Globex', mm);
    return w.bytes();
  }
  it.each([
    ['ko', '속성'],
    ['en', 'Properties'],
    ['ja', 'プロパティ'],
    ['zh-CN', '属性'],
    ['de', 'Eigenschaften'],
  ])('%s: 이름 없는 속성 줄 이름은 「%s」(같은 사전의 속성 탭 낱말), 이름 있는 줄 이름과 값은 원문 그대로', async (code, label) => {
    const doc = createDoc('a.stp', 1, { scene: stepToScene(withProps(), { name: 'a.stp' }), ms: 1 });
    // 해석기는 파일에 없는 이름을 지어 넣지 않는다(빈 글)
    expect(doc.products[0]!.props?.items).toEqual([['', 'ACME'], ['Supplier', 'Globex']]);
    doc.selKey = '0';
    const root = document.createElement('div');
    document.body.append(root);
    const panel = panelOf(host(doc));
    root.append(panel.el);
    panel.show(doc);
    panel.setTab('props');
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      const row = (v: string) => [...panel.el.querySelectorAll('.prop-row')].find((r) => r.querySelector('dd')?.textContent === v)!;
      const unnamed = row('ACME').querySelector('dt')!;
      expect([unnamed.className, unnamed.closest('[translate="no"]'), unnamed.textContent]).toEqual(['k', null, label]);
      expect(row('ACME').querySelector('dd')!.getAttribute('translate')).toBe('no');
      const named = row('Globex').querySelector('dt')!;
      expect([named.className, named.getAttribute('translate'), named.textContent]).toEqual(['ftext k', 'no', 'Supplier']);
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
    }
  });
});
