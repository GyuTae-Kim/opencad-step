/**
 * 작은 DOM 도우미: 요소 만들기(h)와 SVG 아이콘 넣기, 알림 칸 한도(pushToast), 다음 프레임에 한 번 부르기(nextFrame).
 */
import { ICONS, type IconName } from './icons';

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * 요소 만들기. attrs의 class·text·html·style·hidden·disabled 등을 다루고, 값이 false·null·undefined면 넣지 않는다.
 * html은 우리 코드의 고정 글(아이콘 SVG)만 넣는다(파일에서 읽은 글은 text나 자식 문자열로 넣는다).
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'hidden') el.hidden = !!v;
    else if (k === 'disabled') (el as HTMLButtonElement).disabled = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

const iconCache = new Map<string, SVGSVGElement>();

/** 아이콘 SVG 요소(이름·크기마다 한 번 읽어 두고 복제한다 — 큰 제품 나무는 줄마다 눈·펼침·몸체 아이콘을 만든다) */
export function icon(name: IconName, size = 18): SVGSVGElement {
  const k = `${name}/${size}`;
  let svg = iconCache.get(k);
  if (!svg) {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
    iconCache.set(k, (svg = t.content.firstElementChild as SVGSVGElement));
  }
  return svg.cloneNode(true) as SVGSVGElement;
}

/** 아이콘 + 글 단추 */
export function iconButton(name: IconName, label: string, opts: { title?: string; cls?: string; hideLabel?: boolean } = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${opts.cls ?? ''}`.trim(), title: opts.title ?? label });
  b.append(icon(name));
  const span = h('span', { class: opts.hideLabel ? 'btn-label sr-only' : 'btn-label' }, label);
  b.append(span);
  if (opts.hideLabel) b.setAttribute('aria-label', label);
  return b;
}

/** 알림 칸마다 그 칸 밖에서 초점이 들어오기 전 자리(들어올 때 relatedTarget — 없었으면 null, 166차) */
const cameFrom = new WeakMap<Element, HTMLElement | null>();

/**
 * 알림 칸에 알림 t를 넣고, max개를 넘으면 하나씩 뺀다 — 닫을 때까지 남기는 안내(data-keep: 그래픽 문맥 잃음 — 되찾을 때까지)는
 * 건너뛰고(144차 — 잃은 동안 저장 오류 알림이 쌓여 그 안내가 먼저 빠졌다), 가장 오래된 안내(class info)부터, 안내가 없으면 가장 오래된 것부터 뺀다
 * (152차 — 다시 볼 곳 없는 오류·경고가 뒤이은 안내에 밀려 제 시간 전에 빠졌다). 모두 남길 것이면 맨 앞을 빼 한도는 늘 지킨다.
 * ms를 주면 그 시간 뒤 저절로 닫되, 마우스가 올라 있거나 초점이 그 안(닫기·동작 버튼)이면 멈추고 둘 다 떠나면 처음 시간을 다시 센다
 * (160차 — WCAG 2.2.1 시간 조절의 연장: 전에는 읽거나 버튼에 가 있는 동안에도 사라졌고, 초점이 있던 버튼과 함께 사라지면 초점이 문서로 빠졌다).
 * 처음 시간을 다시 주어 끝 무렵에 올렸다 떼도 곧바로 사라지지 않는다. 손가락은 누르는 동안만(pointerenter~pointerleave) 멈춘다.
 * 돌려준 함수가 그 알림을 닫는다(앱의 닫기·동작 버튼·문맥 되찾음 등). 닫거나 한도로 빼거나 시간이 다 되어 빠지는 알림 안에 초점이 있었으면 알림 칸 밖에서 들어오기 전 자리로,
 * 그 자리가 없거나(문서에서 곧장 옴) 빠졌거나 초점을 받지 못하면 home()으로 돌려준다(166차 — WCAG 2.4.3: 전에는 초점이 문서로 빠져 다음 Tab이 처음부터 돌았다).
 * 초점이 그 알림 밖이면(명령이 이미 옮김) 건드리지 않는다. 포인터로 누른 알림(누름이 버튼에 초점을 주는 브라우저 — 그 뒤 알림 안 글쇠 없음)을 닫을 때는
 * 들어오기 전 자리가 글 칸이면 그 칸 대신 home()으로 간다(손가락 화면 자판이 다시 뜨지 않게 — 166차 덧고침)
 */
export function pushToast(box: Element, t: Element, max: number, ms?: number, home?: () => HTMLElement | null | undefined): () => void {
  const drop = (x: Element, pressed?: boolean): void => {
    const a = document.activeElement;
    const had = !!a && x.contains(a);
    x.remove();
    if (!had) return;
    const to = cameFrom.get(box);
    if (to?.isConnected && !(pressed && to.matches('input, textarea, select, [contenteditable]'))) to.focus({ preventScroll: true });
    if (document.activeElement !== to) home?.()?.focus({ preventScroll: true });
  };
  let pressed = false;
  const close = (): void => drop(t, pressed);
  box.append(t);
  t.addEventListener('pointerdown', () => (pressed = true));
  t.addEventListener('keydown', () => (pressed = false));
  // 알림 칸 밖에서 들어온 초점만 기억한다(알림끼리 옮기면 처음 들어온 자리 그대로)
  t.addEventListener('focusin', (e) => {
    const r = (e as FocusEvent).relatedTarget as HTMLElement | null;
    if (!box.contains(r)) cameFrom.set(box, r);
  });
  while (box.children.length > max) {
    const free = [...box.children].filter((c) => !c.hasAttribute('data-keep'));
    drop(free.find((c) => /\binfo\b/.test(c.className)) ?? free[0] ?? box.children[0]!);
  }
  if (ms === undefined) return close;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let over = false;
  let inside = false;
  const on = (type: string, set: (e: Event) => void) =>
    t.addEventListener(type, (e) => {
      set(e);
      clearTimeout(timer);
      timer = over || inside ? undefined : setTimeout(close, ms);
    });
  on('pointerenter', () => (over = true));
  on('pointerleave', () => (over = false));
  on('focusin', () => (inside = true));
  // 안에서 옮기면(동작 ↔ 닫기) relatedTarget이 안이라 멈춘 채, 밖·창 밖(null)이면 떠남
  on('focusout', (e) => (inside = t.contains((e as FocusEvent).relatedTarget as Node | null)));
  timer = setTimeout(close, ms);
  return close;
}

/**
 * 다음 프레임에 한 번 부르기: 앞서 잡은 예약(prev, 0 = 없음)은 지우고 지금 다시 잡는다. 그사이 다른 쪽이 잡은 프레임 일(코어가 포인터 사건에서
 * 예약한 그리기 — 그때 커서 아래 붙잡을 점을 구한다)보다 먼저 돌아 옛 값을 읽지 않게. 돌려준 수를 다음 부름의 prev로 준다
 */
export function nextFrame(prev: number, cb: FrameRequestCallback): number {
  if (prev) cancelAnimationFrame(prev);
  return requestAnimationFrame(cb);
}
