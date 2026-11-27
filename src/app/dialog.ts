/**
 * 작은 대화 상자(<dialog>, 모달): 제목·본문·닫기 단추. Esc·바깥 누르기·닫기로 닫고, 닫힐 때 onClose를 부른다.
 * showModal이 없는 환경(오래된 브라우저·시험)에서는 open 속성으로 띄운다. 한 번에 하나만 연다.
 */
import { h, icon } from './dom';

let current: HTMLDialogElement | null = null;

export interface DialogHandle {
  el: HTMLDialogElement;
  close(): void;
}

/** 대화 상자가 열려 있는지(closeDialog가 닫을 것 — showModal·open 속성 갈래 모두). 154차: 열린 동안 앱 창 글쇠는 Esc 말고 받지 않는다(keys.ts routeKey) */
export function dialogOpen(): boolean {
  return !!current;
}

/** 열린 대화 상자 닫기(있었으면 true) */
export function closeDialog(): boolean {
  if (!current) return false;
  const d = current;
  current = null;
  if (d.open) {
    if (typeof d.close === 'function') d.close();
    else d.removeAttribute('open');
  }
  d.remove();
  return true;
}

export function openDialog(title: string, body: (HTMLElement | null)[], opts: { onClose?: () => void; cls?: string } = {}): DialogHandle {
  closeDialog();
  // 닫으면 연 자리(단추)로 초점을 돌려준다(그 사이 사라졌으면 그대로)
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const close = h('button', { type: 'button', class: 'icon-btn dlg-close', 'aria-label': '닫기', title: '닫기' });
  close.append(icon('close', 16));
  const head = h('div', { class: 'dlg-head' }, h('h2', { class: 'dlg-title' }, title), close);
  const content = h('div', { class: 'dlg-body' }, ...body.filter((x): x is HTMLElement => !!x));
  const el = h('dialog', { class: `dlg${opts.cls ? ` ${opts.cls}` : ''}`, 'aria-label': title }, head, content) as HTMLDialogElement;
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    if (current === el) current = null;
    el.remove();
    opts.onClose?.();
    if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true });
  };
  close.addEventListener('click', () => {
    if (current === el) closeDialog();
    done();
  });
  el.addEventListener('close', done);
  el.addEventListener('cancel', () => done());
  // 바깥(배경) 누르기
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      if (current === el) closeDialog();
      done();
    }
  });
  document.body.append(el);
  current = el;
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');
  return {
    el,
    close: () => {
      if (current === el) closeDialog();
      done();
    },
  };
}

/** 안내 칸 id 셈 수(문서 안에서 하나뿐이게 — 대화 상자를 열 때마다 줄을 새로 만든다) */
let hints = 0;

/**
 * 이름표 + 고르기 칸 한 줄. 174차: 밑 안내 글(hint)이 있으면 고르기 칸의 aria-describedby로 잇는다(WCAG 1.3.1·3.3.2 — 감싼 label 안이지만
 * 이름은 aria-label이 정해, 초점으로 옮겨 다니면 안내가 이름에도 설명에도 들지 않았다)
 */
export function selectRow(label: string, options: [string, string][], value: string, onChange: (v: string) => void, hint?: string): HTMLElement {
  const id = hint ? `dlg-hint-${++hints}` : null;
  const sel = h('select', { class: 'dlg-select', 'aria-label': label, 'aria-describedby': id }) as HTMLSelectElement;
  for (const [v, text] of options) {
    const o = h('option', { value: v }, text) as HTMLOptionElement;
    if (v === value) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'dlg-row' }, h('span', { class: 'dlg-label' }, label), sel, hint ? h('span', { class: 'dlg-hint', id }, hint) : null);
}
