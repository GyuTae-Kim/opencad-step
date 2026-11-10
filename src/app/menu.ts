/**
 * 단추 아래에 펼치는 작은 메뉴. 도구 막대가 가로로 스크롤될 수 있어(overflow) body에 붙이고 fixed로 놓는다.
 * 바깥 누르기·Esc·항목 고르기·창 폭 바뀜에 닫히고, 위아래 화살표로 (쓸 수 있는) 항목을 옮긴다.
 * 항목: 명령(menuitem) · 하나 고르기(checked, menuitemradio) · 켜고 끄기(toggle, menuitemcheckbox), 앞 구분선(sep)·흐리게(disabled), 이름 뒤 파일 글(file).
 */
import { h } from './dom';
import { fileSpan } from './ftext';

export interface MenuItem {
  label: string;
  /** 오른쪽에 보일 단축키 */
  hint?: string;
  /** 고른 상태(라디오, toggle이면 켜짐) — undefined면 표시 없는 명령 */
  checked?: boolean;
  /** 켜고 끄는 항목(menuitemcheckbox) — 아니면 하나 고르기(menuitemradio) */
  toggle?: boolean;
  /** 쓸 수 없음(흐리게, 화살표로 건너뜀) */
  disabled?: boolean;
  /** 앞에 구분선 */
  sep?: boolean;
  /** 덜 쓰는 항목: 손가락 기기 작업 메뉴에서 끝의 "그 밖의 작업…" 아래로 보낸다(ctxmenu.ts foldMenu — 52차) */
  more?: boolean;
  /** 이름 뒤에 붙일 파일 글(64차 겹친 것 고르기 목록의 부품 이름 — 번역하지 않는다, ftext.ts fileSpan) */
  file?: string;
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

/**
 * 화면 점(client 좌표)에 메뉴를 연다(오른쪽 누르기·길게 누르기 작업 메뉴). 보이지 않는 1화소 기준점을 그 자리에 두고 연다.
 * 65차: 연 메뉴 요소를 돌려주고, 닫힐 때(고르기 — 그 명령보다 먼저·Esc·바깥 누르기·다른 메뉴) onClose를 부른다(겹친 것 목록 미리 강조 되돌리기 — ctxmenu.ts)
 */
export function openMenuAt(x: number, y: number, items: MenuItem[], label: string, onClose?: () => void): HTMLElement | null {
  closeMenu();
  const anchor = h('div', { class: 'menu-point', 'aria-hidden': 'true' });
  anchor.style.cssText = `position:fixed;left:${Math.round(x)}px;top:${Math.round(y)}px;width:1px;height:1px;pointer-events:none`;
  document.body.append(anchor);
  openMenu(anchor, items, label);
  const c = current as { el: HTMLElement; close: () => void } | null;
  if (c) {
    const close = c.close;
    c.close = () => {
      close();
      anchor.remove();
      onClose?.();
    };
  } else anchor.remove();
  return c?.el ?? null;
}

/** anchor 아래에 메뉴를 연다(같은 단추로 다시 누르면 닫는다) */
export function openMenu(anchor: HTMLElement, items: MenuItem[], label: string): void {
  if (current?.anchor === anchor) {
    closeMenu();
    return;
  }
  // 닫을 때 초점을 돌려줄 곳: 연 단추(도구 막대 단추는 Tab 멈춤이 아니어도 — keynav.ts), 화면 점 메뉴(보이지 않는 기준점)면 열 때 초점이 있던 것
  // (나무 줄·3D 보기 — 53차, 전에는 초점이 사라진 메뉴 항목과 함께 body로 날아갔다)
  const was = document.activeElement;
  const opener = anchor.tagName === 'BUTTON' || anchor.tabIndex >= 0 ? anchor : was instanceof HTMLElement && was !== document.body && !was.closest('.menu') ? was : null;
  const back = () => opener?.isConnected && opener.focus({ preventScroll: true });
  closeMenu();
  const el = h('div', { class: 'menu', role: 'menu', 'aria-label': label });
  const buttons: HTMLButtonElement[] = [];
  for (const it of items) {
    if (it.sep && buttons.length) el.append(h('div', { class: 'menu-sep', role: 'separator' }));
    const role = it.checked === undefined ? 'menuitem' : it.toggle ? 'menuitemcheckbox' : 'menuitemradio';
    const b = h(
      'button',
      { type: 'button', class: `menu-item${it.checked ? ' checked' : ''}`, role, 'aria-checked': it.checked === undefined ? null : String(it.checked), disabled: !!it.disabled, tabindex: '-1' },
      h('span', { class: `menu-check${it.toggle ? ' tick' : ''}`, 'aria-hidden': 'true' }, it.checked ? (it.toggle ? '✓' : '●') : ''),
      h('span', { class: 'menu-label' }, it.label),
      it.file ? fileSpan(it.file, 'menu-file') : null,
      it.hint ? h('kbd', {}, it.hint) : null,
    );
    b.addEventListener('click', () => {
      // 항목을 고르면 메뉴가 사라지므로 초점을 연 단추로 돌려준다(키보드로 고른 뒤 초점이 문서 처음으로 날아가지 않게,
      // 그 명령이 대화 상자를 열면 닫을 때 이 단추로 돌아온다). 화면 점 메뉴의 보이지 않는 기준점은 초점을 받지 않으므로 연 때 초점이 있던 곳으로
      const hadFocus = el.contains(document.activeElement);
      closeMenu();
      if (hadFocus) back();
      it.run();
    });
    buttons.push(b);
    el.append(b);
  }
  document.body.append(el);
  const usable = buttons.filter((b) => !b.disabled);
  // 자리: 단추 아래 왼쪽 맞춤, 화면 밖으로 나가지 않게(가장자리 8px, 단추와 4px). 아래에 다 들어가지 않으면 더 넓은 쪽으로 펴고(51차 — Android PopupWindow는
  // 아래가 모자라면 단추 위에 붙이고, iOS 작업 메뉴도 누른 자리 위·아래로 열린다), 그 쪽도 모자라면 그 높이까지 펴고 메뉴 안에서 굴린다.
  // 전에는 위아래 모두 모자라면 위쪽이 더 넓어도 아래로 폈다(휴대폰 3D 보기 아래쪽을 길게 눌러 연 작업 메뉴가 320×568에서 다섯 줄쯤만 보임)
  const place = (): void => {
    el.style.maxHeight = '';
    const r = anchor.getBoundingClientRect();
    const below = innerHeight - r.bottom - 12;
    const mh = el.offsetHeight;
    const up = mh > below && r.top - 12 > below;
    const fit = Math.min(mh, up ? r.top - 12 : below);
    if (fit < mh) el.style.maxHeight = `${fit}px`;
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${up ? r.top - 4 - fit : r.bottom + 4}px`;
  };
  place();
  // 다른 언어 화면은 번역층(i18n.ts — 문서 변화 관찰, 마이크로태스크)이 붙인 뒤 글을 바꿔 폭이 달라진다(375px 독일어 "App-Einstellungen" 메뉴가
  // 한국어 폭으로 놓여 화면 오른쪽 밖으로 18px 나갔다): 번역 뒤 크기로 다시 놓는다. 관찰자 마이크로태스크는 붙일 때 이미 줄을 섰으니 이것이 뒤에 돈다.
  // 그 뒤에도 글꼴을 늦게 받으면 폭이 또 바뀌므로(일본어 앱 설정 메뉴 188 → 196px) 열린 동안 크기가 바뀔 때마다 다시 놓는다
  queueMicrotask(() => {
    if (current?.el === el) place();
  });
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => current?.el === el && place()) : null;
  sized?.observe(el);
  anchor.setAttribute('aria-expanded', 'true');

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !anchor.contains(t)) closeMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = usable.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      back();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = usable.length;
      const next = e.key === 'ArrowDown' ? (i + 1 + n) % n : (i - 1 + n) % n;
      usable[i < 0 ? 0 : next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      // APG Menu: 처음·끝 항목(53차 — 전에는 Home이 창 글쇠로 넘어가 메뉴를 연 채 3D 보기가 홈 뷰로 돌았다)
      e.preventDefault();
      usable[e.key === 'Home' ? 0 : usable.length - 1]?.focus();
    } else if (e.key === 'Tab') closeMenu();
  };
  // 휴대폰 주소 막대가 숨고 나타날 때(높이만 바뀜)는 닫지 않는다
  const width = innerWidth;
  const onResize = () => {
    if (innerWidth !== width) closeMenu();
  };
  const close = () => {
    sized?.disconnect();
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
  (usable.find((b) => b.classList.contains('checked')) ?? usable[0])?.focus({ preventScroll: true });
}
