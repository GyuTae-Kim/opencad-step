/**
 * PMI 탭 본문(54차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖): 표현 PMI 표(보이기 상자·이름 단추·평면), 의미 PMI 표(종류·이름·값), 저장된 보기 단추.
 * 두 표는 제품 나무·부품별 보이기 표(49차)처럼 화면에 보이는 줄만 만드는 가상 목록(treeview.ts VList, ARIA table — aria-rowcount·aria-rowindex)이다.
 * 53차까지는 패널이 줄을 모두 만들고(표마다 처음 1,000줄까지) 고르기·보이기가 바뀔 때마다 본문을 통째로 다시 그렸다 — 합성 PMI 2,120개
 * (표현 1,500·의미 620)에서 탭 그리기 57~75 ms, 주 스레드를 4배 느리게 하면 228 ms(가장 길게 351 ms), 이름 누르기 193 ms·상자 바꾸기 177 ms·
 * PMI 탭을 연 채 3D에서 고르기 200 ms(헤드리스 Chrome, load average 16~22). 이제 모든 줄을 보이는 만큼만 만들고(1,000줄 끊음 없음),
 * 고르기·보이기가 바뀌면 만든 줄의 표시만 고친다(patch — 초점·스크롤도 그대로)
 */
import { h, icon } from './dom';
import type { StepDoc } from './doc';
import { fmtCount } from './format';
import { pmiTypeLabel, semanticLabel, type PanelHost } from './panel';
import { VList } from './treeview';

/** PMI 탭 본문: 패널이 본문에 붙이고, 목록은 자리가 정해진 뒤 update, 고르기·보이기가 바뀌면 patch */
export interface PmiView {
  el: HTMLElement;
  lists: VList[];
  patch(): void;
}

/** 패널이 부르는 앱 쪽 기능 가운데 PMI 탭이 쓰는 것 */
export type PmiHost = Pick<PanelHost, 'setPmiVisible' | 'selectItems' | 'showPmiFaces' | 'applySavedView'>;

const section = (id: string, title: string, ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', { id }, title), ...children.filter((c): c is HTMLElement => !!c));

/** 표 한 벌(머리 줄 + 가상 목록 줄): 줄 만들기와 만든 줄 표시 고치기 */
function grid(labelledBy: string, heads: string[], count: number, scroller: HTMLElement, make: (i: number) => HTMLElement, mark: (row: HTMLElement, i: number) => void): { el: HTMLElement; list: VList; patch(): void } {
  const body = h('div', { role: 'rowgroup' });
  const el = h(
    'div',
    { class: `vgrid pmi-grid cols-${heads.length}`, role: 'table', 'aria-labelledby': labelledBy, 'aria-rowcount': String(count + 1) },
    h('div', { class: 'vgrid-row vgrid-head', role: 'row', 'aria-rowindex': '1' }, ...heads.map((t) => h('span', { role: 'columnheader' }, t))),
    body,
  );
  const list = new VList(
    body,
    scroller,
    count,
    (i) => {
      const row = make(i);
      row.setAttribute('aria-rowindex', String(i + 2));
      mark(row, i);
      return row;
    },
    26,
  );
  return { el, list, patch: () => list.shown.forEach((row, i) => mark(row, i)) };
}

export function pmiView(d: StepDoc, host: PmiHost, scroller: HTMLElement): PmiView {
  const v = d.vis;
  const el = h('div', { class: 'pmi-view' });
  const lists: VList[] = [];
  const patches: (() => void)[] = [];

  const pres = d.pmi.presentations;
  if (pres.length) {
    const all = h('input', { type: 'checkbox', 'aria-label': '표현 PMI 모두 보이기' });
    all.addEventListener('change', () => host.setPmiVisible(null, all.checked));
    /** 이름 단추 하나만 고른 것(누르면 고르기 풀기) */
    const picked = (id: string) => d.items?.ids.length === 1 && d.items.ids[0] === id;
    const g = grid(
      'pmi-pres-title',
      ['주석', '평면·종류'],
      pres.length,
      scroller,
      (i) => {
        const p = pres[i]!;
        const cb = h('input', { type: 'checkbox', 'aria-label': `${p.name || p.type} 보이기` });
        cb.addEventListener('change', () => host.setPmiVisible(p.id, cb.checked));
        const label = p.name || pmiTypeLabel(p.type);
        const nameBtn = h('button', { type: 'button', class: 'link-btn', title: `${pmiTypeLabel(p.type)} · #${p.stepId}${p.model ? ` · ${p.model}` : ''} · 누르면 강조(두 번 누르면 맞춰 보기)` }, label);
        nameBtn.addEventListener('click', (ev) => {
          if (ev.detail === 2) host.selectItems([p.id], `PMI ${label}`, true);
          else if (ev.detail <= 1) host.selectItems(picked(p.id) ? null : [p.id], `PMI ${label}`);
        });
        return h('div', { class: 'vgrid-row', role: 'row' }, h('span', { class: 'check', role: 'cell' }, h('label', { class: 'cb-hit' }, cb), nameBtn), h('span', { class: 'dim small', role: 'cell' }, p.plane ?? pmiTypeLabel(p.type)));
      },
      (row, i) => {
        const p = pres[i]!;
        const on = !v.pmiHidden.has(p.id);
        row.classList.toggle('off', !on || v.pmiOff);
        const cb = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
        cb.checked = on;
        cb.disabled = v.pmiOff;
        row.querySelector('.link-btn')!.classList.toggle('sel', picked(p.id));
      },
    );
    lists.push(g.list);
    patches.push(() => {
      all.checked = !v.pmiOff;
      g.patch();
    });
    el.append(section('pmi-pres-title', `표현 PMI ${fmtCount(pres.length)}개`, h('label', { class: 'check all-check' }, all, h('span', {}, '표현 PMI 보이기')), g.el));
  }

  const sem = d.pmi.semantic;
  if (sem.length) {
    const labelOf = (i: number) => `PMI ${sem[i]!.name || semanticLabel(sem[i]!.type)}`;
    const g = grid(
      'pmi-sem-title',
      ['종류', '이름', '값'],
      sem.length,
      scroller,
      (i) => {
        const x = sem[i]!;
        const label = labelOf(i);
        let nameCell: HTMLElement;
        // 면에 이어진 PMI는 이름을 누르면 그 면을 강조하고 맞춰 본다
        if (x.faces?.length) {
          const b = h('button', { type: 'button', class: 'link-btn', title: '누르면 이 PMI가 가리키는 면을 강조하고 맞춰 봅니다' }, h('span', { translate: 'no' }, x.name || '—'));
          b.addEventListener('click', () => (d.items?.label === label ? host.selectItems(null, label) : host.showPmiFaces(x.faces!, label)));
          nameCell = h('span', { class: 'sem-name', role: 'cell' }, b, h('span', { class: 'chip dim-chip', title: '이어진 면 수' }, `${x.faces.length}`));
        } else nameCell = h('span', { role: 'cell', translate: 'no' }, x.name || '—');
        return h(
          'div',
          { class: 'vgrid-row', role: 'row' },
          h('span', { role: 'cell', title: `${x.type} · #${x.stepId}` }, semanticLabel(x.type)),
          nameCell,
          h('span', { class: 'mono', role: 'cell', translate: 'no', title: x.value || '' }, x.value || '—'),
        );
      },
      (row, i) => {
        const on = d.items?.label === labelOf(i);
        row.classList.toggle('sel', on);
        row.querySelector('.link-btn')?.classList.toggle('sel', on);
      },
    );
    lists.push(g.list);
    patches.push(g.patch);
    el.append(
      section(
        'pmi-sem-title',
        `의미 PMI ${fmtCount(sem.length)}개`,
        g.el,
        h('p', { class: 'hint' }, '치수(값·± 공차), 기하 공차(크기 | 데이텀), 데이텀을 STEP 의미 PMI에서 읽었습니다.'),
      ),
    );
  }

  const views = d.pmi.views;
  if (views.length) {
    const list = h('div', { class: 'view-list' });
    for (const sv of views) {
      const b = h('button', { type: 'button', class: 'btn small view-btn', title: `${sv.projection === 'perspective' ? '원근' : '평행'} · ${sv.pmiIds?.length ? `PMI ${sv.pmiIds.length}개` : 'PMI 없음'}` }, icon('views', 14), h('span', { translate: 'no' }, sv.name || `#${sv.id}`));
      b.addEventListener('click', () => host.applySavedView(sv));
      list.append(b);
    }
    el.append(section('pmi-view-title', `저장된 보기 ${fmtCount(views.length)}개`, list, h('p', { class: 'hint' }, '누르면 그 보기의 카메라로 옮기고 그 보기에 든 표현 PMI만 보입니다(PMI 모두 보이기로 되돌립니다).')));
  }
  if (!pres.length && !sem.length && !views.length) el.append(h('p', { class: 'empty' }, '이 파일에는 PMI가 없습니다.'));
  const patch = () => patches.forEach((p) => p());
  patch();
  return { el, lists, patch };
}
