/**
 * 키보드로 3D 붙잡기·고르기(62차 — 코어 0.46.0 setKeyboardSnap, 0.47.0 겹친 것 고르기 pickCycle·알림 글 틀 messages). viewerkit 조각 — 뷰어를 만들 때 단다.
 * - 3D 보기(캔버스)에 초점을 두고 화살표로 가상 커서를 켜 옮기고(Shift와 함께면 크게), Tab·Shift+Tab으로 같은 자리 후보(측정 중이면 붙잡을 점,
 *   고르기 중이면 겹친 점·선분·모서리·면 — 앞 면 뒤의 것도)를 돌리고, Enter로 찍거나 고른다. Esc는 측정 지우기가 먼저, 지울 것이 없으면 커서를 끈다
 * - 앱이 할 일(app.ts): 고르기 알림의 pointerType 'keyboard'면 초점을 캔버스에 두고, 둘째 이후 후보(PickEvent.cycle)면 그 고르기를 B-rep 면·모서리 선택으로
 *   (면 표로 그 면 통째), 두 점 측정 화살표 방향 잠금과 나눠 쓴다(가상 커서가 켜져 있으면 코어, 꺼져 있고 마우스·펜이 3D 보기 위면 앱 잠금 — keys.ts arrowOwner)
 * - 알림 글(announce)은 화면 밖 aria-live="polite" 영역에 넣는다. 글 틀(messages)은 코어 기본 한국어 틀을 열쇠로 앱 사전(site/locales)에서 옮긴다 —
 *   그래서 영역은 번역층이 건드리지 않는다(data-i18n-skip — 이미 화면 언어 글)
 * - 캔버스 aria-keyshortcuts(코어 키 표와 뷰어 키 F·1~7)와 도움말 키 표(keyHelpBody — 코어 keyLabel)
 * - 116차: 가상 커서가 꺼진 마우스 측정 미리 보기의 Tab·Shift+Tab 후보 돌리기·Esc 풀기(코어 0.116.0 tabCycle)를 aria-keyshortcuts와 도움말 안내 줄에
 * - 117차: 알림 글의 스냅 이름을 상태 막대와 맞춘다 — 첫 점에서 모서리에 수직인 방향 위 후보(코어 0.115.0 perpendicularDir)는 코어 틀이 수직 발과 같은
 *   「수직점」이라 「모서리에 수직」으로 바꿔 넣는다(keySnapAnnounceText — 코어 0.117.0 README 앱이 할 일, 이름은 trackdir.ts와 같은 규칙·같은 사전 글).
 *   124차: 잠그지 않은 나란함·끌어온 점 선 후보도 상태 막대 이름으로(첫 점 나란함 「모서리와 나란히」, 끌어온 점 나란한·수직인 선·만나는 점 — 코어 틀은 「나란한 선」·「수직점」)
 *   125차: 모든 측정 후보와 찍은 첫 점을 상태 막대 이름으로(축 「X축 방향」·「끌어온 점에서 X축」, 붙잡지 않은 점 「면 위 점」·「곡선 위 점」, 잠근 후보 「X축 방향 · 잠금」·
 *   「잠근 X축 · 모서리 위」 — 앱 곡선 접선 잠금이면 「접선 방향 · 잠금」, 앱 고르기 호스트(pick — app.ts 자신)의 tangents로 안다)
 * - 118차: 마우스 미리 보기 Tab 돌리기로 돌린 동안(코어 0.118.0 MeasureHoverSnap.cycle) 상태 막대·측정 띠 스냅 이름 뒤에 차례·수 「끝점 2/4」 — 가상 커서 알림과
 *   같은 틀 'order'로 만들고(hoverCycleLabel — installKeySnap의 cycleLabel이 지금 틀·화면 언어로 부른다), 같은 글을 화면 언어로 이 알림 영역에도(app.ts showHoverSnap)
 * - 고르기 후보는 앱 누르기 알림과 같은 선택이다(반투명 너머 고르기 — pickThrough가 바뀌면 sync)
 * - 66차: 지금 후보가 그물 면이면 그 B-rep 면을 3D 보기에 표식(코어 0.54.0 facePreview·faceRanges — 측정 모드에서는 코어가 그리지 않는다),
 *   면 고르기·여러 개 고르기·고르기 단위가 바뀌어도 sync(켜진 커서의 후보 묶음을 다시 만든다 — 65차까지는 커서를 옮길 때까지 앞 묶음 그대로였다)
 */
import {
  formatKeySnapMessage,
  KEY_SNAP_MESSAGES,
  keyLabel,
  keySnapMessages,
  snapKindText,
  type KeyboardSnapAnnouncement,
  type KeySnapAction,
  type KeySnapMessageKey,
  type MeasureHoverSnap,
  type Pick3d,
  type PickGroupKey,
  type Viewer3d,
} from 'opencad-viewer3d';
import { VIEW_KEYS } from 'opencad-viewer3d/viewkeys';
import type { StepDoc } from './doc';
import { h } from './dom';
import { pickFaceRanges, pickGroup, type PickRowHost } from './picklist';
import type { TangentLock } from './tangent';
import { snapNameOf } from './trackdir';

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

/**
 * 알림 영역에 넣을 글(117차): 측정 후보 알림(켜기·옮기기·후보 돌리기·다시 구함)의 지금 후보가 첫 점에서 모서리에 수직인 방향 위 점(trackdir.ts isPerpendicularDir —
 * 코어 0.115.0 perpendicularDir)이면 코어 글의 첫 수직 발 이름(화면 언어 틀 'snap.perpendicular' — 「수직점」)을 상태 막대·측정 띠·결과와 같은 「모서리에 수직」
 * (PERPENDICULAR_DIR_LABEL을 화면 언어로 — 116차에 네 언어 사전에 있음)으로 바꾼다. 후보 글은 '{종류}[ 차례/수]: 점 …'이라 종류 이름이 글에서 처음 나온다
 * (켜기 글의 앞 글·키 안내에는 그 이름이 없다). 찍기·끄기 알림(찍은 점·측정 결과 글 — 지금 후보 이름이 아니다)·고르기·다른 후보는 코어 글 그대로.
 * 코어 틀 열쇠를 더하지 않고 앱이 고르는 까닭: 코어에 새 열쇠를 두면 옮긴 틀을 주는 앱의 다른 언어 화면에 한국어 기본 글이 섞인다(코어 0.117.0 README)
 * 124차: 같은 길로 잠그지 않은 나란함·끌어온 점 선 후보도 상태 막대 이름으로(125차에 trackdir.ts snapNameOf로 묶음) — 첫 점 나란함 「모서리와 나란히」·끌어온 점 나란한 선
 * 「끌어온 점에서 모서리와 나란히」(코어 'snap.parallel' 「나란한 선」), 끌어온 점 수직인 선 「끌어온 점에서 모서리에 수직」(코어 'snap.perpendicular' 「수직점」 — 수직 발과 같은 이름),
 * 끌어온 점 안내 선이 만나는 점 「… · X축 위」 등. 이름은 화면 언어로(tr — 「 · 」 조각마다 옮김). 잠근 후보·축·붙잡지 않은 점은 코어 글 그대로
 * 125차: 모든 측정 후보와 찍은 첫 점 — 이름은 상태 막대와 같은 규칙(trackdir.ts snapNameOf), 바꿀 글은 코어가 그 후보로 만든 종류 글(코어 snapKindText — 「X축」·
 * 「스냅하지 않은 점」·「잠근 선 위 나란한 선」 등, 같은 틀). tangent = 코어 잠금이 앱 곡선 접선 잠금인지(installKeySnap이 앱 고르기 호스트에서 읽는다).
 * 찍기 알림은 첫 점 글(「첫 점을 찍었습니다. {종류}: {점}」)의 찍은 점(a.point)만 — 둘째 점 글(측정 결과)·찍을 점 없음에는 종류 이름이 없다.
 * 켜기·첫 점 글은 틀의 앞 글({0} 앞) 뒤에서 찾는다(앞 글에 같은 낱말이 있어도 — 앱이 옮긴 틀). 끄기·고르기는 코어 글 그대로
 */
export function keySnapAnnounceText(a: KeyboardSnapAnnouncement, msgs: Partial<Record<KeySnapMessageKey, string>>, tr: Tr, tangent = false): string {
  const s = a.mode !== 'measure' || a.reason === 'end' ? null : a.reason === 'commit' ? (a.measurement ? null : a.point) : a.snap;
  const name = s ? snapNameOf(s, tangent) : null;
  if (!s || !name) return a.text;
  const M = keySnapMessages(msgs);
  const kind = snapKindText(s.snap, s.axis, s.locked, M);
  const lead = a.reason === 'start' ? M.start : a.reason === 'commit' ? M.firstPoint : '';
  const pre = lead.slice(0, Math.max(0, lead.indexOf('{0}')));
  const i = a.text.indexOf(kind, a.text.startsWith(pre) ? pre.length : 0);
  return i < 0 ? a.text : a.text.slice(0, i) + tr(name) + a.text.slice(i + kind.length);
}

/** 118차: 마우스 미리 보기 Tab 돌리기의 지금 차례(0부터)·그 자리 후보 수(코어 0.118.0 MeasureHoverSnap.cycle — Tab으로 돌린 동안만 있다) */
export type HoverCycle = NonNullable<MeasureHoverSnap['cycle']>;

/** 118차: 차례·수를 붙인 스냅 이름 — parts는 상태 막대·측정 띠에 넣을 글 마디, said는 같은 글의 화면 언어(알림 영역) */
export interface HoverCycleLabel {
  parts: string[];
  said: string;
}

/**
 * 118차: 스냅 이름 뒤에 마우스 미리 보기 Tab 돌리기의 차례·수를 붙인 글(코어 0.118.0 README 앱이 할 일 — 「끝점 2/4」). 꼴은 가상 커서 알림 후보 글의 차례와 같은 틀 'order'
 * (코어 기본 '{0} {1}/{2}' — 자리 글뿐이라 사전에 옮기지 않아(keySnapCatalogKey) 네 언어 모두 이 꼴, 앱이 옮긴 틀을 주면 그 틀).
 * - parts: 틀을 이름 자리({0})로 나눠 나머지 자리(차례·수)만 채운 글 마디 사이에 받은 이름(한국어)을 한 마디로 끼운다(빈 마디는 뺀다). 상태 막대·측정 띠는 번역층이
 *   글 마디마다 옮기므로 이름 마디만 화면 언어가 되고 「 2/4」 마디는 한글이 없어 그대로다(한 마디 「끝점 2/4」는 사전에 그 열쇠가 없다). 이으면 keySnapText(틀, 'order', [이름, 차례 + 1, 수])
 * - said: 같은 글을 화면 언어로(이름만 tr — 마디를 번역층처럼 옮긴 글과 같다) — 번역층이 건너뛰는 가상 커서 알림 영역에 넣는다
 */
export function hoverCycleLabel(name: string, c: HoverCycle, msgs: Partial<Record<KeySnapMessageKey, string>>, tr: Tr): HoverCycleLabel {
  const segs = (msgs.order ?? KEY_SNAP_MESSAGES.order).split('{0}').map((s) => formatKeySnapMessage(s, ['', c.index + 1, c.count]));
  return { parts: segs.flatMap((s, i) => (i ? [name, s] : [s])).filter((s) => s !== ''), said: segs.join(tr(name)) };
}

const MOVES: readonly KeySnapAction[] = ['left', 'right', 'up', 'down'];

/**
 * 캔버스 aria-keyshortcuts 값(WAI-ARIA 꼴 — KeyboardEvent.key, 수정 키는 앞에 'Shift+'): 코어 키 표(옮기기는 Shift와 함께도 — 크게 옮기기),
 * 후보·찍기·끄기, 마우스 미리 보기 후보 돌리기(116차 — 코어 0.116.0 tabCycle은 키 표와 따로 Tab·Shift+Tab·Esc로 정해져 있다 — 기본 키 표에는 이미 있다),
 * 뷰어 키(F 전체 보기, 1~7 표준 뷰)
 */
export function keyShortcuts(keys: Readonly<Record<KeySnapAction, readonly string[]>>): string {
  const out = new Set<string>();
  for (const a of MOVES)
    for (const k of keys[a]) {
      out.add(k);
      if (!/(^|\+)shift\+/i.test(k)) out.add(`Shift+${k}`);
    }
  for (const a of ['next', 'prev', 'commit', 'exit'] as const) for (const k of keys[a]) out.add(k);
  for (const k of ['Tab', 'Shift+Tab', 'Escape']) out.add(k);
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
    h('p', {}, '3D 보기를 Tab으로 고른 뒤 화살표를 누르면 가상 커서가 켜집니다. 마우스처럼 측정 점에 스냅하고 면·모서리를 고르며, 바뀔 때마다 화면 읽기 프로그램에 알립니다.'),
    h(
      'table',
      { class: 'key-help' },
      h('tbody', {}, ...rows.map(([k, what]) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', { translate: 'no' }, k)), h('td', {}, what)))),
    ),
    h('p', { class: 'hint' }, '두 점 측정에서 가상 커서가 꺼져 있고 마우스가 3D 보기 위에 있으면 화살표는 방향 잠금입니다(→ X축 · ← Y축 · ↑ Z축 · ↓ 지금 방향).'),
    // 116차: 마우스 미리 보기 Tab 후보 돌리기(코어 0.116.0 tabCycle — measureSnapOptions가 켠다)
    h('p', { class: 'hint' }, '두 점 측정에서 가상 커서가 꺼져 있고 마우스 자리에 스냅 후보가 둘 이상이면 Tab · Shift+Tab으로 후보를 돌리고, 누르면 보이는 후보를 찍습니다(Esc는 돌리기를 풀고 첫 후보로).'),
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
   * 66차: 앱 고르기 상태(문서·면 고르기·여러 개 고르기·고르기 단위 — app.ts는 자기 자신을 준다). 주면 고르기 후보를
   * - 묶음 열쇠(65차 — 코어 0.53.0 pickCycle group, 겹친 것 목록과 같은 picklist.ts pickGroup)로 B-rep 면·모서리 단위로 돌리고
   *   (64차까지는 코어 기본 도형 단위 — 한 면의 앞뒤·곡선 모서리 선분마다 멈췄다, 여러 개 고르기면 고르기 단위)
   * - 지금 후보가 그물 면이면 그 B-rep 면을 3D 보기에 표식한다(코어 0.54.0 pickCycle facePreview·faceRanges — picklist.ts pickFaceRanges,
   *   면 표가 없는 그물은 코어가 같은 평면으로 이어진 삼각형. 65차까지는 그물 면 후보에 표식이 없었다 — 선분·점만)
   * 면 고르기·여러 개 고르기·고르기 단위를 바꾸면 앱이 sync()를 불러 켜진 커서의 후보를 새 묶음으로 다시 구한다. 없으면 기본 도형 단위·같은 평면 면 표식.
   * 125차: tangents(app.ts의 곡선 접선 잠금 — 측정 접선 조각을 받기 전에는 null)도 읽는다 — 코어 잠금이 앱 접선 잠금이면 알림 이름을 상태 막대처럼 「접선 방향 · 잠금」으로
   * (첫 화면 조각을 늘리지 않으려고 새 칸을 주지 않고 앱이 이미 주는 자기 자신에서 읽는다). 없으면 접선 잠금이 없는 것으로
   */
  pick?: PickRowHost & { doc: StepDoc | null; tangents?: Pick<TangentLock, 'locked'> | null };
  /** 묶음 열쇠를 따로 줄 때(시험 — 주면 pick의 열쇠 대신) */
  group?: PickGroupKey;
}

/**
 * 뷰어에 키보드 붙잡기를 켜고 알림 영역·캔버스 aria-keyshortcuts를 단다. sync()는 화면 언어·반투명 너머 고르기·고르기 모드(면·여러 개·단위)가 바뀌면 다시 건다
 * (켜진 가상 커서는 그대로 — 고르기 모드면 새 선택·새 묶음으로 후보를 다시 구한다, 알리지는 않는다).
 * cycleLabel(118차)은 마우스 Tab 돌리기 차례·수를 붙인 이름(hoverCycleLabel)을 지금 글 틀·화면 언어로 만든다 — app.ts showHoverSnap이 부르고 said를 live에 넣는다
 */
export function installKeySnap(v: Viewer3d, host: KeySnapHost): { sync(): void; live: HTMLElement; cycleLabel(name: string, c: HoverCycle): HoverCycleLabel } {
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'data-i18n-skip': '' });
  (v.canvas.parentElement ?? document.body).append(live);
  const P = host.pick;
  const group: PickGroupKey | undefined = host.group ?? (P ? (p) => pickGroup(P, p) : undefined);
  const faceRanges = P ? (p: Pick3d) => pickFaceRanges(P.doc, p) : undefined;
  let messages: Partial<Record<KeySnapMessageKey, string>> = {};
  const sync = (): void => {
    messages = keySnapMessagesFor(host.tr);
    v.setKeyboardSnap({
      announce: (a) => {
        // 117·124·125차: 측정 후보·찍은 첫 점의 이름은 상태 막대와 같은 이름(코어 글은 「수직점」·「나란한 선」·「X축」·「스냅하지 않은 점」·「잠근 선 위 …」),
        // 코어 잠금이 앱 곡선 접선 잠금이면 「접선 방향 · 잠금」(앱 고르기 호스트의 tangents)
        live.textContent = keySnapAnnounceText(a, messages, host.tr, !!P?.tangents?.locked(v));
        host.announced?.(a);
      },
      pickCycle: { throughTranslucent: host.pickThrough(), group, facePreview: true, faceRanges },
      messages,
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
  return { sync, live, cycleLabel: (name, c) => hoverCycleLabel(name, c, messages, host.tr) };
}
