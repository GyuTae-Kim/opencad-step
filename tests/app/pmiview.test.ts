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
// 223차: 레이어 탭 본문·아래 띠(panelview.ts — panel.ts에서 옮김)도 나무 조각 — 앱처럼 함께 넣는다
import * as PV from '../../src/app/panelview';
import { translate } from '../../site/i18n.mjs';

const NP = 1500;
const NS = 620;

/** faces: 의미 PMI 줄마다 이어진 면(133차 — 기본은 짝수 줄만 면 하나) */
function setup(faces: (i: number) => number[] = (i) => (i % 2 ? [] : [7])): { panel: Panel; d: StepDoc; calls: string[] } {
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
  const semantic = Array.from({ length: NS }, (_, i) => ({ kind: 'dimension', type: 'DIMENSIONAL_SIZE', name: `형체 ${i + 1}`, value: `${i + 1} mm ±0.05`, stepId: 9000 + i, faces: faces(i) }));
  const meta = { products: [], pmi: { presentations, semantic } };
  d = createDoc('p.stp', 1, { scene: { meshes: [], lines: [], meta }, ms: 1 } as unknown as ParseResult);
  panel = new Panel(host);
  panel.kit = { treeView, groupGrid, pmiView, ...PV };
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

  it('상자를 끄면 본문을 다시 그리지 않고 그 줄만 끈 표시(초점은 그 상자에 남음), 모두 끄기는 상자를 흐리게 — 134차: 줄을 끈 동안 모두 보이기 상자는 섞임, 누르면 모두 보임', () => {
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
    // 134차: 줄 하나를 끄면 「표현 PMI 모두 보이기」 상자는 켜짐이 아니라 섞임(aria-checked="mixed")
    expect([all.checked, all.indeterminate]).toEqual([false, true]);
    all.click();
    // 섞인 상자를 누르면 끈 줄까지 모두 보인다(133차까지는 모두 끄기만 바꿔 줄 숨김이 남았다)
    expect(calls.at(-1)).toBe('pmi null true');
    expect(d.vis.pmiOff).toBe(false);
    expect(d.vis.pmiHidden.size).toBe(0);
    expect(row.isConnected).toBe(true);
    expect(row.classList.contains('off')).toBe(false);
    expect(cb.checked).toBe(true);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
    all.click();
    expect(d.vis.pmiOff).toBe(true);
    expect([all.checked, all.indeterminate]).toEqual([false, false]);
    expect(row.isConnected).toBe(true);
    const first = grid.querySelector<HTMLInputElement>('[role=rowgroup] input[type=checkbox]')!;
    expect(first.disabled).toBe(true);
    expect(first.checked).toBe(true);
    expect(first.closest('[role=row]')!.classList.contains('off')).toBe(true);
    all.click();
    expect(first.disabled).toBe(false);
    expect(row.classList.contains('off')).toBe(false);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
  });

  it('134차: 저장된 보기처럼 줄마다 숨긴 표현 PMI가 있으면 모두 보이기 상자가 섞임이고, 안내(「PMI 모두 보이기로 되돌립니다」)대로 그 상자 한 번으로 모두 되돌린다', () => {
    const { panel, d, calls } = setup();
    // 앱 applySavedView와 같게: 모두 끄기를 풀고 보기에 든 PMI(p0·p2)만 남긴 뒤 패널에 알린다
    const show = new Set(['p0', 'p2']);
    d.vis.pmiOff = false;
    for (const id of d.vis.pmiIds) d.vis.setPmi(id, show.has(id));
    panel.onVisibility();
    const all = panel.el.querySelector<HTMLInputElement>('.all-check input')!;
    // 168차: 상자 이름은 감싼 이름표의 보이는 글(aria-label 없음 — 아래 168차 시험)
    expect(all.closest('label')!.textContent).toBe('표현 PMI 보이기');
    expect([all.checked, all.indeterminate]).toEqual([false, true]);
    const grid = panel.el.querySelector('.pmi-grid')!;
    const rows = () => [...grid.querySelectorAll<HTMLElement>('[role=rowgroup] > [role=row]')];
    const before = rows();
    expect(before.slice(0, 4).map((r) => r.classList.contains('off'))).toEqual([false, true, false, true]);
    all.focus();
    all.click();
    expect(calls.at(-1)).toBe('pmi null true');
    expect(d.vis.pmiOff).toBe(false);
    expect(d.vis.pmiHidden.size).toBe(0);
    // 본문은 다시 그리지 않고 줄 표시만(초점은 상자에)
    expect(rows()[0]).toBe(before[0]);
    expect(rows().slice(0, 4).map((r) => r.classList.contains('off'))).toEqual([false, false, false, false]);
    expect(rows().slice(0, 4).map((r) => r.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked)).toEqual([true, true, true, true]);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
    expect(document.activeElement).toBe(all);
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

  it('137차: 의미 PMI 이름 두 번 누르기는 강조하고 맞춘 채(둘째 누름이 풀지 않음 — 표현 PMI 줄처럼), 강조된 이름을 두 번 누르면 다시 강조, 한 번씩 누르면 지금처럼 풀기', () => {
    const { panel, calls } = setup();
    const grid = panel.el.querySelectorAll('.pmi-grid')[1]!;
    const row = grid.querySelector<HTMLElement>('[role=rowgroup] > [role=row]')!;
    const b = row.querySelector<HTMLButtonElement>('.link-btn')!;
    const press = (detail: number) => b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
    const label = 'PMI \u{2068}형체 1\u{2069}';
    const n0 = calls.length;
    const since = () => calls.slice(n0);
    // 두 번 누르기(첫 누름 detail 1 → 둘째 detail 2): 강조·맞춤 한 번, 둘째는 아무것도 하지 않는다
    press(1);
    press(2);
    expect(since()).toEqual([`faces 7 ${label}`]);
    expect([row.classList.contains('sel'), b.classList.contains('sel')]).toEqual([true, true]);
    // 강조된 이름을 두 번 누르면 첫 누름이 풀고 둘째가 다시 강조·맞춤 — 두 번 누르기는 늘 강조된 채 끝난다
    press(1);
    press(2);
    expect(since().slice(1)).toEqual([`select null ${label}`, `faces 7 ${label}`]);
    expect(row.classList.contains('sel')).toBe(true);
    // 셋째 누름(detail 3)은 받지 않는다(표현 PMI 줄과 같음)
    press(3);
    expect(since().length).toBe(3);
    // 한 번 누르기(Enter·Space는 detail 0)는 지금처럼 다시 누르면 푼다
    press(0);
    expect(calls.at(-1)).toBe(`select null ${label}`);
    expect(row.classList.contains('sel')).toBe(false);
  });

  it('133차: 이름 단추의 누르기 풀이(말풍선)를 손가락 기기 안내 줄(coarse-only — 같은 글)로 표마다 한 줄 표 위에, 이름 단추가 없는 의미 표에는 없다', () => {
    const { panel } = setup();
    const [pres, sem] = [...panel.el.querySelectorAll<HTMLElement>('.pmi-grid')].map((g) => g.closest('section')!);
    const tips = (sec: HTMLElement) => [...sec.querySelectorAll<HTMLElement>(':scope > p.hint.coarse-only')];
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    // 표현 PMI: 이름 단추 말풍선의 끝 조각(누르기 풀이)과 같은 글, 표 위(가상 목록이라 표 밑은 끝까지 굴려야 보인다)
    const pt = tips(pres);
    expect(pt.map((p) => p.textContent)).toEqual(['누르면 강조(두 번 누르면 맞춰 보기)']);
    expect(pres.querySelector('[role=rowgroup] .link-btn')!.getAttribute('title')!.split(' · ').at(-1)).toBe(pt[0]!.textContent);
    expect(before(pt[0]!, pres.querySelector('.pmi-grid')!)).toBe(true);
    // 의미 PMI: 이름 단추 말풍선과 같은 글, 표 위. 값 꼴 안내(모든 기기)는 그대로 표 뒤
    const st = tips(sem);
    expect(st.map((p) => p.textContent)).toEqual([sem.querySelector('[role=rowgroup] .link-btn')!.getAttribute('title')]);
    expect(before(st[0]!, sem.querySelector('.pmi-grid')!)).toBe(true);
    expect([...sem.querySelectorAll(':scope > p.hint:not(.coarse-only)')].map((p) => p.textContent)).toEqual(['치수(값·± 공차), 기하 공차(크기 | 데이텀), 데이텀을 STEP 의미 PMI에서 읽었습니다.']);
    // 줄마다가 아니라 표마다 한 줄
    expect(panel.el.querySelectorAll('.coarse-only').length).toBe(2);
    // 네 언어 사전에 있다(번역층이 옮김 — 한국어가 남지 않음)
    for (const p of [...pt, ...st]) for (const code of ['en', 'ja', 'zh-CN', 'de']) expect(translate(p.textContent!, code), `${code}: ${p.textContent}`).not.toMatch(/[가-힣]/);
    // 손가락 기기에서만 보이는 표현 표 안내는 탭 낱말(같은 사전의 손가락 안내 꼴 — 말풍선 틀은 마우스에도 보여 누르기·두 번 누르기 낱말 그대로).
    // 228차: 일본어·중국어 풀이 괄호는 그 언어 다수 꼴 전각(i18n.test 괄호 시험)
    expect(['en', 'ja', 'zh-CN', 'de'].map((code) => translate(pt[0]!.textContent!, code))).toEqual([
      'Tap to highlight (double-tap to zoom to it)',
      'タップで強調表示（ダブルタップで合わせて表示）',
      '点按可突出显示（点按两次可缩放到它）',
      'Antippen zum Hervorheben (doppelt antippen zum Einpassen)',
    ]);
    // 면에 이어진 의미 PMI가 없으면 이름 단추가 없어 의미 표 안내도 없다(표현 표 안내는 그대로)
    document.body.innerHTML = '';
    const { panel: bare } = setup(() => []);
    const [pres2, sem2] = [...bare.el.querySelectorAll<HTMLElement>('.pmi-grid')].map((g) => g.closest('section')!);
    expect(sem2.querySelector('.link-btn')).toBeNull();
    expect(tips(sem2)).toEqual([]);
    expect(tips(pres2).length).toBe(1);
  });

  it('168차: 「표현 PMI 보이기」 상자의 이름은 감싼 이름표의 보이는 글(aria-label 없음 — WCAG 2.5.3), 줄 상자 이름은 그 줄의 보이는 이름을 품는다', () => {
    const { panel } = setup();
    const lab = panel.el.querySelector<HTMLLabelElement>('label.all-check')!;
    const all = lab.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    // 전에는 aria-label 「표현 PMI 모두 보이기」가 보이는 글을 앞서 이름이 그 글을 품지 않았다(다섯 언어 모두)
    expect([all.getAttribute('aria-label'), all.getAttribute('aria-labelledby')]).toEqual([null, null]);
    expect(lab.textContent).toBe('표현 PMI 보이기');
    // 이름표 글은 번역층이 옮기는 화면 글(파일 글 가둠 밖)
    expect(lab.closest('[translate="no"], [data-i18n-skip]')).toBeNull();
    for (const code of ['en', 'ja', 'zh-CN', 'de']) expect(translate('표현 PMI 보이기', code), code).not.toMatch(/[가-힣]/);
    const rows = [...panel.el.querySelectorAll<HTMLElement>('.pmi-grid [role=rowgroup] > [role=row]')].slice(0, 3);
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.querySelector('input[type=checkbox]')!.getAttribute('aria-label')).toContain(row.querySelector('.link-btn')!.textContent!);
  });

  it('182차: 이름 단추(누르면 강조·다시 누르면 풀기)의 강조는 aria-pressed로도 — 표현·의미 PMI 표와 레이어 표, 3D 쪽에서 고르기가 바뀌어도 함께(WCAG 4.1.2)', () => {
    const { panel, d } = setup();
    const [pres, sem] = [...panel.el.querySelectorAll('.pmi-grid')];
    const btns = (g: Element) => [...g.querySelectorAll<HTMLButtonElement>('[role=rowgroup] .link-btn')];
    // 눌린 단추 차례와 강조(.sel) 단추 차례 — 둘이 늘 같아야 한다(의미 PMI 줄의 .sel은 role=table 안 줄이라 aria-selected가 뜻이 없어 이름 단추가 나른다)
    const on = (g: Element) => {
      const bs = btns(g);
      const pick = (f: (b: HTMLButtonElement) => boolean) => bs.flatMap((b, i) => (f(b) ? [i] : []));
      return { pressed: pick((b) => b.getAttribute('aria-pressed') === 'true'), sel: pick((b) => b.classList.contains('sel')), unset: pick((b) => b.getAttribute('aria-pressed') === null).length };
    };
    expect(on(pres!)).toEqual({ pressed: [], sel: [], unset: 0 });
    expect(on(sem!)).toEqual({ pressed: [], sel: [], unset: 0 });
    // 표현 PMI 셋째 이름을 누르면 그 단추만 눌림, 다시 누르면 풀림
    const p2 = btns(pres!)[2]!;
    p2.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(on(pres!)).toEqual({ pressed: [2], sel: [2], unset: 0 });
    p2.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(on(pres!)).toEqual({ pressed: [], sel: [], unset: 0 });
    // 의미 PMI(면에 이어진 짝수 줄만 단추): 첫 단추를 Enter·Space(detail 0)로 누르면 눌림 — 표현 PMI 단추는 풀린 그대로
    btns(sem!)[0]!.click();
    expect(on(sem!)).toEqual({ pressed: [0], sel: [0], unset: 0 });
    expect(on(pres!).pressed).toEqual([]);
    // 3D 쪽에서 고르기가 바뀜(고르기 풀기 → 다른 PMI 하나): 만든 줄 표시를 고칠 때 눌림도 함께
    d.items = null;
    panel.onSelection();
    expect([on(pres!).pressed, on(sem!).pressed]).toEqual([[], []]);
    d.items = { ids: ['p5'], label: 'PMI 다른 이름' };
    panel.onSelection();
    expect([on(pres!), on(sem!).pressed]).toEqual([{ pressed: [5], sel: [5], unset: 0 }, []]);

    // 레이어 표(첫 화면 패널): 이름 단추도 같은 토글 — 누르면 다시 그린 표의 그 단추가 눌림
    document.body.innerHTML = '';
    let ld!: StepDoc;
    let lp!: Panel;
    const lhost = new Proxy(
      {
        measuring: false,
        measureKind: 'points',
        touch: false,
        multiPick: false,
        fmt: new Fmt('mm'),
        isVisible: () => true,
        groups: () => [],
        selectItems: (ids: readonly string[] | null, label: string) => {
          ld.items = ids ? { ids: [...ids], label } : null;
          lp.onSelection();
        },
      } as Record<string, unknown>,
      { get: (t, k) => (k in t ? t[k as string] : () => {}) },
    ) as unknown as PanelHost;
    const meta = { products: [], layers: [{ name: 'L1', meshIds: ['m1'] }, { name: 'L2', meshIds: ['m2'] }] };
    ld = createDoc('l.stp', 1, { scene: { meshes: [], lines: [], meta }, ms: 1 } as unknown as ParseResult);
    lp = new Panel(lhost);
    lp.kit = { treeView, groupGrid, pmiView, ...PV };
    document.body.append(lp.el);
    lp.show(ld);
    lp.setOpen(true);
    lp.setTab('layers');
    const layer = () => [...lp.el.querySelectorAll<HTMLButtonElement>('tbody .link-btn')].map((b) => [b.getAttribute('aria-pressed'), b.classList.contains('sel')]);
    expect(layer()).toEqual([['false', false], ['false', false]]);
    lp.el.querySelector<HTMLButtonElement>('tbody .link-btn')!.click();
    expect(layer()).toEqual([['true', true], ['false', false]]);
    lp.el.querySelector<HTMLButtonElement>('tbody .link-btn')!.click();
    expect(layer()).toEqual([['false', false], ['false', false]]);
    // 다른 길(3D·나무에서 같은 묶음을 고름)로 바뀌어도
    ld.items = { ids: ['m2'], label: '레이어 \u{2068}L2\u{2069}' };
    lp.onSelection();
    expect(layer()).toEqual([['false', false], ['true', true]]);
  });
});
