/**
 * 작은 DOM 도우미: 요소 만들기(h)와 SVG 아이콘 넣기.
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

/** 아이콘 SVG 요소 */
export function icon(name: IconName, size = 18): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return t.content.firstElementChild as SVGSVGElement;
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
