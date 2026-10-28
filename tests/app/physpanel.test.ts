// @vitest-environment jsdom
/**
 * 속성 탭 물리 속성 묶음과 미룬 질량 속성: 워커가 적분하는 동안 부피·질량·무게중심·관성은 "계산 중…", 정확도 줄에는 끝낸 입체 수.
 * 값이 오면(onProps) 그 묶음만 다시 그려 한 번에 구한 문서와 같은 글을 보이고, 멈추면(stopped) 삼각형 값과 안내를 보인다.
 */
import { describe, expect, it } from 'vitest';
import { stepToScene, stepToSceneDeferred, type StepMeta } from '../../src/scene';
import { applyDocProps, createDoc, type StepDoc } from '../../src/app/doc';
import { Panel, type PanelHost } from '../../src/app/panel';
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

const rows = (el: HTMLElement) => Object.fromEntries([...el.querySelectorAll('.prop-row')].map((r) => [r.querySelector('.k')?.textContent, r.querySelector('.v')?.textContent]));

describe('물리 속성: 질량 속성을 기다리는 동안 "계산 중"', () => {
  const bytes = twoParts();

  it('계산 중 → 값이 오면 그 묶음만 다시 그려 한 번에 구한 문서와 같은 글', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    doc.density = 7850;
    const panel = new Panel(host(doc));
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
    expect(panel.el.querySelector('.prop-row.busy .v')?.getAttribute('translate')).toBeNull();
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
    const p2 = new Panel(host(inlineDoc));
    document.body.append(p2.el);
    p2.show(inlineDoc);
    p2.setTab('props');
    const want = rows(p2.el);
    expect(r).toEqual(want);
    expect(r['정확도']).toBe('정확(B-rep 곡면 적분)');
    expect(panel.el.querySelector('.prop-row.busy')).toBeNull();
    panel.el.remove();
    p2.el.remove();
  });

  it('고른 부품의 값이 먼저 오면 다른 부품이 계산 중이어도 그 값을 보인다', () => {
    const def = stepToSceneDeferred(bytes, { name: 'a.stp' });
    const job = def.props!;
    const doc = createDoc('a.stp', 1, { scene: def.scene, ms: 1, props: { tables: job.tables(), solids: job.total } });
    // 첫 입체(원기둥)를 고른다
    doc.items = { ids: [def.scene.meshes[0]!.id], label: '몸체 1개' };
    const panel = new Panel(host(doc));
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
    const panel = new Panel(host(doc));
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
});
