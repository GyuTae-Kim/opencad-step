// @vitest-environment jsdom
/**
 * 속성 탭 물리 속성 묶음과 미룬 질량 속성: 워커가 적분하는 동안 부피·질량·무게중심·관성은 "계산 중…", 정확도 줄에는 끝낸 입체 수.
 * 값이 오면(onProps) 그 묶음만 다시 그려 한 번에 구한 문서와 같은 글을 보이고, 멈추면(stopped) 삼각형 값과 안내를 보인다.
 */
import { describe, expect, it } from 'vitest';
import { stepToScene, stepToSceneDeferred, type StepMeta } from '../../src/scene';
import { applyDocProps, createDoc, type StepDoc } from '../../src/app/doc';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as PHYS from '../../src/app/physics';
import { Fmt } from '../../src/app/display';
import { cube, cylinder, StepText } from '../stepText';
import { translate } from '../../site/i18n.mjs';

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
