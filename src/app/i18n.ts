import { createLanguageMenu } from 'opencad-site-kit/i18n/language-menu';
// 66차: 코어 0.54.0 작은 모듈의 표(뷰어 조각의 코어 입구·camera와 같은 객체 — 코어는 이 표를 개발 화면에만 쓴다)
import { VIEW_LABELS } from 'opencad-viewer3d/viewkeys';
/** Localize only presentation DOM. CAD data, input values and command keys stay intact. */
import { currentLanguage, languages, languageUrl, metadataForLanguage, registerCatalog, sourceMessage, translate } from '../../site/i18n-core.mjs';

const loaders: Record<string, () => Promise<{default: Record<string,string>}>> = {
  en: () => import('../../site/locales/en.json'), ja: () => import('../../site/locales/ja.json'),
  'zh-CN': () => import('../../site/locales/zh-CN.json'), de: () => import('../../site/locales/de.json'),
};
async function loadLanguage(language: string): Promise<void> { if (loaders[language]) registerCatalog(language,(await loaders[language]()).default); }

type RecordValue = { source: string; rendered: string };
/**
 * 211차(WCAG 3.1.2): 앱 글 칸(data-i18n-ui — 상태 막대 고른 것·묶음 이름표 칸·PMI 표 이름 버튼)은 틀이 잡은 값도 옮긴다(「고른 것: {0}」이 끼운 「부품 2개」·PMI 종류는
 * 앱 글인데 그대로 끼워 다른 언어에서 한국어로 남았다). 그 칸의 파일 글은 FSI…PDI로 갇혀 있으니(ftext.ts isolateText) 바깥 가둠 하나째(겹쳐 가둔 경로 글도 하나로)를
 * 사적 영역 글자 하나로 바꿔 번역이 한글 없는 값으로 그대로 끼우게 하고, 옮긴 뒤 되돌린다(NC 199차 mixSpan ui 꼴 — 파일 글 조각은 그대로)
 */
function uiTranslate(source: string, language: string): string {
  const kept: string[] = [];
  let masked = '';
  let depth = 0;
  let from = 0;
  const keep = (end: number): void => {
    masked += String.fromCharCode(0xe000 + kept.push(source.slice(from, end)) - 1);
    from = end;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    // LRI·RLI·FSI 열기, PDI 닫기(UAX #9)
    if (c > 0x2065 && c < 0x2069) {
      if (!depth++) {
        masked += source.slice(from, i);
        from = i;
      }
    } else if (c === 0x2069 && depth && !--depth) keep(i + 1);
  }
  // 닫지 않은 가둠은 끝까지 파일 글로
  if (depth) keep(source.length);
  else masked += source.slice(from);
  let out = translate(masked, language, true);
  kept.forEach((run, i) => (out = out.split(String.fromCharCode(0xe000 + i)).join(run)));
  return out;
}
const SKIP = '[data-static-languages], [translate="no"], [data-i18n-skip], script, style, [contenteditable]:not([contenteditable="false"]), textarea, input, code, pre, canvas, svg, .anno-layer, .pmi-layer, .docname, .doc-name, .code-list, .cmd-input, .file-name, .tree .name, .tree-name, .boot-recent-list button, .plist .name, .def-cell, .scene-tabs, .scene-cap, .group-item:not(.opt) .name';
/**
 * 224차(WCAG 3.3.1·4.1.3): 사전 조각을 받지 못하면(오프라인에서 새 판과 옛 캐시가 엇갈림·네트워크 끊김) failed로 알린다(앱 — 바꾸기 전 화면 언어의 경고 알림과
 * 「다시 시도」 = 그 언어로 바꾸기, 까닭은 콘솔에만). 처음 받기에 실패하면 원문(한국어)으로 세운다(lang·언어 메뉴도 한국어 — 전에는 거절로 끝나 번역층·언어 메뉴가 서지 않았다).
 * 언어 메뉴로 바꾸다 실패하면 지금 언어 그대로(전에는 아무 알림 없이 끝났다)
 */
export async function installLocalization(root: HTMLElement, failed?: (e: unknown, retry: () => void) => void): Promise<() => void> {
  const fail = (e: unknown, code: string): void => failed?.(e, () => void changeLanguage(code));
  let language = currentLanguage(location.href);
  try { await loadLanguage(language); } catch (e) { fail(e, language); language = 'ko'; }
  const originalViews = Object.entries(VIEW_LABELS);
  // View cube face labels (core viewcube module) are relabeled by the app once the viewer chunk is loaded (app.ts relabelCube — 61st round:
  // keeps the core viewcube module out of the first-screen bundle)
  function canvasLabels(): void {
    for (const [view,label] of originalViews) VIEW_LABELS[view as keyof typeof VIEW_LABELS] = translate(label,language);
  }
  canvasLabels();
  const presentationRoot = document.body;
  const texts = new WeakMap<Node, RecordValue>();
  const attributes = new WeakMap<Element, Map<string, RecordValue>>();
  const control = createLanguageMenu(languages, language, changeLanguage);
  function value(current: string, record?: RecordValue, ui?: boolean): RecordValue {
    const source = record && current === record.rendered ? record.source : sourceMessage(current);
    const rendered = ui ? uiTranslate(source, language) : translate(source, language);
    // Keep spacing around split text nodes and inline elements.
    return { source, rendered: rendered === source ? source : (source.match(/^\s*/)?.[0] ?? '') + rendered + (source.match(/\s*$/)?.[0] ?? '') };
  }
  // Callers (update) have already checked that el and its ancestors are outside SKIP or el is a skipped form field outside translate="no"
  function element(el: Element, ui?: boolean): void {
    const records = attributes.get(el) ?? new Map<string, RecordValue>(); attributes.set(el, records);
    for (const name of ['title','aria-label','aria-description','placeholder','alt']) {
      if (!el.hasAttribute(name)) continue;
      const record = value(el.getAttribute(name)!, records.get(name), ui); records.set(name, record);
      if (el.getAttribute(name) !== record.rendered) el.setAttribute(name, record.rendered);
    }
    if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) {
      const current = el.getAttribute('href')!; const old = records.get('href');
      const source = old && current === old.rendered ? old.source : current;
      const rendered = languageUrl(new URL(source, document.baseURI).href, language);
      records.set('href',{source,rendered}); if (el.getAttribute('href') !== rendered) el.setAttribute('href',rendered);
    }
  }
  // inside: the parent was walked here and is outside SKIP, so the ancestor lookup (closest per node — slow for a 3,000-row tree) is skipped.
  // ui: inside an app-text cell (data-i18n-ui — uiTranslate), handed down the same way
  function update(node: Node, inside?: boolean, ui?: boolean): void {
    if (!inside) {
      if (node.parentElement?.closest(SKIP)) return;
      ui = !!node.parentElement?.closest('[data-i18n-ui]');
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement) return;
      const record = value(node.nodeValue ?? '', texts.get(node), ui); texts.set(node, record);
      if (node.nodeValue !== record.rendered) node.nodeValue = record.rendered;
      return;
    }
    if (!(node instanceof Element)) return;
    ui ||= node.hasAttribute('data-i18n-ui');
    if (node.matches(SKIP)) { if (node.matches('input, textarea, canvas, [contenteditable]') && !node.closest('[translate="no"], [data-i18n-skip]')) element(node, ui); return; }
    element(node, ui);
    for (const child of [...node.childNodes]) update(child, true, ui);
  }
  function mountSelector(): void {
    // The shared widget preserves native language names with translate="no".
    // Its own accessible name still follows the selected UI language.
    const label = translate('언어 선택', language);
    const trigger = control.element.querySelector('button');
    const menu = document.getElementById(trigger?.getAttribute('aria-controls') ?? '');
    for (const el of [trigger, menu]) if (el && el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    // 181차(WCAG 1.1.1): 고른 언어의 ✓는 styles.css ::after 생성 글이라 내용에서 센 항목 이름에 섞였다(고름은 aria-checked가 이미 알림 — 앱 메뉴 ✓는 aria-hidden 칸, menu.ts).
    // 이름은 보이는 언어 이름 그대로
    for (const item of menu?.querySelectorAll('button') ?? []) if (item.getAttribute('aria-label') !== item.textContent) item.setAttribute('aria-label', item.textContent ?? '');
    if (trigger && trigger.title !== label) trigger.title = label;
    const host = root.querySelector('.titlebar, .topbar, header');
    if (host) { control.element.classList.remove('language-control-floating'); if (control.element.parentNode !== host) host.append(control.element); }
    if (!control.element.isConnected) { control.element.classList.add('language-control-floating'); root.append(control.element); }
  }
  let titleSource = sourceMessage(document.title);
  function metadata(): void {
    const data = metadataForLanguage(language);
    document.documentElement.lang = language;
    const previous = titleSource;
    document.title = translate(previous,language);
    const originalName = metadataForLanguage('ko').siteName;
    if (previous.endsWith(originalName)) document.title = previous.slice(0,-originalName.length) + translate(originalName,language);
    const fields: [string,string][] = [
      ['meta[name="description"]',data.description],['meta[name="author"]',data.author.name],['meta[property="og:locale"]',data.locale],
      ['meta[property="og:title"]',data.title],['meta[property="og:description"]',data.description],['meta[property="og:url"]',data.url],
      ['meta[property="og:site_name"]',data.siteName],['meta[property="og:image"]',data.image.url],['meta[property="og:image:secure_url"]',data.image.url],['meta[property="og:image:alt"]',data.image.alt],
      ['meta[name="twitter:title"]',data.title],['meta[name="twitter:description"]',data.description],['meta[name="twitter:image"]',data.image.url],['meta[name="twitter:image:alt"]',data.image.alt],
    ];
    for (const [query,content] of fields) document.querySelector(query)?.setAttribute('content',content);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href',data.url);
    const graph = document.querySelector('script[type="application/ld+json"]');
    if (graph?.textContent) {
      const existing = JSON.parse(graph.textContent);
      for (const item of existing['@graph'] ?? []) {
        if (item['@type'] === 'WebApplication') Object.assign(item,{...data.application,'@id':data.url+'#app',url:data.url,description:data.description,inLanguage:language,image:data.image.url,author:data.author});
        if (item['@type'] === 'BreadcrumbList') item.itemListElement=data.breadcrumbs;
      }
      graph.textContent=JSON.stringify(existing).replace(/</g,'\\u003c');
    }
  }
  async function changeLanguage(next: string): Promise<void> {
    try { await loadLanguage(next); } catch (e) { fail(e, next); return; }
    const url = new URL(languageUrl(location.href,next));
    // Dev servers use /en/; published apps use /opencad-<format>/en/.
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      const base = location.pathname.match(/^\/(?:2dcad-viewer|opencad-(?:dwgdxf|skp|step|nc))\//)?.[0] ?? '/';
      url.pathname = base + (next === 'ko' ? '' : next + '/');
    }
    language = next;
    control.setLanguage(language);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    metadata(); canvasLabels(); update(presentationRoot);
    mountSelector();
    root.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of Array.from(record.addedNodes)) update(node);
      else update(record.target);
    }
    mountSelector();
  });
  metadata(); update(presentationRoot); mountSelector();
  const title = document.querySelector('title');
  const titleObserver = new MutationObserver(() => {
    const current = document.title;
    const originalName = metadataForLanguage('ko').siteName;
    const translatedName = translate(originalName,language);
    if (current === translate(titleSource,language) || (titleSource.endsWith(originalName) && current === titleSource.slice(0,-originalName.length)+translatedName)) return;
    titleSource=sourceMessage(current);
    if (current.endsWith(originalName)) document.title=current.slice(0,-originalName.length)+translatedName;
    else document.title=translate(current,language);
  });
  if (title) titleObserver.observe(title,{childList:true,subtree:true,characterData:true});
  observer.observe(presentationRoot,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','aria-description','placeholder','alt','href']});
  // App listeners redraw toolbar labels and status during this initial event.
  // Observe first so those new source strings receive the selected language too.
  root.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
  return () => {
    observer.disconnect(); titleObserver.disconnect(); control.dispose();
    for (const [view,label] of originalViews) VIEW_LABELS[view as keyof typeof VIEW_LABELS]=label;
  };
}
