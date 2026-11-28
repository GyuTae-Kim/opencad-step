/**
 * 단추 아래에 펼치는 작은 메뉴. 도구 막대가 가로로 스크롤될 수 있어(overflow) body에 붙이고 fixed로 놓는다.
 * 바깥 누르기·바깥 초점(159차)·Esc·Tab·항목 고르기·창 폭 바뀜에 닫히고, 위아래 화살표로 (쓸 수 있는) 항목을 옮긴다.
 * 항목: 명령(menuitem) · 하나 고르기(checked, menuitemradio) · 켜고 끄기(toggle, menuitemcheckbox), 앞 구분선(sep)·흐리게(disabled), 이름 뒤 파일 글(file).
 */
import { h } from './dom';
import { fileSpan } from './ftext';

export interface MenuItem {
  label: string;
  /** 오른쪽에 보일 단축키(221차: 번역하지 않는 원문 — 한글이 없어 사전 밖, 키 도움말 표 kbd와 같이 translate="no") */
  hint?: string;
  /**
   * 220차: 같은 일을 하는 앱 키(aria-keyshortcuts 값 — 부르는 쪽이 172차 설정대로 고른 값, keys.ts outsideKeys). 없으면 달지 않는다.
   * 221차: null(설정을 꺼 그 키가 메뉴 밖에서 듣지 않음)이면 키 글도 보이지 않는다 — 보이는 키 = 값(값을 주지 않는 Enter·Alt 키 글은 그대로)
   */
  keys?: string | null;
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

/** spot: 화면 점 메뉴를 연 자리에서 누르면 초점을 받는 칸(3D 보기·나무 줄 — 159차, openMenuAt), owner: 화면 점 메뉴를 연 버튼(183차) */
let current: { el: HTMLElement; anchor: HTMLElement; close: () => void; spot?: Element | null; owner?: HTMLElement | null } | null = null;
/** 183차: 항목 명령이 도는 동안 그 메뉴의 owner — 명령이 같은 자리에 다시 여는 하위 메뉴(불투명도…·그 밖의 작업…)도 그 버튼이 펼친 메뉴 */
let carry: HTMLElement | null = null;

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
 * 65차: 연 메뉴 요소를 돌려주고, 닫힐 때(고르기 — 그 명령보다 먼저·Esc·바깥 누르기·바깥 초점·다른 메뉴) onClose를 부른다(겹친 것 목록 미리 강조 되돌리기 — ctxmenu.ts)
 * 183차(WCAG 4.1.2): owner는 그 자리에서 메뉴를 연 메뉴 버튼(여러 개 고르기 띠 「작업」) — 펼침(aria-expanded)을 기준점 대신 그 버튼에 열 때 true, 닫을 때 false로 둔다
 * (전에는 버튼이 메뉴를 열어도 펼침이 아니었다). 주지 않으면 항목 명령이 다시 연 하위 메뉴는 앞 메뉴의 owner(carry)
 */
export function openMenuAt(x: number, y: number, items: MenuItem[], label: string, onClose?: () => void, owner: HTMLElement | null = carry): HTMLElement | null {
  closeMenu();
  // 159차: 그 자리에서 누르면 초점을 받는 칸(배치가 없는 환경은 없음). 기준점은 누르기를 받지 않고 메뉴는 그 자리 4px 아래·위에 놓여 덮지 않는다
  const spot = document.elementFromPoint?.(x, y)?.closest('[tabindex],button');
  const anchor = h('div', { class: 'menu-point', 'aria-hidden': 'true' });
  anchor.style.cssText = `position:fixed;left:${Math.round(x)}px;top:${Math.round(y)}px;width:1px;height:1px;pointer-events:none`;
  document.body.append(anchor);
  openMenu(anchor, items, label);
  const c = current as { el: HTMLElement; close: () => void; spot?: Element | null; owner?: HTMLElement | null } | null;
  if (c) {
    c.spot = spot;
    c.owner = owner;
    owner?.setAttribute('aria-expanded', 'true');
    const close = c.close;
    c.close = () => {
      close();
      anchor.remove();
      owner?.setAttribute('aria-expanded', 'false');
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
      { type: 'button', class: `menu-item${it.checked ? ' checked' : ''}`, role, 'aria-checked': it.checked === undefined ? null : String(it.checked), 'aria-keyshortcuts': it.keys, disabled: !!it.disabled, tabindex: '-1' },
      h('span', { class: `menu-check${it.toggle ? ' tick' : ''}`, 'aria-hidden': 'true' }, it.checked ? (it.toggle ? '✓' : '●') : ''),
      h('span', { class: 'menu-label' }, it.label),
      // 238차(WCAG 1.4.12): 말줄임 부품 이름(.menu-file)은 말풍선에 전체 — 글 간격을 넓히면 더 일찍 잘리고, 앞부분이 같은 이름은 3D 미리 강조로만 갈렸다
      it.file ? fileSpan(it.file, 'menu-file', it.file) : null,
      it.hint && it.keys !== null ? h('kbd', { translate: 'no' }, it.hint) : null,
    );
    b.addEventListener('click', () => {
      // 항목을 고르면 메뉴가 사라지므로 초점을 연 단추로 돌려준다(키보드로 고른 뒤 초점이 문서 처음으로 날아가지 않게,
      // 그 명령이 대화 상자를 열면 닫을 때 이 단추로 돌아온다). 화면 점 메뉴의 보이지 않는 기준점은 초점을 받지 않으므로 연 때 초점이 있던 곳으로
      const hadFocus = el.contains(document.activeElement);
      const owner = current?.owner ?? null;
      closeMenu();
      if (hadFocus) back();
      // 183차: 그 명령이 같은 자리에 다시 여는 하위 메뉴도 이 메뉴를 연 버튼이 펼친 것(openMenuAt owner — 도구 막대 「보기 설정 → 내보내기…」가 같은 버튼에 다시 여는 것과 같은 끝 상태)
      carry = owner;
      try {
        it.run();
      } finally {
        carry = null;
      }
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

  // 바깥 누르기와 159차 바깥 초점: Tab·누르기 밖의 길(앱이 옮김 — 메뉴 항목에서 Ctrl·⌘+F의 나무 거르기 칸·분해 끄는 중 숫자의 거리 칸, 화면 읽기 프로그램이 옮김)로
  // 초점이 메뉴·연 단추 밖으로 가면 닫는다(초점은 옮겨 간 칸 그대로). 전에는 열린 채 남아 아래 문서 캡처 키 듣기가 그 칸의 Esc(닫고 연 곳으로)·↑↓·Home·End(메뉴 항목으로)를 가져갔고,
  // 그 칸의 H·I 등은 158차 메뉴 판정 밖이라 메뉴를 연 채 뒤를 바꿨다(NC 152차·SKP 162차 꼴). 여는 길은 모두 메뉴 항목에 초점을 주고 끝나 연 차례를 건너뛰지 않는다.
  // 화면 점 메뉴는 연 자리의 칸(spot)으로 가는 초점만 메뉴 쪽 — 그 칸을 누르면 pointerdown이 먼저 닫고, 길게 누르기를 뗀 손가락의 초점(132차가 뗀 click을 거름)에 방금 연 메뉴가 닫히지 않게
  const onDown = (e: Event) => {
    const t = e.target as Node;
    if (!el.contains(t) && !anchor.contains(t) && !(e.type === 'focusin' && t === current?.spot)) closeMenu();
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
    } else if (e.key === 'Tab') {
      // 188차(WCAG 2.4.3): 메뉴 안 초점이면 Esc·항목처럼 연 곳으로 돌려준 뒤 기본 이동은 막지 않아 그 자리의 다음·앞 칸으로(APG Menu — 메뉴는 body 끝에 붙어,
      // 전에는 지운 자리에서 떠나 Tab은 문서 밖·Shift+Tab은 앱 끝 칸으로 갔다). 밖이면 닫기만
      const had = el.contains(document.activeElement);
      closeMenu();
      if (had) back();
    }
  };
  // 휴대폰 주소 막대가 숨고 나타날 때(높이만 바뀜)는 닫지 않는다
  const width = innerWidth;
  const onResize = () => {
    if (innerWidth !== width) closeMenu();
  };
  const close = () => {
    sized?.disconnect();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('focusin', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    anchor.setAttribute('aria-expanded', 'false');
    el.remove();
    current = null;
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('focusin', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  current = { el, anchor, close };
  (usable.find((b) => b.classList.contains('checked')) ?? usable[0])?.focus({ preventScroll: true });
}
