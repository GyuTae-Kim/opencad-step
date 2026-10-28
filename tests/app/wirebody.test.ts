// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { bodyTitle, carryDocState, createDoc, hasBodies, multiLabel, nodeItems, selectedBody, selectionItemIds, type StepDoc } from '../../src/app/doc';
import { filterRows, selectFromPick, visibleRows } from '../../src/app/tree';
import { resolveTokens, selectionTokens } from '../../src/app/selink';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { StepText, cube } from '../stepText';
import { translate } from '../../site/i18n.mjs';

/**
 * 조립 asm: 부품 bracket(입체 하나 + 같은 형상 표현의 곡선 묶음 — 원 하나, 이름이 부품과 같아 이름 없음),
 * 부품 guide(입체 하나 + 이름 있는 곡선 묶음 'rails'), 부품 other(입체 하나)
 */
function wireParts(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const bracket = w.product('bracket', [cube(w, 10, [0, 0, 0], 'body-A').solid, w.add('GEOMETRIC_CURVE_SET', `'',(#${w.circle([5, 5, 12], 3)})`)], ctx);
  const rails = w.add('GEOMETRIC_CURVE_SET', `'rails',(#${w.circle([25, 5, 12], 2)})`);
  const railsRep = w.add('GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION', `'rails',(#${rails}),#${ctx}`);
  const guide = w.product('guide', [cube(w, 6, [22, 2, 0], 'guide-body').solid], ctx);
  w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${guide.rep},#${railsRep}`);
  const other = w.product('other', [w.ax2([0, 0, 0]), cube(w, 8, [0, 20, 0], 'other-body').solid], ctx);
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, bracket, w.ax2([0, 0, 0]), 'bracket-1');
  w.place(root, guide, w.ax2([0, 0, 0]), 'guide-1');
  w.place(root, other, w.ax2([0, 0, 0]), 'other-1');
  return w.bytes();
}

const scene = stepToScene(wireParts(), { name: 'w.stp' });
const newDoc = (): StepDoc => createDoc('w.stp', 1, { scene, ms: 1 });

describe('선 형상(와이어프레임 곡선) 몸체 줄', () => {
  it('해석 결과: 부품 마디에 입체 하나와 선 형상 묶음 하나(이름은 표현 이름, 없으면 부품 이름)', () => {
    const d = newDoc();
    const [bracket, guide, other] = d.products[0]!.children;
    expect([bracket!.name, guide!.name, other!.name]).toEqual(['bracket', 'guide', 'other']);
    expect(bracket!.meshIds).toHaveLength(1);
    expect(bracket!.lineIds).toHaveLength(1);
    expect(guide!.lineIds).toHaveLength(1);
    expect(scene.lines.map((l) => l.name)).toEqual(['bracket', 'rails']);
    // 입체 다음 선 형상 차례 — 몸체 줄을 둘 부품(형상 항목 둘 이상)
    expect(nodeItems(bracket!)).toEqual([...bracket!.meshIds, ...bracket!.lineIds!]);
    expect([bracket, guide, other].map((n) => hasBodies(n!))).toEqual([true, true, false]);
  });

  it('나무: 펼치면 입체 줄 다음 선 형상 줄("0/0.2", 이름 없으면 "선 형상 1"), 이름 거르기는 표현 이름도 찾는다', () => {
    const d = newDoc();
    const { rows } = visibleRows(d.products, new Set(['0', '0/0', '0/1']));
    expect(rows.map((r) => r.key)).toEqual(['0', '0/0', '0/0.1', '0/0.2', '0/1', '0/1.1', '0/1.2', '0/2']);
    const w = rows.find((r) => r.key === '0/0.2')!;
    expect(w).toMatchObject({ body: 2, wire: 1, meshIds: [], itemIds: [scene.lines[0]!.id] });
    expect(rows.find((r) => r.key === '0/0.1')!.wire).toBeUndefined();
    const name = (n: (typeof d.products)[number], i: number) => (i >= n.meshIds.length ? (scene.lines.find((l) => l.id === nodeItems(n)[i])?.name ?? '') : '');
    expect(filterRows(d.products, 'rails', new Set(), 3000, (n, i) => (name(n, i) === n.name ? '' : name(n, i))).rows.map((r) => r.key)).toEqual(['0', '0/1', '0/1.2']);
  });

  it('3D에서 선 형상을 몸체 단위로 누르면 그 부품을 펼쳐 선 형상 줄을 고름으로, 부품 단위면 부품 마디', () => {
    const d = newDoc();
    const lid = scene.lines[0]!.id;
    expect([...selectFromPick(d.products, new Set(), lid, true)!.expanded].sort()).toEqual(['0', '0/0']);
    expect(selectFromPick(d.products, new Set(), lid)!.key).toBe('0/0');
    d.pick = { kind: 'line', id: lid, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    expect(selectedBody(d)).toBe(lid);
    expect(selectionItemIds(d)).toEqual([lid]);
  });

  it('이름: "부품 · 선 형상 1"·"부품 / 표현 이름", 입체가 하나여도 선 형상이 있으면 "부품 · 몸체 1"', () => {
    const d = newDoc();
    const [l1, l2] = scene.lines;
    expect(bodyTitle(d.products, scene, l1!.id)).toBe('bracket · 선 형상 1');
    expect(bodyTitle(d.products, scene, l2!.id)).toBe('guide / rails');
    expect(bodyTitle(d.products, scene, d.products[0]!.children[0]!.meshIds[0]!)).toBe('bracket / body-A');
    expect(bodyTitle(d.products, scene, d.products[0]!.children[2]!.meshIds[0]!)).toBe('other / other-body');
    expect(multiLabel(d.products, [l1!.id])).toBe('몸체 1개');
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) {
      expect(translate('bracket · 선 형상 1', lang), lang).not.toMatch(/[가-힣]/);
      expect(translate('점 형상 2', lang), lang).not.toMatch(/[가-힣]/);
    }
  });

  it('보기 링크 낱말: 선 형상만 고른 것도 "0/0.2"(입체 다음 차례)로 담고 되푼다 — 부품 통째면 마디 하나', () => {
    const d = newDoc();
    const [bracket, guide] = d.products[0]!.children;
    const [l1, l2] = scene.lines;
    expect(selectionTokens(d.products, [l1!.id])).toEqual(['0/0.2']);
    expect(selectionTokens(d.products, [l1!.id, l2!.id])).toEqual(['0/0.2', '0/1.2']);
    expect(selectionTokens(d.products, [bracket!.meshIds[0]!, l1!.id])).toEqual(['0/0']);
    expect(selectionTokens(d.products, [guide!.meshIds[0]!, l2!.id, l1!.id])).toEqual(['0/0.2', '0/1']);
    expect(resolveTokens(d.products, ['0/0.2'])).toEqual({ ids: [l1!.id], open: ['0/0'], body: l1!.id });
    expect(resolveTokens(d.products, ['0/0.1-2', '0/1.2'])).toEqual({ ids: [bracket!.meshIds[0]!, l1!.id, l2!.id], open: ['0/0', '0/1'] });
    // 예전 링크의 입체 낱말은 그대로, 차례를 넘는 낱말은 건너뛴다
    expect(resolveTokens(d.products, ['0/0.1'])).toEqual({ ids: [bracket!.meshIds[0]!], open: ['0/0'], body: bracket!.meshIds[0]! });
    expect(resolveTokens(d.products, ['0/2.2'])).toEqual({ ids: [], open: [] });
  });

  it('다시 삼각화해도 고른 선 형상 몸체를 잇는다(표현 PMI 선은 몸체로 잇지 않는다)', () => {
    const from = newDoc();
    const lid = scene.lines[1]!.id;
    from.body = lid;
    const to = newDoc();
    carryDocState(from, to);
    expect(to.body).toBe(lid);
    const pmiFrom = newDoc();
    pmiFrom.pick = { kind: 'line', id: lid, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    (pmiFrom.vis.pmiIds as Set<string>).add(lid);
    const to2 = newDoc();
    (to2.vis.pmiIds as Set<string>).add(lid);
    carryDocState(pmiFrom, to2);
    expect(to2.body).toBeNull();
  });
});

/** 나무 동작만 보는 패널 손님(그 밖의 부름은 기록만) */
function panelHost(d: StepDoc) {
  const calls: string[] = [];
  const host = new Proxy(
    {
      measuring: false,
      measureKind: 'points',
      touch: false,
      fmt: new Fmt('mm'),
      multiPick: false,
      isVisible: () => true,
      groups: () => [],
      selectKey: (k: string | null) => {
        calls.push(`select ${k}`);
        d.selKey = k;
      },
      toggleInSelection: (ids: readonly string[]) => calls.push(`toggle ${ids.join(',')}`),
      selectBody: (id: string | null) => {
        calls.push(`body ${id}`);
        d.selKey = null;
        d.body = id;
      },
      fitBody: (id: string) => calls.push(`fit-body ${id}`),
      setItemsVisible: (ids: readonly string[], on: boolean) => calls.push(`visible ${ids.join(',')} ${on}`),
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => calls.push(String(k))) },
  ) as unknown as PanelHost;
  return { host, calls };
}

describe('패널: 선 형상 몸체 줄', () => {
  const row = (panel: Panel, key: string) => panel.el.querySelector<HTMLElement>(`.tree-row[data-key="${key}"]`)!;
  const click = (el: HTMLElement, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...init }));

  it('줄 이름·아이콘·말풍선, 누르기 = 그 선 형상 고르기, 눈 단추 = 그 선 형상만 숨기기, 두 번 = 맞춰 보기', () => {
    const d = newDoc();
    d.expanded.add('0/0').add('0/1');
    const { host, calls } = panelHost(d);
    const panel = new Panel(host);
    document.body.append(panel.el);
    panel.show(d);
    const [l1, l2] = scene.lines;
    const w1 = row(panel, '0/0.2');
    expect(w1.classList.contains('body-row')).toBe(true);
    expect(w1.querySelector('.tree-name-gen')!.textContent).toBe('선 형상 1');
    expect(w1.title).toBe('bracket · 선 형상 1 · 두 번 누르면 이 선 형상으로 맞춰 봅니다');
    // 이름 있는 선 형상은 파일 글(번역하지 않음)
    expect(row(panel, '0/1.2').querySelector('.tree-name')!.textContent).toBe('rails');
    expect(row(panel, '0/1.2').querySelector('.tree-name')!.getAttribute('translate')).toBe('no');
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) expect(translate(w1.title, lang), lang).not.toMatch(/[가-힣]/);
    click(w1);
    click(row(panel, '0/1.2'), { detail: 2 });
    w1.querySelector<HTMLElement>('.eye')!.click();
    expect(calls).toEqual([`body ${l1!.id}`, `fit-body ${l2!.id}`, `visible ${l1!.id} false`]);
    // 고른 선 형상 줄은 고름, 부품 줄은 일부 고름, 아래 띠는 "고른 몸체 부품 · 선 형상 1"
    d.body = l1!.id;
    panel.onSelection();
    expect(row(panel, '0/0.2').classList.contains('sel')).toBe(true);
    expect(row(panel, '0/0').classList.contains('part-sel')).toBe(true);
    panel.redraw();
    expect(panel.el.querySelector('.panel-foot')!.textContent).toContain('고른 몸체 bracket · 선 형상 1');
    // 속성 탭: 부품 속성과 "선 형상에는 부피·질량이 없습니다" 안내
    panel.setTab('props');
    expect(panel.el.textContent).toContain('선 형상에는 부피·질량이 없습니다');
    panel.el.remove();
  });
});
