// @vitest-environment jsdom
/**
 * PMI 탭 본문(54차 — pmiview.ts, 뷰어 조각): 표현·의미 PMI 표가 보이는 줄만 만드는 가상 목록(ARIA table)인지, 1,000줄 끊음이 없는지,
 * 고르기·보이기가 바뀌면 본문을 다시 그리지 않고 만든 줄의 표시만 고치는지(초점이 그 상자에 남는다), 이름 단추가 지금 고른 것을 보고 고르기·풀기를 하는지.
 * jsdom에는 배치가 없어 가상 목록은 창 높이만큼(첫 줄부터) 만든다
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDoc, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { groupGrid, treeView } from '../../src/app/treeview';
import { pmiView } from '../../src/app/pmiview';

const NP = 1500;
const NS = 620;

function setup(): { panel: Panel; d: StepDoc; calls: string[] } {
  const calls: string[] = [];
  let d!: StepDoc;
  let panel!: Panel;
  const host = new Proxy(
    {
      measuring: false,
      measureKind: 'points',
      touch: false,
      multiPick: false,
      fmt: new Fmt('mm'),
      isVisible: () => true,
      groups: () => [],
      setPmiVisible: (id: string | null, on: boolean) => {
        calls.push(`pmi ${id} ${on}`);
        if (id === null) d.vis.pmiOff = !on;
        else d.vis.setPmi(id, on);
        panel.onVisibility();
      },
      selectItems: (ids: readonly string[] | null, label: string) => {
        calls.push(`select ${ids ? ids.join(',') : 'null'} ${label}`);
        d.items = ids ? { ids: [...ids], label } : null;
        panel.onSelection();
      },
      showPmiFaces: (faces: readonly number[], label: string) => {
        calls.push(`faces ${faces.join(',')} ${label}`);
        d.items = { ids: ['f'], label };
        panel.onSelection();
        return true;
      },
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => {}) },
  ) as unknown as PanelHost;
  const presentations = Array.from({ length: NP }, (_, i) => ({ id: `p${i}`, name: `치수 ${i + 1}`, type: 'annotation_curve_occurrence', stepId: 100 + i, plane: `평면 ${(i % 30) + 1}` }));
  const semantic = Array.from({ length: NS }, (_, i) => ({ kind: 'dimension', type: 'DIMENSIONAL_SIZE', name: `형체 ${i + 1}`, value: `${i + 1} mm ±0.05`, stepId: 9000 + i, faces: i % 2 ? [] : [7] }));
  const meta = { products: [], pmi: { presentations, semantic } };
  d = createDoc('p.stp', 1, { scene: { meshes: [], lines: [], meta }, ms: 1 } as unknown as ParseResult);
  panel = new Panel(host);
  panel.kit = { treeView, groupGrid, pmiView };
  document.body.append(panel.el);
  panel.show(d);
  panel.setOpen(true);
  panel.setTab('pmi');
  return { panel, d, calls };
}

describe('PMI 탭 본문(가상 목록)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('두 표 모두 ARIA table(머리 줄 + 줄 수), 보이는 줄만 만들고 1,000줄 끊음·안내가 없다', () => {
    const { panel } = setup();
    const grids = [...panel.el.querySelectorAll<HTMLElement>('.pmi-grid[role=table]')];
    expect(grids.map((g) => g.getAttribute('aria-rowcount'))).toEqual([String(NP + 1), String(NS + 1)]);
    expect(grids.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent)).toEqual([`표현 PMI 1,500개`, `의미 PMI 620개`]);
    for (const g of grids) {
      const rows = g.querySelectorAll('[role=rowgroup] > [role=row]');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(200);
      expect(rows[0]!.getAttribute('aria-rowindex')).toBe('2');
    }
    expect(panel.el.textContent).not.toContain('처음 1,000개만');
    // 표현 PMI 줄: 확인 칸(라벨로 감쌈)·이름 단추·평면
    const row = grids[0]!.querySelector('[role=rowgroup] > [role=row]')!;
    expect(row.querySelector('label.cb-hit > input[type=checkbox]')!.getAttribute('aria-label')).toBe('\u{2068}치수 1\u{2069} 보이기');
    expect(row.querySelector('.link-btn')!.textContent).toBe('치수 1');
    expect(row.lastElementChild!.textContent).toBe('평면 1');
  });

  it('상자를 끄면 본문을 다시 그리지 않고 그 줄만 끈 표시(초점은 그 상자에 남음), 모두 끄기는 상자를 흐리게', () => {
    const { panel, d, calls } = setup();
    const grid = panel.el.querySelector('.pmi-grid')!;
    const row = grid.querySelectorAll<HTMLElement>('[role=rowgroup] > [role=row]')[3]!;
    const cb = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    cb.focus();
    cb.click();
    expect(calls).toContain('pmi p3 false');
    expect(d.vis.pmiHidden.has('p3')).toBe(true);
    expect(row.isConnected).toBe(true);
    expect(row.classList.contains('off')).toBe(true);
    expect(cb.checked).toBe(false);
    expect(document.activeElement).toBe(cb);
    const all = panel.el.querySelector<HTMLInputElement>('.all-check input')!;
    all.click();
    expect(d.vis.pmiOff).toBe(true);
    expect(row.isConnected).toBe(true);
    const first = grid.querySelector<HTMLInputElement>('[role=rowgroup] input[type=checkbox]')!;
    expect(first.disabled).toBe(true);
    expect(first.checked).toBe(true);
    expect(first.closest('[role=row]')!.classList.contains('off')).toBe(true);
    all.click();
    expect(first.disabled).toBe(false);
    expect(row.classList.contains('off')).toBe(true);
  });

  it('이름 단추: 누르면 고르고(그 줄만 고른 표시), 다시 누르면 풀고, 3D 고르기가 바뀌어도 줄 표시만 고친다', () => {
    const { panel, calls } = setup();
    const grid = panel.el.querySelector('.pmi-grid')!;
    const btns = () => [...grid.querySelectorAll<HTMLButtonElement>('[role=rowgroup] .link-btn')];
    const b = btns()[2]!;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(calls.at(-1)).toBe('select p2 PMI \u{2068}치수 3\u{2069}');
    expect(b.isConnected).toBe(true);
    expect(btns().filter((x) => x.classList.contains('sel'))).toEqual([b]);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(calls.at(-1)).toBe('select null PMI \u{2068}치수 3\u{2069}');
    expect(btns().some((x) => x.classList.contains('sel'))).toBe(false);
  });

  it('의미 PMI: 면에 이어진 줄은 이름 단추(면 수 칩), 누르면 면을 강조하고 그 줄을 고른 표시, 다시 누르면 풀기', () => {
    const { panel, calls } = setup();
    const grid = panel.el.querySelectorAll('.pmi-grid')[1]!;
    const rows = [...grid.querySelectorAll<HTMLElement>('[role=rowgroup] > [role=row]')];
    expect(rows[0]!.querySelector('.chip')!.textContent).toBe('1');
    expect(rows[1]!.querySelector('.link-btn')).toBeNull();
    expect(rows[0]!.querySelector('.mono')!.textContent).toBe('1 mm ±0.05');
    const b = rows[0]!.querySelector<HTMLButtonElement>('.link-btn')!;
    b.click();
    expect(calls.at(-1)).toBe('faces 7 PMI \u{2068}형체 1\u{2069}');
    expect(rows[0]!.classList.contains('sel')).toBe(true);
    expect(b.classList.contains('sel')).toBe(true);
    expect(rows[2]!.classList.contains('sel')).toBe(false);
    b.click();
    expect(calls.at(-1)).toBe('select null PMI \u{2068}형체 1\u{2069}');
    expect(rows[0]!.classList.contains('sel')).toBe(false);
  });
});
