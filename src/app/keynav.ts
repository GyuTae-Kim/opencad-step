/**
 * 키보드 길잡이(53차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖): WAI-ARIA APG(Authoring Practices Guide)의 탭·라디오 묶음·도구 막대 패턴을
 * 화살표 글쇠로. 문서를 열어 뷰어를 만들 때 앱 뿌리에 한 번 단다(도구 막대는 문서가 없으면 모두 흐리고, 패널 탭·라디오 묶음은 문서가 있을 때만 보인다).
 * 전에는 역할(role)만 탭·라디오·도구 막대이고 화살표가 없어 단추마다 Tab으로 멈췄다 — 화면 읽기 프로그램이 "탭 1/5", "라디오 단추", "도구 막대"라고 읽어
 * 화살표를 눌러도 아무것도 되지 않았다(측정 중에는 화살표가 앱의 측정 방향 잠금으로, 걷기 중에는 카메라 걷기로 샜다).
 * - 탭(role=tab, 부모 role=tablist): ←·→(끝에서 돌아감)·Home·End로 옮기고 바로 고른다(자동 활성 — APG Tabs는 탭 본문을 눈에 띄게 늦지 않게 보일 수 있으면
 *   자동 활성을 권한다. 패널 탭 본문은 이미 읽은 문서에서 바로 그린다). Tab 멈춤은 고른 탭 하나(panel.ts가 tabindex를 둔다)
 * - 라디오(role=radio, 부모 role=radiogroup): ←·↑·→·↓로 옮기고 고른다(APG Radio Group). Tab 멈춤은 고른 라디오(없으면 첫 것) 하나 — aria-checked가 바뀌면 맞춘다
 * - 도구 막대(role=toolbar): ←·→로 보이고 쓸 수 있는 단추 사이를 옮긴다(끝에서 돌아감). Tab 멈춤은 마지막으로 초점을 받은 단추 하나(숨거나 흐려졌으면 첫 단추).
 *   Home·End는 앱의 홈 뷰 글쇠로 남긴다(APG Toolbar에서 고를 수 있는 것). 메뉴 단추(aria-haspopup=menu)는 ↓로도 연다(APG Menu Button)
 * 처리한 글쇠는 기본 동작을 막아(preventDefault) 앱의 창 글쇠(홈 뷰·측정 방향 잠금·걷기)로 넘어가지 않게 한다.
 */

/** 3D 보기 위 띠·막대와 패널(그 안에서 닫으면 초점을 돌려준다) */
const BARS = '.measure-bar, .section-bar, .explode-bar, .iso-bar, .panel';

/** 보이는지(숨김 조상·display:none·눈에 안 보이게 접힌 자리 — checkVisibility가 없는 환경은 hidden 조상만) */
function shown(el: HTMLElement): boolean {
  if (el.closest('[hidden]')) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

const usable = (el: HTMLElement): boolean => !(el as HTMLButtonElement).disabled && shown(el);

/** 도구 막대의 단추(바로 아래 단추만 — 펼친 메뉴는 body에 붙는다) */
const toolsOf = (tb: Element): HTMLElement[] => [...tb.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName === 'BUTTON');

/**
 * 라디오 묶음의 Tab 멈춤: 고른 라디오, 없으면 첫 보이는 라디오(면으로 자른 단면은 축 라디오를 고르지 않는다). 숨은 띠 안에서 고른 것이 바뀌어도(측정을 끈 동안의
 * 측정 종류) 고른 것을 멈춤으로 둔다 — 보이는지는 고른 것이 없을 때만 본다
 */
export function syncRadios(group: Element): void {
  const items = [...group.querySelectorAll<HTMLElement>('[role=radio]')];
  const stop = items.find((b) => b.getAttribute('aria-checked') === 'true' && !(b as HTMLButtonElement).disabled) ?? items.find(usable) ?? items[0];
  for (const b of items) b.tabIndex = b === stop ? 0 : -1;
}

/** 도구 막대마다 마지막으로 초점을 받은 단추 */
const lastTool = new WeakMap<Element, HTMLElement>();

/** 도구 막대의 Tab 멈춤: 마지막으로 초점을 받은 단추(쓸 수 없거나 숨었으면 첫 쓸 수 있는 단추) 하나 */
export function syncToolbar(tb: Element): void {
  const items = toolsOf(tb);
  const last = lastTool.get(tb);
  const stop = last && items.includes(last) && usable(last) ? last : (items.find(usable) ?? items[0]);
  for (const b of items) b.tabIndex = b === stop ? 0 : -1;
}

type Group = { kind: 'tab' | 'radio' | 'tool'; items: HTMLElement[] };

function groupOf(t: HTMLElement): Group | null {
  const role = t.getAttribute('role');
  if (role === 'tab') {
    const g = t.closest('[role=tablist]');
    return g ? { kind: 'tab', items: [...g.querySelectorAll<HTMLElement>('[role=tab]')].filter(usable) } : null;
  }
  if (role === 'radio') {
    const g = t.closest('[role=radiogroup]');
    return g ? { kind: 'radio', items: [...g.querySelectorAll<HTMLElement>('[role=radio]')].filter(usable) } : null;
  }
  const tb = t.parentElement;
  if (tb?.getAttribute('role') === 'toolbar' && t.tagName === 'BUTTON') return { kind: 'tool', items: toolsOf(tb).filter(usable) };
  return null;
}

/**
 * 눌린 글쇠 → 옮겨 갈 차례(못 받으면 -1). 탭: ←·→·Home·End, 라디오: ←·↑·→·↓, 도구 막대: ←·→ — 모두 끝에서 돌아간다
 */
export function moveIndex(kind: Group['kind'], key: string, i: number, n: number): number {
  if (n < 1 || i < 0) return -1;
  const next = key === 'ArrowRight' || (kind === 'radio' && key === 'ArrowDown');
  const prev = key === 'ArrowLeft' || (kind === 'radio' && key === 'ArrowUp');
  if (next) return (i + 1) % n;
  if (prev) return (i - 1 + n) % n;
  if (kind === 'tab' && (key === 'Home' || key === 'End')) return key === 'Home' ? 0 : n - 1;
  return -1;
}

let installed: Element | null = null;

/** 앱 뿌리에 단다(한 번만 — 두 번째부터는 아무것도 하지 않는다). 뗄 함수를 돌려준다 */
export function installKeyNav(root: HTMLElement): () => void {
  if (installed) return () => {};
  installed = root;
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target as HTMLElement;
    const g = groupOf(t);
    if (!g) return;
    if (g.kind === 'tool' && e.key === 'ArrowDown' && t.getAttribute('aria-haspopup') === 'menu') {
      e.preventDefault();
      t.click();
      return;
    }
    const j = moveIndex(g.kind, e.key, g.items.indexOf(t), g.items.length);
    if (j < 0) return;
    e.preventDefault();
    const to = g.items[j]!;
    if (g.kind === 'tool') {
      lastTool.set(t.parentElement!, to);
      syncToolbar(t.parentElement!);
    } else to.tabIndex = 0;
    to.focus();
    // 탭·라디오는 옮기면 고른다(이미 골랐으면 그대로). 탭은 누르면 탭 줄을 다시 그리고 패널이 새 고른 탭으로 초점을 옮긴다
    if (g.kind !== 'tool' && to.getAttribute(g.kind === 'tab' ? 'aria-selected' : 'aria-checked') !== 'true') to.click();
  };
  const onFocus = (e: FocusEvent): void => {
    const t = e.target as HTMLElement;
    const tb = t.parentElement;
    if (tb?.getAttribute('role') !== 'toolbar' || t.tagName !== 'BUTTON') return;
    lastTool.set(tb, t);
    syncToolbar(tb);
  };
  // 띠·막대·패널 안에서 누른 단추나 글쇠(끝내기·끄기·패널 닫기·Esc·거리 칸 Enter)가 그 띠를 숨기거나 칸을 떠나 초점이 body로 떨어지면 돌려준다
  // (WCAG 2.4.3 — 전에는 다음 Tab이 문서 처음부터 다시 돌았다). 패널이 닫혔으면 도구 막대의 패널 단추, 패널이 그대로면 고른 탭, 그 밖에는 띠가 떠 있던 3D 보기로.
  // 명령이 스스로 초점을 옮겼으면(대화 상자·메뉴·다시 그린 나무 줄) 그대로 둔다
  const rescue = (): void => {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement)) return;
    const bar = a.closest<HTMLElement>(BARS);
    if (!bar) return;
    setTimeout(() => {
      // 숨긴 단추에서 초점을 떼는 일(focus fixup)은 브라우저가 다음 그리기 때 하므로, 아직 그 단추에 초점이 있어도 보이지 않으면 잃은 것으로 본다
      const now = document.activeElement;
      if (now && now !== document.body && (now !== a || shown(a))) return;
      const panel = bar.classList.contains('panel');
      const to = panel ? (shown(bar) ? bar.querySelector<HTMLElement>('[role=tab][aria-selected=true]') : root.querySelector<HTMLElement>('.toolbar [data-tool=panel]')) : root.querySelector<HTMLElement>('.viewer-host canvas');
      if (to && shown(to)) to.focus({ preventScroll: true });
    });
  };
  const all = (): void => {
    for (const g of root.querySelectorAll('[role=radiogroup]')) syncRadios(g);
    for (const tb of root.querySelectorAll('[role=toolbar]')) syncToolbar(tb);
  };
  // 고른 라디오가 바뀌거나(aria-checked — 분해 막대의 라디오는 조각을 받은 뒤 붙지만 막대를 맞출 때마다 이 값을 다시 건다),
  // 도구 단추가 흐려지거나 살아나면(disabled) 멈춤을 다시 맞춘다
  const mo = new MutationObserver((recs) => {
    const radios = new Set<Element>();
    const bars = new Set<Element>();
    for (const r of recs) {
      const el = r.target as HTMLElement;
      const g = r.attributeName === 'aria-checked' ? el.closest('[role=radiogroup]') : null;
      if (g) radios.add(g);
      else if (el.parentElement?.getAttribute('role') === 'toolbar') bars.add(el.parentElement);
    }
    for (const g of radios) syncRadios(g);
    for (const tb of bars) syncToolbar(tb);
  });
  mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'disabled'] });
  // 좁은 화면 ↔ 넓은 화면(도구 막대의 넓은 화면 전용 단추가 숨고 나타난다)
  const onResize = (): void => {
    for (const tb of root.querySelectorAll('[role=toolbar]')) syncToolbar(tb);
  };
  root.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocus);
  root.addEventListener('click', rescue, true);
  root.addEventListener('keydown', rescue, true);
  addEventListener('resize', onResize);
  all();
  return () => {
    mo.disconnect();
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('focusin', onFocus);
    root.removeEventListener('click', rescue, true);
    root.removeEventListener('keydown', rescue, true);
    removeEventListener('resize', onResize);
    installed = null;
  };
}
