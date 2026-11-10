/**
 * 키보드로 3D 붙잡기·고르기(62차 — 코어 0.46.0 setKeyboardSnap, 0.47.0 겹친 것 고르기 pickCycle·알림 글 틀 messages). viewerkit 조각 — 뷰어를 만들 때 단다.
 * - 3D 보기(캔버스)에 초점을 두고 화살표로 가상 커서를 켜 옮기고(Shift와 함께면 크게), Tab·Shift+Tab으로 같은 자리 후보(측정 중이면 붙잡을 점,
 *   고르기 중이면 겹친 점·선분·모서리·면 — 앞 면 뒤의 것도)를 돌리고, Enter로 찍거나 고른다. Esc는 측정 지우기가 먼저, 지울 것이 없으면 커서를 끈다
 * - 앱이 할 일(app.ts): 고르기 알림의 pointerType 'keyboard'면 초점을 캔버스에 두고, 둘째 이후 후보(PickEvent.cycle)면 그 고르기를 B-rep 면·모서리 선택으로
 *   (면 표로 그 면 통째), 두 점 측정 화살표 방향 잠금과 나눠 쓴다(가상 커서가 켜져 있으면 코어, 꺼져 있고 마우스·펜이 3D 보기 위면 앱 잠금 — keys.ts arrowOwner)
 * - 알림 글(announce)은 화면 밖 aria-live="polite" 영역에 넣는다. 글 틀(messages)은 코어 기본 한국어 틀을 열쇠로 앱 사전(site/locales)에서 옮긴다 —
 *   그래서 영역은 번역층이 건드리지 않는다(data-i18n-skip — 이미 화면 언어 글)
 * - 캔버스 aria-keyshortcuts(코어 키 표와 뷰어 키 F·1~7)와 도움말 키 표(keyHelpBody — 코어 keyLabel)
 * - 고르기 후보는 앱 누르기 알림과 같은 선택이다(반투명 너머 고르기 — pickThrough가 바뀌면 sync)
 */
import { KEY_SNAP_MESSAGES, keyLabel, type KeyboardSnapAnnouncement, type KeySnapAction, type KeySnapMessageKey, type PickGroupKey, type Viewer3d } from 'opencad-viewer3d';
import { VIEW_KEYS } from 'opencad-viewer3d/camera';
import { h } from './dom';

/** 한국어 글 → 지금 화면 언어(앱 사전) */
type Tr = (ko: string) => string;

/**
 * 자리({0}) 밖 글이 짧아 사전에 그대로 두면 다른 화면 글(번역층의 틀 맞추기)에 잘못 맞을 틀: 사전 열쇠 앞에 KEYED_PREFIX를 붙인다
 * (예: '{0}축'이 '회전축' 같은 글에, '끄기 {0}'이 '끄기 …' 단추 글에 맞지 않게 — 화면에는 나오지 않는 열쇠)
 */
const KEYED = new Set<KeySnapMessageKey>(['only', 'candidateDistance', 'picked', 'axisKind', 'lockedKind', 'hintMove', 'hintNext', 'hintCommit', 'hintPick', 'hintExit']);
export const KEYED_PREFIX = '가상 커서 알림 — ';

/** 알림 글 틀의 사전 열쇠(코어 기본 한국어 틀 그대로, KEYED는 앞에 KEYED_PREFIX) — 자리 글뿐인 틀(한글 없음)은 null(옮기지 않는다) */
export function keySnapCatalogKey(k: KeySnapMessageKey): string | null {
  const ko: string = KEY_SNAP_MESSAGES[k];
  return /[가-힣]/.test(ko) ? (KEYED.has(k) ? KEYED_PREFIX + ko : ko) : null;
}

/** 알림 글 틀: 코어 기본 한국어 틀(KEY_SNAP_MESSAGES)을 지금 화면 언어로(앱 사전 — keySnapCatalogKey). 옮기지 못한 틀(한국어 화면 등)은 빼서 코어 기본을 쓴다 */
export function keySnapMessagesFor(tr: Tr): Partial<Record<KeySnapMessageKey, string>> {
  const out: Partial<Record<KeySnapMessageKey, string>> = {};
  for (const k of Object.keys(KEY_SNAP_MESSAGES) as KeySnapMessageKey[]) {
    const key = keySnapCatalogKey(k);
    const t = key && tr(key);
    if (t && t !== key) out[k] = t;
  }
  return out;
}

const MOVES: readonly KeySnapAction[] = ['left', 'right', 'up', 'down'];

/**
 * 캔버스 aria-keyshortcuts 값(WAI-ARIA 꼴 — KeyboardEvent.key, 수정 키는 앞에 'Shift+'): 코어 키 표(옮기기는 Shift와 함께도 — 크게 옮기기),
 * 후보·찍기·끄기, 뷰어 키(F 전체 보기, 1~7 표준 뷰)
 */
export function keyShortcuts(keys: Readonly<Record<KeySnapAction, readonly string[]>>): string {
  const out = new Set<string>();
  for (const a of MOVES)
    for (const k of keys[a]) {
      out.add(k);
      if (!/(^|\+)shift\+/i.test(k)) out.add(`Shift+${k}`);
    }
  for (const a of ['next', 'prev', 'commit', 'exit'] as const) for (const k of keys[a]) out.add(k);
  out.add('F');
  for (const k of Object.keys(VIEW_KEYS)) out.add(k);
  return [...out].join(' ');
}

/** 도움말 키 표 줄: [키 글(코어 keyLabel — 바꾼 키면 그 키), 할 일(한국어 — 번역층이 옮긴다)] */
export function keyHelpRows(ks: { step: number; bigStep: number; keys: Readonly<Record<KeySnapAction, readonly string[]>> }): [string, string][] {
  const lab = (a: KeySnapAction): string[] => ks.keys[a].map(keyLabel);
  const move = MOVES.flatMap(lab);
  const moveText = move.every((s) => s.length === 1) ? move.join('') : move.join(' ');
  const views = Object.keys(VIEW_KEYS);
  const rows: [string, string][] = [];
  if (move.length) rows.push([moveText, `가상 커서 켜기·옮기기(${ks.step}화소)`], [`Shift+${moveText}`, `크게 옮기기(${ks.bigStep}화소)`]);
  const cyc = [...lab('next'), ...lab('prev')];
  if (cyc.length) rows.push([cyc.join(' · '), '같은 자리의 다음·앞 후보(측정 점, 겹친 면·모서리)']);
  if (ks.keys.commit.length) rows.push([lab('commit').join(' · '), '찍기(측정)·고르기']);
  if (ks.keys.exit.length) rows.push([lab('exit').join(' · '), '측정 지우기 — 지울 것이 없으면 커서 끄기']);
  // 65차: 커서 자리 작업 메뉴(64차 menuAt)와 겹친 것 목록 줄 미리 강조 안내
  rows.push(['Shift+F10', '커서 자리 작업 메뉴(겹친 것 고르기… — 목록 줄에 초점을 두면 3D에 미리 강조)']);
  rows.push([`F · ${views[0]}~${views[views.length - 1]}`, '전체 보기 · 표준 뷰']);
  return rows;
}

/** 도움말 대화 상자 본문(앱 openDialog에 넣는다 — 키 글은 번역하지 않는다) */
export function keyHelpBody(v: Pick<Viewer3d, 'keyboardSnap'>): HTMLElement[] {
  const ks = v.keyboardSnap;
  const rows = ks ? keyHelpRows(ks) : [];
  return [
    h('p', {}, '3D 보기를 Tab으로 고른 뒤 화살표를 누르면 가상 커서가 켜집니다. 마우스처럼 측정 점을 붙잡고 면·모서리를 고르며, 바뀔 때마다 화면 읽기 프로그램에 알립니다.'),
    h(
      'table',
      { class: 'key-help' },
      h('tbody', {}, ...rows.map(([k, what]) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', { translate: 'no' }, k)), h('td', {}, what)))),
    ),
    h('p', { class: 'hint' }, '두 점 측정에서 가상 커서가 꺼져 있고 마우스가 3D 보기 위에 있으면 화살표는 방향 잠금입니다(→ X축 · ← Y축 · ↑ Z축 · ↓ 지금 방향).'),
  ];
}

/** installKeySnap에 앱이 주는 것 */
export interface KeySnapHost {
  /** 한국어 글 → 지금 화면 언어(앱 사전) */
  tr: Tr;
  /** 앱 누르기 알림이 반투명 그물 너머로 고르는지(고르기 후보도 같은 선택으로) */
  pickThrough: () => boolean;
  /** 알림마다(글을 영역에 넣은 뒤) — 앱이 상태 막대·측정 띠를 맞춘다 */
  announced?: (a: KeyboardSnapAnnouncement) => void;
  /**
   * 64차: 가상 커서를 켠 동안 3D 보기에서 Shift+F10·메뉴 키 — 커서 자리(client 좌표)의 작업 메뉴(겹친 것 고르기…). 열었으면 true(그 키의 기본 동작·브라우저
   * contextmenu를 막는다 — macOS는 Shift+F10에 contextmenu를 내지 않는다). 커서가 꺼져 있으면 부르지 않는다(앱 contextmenu 처리 — 3D 보기 가운데 메뉴)
   */
  menuAt?: (clientX: number, clientY: number) => boolean;
  /**
   * 65차: 고르기 후보 묶음 열쇠(코어 0.53.0 pickCycle group — 겹친 것 목록과 같은 picklist.ts pickGroup): Tab이 B-rep 면·모서리 단위로 돈다
   * (64차까지는 코어 기본 도형 단위 — 한 면의 앞뒤·곡선 모서리 선분마다 멈췄다). 없으면 기본 도형 단위
   */
  group?: PickGroupKey;
}

/**
 * 뷰어에 키보드 붙잡기를 켜고 알림 영역·캔버스 aria-keyshortcuts를 단다. sync()는 화면 언어·반투명 너머 고르기가 바뀌면 다시 건다
 * (켜진 가상 커서는 그대로 — 고르기 모드면 새 선택으로 후보를 다시 구한다)
 */
export function installKeySnap(v: Viewer3d, host: KeySnapHost): { sync(): void; live: HTMLElement } {
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'data-i18n-skip': '' });
  (v.canvas.parentElement ?? document.body).append(live);
  const sync = (): void => {
    v.setKeyboardSnap({
      announce: (a) => {
        live.textContent = a.text;
        host.announced?.(a);
      },
      pickCycle: { throughTranslucent: host.pickThrough(), group: host.group },
      messages: keySnapMessagesFor(host.tr),
    });
    const ks = v.keyboardSnap;
    if (ks) v.canvas.setAttribute('aria-keyshortcuts', keyShortcuts(ks.keys));
  };
  sync();
  v.canvas.addEventListener('keydown', (e) => {
    const c = v.keyboardCursor;
    if (!c || !host.menuAt || !((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') || e.ctrlKey || e.metaKey || e.altKey) return;
    const r = v.canvas.getBoundingClientRect();
    if (!host.menuAt(r.left + c.x, r.top + c.y)) return;
    e.preventDefault();
    e.stopPropagation();
  });
  return { sync, live };
}
