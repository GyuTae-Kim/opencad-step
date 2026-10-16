/**
 * 단추 아래에 펼치는 작은 메뉴. 도구 막대가 가로로 스크롤될 수 있어(overflow) body에 붙이고 fixed로 놓는다.
 * 바깥 누르기·Esc·항목 고르기·창 크기 바뀜에 닫히고, 위아래 화살표로 항목을 옮긴다.
 */
import { h } from './dom';

export interface MenuItem {
  label: string;
  /** 오른쪽에 보일 단축키 */
  hint?: string;
  /** 고른 상태(라디오) */
  checked?: boolean;
  run: () => void;
}

let current: { el: HTMLElement; anchor: HTMLElement; close: () => void } | null = null;

/** 열린 메뉴가 있는지 */
export function menuOpen(): boolean {
  return current !== null;
}

/** 열린 메뉴 닫기(있었으면 true) */
export function closeMenu(): boolean {
  if (!current) return false;
  current.close();
  return true;
}

/** anchor 아래에 메뉴를 연다(같은 단추로 다시 누르면 닫는다) */
export function openMenu(anchor: HTMLElement, items: MenuItem[], label: string): void {
  if (current?.anchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  const radio = items.some((i) => i.checked !== undefined);
  const el = h('div', { class: 'menu', role: 'menu', 'aria-label': label });
  const buttons: HTMLButtonElement[] = [];
  for (const it of items) {
    const b = h(
      'button',
      { type: 'button', class: `menu-item${it.checked ? ' checked' : ''}`, role: radio ? 'menuitemradio' : 'menuitem', 'aria-checked': radio ? String(!!it.checked) : null, tabindex: '-1' },
      h('span', { class: 'menu-check', 'aria-hidden': 'true' }, it.checked ? '●' : ''),
      h('span', { class: 'menu-label' }, it.label),
      it.hint ? h('kbd', {}, it.hint) : null,
    );
    b.addEventListener('click', () => {
      closeMenu();
      it.run();
    });
    buttons.push(b);
    el.append(b);
  }
  document.body.append(el);
  // 자리: 단추 아래 왼쪽 맞춤, 화면 밖으로 나가지 않게
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !anchor.contains(t)) closeMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      anchor.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = buttons.length;
      const next = e.key === 'ArrowDown' ? (i + 1 + n) % n : (i - 1 + n) % n;
      buttons[i < 0 ? 0 : next]?.focus();
    } else if (e.key === 'Tab') closeMenu();
  };
  const onResize = () => closeMenu();
  const close = () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    anchor.setAttribute('aria-expanded', 'false');
    el.remove();
    current = null;
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  current = { el, anchor, close };
  (buttons.find((b) => b.classList.contains('checked')) ?? buttons[0])?.focus({ preventScroll: true });
}
