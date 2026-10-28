// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { bodyTitle, createDoc, multiLabel, selectionItemIds, toggledItems, unitItemIds, type StepDoc } from '../../src/app/doc';
import { multiHint } from '../../src/app/measure';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { StepText, cube } from '../stepText';
import { translate } from '../../site/i18n.mjs';

/** 몸체 셋(이름 둘·이름 없음 하나)인 부품과 몸체 하나인 부품의 조립 */
function multiBody(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const a = cube(w, 10, [0, 0, 0], 'body-A').solid;
  const b = cube(w, 10, [15, 0, 0], 'body-B').solid;
  const c = cube(w, 6, [30, 2, 2], '').solid;
  const multi = w.product('multibody', [w.ax2([0, 0, 0]), a, b, c], ctx);
  const other = w.product('other', [w.ax2([0, 0, 0]), cube(w, 8, [0, 20, 0], 'other-body').solid], ctx);
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, multi, w.ax2([0, 0, 0]), 'multibody-1');
  w.place(root, other, w.ax2([0, 0, 0]), 'other-1');
  return w.bytes();
}

const scene = stepToScene(multiBody(), { name: 'm.stp' });
const newDoc = (): StepDoc => createDoc('m.stp', 1, { scene, ms: 1 });

describe('몸체 단위 고르기: 해석기가 형상 항목(입체)마다 그물 하나를 주므로 그물 = 몸체', () => {
  it('한 부품의 입체 셋 → 같은 나무 마디의 그물 셋, 이름은 "부품 / 항목"(없으면 부품 이름)', () => {
    const d = newDoc();
    const part = d.products[0]!.children[0]!;
    expect(part.name).toBe('multibody');
    expect(part.meshIds).toHaveLength(3);
    expect(scene.meshes.slice(0, 3).map((m) => m.name)).toEqual(['multibody / body-A', 'multibody / body-B', 'multibody']);
  });

  it('unitItemIds: 부품은 그 마디 아래 모두, 몸체는 하나, 나무에 없는 항목은 그것 하나', () => {
    const d = newDoc();
    const [a, b, c, o] = scene.meshes.map((m) => m.id);
    expect(unitItemIds(d.products, b!, 'part')).toEqual([a, b, c]);
    expect(unitItemIds(d.products, b!, 'body')).toEqual([b]);
    expect(unitItemIds(d.products, o!, 'part')).toEqual([o]);
    expect(unitItemIds(d.products, 'pmi-x', 'part')).toEqual(['pmi-x']);
  });

  it('bodyTitle: 이름 있는 몸체는 그물 이름, 이름 없는 몸체는 "부품 · 몸체 3", 몸체 하나인 부품은 그대로', () => {
    const d = newDoc();
    const [a, , c, o] = scene.meshes;
    expect(bodyTitle(d.products, a!)).toBe('multibody / body-A');
    expect(bodyTitle(d.products, c!)).toBe('multibody · 몸체 3');
    expect(bodyTitle(d.products, o!)).toBe('other / other-body');
    expect(translate('multibody · 몸체 3', 'en')).toBe('multibody · Body 3');
  });

  it('여러 개 고르기: 더하고(차례 지킴) 이미 모두 있으면 빼기, 이름표는 부품 수 또는 몸체 수', () => {
    const d = newDoc();
    const [a, b, c, o] = scene.meshes.map((m) => m.id) as [string, string, string, string];
    let cur = toggledItems([], [a]);
    cur = toggledItems(cur, [o, a]);
    expect(cur).toEqual([a, o]);
    cur = toggledItems(cur, [b, c]);
    expect(cur).toEqual([a, o, b, c]);
    expect(toggledItems(cur, [o])).toEqual([a, b, c]);
    expect(toggledItems(cur, [a, b, c])).toEqual([o]);
    expect(multiLabel(d.products, [a, b, c])).toBe('부품 1개');
    expect(multiLabel(d.products, [a, b, c], 'body')).toBe('몸체 3개');
    expect(multiLabel(d.products, [a, o])).toBe('부품 2개');
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) {
      expect(translate('몸체 3개', lang), lang).not.toMatch(/[가-힣]/);
      expect(translate(multiHint(true), lang), lang).not.toMatch(/[가-힣]/);
      expect(translate(multiHint(false), lang), lang).not.toMatch(/[가-힣]/);
    }
  });
});

/** 나무 동작만 보는 패널 손님(그 밖의 부름은 기록만) */
function panelHost(d: StepDoc, multi: { on: boolean }) {
  const calls: string[] = [];
  const host = new Proxy(
    {
      measuring: false,
      measureKind: 'points',
      touch: true,
      fmt: new Fmt('mm'),
      get multiPick() {
        return multi.on;
      },
      isVisible: () => true,
      groups: () => [],
      selectKey: (k: string | null) => {
        calls.push(`select ${k}`);
        d.selKey = k;
      },
      toggleInSelection: (ids: readonly string[]) => calls.push(`toggle ${ids.join(',')}`),
      openContextMenu: () => calls.push('menu'),
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => calls.push(String(k))) },
  ) as unknown as PanelHost;
  return { host, calls };
}

describe('제품 나무: 여러 개 고르기 모드와 몸체 일부 고름 표시', () => {
  it('여러 개 고르기 모드면 줄 누르기·길게 누르기가 그 마디 아래 형상을 더하고 빼며, 끄면 예전처럼 마디 고르기', () => {
    const d = newDoc();
    const multi = { on: true };
    const { host, calls } = panelHost(d, multi);
    const panel = new Panel(host);
    document.body.append(panel.el);
    panel.show(d);
    const row = (name: string) => [...panel.el.querySelectorAll<HTMLElement>('.tree-row')].find((r) => r.querySelector('.tree-name')?.textContent?.startsWith(name))!;
    const [a, b, c, o] = scene.meshes.map((m) => m.id);
    row('multibody').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    row('other').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(calls).toEqual([`toggle ${a},${b},${c}`, `toggle ${o}`, 'menu']);
    calls.length = 0;
    multi.on = false;
    row('other').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(calls).toEqual(['select 0/1']);
    panel.el.remove();
  });

  it('몸체 하나를 골랐으면(나무 마디 대신) 그 부품 줄에 일부 고름(part-sel), 마디를 고르면 sel', () => {
    const d = newDoc();
    const { host } = panelHost(d, { on: false });
    const panel = new Panel(host);
    document.body.append(panel.el);
    const [, b] = scene.meshes;
    d.pick = { kind: 'mesh', id: b!.id, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    d.selKey = null;
    panel.show(d);
    const row = (name: string) => [...panel.el.querySelectorAll<HTMLElement>('.tree-row')].find((r) => r.querySelector('.tree-name')?.textContent?.startsWith(name))!;
    expect(row('multibody').classList.contains('part-sel')).toBe(true);
    expect(row('multibody').classList.contains('sel')).toBe(false);
    expect(row('other').classList.contains('part-sel')).toBe(false);
    expect(selectionItemIds(d)).toEqual([b!.id]);
    // 마디 통째로 고르면 sel(일부 표시 없음)
    d.pick = null;
    d.selKey = '0/0';
    panel.onSelection();
    expect(row('multibody').classList.contains('sel')).toBe(true);
    expect(row('multibody').classList.contains('part-sel')).toBe(false);
    // 여러 개 고르기로 다른 부품 몸체 하나와 이 부품 몸체 하나
    d.selKey = null;
    d.items = { ids: [b!.id, scene.meshes[3]!.id], label: '몸체 2개' };
    panel.onSelection();
    expect(row('multibody').classList.contains('part-sel')).toBe(true);
    expect(row('other').classList.contains('sel')).toBe(true);
    panel.el.remove();
  });

  it('속성 탭: 몸체 하나를 골랐으면 부품 속성은 그 부품, 물리 속성은 그 몸체만(정육면체 10 → 부피 1000)', () => {
    const d = newDoc();
    const { host } = panelHost(d, { on: false });
    const panel = new Panel(host);
    document.body.append(panel.el);
    const [a, b] = scene.meshes;
    d.pick = { kind: 'mesh', id: b!.id, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    d.selKey = null;
    panel.show(d);
    panel.setTab('props');
    const heads = [...panel.el.querySelectorAll('h3, .sec-title, .section-title')].map((e) => e.textContent);
    expect(heads).toContain('부품 속성');
    expect(heads).toContain('물리 속성 · multibody / body-B');
    const vol = [...panel.el.querySelectorAll('.prop-row')].find((r) => r.querySelector('.k')?.textContent === '부피')!.querySelector('.v')!.textContent!;
    // 평면 상자라 곡면 적분이 정확하다 — ≈ 없이, 정확도 줄에 "정확"
    expect(vol).toMatch(/^1[,.]?000/);
    const acc = [...panel.el.querySelectorAll('.prop-row')].find((r) => r.querySelector('.k')?.textContent === '정확도')!.querySelector('.v')!.textContent!;
    expect(acc).toBe('정확(B-rep 곡면 적분)');
    // 부품(나무 마디)을 고르면 몸체 셋의 합(1000 + 1000 + 216)
    d.pick = null;
    d.selKey = '0/0';
    panel.redraw();
    const vol2 = [...panel.el.querySelectorAll('.prop-row')].find((r) => r.querySelector('.k')?.textContent === '부피')!.querySelector('.v')!.textContent!;
    expect(vol2).toMatch(/^2[,.]?216/);
    void a;
    panel.el.remove();
  });
});
