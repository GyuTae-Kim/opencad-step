// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Pick3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { bodyTitle, carryDocState, createDoc, multiLabel, selectedBody, selectionItemIds, toggledItems, unitItemIds, type StepDoc } from '../../src/app/doc';
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
    expect(bodyTitle(d.products, scene, a!.id)).toBe('multibody / body-A');
    expect(bodyTitle(d.products, scene, c!.id)).toBe('multibody · 몸체 3');
    expect(bodyTitle(d.products, scene, o!.id)).toBe('other / other-body');
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
    expect(multiLabel(d.products, [o, a, b, c])).toBe('부품 2개');
    // 부품 단위라도 몸체 줄로 부품의 일부 몸체만 골랐으면 몸체로 센다
    expect(multiLabel(d.products, [a, o])).toBe('부품 1개 · 몸체 1개');
    expect(multiLabel(d.products, [a, c])).toBe('몸체 2개');
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
      selectBody: (id: string | null) => {
        calls.push(`body ${id}`);
        d.selKey = null;
        d.body = id;
      },
      fitBody: (id: string) => calls.push(`fit-body ${id}`),
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

describe('제품 나무 몸체 줄', () => {
  const rows = (panel: Panel) => [...panel.el.querySelectorAll<HTMLElement>('.tree-row')];
  const row = (panel: Panel, key: string) => panel.el.querySelector<HTMLElement>(`.tree-row[data-key="${key}"]`)!;
  const click = (el: HTMLElement, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ...init }));

  it('몸체가 여럿인 부품을 펼치면 몸체 줄(이름, 없으면 "몸체 3"), 몸체 하나인 부품은 줄을 더하지 않는다', () => {
    const d = newDoc();
    const { host } = panelHost(d, { on: false });
    const panel = new Panel(host);
    document.body.append(panel.el);
    panel.show(d);
    // 처음에는 접혀 있다(펼침 단추만)
    expect(rows(panel).map((r) => r.dataset.key)).toEqual(['0', '0/0', '0/1']);
    expect(row(panel, '0/0').getAttribute('aria-expanded')).toBe('false');
    expect(row(panel, '0/1').hasAttribute('aria-expanded')).toBe(false);
    row(panel, '0/0').querySelector<HTMLElement>('.twisty')!.click();
    expect(rows(panel).map((r) => r.dataset.key)).toEqual(['0', '0/0', '0/0.1', '0/0.2', '0/0.3', '0/1']);
    const names = rows(panel).filter((r) => r.classList.contains('body-row')).map((r) => r.querySelector('.tree-name, .tree-name-gen')!.textContent);
    expect(names).toEqual(['body-A', 'body-B', '몸체 3']);
    // 파일 이름은 번역하지 않고(.tree-name은 번역층이 건너뛴다), "몸체 3"은 번역한다(.tree-name-gen) · 말풍선은 "부품 · 몸체 3"
    expect(row(panel, '0/0.1').querySelector('.tree-name')!.getAttribute('translate')).toBe('no');
    expect(row(panel, '0/0.3').querySelector('.tree-name')).toBeNull();
    expect(row(panel, '0/0.3').querySelector('.tree-name-gen')!.hasAttribute('translate')).toBe(false);
    expect(row(panel, '0/0.3').title).toBe('multibody · 몸체 3 · 두 번 누르면 이 몸체로 맞춰 봅니다');
    expect(row(panel, '0/0.3').getAttribute('aria-level')).toBe('3');
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) {
      expect(translate(row(panel, '0/0.3').title, lang), lang).not.toMatch(/[가-힣]/);
      expect(translate('고른 몸체', lang), lang).not.toMatch(/[가-힣]/);
    }
    panel.el.remove();
  });

  it('몸체 줄 누르기 = 그 몸체 고르기(다시 누르면 풀기), Ctrl·Shift·여러 개 고르기 = 더하고 빼기, 두 번 = 맞춰 보기, 눈 단추 = 그 몸체만', () => {
    const d = newDoc();
    d.expanded.add('0/0');
    const multi = { on: false };
    const { host, calls } = panelHost(d, multi);
    const panel = new Panel(host);
    document.body.append(panel.el);
    panel.show(d);
    const [a, b] = scene.meshes.map((m) => m.id);
    click(row(panel, '0/0.2'));
    click(row(panel, '0/0.2'));
    click(row(panel, '0/0.1'), { ctrlKey: true });
    click(row(panel, '0/0.1'), { detail: 2 });
    multi.on = true;
    click(row(panel, '0/0.2'));
    row(panel, '0/0.1').querySelector<HTMLElement>('.eye')!.click();
    expect(calls).toEqual([`body ${b}`, 'body null', `toggle ${a}`, `fit-body ${a}`, `toggle ${b}`, 'setItemsVisible']);
    panel.el.remove();
  });

  it('고른 몸체는 그 몸체 줄이 고름, 부품 줄은 일부 고름 — 속성 탭은 부품 속성과 그 몸체의 물리 속성, 아래 띠는 "고른 몸체"', () => {
    const d = newDoc();
    d.expanded.add('0/0');
    const { host } = panelHost(d, { on: false });
    const panel = new Panel(host);
    document.body.append(panel.el);
    const [, b, c] = scene.meshes;
    d.body = c!.id;
    panel.show(d);
    expect(row(panel, '0/0.3').classList.contains('sel')).toBe(true);
    expect(row(panel, '0/0.2').classList.contains('sel')).toBe(false);
    expect(row(panel, '0/0').classList.contains('part-sel')).toBe(true);
    expect(selectedBody(d)).toBe(c!.id);
    expect(selectionItemIds(d)).toEqual([c!.id]);
    expect(panel.el.querySelector('.panel-foot')!.textContent).toContain('고른 몸체 multibody · 몸체 3');
    // 3D에서 몸체 단위로 고른 것도 같은 줄(펼침이 그대로면 줄 표시만 고친다)
    const before = row(panel, '0/0.2');
    d.body = null;
    d.pick = { kind: 'mesh', id: b!.id, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    panel.onSelection();
    expect(row(panel, '0/0.2')).toBe(before);
    expect(before.classList.contains('sel')).toBe(true);
    expect(row(panel, '0/0.3').classList.contains('sel')).toBe(false);
    // 여러 개 고르기에 든 몸체 줄도 고름
    d.pick = null;
    d.items = { ids: [b!.id, c!.id], label: '몸체 2개' };
    panel.onSelection();
    expect([row(panel, '0/0.2'), row(panel, '0/0.3')].map((r) => r.classList.contains('sel'))).toEqual([true, true]);
    expect(row(panel, '0/0').classList.contains('part-sel')).toBe(true);
    // 속성 탭: 나무에서 고른 몸체 하나 → 그 몸체만(6³ = 216)
    d.items = null;
    d.body = c!.id;
    panel.setTab('props');
    const heads = [...panel.el.querySelectorAll('h3')].map((e) => e.textContent);
    expect(heads).toEqual(expect.arrayContaining(['부품 속성', '물리 속성 · multibody · 몸체 3']));
    const vol = [...panel.el.querySelectorAll('.prop-row')].find((r) => r.querySelector('.k')?.textContent === '부피')!.querySelector('.v')!.textContent!;
    expect(vol).toMatch(/^216/);
    panel.el.remove();
  });

  it('다시 삼각화(곡면 품질 바꾸기)에서 고른 몸체를 잇는다', () => {
    const from = newDoc();
    from.pick = { kind: 'mesh', id: scene.meshes[1]!.id, index: 0, point: [0, 0, 0] } as unknown as Pick3d;
    const to = newDoc();
    carryDocState(from, to);
    expect(to.body).toBe(scene.meshes[1]!.id);
    expect(selectionItemIds(to)).toEqual([scene.meshes[1]!.id]);
  });
});

describe('간섭 검사 결과: 안에 든 쌍', () => {
  it('안에 든 쌍은 교차 수 대신 "안에 듦"(앞이 안쪽 부품), 요약에 수, 가려 보이지 않을 수 있다는 안내 — 새 글은 네 언어로', () => {
    const d = newDoc();
    const { host, calls } = panelHost(d, { on: false });
    const panel = new Panel(host);
    document.body.append(panel.el);
    const [a, , , o] = scene.meshes.map((m) => m.id);
    const inner = { a: o!, b: a!, count: 0, trisA: [], trisB: [], inside: true as const };
    d.interference = { running: false, done: 0, total: 0, result: { pairs: [inner, { a: a!, b: o!, count: 12, trisA: [1], trisB: [2] }], tested: 3, ms: 5 } };
    panel.show(d);
    const sec = [...panel.el.querySelectorAll('section')].find((x) => x.querySelector('h3')?.textContent === '간섭 검사')!;
    expect(sec.querySelector('.hint')!.textContent).toBe('범위가 겹친 쌍 3 · 간섭 2 · 안에 듦 1 · 5 ms');
    const rows = [...sec.querySelectorAll('.prop-row')];
    expect(rows.map((r) => r.querySelector('.chip')!.textContent)).toEqual(['안에 듦', '12']);
    expect(rows[0]!.querySelector('.link-btn')!.textContent).toBe('other / other-body ↔ multibody / body-A');
    rows[0]!.querySelector<HTMLElement>('.link-btn')!.click();
    expect(calls).toContain('showInterference');
    const notes = [...sec.querySelectorAll('p.hint')].map((x) => x.textContent!);
    expect(notes.some((t) => t.startsWith('안에 든 부품은 바깥 부품에 가려'))).toBe(true);
    const texts = [
      '간섭 3쌍을 찾았습니다(안에 든 것 1쌍 포함).',
      '안에 듦 1',
      '안에 듦',
      '누르면 안쪽 부품을 강조하고 그것으로 맞춰 봅니다',
      '앞 부품이 뒤 부품 안에 통째로 들었습니다(겉면은 만나지 않음)',
      '고른 것이 많아 형상 1,200개 가운데 640개만 담았습니다.',
      '간섭을 찾지 못했습니다. 맞닿은 면·모서리는 간섭으로 치지 않습니다(닫히지 않은 면 모형은 안에 들었는지 보지 않습니다).',
      '보이는 부품끼리 서로 뚫고 지나가거나 한 부품이 다른 부품 안에 든 곳을 찾습니다(맞닿음은 간섭이 아님)',
      ...notes.filter((t) => t.startsWith('안에 든')),
    ];
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) for (const t of texts) expect(translate(t, lang), `${lang}: ${t}`).not.toMatch(/[가-힣]/);
    expect(translate('고른 것이 많아 형상 1,200개 가운데 640개만 담았습니다.', 'en')).toBe('The selection is large, so only 640 of 1,200 shapes were included.');
    panel.el.remove();
  });
});
