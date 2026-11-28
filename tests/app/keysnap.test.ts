// @vitest-environment jsdom
// 키보드로 3D 붙잡기·고르기(62차 — keysnap.ts, 코어 0.46.0 setKeyboardSnap·0.47.0 pickCycle·messages):
// - 알림 글 틀: 코어 기본 한국어 틀이 네 언어 사전 열쇠(짧은 틀은 KEYED_PREFIX를 붙인 열쇠)이고, 옮긴 틀은 자리가 같다. 한국어 화면이면 코어 기본
// - 앱 키(H·I·Home·F7·Ctrl/⌘+O·Z·Y·Delete와 뷰어 F·1~7)는 가상 커서 키와 겹치지 않는다. 두 점 측정 화살표: 커서가 꺼져 있고 마우스가 3D 보기 위면 앱 잠금이 먼저
//   (창 캡처에서 막으면 코어는 커서를 켜지 않는다), 아니면 코어가 받아 앱(창 버블)에 가지 않는다
// - 실제 코어 뷰어(jsdom): aria-keyshortcuts, 알림이 화면 밖 aria-live 영역에 화면 언어로, Enter 고르기는 pointerType 'keyboard', pickCycle은 앱 반투명 너머 고르기와 같다
// - 도움말 키 표(코어 keyLabel) — 216차: 가상 커서가 켜진 동안 방향 잠금 글쇠 X·Y·Z·L 줄과 aria-keyshortcuts(받는 길은 tests/app/cursorlock216.test.ts)
// - 117차: 알림 글의 스냅 이름(keySnapAnnounceText) — 첫 점에서 모서리에 수직인 방향 위 후보(코어 0.115.0 perpendicularDir)만 코어 틀 「수직점」을
//   상태 막대와 같은 「모서리에 수직」으로(화면 언어 틀, 코어 candidateText로 만든 글). 수직 발·잠근 값·끌어온 점 선·찍기·고르기 알림은 그대로
// - 118차: 마우스 Tab 돌리기 차례·수(hoverCycleLabel — 코어 0.118.0 cycle): 가상 커서 알림과 같은 틀 'order'로 「끝점 2/4」, 이름 마디는 한국어 그대로
//   (번역층이 마디마다 옮긴다)·알림 글은 화면 언어, 네 언어
// - 124차: 잠그지 않은 나란함·수직 후보의 알림 이름도 상태 막대 이름(guideSnapLabel ?? hoverSnapLabel)으로 — 첫 점 나란함 「모서리와 나란히」·끌어온 점 나란한·수직인 선
//   「끌어온 점에서 모서리와 나란히·수직」·만나는 점 「… · X축 위」(코어 틀 「나란한 선」·「수직점」). 잠금·수직 발·축·찍기·끄기·고르기는 그대로
// - 125차(124차 남은 한계): 나머지 측정 후보(축 「X축 방향」·「끌어온 점에서 X축」 등, 붙잡지 않은 점 「면 위 점」·「곡선 위 점」·「곡면 위 점」, 잠근 후보 「X축 방향 · 잠금」·
//   「잠근 X축 · 모서리 위」 — 앱 곡선 접선 잠금이면 「접선 방향 · 잠금」)와 찍은 첫 점 글의 이름도 상태 막대 이름(코어 틀 「X축」·「스냅하지 않은 점」·「잠근 선 위 …」),
//   네 언어. 실제 코어로 앞면 가운데에서 켜고 찍고 첫 점 X축 위로 옮기고 잠근 알림 글도(앱 고르기 호스트의 접선 잠금). 수직 발·끝점·둘째 점·끄기·고르기는 그대로
import { afterEach, describe, expect, it } from 'vitest';
import {
  candidateText,
  KEY_SNAP_KEYS,
  KEY_SNAP_MESSAGES,
  keySnapAction,
  keySnapMessages,
  keySnapText,
  snapKindText,
  type KeyboardSnapAnnouncement,
  type KeySnapMessageKey,
  type MeasureHoverSnap,
  type MeasurePoint,
  type MeasureResult,
  type SnapSegment,
} from 'opencad-viewer3d';
import { catalogs, translate } from '../../site/i18n.mjs';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { arrowOwner, routeKey } from '../../src/app/keys';
import {
  hoverCycleLabel,
  installKeySnap,
  keyHelpBody,
  keyHelpRows,
  KEYED_PREFIX,
  keyShortcuts,
  keySnapAnnounceText,
  keySnapCatalogKey,
  keySnapMessagesFor,
} from '../../src/app/keysnap';
import { circleCenters, hoverSnapLabel, measureSnapOptions } from '../../src/app/snap';
import { guideSnapLabel } from '../../src/app/trackdir';
import { cube, StepText } from '../stepText';
import { jsdomViewer, VIEW_H, VIEW_W } from './jsdomview';

const CODES = ['en', 'ja', 'zh-CN', 'de'] as const;
const hangul = /[가-힣]/;

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function cubeViewer() {
  const w = new StepText();
  w.product('c', [cube(w, 10).solid], w.context());
  // 앱처럼 캔버스 키를 코어가 받는다(Viewer3dOptions.keyboard 기본 켬)
  const j = jsdomViewer({ keyboard: true });
  restore = j.restore;
  j.viewer.setScene(stepToScene(w.bytes()));
  j.viewer.fit(false);
  return j;
}

const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(e);
  return e;
};

describe('알림 글 틀(네 언어 사전)', () => {
  it('한글이 든 코어 틀마다 네 사전에 열쇠가 있고 자리({0}…)가 같다 — 짧은 틀은 접두 열쇠, 맨 틀 그대로는 사전에 없다', () => {
    const keys = (Object.keys(KEY_SNAP_MESSAGES) as KeySnapMessageKey[]).filter((k) => hangul.test(KEY_SNAP_MESSAGES[k]));
    expect(keys.length).toBeGreaterThanOrEqual(30);
    for (const k of keys) {
      const ck = keySnapCatalogKey(k)!;
      for (const code of CODES) {
        const t = catalogs[code][ck];
        expect(t, `${code} ${ck}`).toBeTruthy();
        expect(t).not.toMatch(hangul);
        expect((t.match(/\{\d+\}/g) ?? []).sort(), `${code} ${ck}`).toEqual((KEY_SNAP_MESSAGES[k].match(/\{\d+\}/g) ?? []).sort());
      }
      // 짧은 틀(예: '{0}축'·'끄기 {0}')은 다른 화면 글에 맞지 않게 접두 열쇠로만
      if (ck.startsWith(KEYED_PREFIX)) for (const code of CODES) expect(catalogs[code][KEY_SNAP_MESSAGES[k]], `${code} bare ${k}`).toBeUndefined();
    }
    // 자리 글뿐인 틀은 옮기지 않는다
    expect(keySnapCatalogKey('point')).toBeNull();
    expect(keySnapCatalogKey('hintJoin')).toBeNull();
  });

  it('keySnapMessagesFor: 화면 언어면 한글이 든 틀을 모두 옮기고, 한국어 화면이면 비워 코어 기본', () => {
    const en = keySnapMessagesFor((ko) => translate(ko, 'en'));
    expect(en.start).toBe('Virtual cursor on. {0}. {1}');
    expect(en.axisKind).toBe('{0} axis');
    expect(en['snap.endpoint']).toBe('Endpoint');
    expect(en['pick.section']).toBe('Cut face');
    expect(Object.values(en).some((s) => hangul.test(s!))).toBe(false);
    expect(Object.keys(en).length).toBe((Object.keys(KEY_SNAP_MESSAGES) as KeySnapMessageKey[]).filter((k) => hangul.test(KEY_SNAP_MESSAGES[k])).length);
    expect(keySnapMessagesFor((ko) => translate(ko, 'ko'))).toEqual({});
  });
});

describe('키 겹침', () => {
  it('앱·뷰어 키는 가상 커서 키가 아니다, 가상 커서 키의 창 길(routeKey)은 뷰어(handleKey — 코어는 캔버스가 받은 키만)·Esc는 앱', () => {
    const appKeys: KeyboardEventInit[] = [
      { key: 'h' }, { key: 'H' }, { key: 'i' }, { key: 'Home' }, { key: 'F7' }, { key: 'Delete' },
      { key: 'o', ctrlKey: true }, { key: 'o', metaKey: true }, { key: 'z', ctrlKey: true }, { key: 'z', ctrlKey: true, shiftKey: true }, { key: 'y', ctrlKey: true },
      { key: 'f' }, { key: 'F' }, ...['1', '2', '3', '4', '5', '6', '7'].map((k) => ({ key: k })), { key: 'Shift' },
    ];
    for (const e of appKeys) expect(keySnapAction(e, KEY_SNAP_KEYS), JSON.stringify(e)).toBeNull();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter']) expect(routeKey({ key: k, hasDoc: true }), k).toBe('viewer');
    expect(routeKey({ key: 'Escape', hasDoc: true })).toBe('escape');
  });

  it('두 점 측정 화살표의 임자: 커서가 켜져 있으면 코어, 꺼져 있고 마우스가 3D 보기 위면 앱 잠금, 아니면 코어', () => {
    expect(arrowOwner(true, true)).toBe('core');
    expect(arrowOwner(true, false)).toBe('core');
    expect(arrowOwner(false, true)).toBe('lock');
    expect(arrowOwner(false, false)).toBe('core');
  });

  it('실제 뷰어: 창 캡처에서 막은 화살표(앱 잠금)는 코어가 커서를 켜지 않고, 막지 않으면 코어가 켜고 창 버블(앱 키)에 가지 않는다', () => {
    const { viewer: v } = cubeViewer();
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false });
    v.setMeasureMode(true);
    let pointerIn = true;
    const locked: string[] = [];
    const bubbled: string[] = [];
    const capture = (e: KeyboardEvent): void => {
      if (e.target === v.canvas && e.key.startsWith('Arrow') && arrowOwner(!!v.keyboardCursor, pointerIn) === 'lock') {
        locked.push(e.key);
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const bubble = (e: KeyboardEvent): void => void bubbled.push(e.key);
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keydown', bubble);
    try {
      key(v.canvas, 'ArrowRight');
      expect(locked).toEqual(['ArrowRight']);
      expect(v.keyboardCursor).toBeNull();
      // 마우스가 3D 보기 밖: 코어가 커서를 켠다(캔버스 가운데), 앱 버블에는 가지 않는다
      pointerIn = false;
      key(v.canvas, 'ArrowRight');
      expect(v.keyboardCursor).toMatchObject({ x: VIEW_W / 2, y: VIEW_H / 2, mode: 'measure' });
      // 커서가 켜진 동안은 마우스가 3D 보기 위여도 코어(커서 옮기기)
      pointerIn = true;
      key(v.canvas, 'ArrowRight');
      expect(v.keyboardCursor!.x).toBe(VIEW_W / 2 + 5);
      expect(locked).toEqual(['ArrowRight']);
      expect(bubbled).toEqual([]);
      // 다른 칸(단추)의 화살표·Tab은 코어가 받지 않는다(창 버블 그대로)
      const btn = document.createElement('button');
      document.body.append(btn);
      key(btn, 'ArrowLeft');
      key(btn, 'Tab');
      expect(bubbled).toEqual(['ArrowLeft', 'Tab']);
      expect(v.keyboardCursor!.x).toBe(VIEW_W / 2 + 5);
      btn.remove();
    } finally {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('keydown', bubble);
    }
  });
});

describe('installKeySnap(실제 코어 뷰어)', () => {
  it('aria-keyshortcuts·알림 영역(화면 언어, 번역층 건너뜀)·Enter 고르기 pointerType keyboard·pickCycle = 앱 반투명 너머 고르기', () => {
    const { viewer: v } = cubeViewer();
    let through = false;
    const seen: string[] = [];
    const ks = installKeySnap(v, { tr: (ko) => translate(ko, 'en'), pickThrough: () => through, announced: (a) => seen.push(a.reason) });
    expect(v.canvas.getAttribute('aria-keyshortcuts')!.split(' ')).toEqual(
      expect.arrayContaining(['ArrowLeft', 'Shift+ArrowLeft', 'ArrowDown', 'Shift+ArrowDown', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'F', '1', '7']),
    );
    expect(ks.live.getAttribute('aria-live')).toBe('polite');
    expect(ks.live.hasAttribute('data-i18n-skip')).toBe(true);
    expect(ks.live.className).toBe('sr-only');
    // 66차: 그물 면 후보 표식(코어 0.54.0 facePreview)은 늘 켠다 — 앱 고르기 상태(pick)를 주지 않으면 코어 같은 평면 면
    expect(v.keyboardSnap!.pickCycle).toEqual({ throughTranslucent: false, facePreview: true });
    const picks: { pointerType: string; cycle?: unknown }[] = [];
    v.onPick((_p, e) => picks.push({ pointerType: e.pointerType, cycle: e.cycle }));
    key(v.canvas, 'ArrowUp');
    expect(ks.live.textContent).toMatch(/^Virtual cursor on\. /);
    expect(ks.live.textContent).toContain('Select Enter');
    expect(ks.live.textContent).not.toMatch(hangul);
    key(v.canvas, 'Enter');
    expect(picks).toEqual([{ pointerType: 'keyboard', cycle: undefined }]);
    expect(ks.live.textContent).not.toMatch(hangul);
    expect(seen).toEqual(['start', 'commit']);
    // 반투명 너머 고르기가 바뀌면 sync — 겹친 것 고르기 선택도
    through = true;
    ks.sync();
    expect(v.keyboardSnap!.pickCycle).toEqual({ throughTranslucent: true, facePreview: true });
    // 측정 모드: 알림도 화면 언어
    v.setMeasureMode(true);
    key(v.canvas, 'ArrowLeft');
    expect(ks.live.textContent).not.toMatch(hangul);
    key(v.canvas, 'Escape');
    expect(v.keyboardCursor).toBeNull();
    expect(ks.live.textContent).toBe('Virtual cursor off');
  });

  it('키 표 글(aria-keyshortcuts)과 도움말 키 표(keyLabel — 기본 걸음 5·50화소)', () => {
    // 216차: 가상 커서가 켜진 동안 두 점 측정 방향 잠금 글쇠 X·Y·Z·L(앱 키 — 키 표와 따로)
    // 218차: 3D 보기에 초점이 있으면 앱 창 키가 받는 Home·H·I·F7(keys.ts routeKey)과 커서 자리 작업 메뉴 Shift+F10·ContextMenu도(받는 키 대조는 tests/app/keyshortcuts218.test.ts)
    expect(keyShortcuts(KEY_SNAP_KEYS).split(' ')).toEqual(['ArrowLeft', 'Shift+ArrowLeft', 'ArrowRight', 'Shift+ArrowRight', 'ArrowUp', 'Shift+ArrowUp', 'ArrowDown', 'Shift+ArrowDown', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'X', 'Y', 'Z', 'L', 'F', '1', '2', '3', '4', '5', '6', '7', 'Home', 'H', 'I', 'F7', 'Shift+F10', 'ContextMenu']);
    // 116차: 마우스 미리 보기 Tab 돌리기(코어 0.116.0 tabCycle)는 가상 커서 키 표와 따로 Tab·Shift+Tab·Esc로 정해져 있다 — 키 표를 바꿔도 남는다
    const custom = keyShortcuts({ ...KEY_SNAP_KEYS, next: ['n'], prev: ['p'], exit: ['q'] }).split(' ');
    for (const k of ['Tab', 'Shift+Tab', 'Escape', 'X', 'L']) expect(custom, k).toContain(k);
    const rows = keyHelpRows({ step: 5, bigStep: 50, keys: KEY_SNAP_KEYS });
    expect(rows.map((r) => r[0])).toEqual(['←→↑↓', 'Shift+←→↑↓', 'Tab · Shift+Tab', 'Enter', 'Esc', 'X · Y · Z · L', 'Shift+F10', 'F · 1~7']);
    expect(rows[0]![1]).toBe('가상 커서 켜기·옮기기(5화소)');
    // 216차: 방향 잠금 글쇠 줄(커서가 꺼졌을 때의 화살표 안내 줄과 같은 차례 — X축 · Y축 · Z축 · 지금 방향)
    expect(rows[5]![1]).toBe('두 점 측정 방향 잠금(X축 · Y축 · Z축 · 지금 방향 — 다시 누르면 풀기)');
    // 65차: 커서 자리 작업 메뉴와 겹친 것 목록 줄 미리 강조 안내(네 언어)
    expect(rows[6]![1]).toBe('커서 자리 작업 메뉴(겹친 것 고르기… — 목록 줄에 초점을 두면 3D에 미리 강조)');
    for (const [, what] of rows) for (const code of CODES) expect(translate(what, code), `${code} ${what}`).not.toMatch(hangul);
    const { viewer: v } = cubeViewer();
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false });
    const body = keyHelpBody(v);
    expect(body.map((el) => el.tagName)).toEqual(['P', 'TABLE', 'P', 'P']);
    expect([...body[1]!.querySelectorAll('kbd')].map((k) => [k.textContent, k.getAttribute('translate')])).toEqual(rows.map((r) => [r[0], 'no']));
    // 116차: 마우스 미리 보기 Tab 돌리기(코어 0.116.0 tabCycle) — 화살표 방향 잠금 안내와 같은 꼴의 안내 한 줄
    expect(body[3]!.className).toBe('hint');
    expect(body[3]!.textContent).toContain('Tab · Shift+Tab');
    expect(body[3]!.textContent).toContain('Esc');
    for (const el of [body[0]!, body[2]!, body[3]!]) for (const code of CODES) expect(translate(el.textContent!, code)).not.toMatch(hangul);
  });
});

describe('알림 글의 스냅 이름(117차 — 코어 0.117.0 앱이 할 일·0.115.0 남은 한계)', () => {
  const ko = (s: string): string => s;
  /** 측정 후보 알림(코어 keyAnnounce 'move'와 같은 글 — 화면 언어 틀로 코어 candidateText, 첫 차례·후보 둘(o.count)·첫 점에서 거리 5 mm) */
  const ann = (snap: Partial<MeasureHoverSnap>, tr: (s: string) => string, o: Partial<KeyboardSnapAnnouncement> = {}): KeyboardSnapAnnouncement => {
    const s = { snap: 'perpendicular', point: [1, 2, 3], ...snap } as MeasureHoverSnap;
    const count = o.count ?? 2;
    const text = candidateText({ kind: s.snap, axis: s.axis, locked: s.locked, point: s.point }, 0, count, (v) => String(v), 5, 'mm', keySnapMessages(keySnapMessagesFor(tr)));
    return { reason: 'move', mode: 'measure', x: 0, y: 0, snap: s, index: 0, count, pick: null, text, ...o };
  };
  const dir: Partial<MeasureHoverSnap> = { perpendicularDir: true, direction: [0, 1, 0] };

  it('첫 점에서 모서리에 수직인 방향 위 후보(perpendicularDir)는 코어 틀 「수직점」을 「모서리에 수직」으로 — 켤 때 글·후보 하나 글도, 네 언어 화면 틀', () => {
    const a = ann(dir, ko);
    expect(a.text).toBe('수직점 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    const m = keySnapMessagesFor(ko);
    expect(keySnapAnnounceText(a, m, ko)).toBe('모서리에 수직 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    const M = keySnapMessages(m);
    expect(keySnapAnnounceText({ ...a, reason: 'start', text: keySnapText(M, 'start', [a.text, '옮기기 ←→↑↓']) }, m, ko)).toBe(
      '가상 커서를 켰습니다. 모서리에 수직 1/2: X 1, Y 2, Z 3, 거리 5 mm. 옮기기 ←→↑↓',
    );
    const one = ann(dir, ko, { reason: 'cycle', count: 1 });
    expect(keySnapAnnounceText({ ...one, text: keySnapText(M, 'only', [one.text]) }, m, ko)).toBe('모서리에 수직: X 1, Y 2, Z 3, 거리 5 mm (후보 하나)');
    expect(keySnapAnnounceText({ ...a, reason: 'refresh' }, m, ko)).toBe('모서리에 수직 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      const t = keySnapAnnounceText(ann(dir, tr), keySnapMessagesFor(tr), tr);
      expect(t, code).toContain(translate('모서리에 수직', code));
      expect(t, code).not.toContain(translate('수직점', code));
      expect(t, code).not.toMatch(hangul);
    }
    expect(keySnapAnnounceText(ann(dir, (s) => translate(s, 'en')), keySnapMessagesFor((s) => translate(s, 'en')), (s) => translate(s, 'en'))).toBe(
      'Perpendicular to edge 1/2: X 1, Y 2, Z 3, distance 5 mm',
    );
  });

  it('첫 점에서 내린 수직 발·찍기(찍은 점 없음)·끄기·고르기 알림은 코어 글 그대로(끌어온 점 수직 선은 124차부터, 잠근 값·축은 125차부터 상태 막대 이름 — 아래 시험)', () => {
    const m = keySnapMessagesFor(ko);
    const same = (a: KeyboardSnapAnnouncement): void => expect(keySnapAnnounceText(a, m, ko)).toBe(a.text);
    same(ann({}, ko));
    expect(ann({}, ko).text).toBe('수직점 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    same(ann(dir, ko, { reason: 'commit' }));
    same(ann(dir, ko, { reason: 'end' }));
    same(ann(dir, ko, { mode: 'pick' }));
    // 125차: 잠근 수직 방향은 상태 막대와 같은 「수직점 · 잠금」, 축은 「X축 방향」(코어 「잠근 선 위 수직점」·「X축」)
    expect(ann({ ...dir, locked: true }, ko).text).toBe('잠근 선 위 수직점 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    expect(keySnapAnnounceText(ann({ ...dir, locked: true }, ko), m, ko)).toBe('수직점 · 잠금 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    expect(keySnapAnnounceText(ann({ ...dir, snap: 'axis', axis: 'x' }, ko), m, ko)).toBe('X축 방향 1/2: X 1, Y 2, Z 3, 거리 5 mm');
  });
});

describe('알림 글의 나란함·끌어온 점 선 이름(124차 — 117차 남은 한계: 상태 막대와 같은 이름)', () => {
  const ko = (s: string): string => s;
  /** 117차 시험과 같은 측정 후보 알림(화면 언어 틀로 코어 candidateText — 첫 차례·후보 둘(o.count)·첫 점에서 거리 5 mm), 종류는 주는 값 그대로 */
  const ann = (snap: Partial<MeasureHoverSnap>, tr: (s: string) => string, o: Partial<KeyboardSnapAnnouncement> = {}): KeyboardSnapAnnouncement => {
    const s = { point: [1, 2, 3], ...snap } as MeasureHoverSnap;
    const count = o.count ?? 2;
    const text = candidateText({ kind: s.snap, axis: s.axis, locked: s.locked, point: s.point }, 0, count, (v) => String(v), 5, 'mm', keySnapMessages(keySnapMessagesFor(tr)));
    return { reason: 'move', mode: 'measure', x: 0, y: 0, snap: s, index: 0, count, pick: null, text, ...o };
  };
  /** 상태 막대·측정 띠 이름(app.ts showHoverSnap — 뷰어 조각 이름 ?? 첫 화면 이름) */
  const barName = (s: MeasureHoverSnap | null): string | null => guideSnapLabel(s) ?? hoverSnapLabel(s);
  const T0: [number, number, number] = [0, 0, 0];
  /** 첫 점 나란한 선 · 끌어온 점 나란한 선 · 끌어온 점 수직인 선 · 끌어온 점 나란한 선이 첫 점 X축과 · 끌어온 점 수직인 선이 첫 점 나란한 선과 만나는 점 */
  const cases: [Partial<MeasureHoverSnap>, string, string][] = [
    [{ snap: 'parallel', direction: [1, 0, 0] }, '나란한 선', '모서리와 나란히'],
    [{ snap: 'parallel', trackFrom: T0 }, '나란한 선', '끌어온 점에서 모서리와 나란히'],
    [{ snap: 'perpendicular', trackFrom: T0 }, '수직점', '끌어온 점에서 모서리에 수직'],
    [{ snap: 'parallel', trackFrom: T0, axis: 'x' }, '나란한 선', '끌어온 점에서 모서리와 나란히 · X축 위'],
    [{ snap: 'perpendicular', perpendicularDir: true, direction: [0, 1, 0], trackFrom: T0 }, '수직점', '끌어온 점에서 모서리에 수직 · 시작점에서 나란한 선 위'],
  ];

  it('잠그지 않은 나란함·끌어온 점 선 후보는 코어 틀 이름(「나란한 선」·「수직점」)을 상태 막대 이름으로 — 켤 때 글·후보 하나 글·다시 구함도', () => {
    const m = keySnapMessagesFor(ko);
    const M = keySnapMessages(m);
    for (const [snap, core, name] of cases) {
      const a = ann(snap, ko);
      expect(barName(a.snap), name).toBe(name);
      expect(a.text, name).toBe(`${core} 1/2: X 1, Y 2, Z 3, 거리 5 mm`);
      expect(keySnapAnnounceText(a, m, ko), name).toBe(`${name} 1/2: X 1, Y 2, Z 3, 거리 5 mm`);
      expect(keySnapAnnounceText({ ...a, reason: 'refresh' }, m, ko), name).toBe(`${name} 1/2: X 1, Y 2, Z 3, 거리 5 mm`);
      expect(keySnapAnnounceText({ ...a, reason: 'cycle' }, m, ko), name).toBe(`${name} 1/2: X 1, Y 2, Z 3, 거리 5 mm`);
    }
    const a = ann(cases[1]![0], ko);
    expect(keySnapAnnounceText({ ...a, reason: 'start', text: keySnapText(M, 'start', [a.text, '옮기기 ←→↑↓']) }, m, ko)).toBe(
      '가상 커서를 켰습니다. 끌어온 점에서 모서리와 나란히 1/2: X 1, Y 2, Z 3, 거리 5 mm. 옮기기 ←→↑↓',
    );
    const one = ann(cases[0]![0], ko, { reason: 'cycle', count: 1 });
    expect(keySnapAnnounceText({ ...one, text: keySnapText(M, 'only', [one.text]) }, m, ko)).toBe('모서리와 나란히: X 1, Y 2, Z 3, 거리 5 mm (후보 하나)');
  });

  it('네 언어 화면 틀: 글이 상태 막대 이름(화면 언어)으로 시작하고 한글이 없다 — 영어는 「Parallel to edge …」', () => {
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      for (const [snap, core, name] of cases) {
        const a = ann(snap, tr);
        expect(a.text.startsWith(tr(core)), `${code} ${name}`).toBe(true);
        const t = keySnapAnnounceText(a, keySnapMessagesFor(tr), tr);
        expect(t.startsWith(tr(name)), `${code} ${name}: ${t}`).toBe(true);
        expect(t, `${code} ${name}`).not.toMatch(hangul);
      }
    }
    const en = (s: string): string => translate(s, 'en');
    expect(keySnapAnnounceText(ann(cases[0]![0], en), keySnapMessagesFor(en), en)).toBe('Parallel to edge 1/2: X 1, Y 2, Z 3, distance 5 mm');
  });

  it('첫 점 수직 발·끝점·찍기(찍은 점 없음)·끄기·고르기 알림은 코어 글 그대로 — 잠근 나란함·끌어온 점 선과 축은 125차부터 상태 막대 이름(앱 접선 잠금이면 「접선 방향 · 잠금」)', () => {
    const m = keySnapMessagesFor(ko);
    const same = (a: KeyboardSnapAnnouncement): void => expect(keySnapAnnounceText(a, m, ko)).toBe(a.text);
    same(ann({ snap: 'perpendicular' }, ko));
    same(ann({ snap: 'endpoint' }, ko));
    for (const [snap] of cases) {
      same(ann(snap, ko, { reason: 'commit' }));
      same(ann(snap, ko, { reason: 'end' }));
      same(ann(snap, ko, { mode: 'pick' }));
    }
    // 125차(124차는 그대로 두던 것): 잠근 후보는 상태 막대 이름(접선 잠금인지는 넷째 인자 — installKeySnap이 앱 고르기 호스트의 tangents로 준다)
    const locked = ann({ ...cases[0]![0], locked: true }, ko);
    expect(locked.text).toBe('잠근 선 위 나란한 선 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    expect(keySnapAnnounceText(locked, m, ko)).toBe('모서리와 나란히 · 잠금 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    expect(keySnapAnnounceText(locked, m, ko, true)).toBe('접선 방향 · 잠금 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    for (const c of [cases[1]!, cases[2]!]) {
      const a = ann({ ...c[0], locked: true }, ko);
      expect(barName(a.snap), c[2]).toBe('잠근 방향 · 끌어온 점과 나란히');
      expect(keySnapAnnounceText(a, m, ko), c[2]).toBe('잠근 방향 · 끌어온 점과 나란히 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    }
    expect(keySnapAnnounceText(ann({ snap: 'axis', axis: 'x' }, ko), m, ko)).toBe('X축 방향 1/2: X 1, Y 2, Z 3, 거리 5 mm');
    expect(keySnapAnnounceText(ann({ snap: 'axis', axis: 'x', trackFrom: T0 }, ko), m, ko)).toBe('끌어온 점에서 X축 1/2: X 1, Y 2, Z 3, 거리 5 mm');
  });
});

describe('알림 글의 축·붙잡지 않은 점·잠근 후보·찍은 첫 점 이름(125차 — 124차 남은 한계: 상태 막대와 같은 이름)', () => {
  const ko = (s: string): string => s;
  /** 124차 시험과 같은 측정 후보 알림(화면 언어 틀로 코어 candidateText — 첫 차례·후보 둘(o.count)·첫 점에서 거리 5 mm), 종류는 주는 값 그대로 */
  const ann = (snap: Partial<MeasureHoverSnap>, tr: (s: string) => string, o: Partial<KeyboardSnapAnnouncement> = {}): KeyboardSnapAnnouncement => {
    const s = { point: [1, 2, 3], ...snap } as MeasureHoverSnap;
    const count = o.count ?? 2;
    const text = candidateText({ kind: s.snap, axis: s.axis, locked: s.locked, point: s.point }, 0, count, (v) => String(v), 5, 'mm', keySnapMessages(keySnapMessagesFor(tr)));
    return { reason: 'move', mode: 'measure', x: 0, y: 0, snap: s, index: 0, count, pick: null, text, ...o };
  };
  /** 상태 막대·측정 띠 이름(app.ts showHoverSnap — 뷰어 조각 이름 ?? 첫 화면 이름, 앱 곡선 접선 잠금이면 tangent) */
  const barName = (s: MeasureHoverSnap | MeasurePoint | null, tangent = false): string | null => guideSnapLabel(s) ?? hoverSnapLabel(s, tangent);
  const T0: [number, number, number] = [0, 0, 0];
  const SEG: SnapSegment = { kind: 'edge', id: 'm', index: 0, raw: 0, ends: [[0, 0, 0], [10, 0, 0]] };
  /**
   * [후보, 코어 종류 글, 상태 막대 이름, 앱 곡선 접선 잠금일 때 상태 막대 이름(나란함 잠금만)]:
   * 첫 점 X축 · 끌어온 점 Y축 · 첫 점 Z축이 모서리와 만나는 점 · 끌어온 X축과 Y축의 교차 · 붙잡지 않은 점(그대로·곡선 위로·곡면 위로 다듬음) ·
   * 잠근 X축(그대로·모서리와 만남·끌어온 점 Y축과 만남) · 잠근 수직 방향 · 잠근 나란함(그대로·모서리와 만남·끌어온 점과 나란한 자리)
   */
  const cases: [Partial<MeasureHoverSnap>, string, string, string?][] = [
    [{ snap: 'axis', axis: 'x', direction: [1, 0, 0] }, 'X축', 'X축 방향'],
    [{ snap: 'axis', axis: 'y', trackFrom: T0 }, 'Y축', '끌어온 점에서 Y축'],
    [{ snap: 'axis', axis: 'z', direction: [0, 0, 1], segment: SEG }, 'Z축', 'Z축 · 모서리 위'],
    [{ snap: 'axis', axis: 'x', trackFrom: T0, trackOther: { from: T0, axis: 'y' } }, 'X축', '끌어온 X축과 Y축의 교차'],
    [{ snap: null }, '스냅하지 않은 점', '면 위 점'],
    [{ snap: null, refined: true, segment: SEG }, '스냅하지 않은 점', '곡선 위 점'],
    [{ snap: null, refined: true }, '스냅하지 않은 점', '곡면 위 점'],
    [{ snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true }, '잠근 선 위 X축', 'X축 방향 · 잠금'],
    [{ snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true, segment: SEG }, '잠근 선 위 X축', '잠근 X축 · 모서리 위'],
    [{ snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true, trackFrom: T0, trackOther: { from: T0, axis: 'y' } }, '잠근 선 위 X축', '잠근 X축 · 끌어온 점 Y축 위'],
    [{ snap: 'perpendicular', perpendicularDir: true, direction: [0, 1, 0], locked: true }, '잠근 선 위 수직점', '수직점 · 잠금'],
    [{ snap: 'parallel', direction: [1, 0, 0], locked: true }, '잠근 선 위 나란한 선', '모서리와 나란히 · 잠금', '접선 방향 · 잠금'],
    [{ snap: 'parallel', direction: [1, 0, 0], locked: true, segment: SEG }, '잠근 선 위 나란한 선', '잠근 방향 · 모서리 위', '잠근 접선 · 모서리 위'],
    [{ snap: 'parallel', direction: [1, 0, 0], locked: true, trackFrom: T0 }, '잠근 선 위 나란한 선', '잠근 방향 · 끌어온 점과 나란히', '잠근 접선 · 끌어온 점과 나란히'],
  ];

  it('축·붙잡지 않은 점·잠근 후보는 코어 틀 이름(「X축」·「스냅하지 않은 점」·「잠근 선 위 …」)을 상태 막대 이름으로 — 켤 때 글·후보 하나 글·다시 구함도, 앱 접선 잠금이면 접선 이름', () => {
    const m = keySnapMessagesFor(ko);
    const M = keySnapMessages(m);
    const tail = ' 1/2: X 1, Y 2, Z 3, 거리 5 mm';
    for (const [snap, core, name, tan] of cases) {
      const a = ann(snap, ko);
      expect(barName(a.snap), name).toBe(name);
      expect(a.text, name).toBe(core + tail);
      expect(keySnapAnnounceText(a, m, ko), name).toBe(name + tail);
      expect(keySnapAnnounceText({ ...a, reason: 'refresh' }, m, ko), name).toBe(name + tail);
      expect(keySnapAnnounceText({ ...a, reason: 'cycle' }, m, ko), name).toBe(name + tail);
      expect(keySnapAnnounceText({ ...a, reason: 'start', text: keySnapText(M, 'start', [a.text, '옮기기 ←→↑↓']) }, m, ko), name).toBe(
        `가상 커서를 켰습니다. ${name}${tail}. 옮기기 ←→↑↓`,
      );
      const one = ann(snap, ko, { reason: 'cycle', count: 1 });
      expect(keySnapAnnounceText({ ...one, text: keySnapText(M, 'only', [one.text]) }, m, ko), name).toBe(`${name}: X 1, Y 2, Z 3, 거리 5 mm (후보 하나)`);
      if (!tan) continue;
      expect(barName(a.snap, true), tan).toBe(tan);
      expect(keySnapAnnounceText(a, m, ko, true), tan).toBe(tan + tail);
    }
  });

  it('네 언어 화면 틀: 글이 상태 막대 이름(화면 언어 — 「 · 」 조각마다)으로 시작하고 한글이 없다 — 영어는 「Along X axis …」·「Point on face …」·「Along tangent · Locked …」', () => {
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      for (const [snap, , name, tan] of cases) {
        const a = ann(snap, tr);
        const t = keySnapAnnounceText(a, keySnapMessagesFor(tr), tr);
        expect(t.startsWith(tr(name)), `${code} ${name}: ${t}`).toBe(true);
        expect(t, `${code} ${name}`).not.toMatch(hangul);
        if (!tan) continue;
        const u = keySnapAnnounceText(a, keySnapMessagesFor(tr), tr, true);
        expect(u.startsWith(tr(tan)), `${code} ${tan}: ${u}`).toBe(true);
        expect(u, `${code} ${tan}`).not.toMatch(hangul);
      }
    }
    const en = (s: string): string => translate(s, 'en');
    const say = (i: number, tangent = false): string => keySnapAnnounceText(ann(cases[i]![0], en), keySnapMessagesFor(en), en, tangent);
    expect(say(0)).toBe('Along X axis 1/2: X 1, Y 2, Z 3, distance 5 mm');
    expect(say(4)).toBe('Point on face 1/2: X 1, Y 2, Z 3, distance 5 mm');
    expect(say(11)).toBe('Parallel to edge · Locked 1/2: X 1, Y 2, Z 3, distance 5 mm');
    expect(say(11, true)).toBe('Along tangent · Locked 1/2: X 1, Y 2, Z 3, distance 5 mm');
  });

  it('찍은 첫 점 글(「첫 점을 찍었습니다. {종류}: {점}」)도 찍은 점의 상태 막대 이름으로 — 틀 앞 글 뒤에서 바꾸고, 둘째 점·찍을 점 없음·끝점은 그대로, 네 언어', () => {
    /** 코어 keyCommit과 같은 첫 점 글(화면 언어 틀 — 찍은 점의 snapKindText, 점 글), 지금 후보는 찍은 뒤 그 자리의 것(이름에 쓰지 않는다) */
    const first = (p: Partial<MeasurePoint>, tr: (s: string) => string, msgs: Partial<Record<KeySnapMessageKey, string>> = keySnapMessagesFor(tr)): KeyboardSnapAnnouncement => {
      const point = { point: [1, 2, 3], snap: null, ...p } as MeasurePoint;
      const M = keySnapMessages(msgs);
      const text = keySnapText(M, 'firstPoint', [snapKindText(point.snap, point.axis, point.locked, M), keySnapText(M, 'point', [1, 2, 3])]);
      return { reason: 'commit', mode: 'measure', x: 0, y: 0, snap: { point: [1, 2, 3], snap: 'axis', axis: 'z' }, index: 0, count: 1, pick: null, point, text };
    };
    const m = keySnapMessagesFor(ko);
    const pts: [Partial<MeasurePoint>, string, string][] = [
      [{}, '스냅하지 않은 점', '면 위 점'],
      [{ refined: true }, '스냅하지 않은 점', '곡면 위 점'],
      [{ snap: 'axis', axis: 'x', trackFrom: T0 }, 'X축', '끌어온 점에서 X축'],
      [{ snap: 'parallel', trackFrom: T0 }, '나란한 선', '끌어온 점에서 모서리와 나란히'],
      [{ snap: 'endpoint' }, '끝점', '끝점'],
    ];
    for (const [p, core, name] of pts) {
      const a = first(p, ko);
      expect(barName(a.point!), name).toBe(name);
      expect(a.text, name).toBe(`첫 점을 찍었습니다. ${core}: X 1, Y 2, Z 3`);
      expect(keySnapAnnounceText(a, m, ko), name).toBe(`첫 점을 찍었습니다. ${name}: X 1, Y 2, Z 3`);
    }
    // 틀 앞 글에 같은 종류 낱말이 있어도 앞 글 뒤의 종류 글을 바꾼다(앱이 옮긴 틀)
    const own = { firstPoint: 'X축 기준 첫 점 — {0}: {1}' };
    expect(keySnapAnnounceText(first(pts[2]![0], ko, own), own, ko)).toBe('X축 기준 첫 점 — 끌어온 점에서 X축: X 1, Y 2, Z 3');
    // 둘째 점(측정 결과 글 — 이름 없음)·찍을 점 없음은 그대로
    const second: KeyboardSnapAnnouncement = { ...first({}, ko), measurement: {} as MeasureResult, text: '둘째 점을 찍었습니다. 거리 5 mm, X 차 1, Y 차 2, Z 차 3' };
    expect(keySnapAnnounceText(second, m, ko)).toBe(second.text);
    const none: KeyboardSnapAnnouncement = { reason: 'commit', mode: 'measure', x: 0, y: 0, snap: null, index: 0, count: 0, pick: null, text: '찍을 점이 없습니다' };
    expect(keySnapAnnounceText(none, m, ko)).toBe('찍을 점이 없습니다');
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      const lead = keySnapMessages(keySnapMessagesFor(tr)).firstPoint.split('{0}')[0]!;
      for (const [p, core, name] of pts.slice(0, 4)) {
        const t = keySnapAnnounceText(first(p, tr), keySnapMessagesFor(tr), tr);
        expect(t.startsWith(lead + tr(name)), `${code} ${name}: ${t}`).toBe(true);
        expect(t, `${code} ${name}`).not.toMatch(hangul);
        expect(tr(core), `${code} ${core}`).not.toBe(tr(name));
      }
    }
    expect(keySnapAnnounceText(first({}, (s) => translate(s, 'en')), keySnapMessagesFor((s) => translate(s, 'en')), (s) => translate(s, 'en'))).toBe(
      'First point placed. Point on face: X 1, Y 2, Z 3',
    );
  });

  it('실제 코어: 앞면 가운데(붙잡지 않은 점)에서 켜고 찍은 첫 점 「면 위 점」, 첫 점 X축 위 「X축 방향」, 앱 나란함 잠금 「모서리와 나란히 · 잠금」 — 앱 고르기 호스트가 접선 잠금이라 하면 「접선 방향 · 잠금」', () => {
    const w = new StepText();
    w.product('c', [cube(w, 10).solid], w.context());
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    const sc = stepToScene(w.bytes());
    v.setScene(sc);
    // 앞에서(+Y 쪽을 본다 — 앞면 y = 0, 화면 가로 = X, 세로 = Z): 캔버스 가운데는 앞면 가운데 (5, 0, 5), 모서리·가운데점에서 붙잡기 거리(10화소)보다 멀다
    v.setView('front', false);
    v.fit(false);
    v.renderNow();
    const ex = stepEdgeIndex(sc);
    // 앱처럼(syncMeasureSnap — 곡선 붙잡기를 받기 전), 키보드 붙잡기는 앱처럼 installKeySnap — 고르기 호스트(app.ts는 자기 자신)의 접선 잠금을 시험이 정한다
    v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true));
    v.setMeasureMode(true);
    let tangent = false;
    const ks = installKeySnap(v, {
      tr: ko,
      pickThrough: () => false,
      pick: { faceMode: false, multiPick: false, pickUnit: 'part', doc: null, tangents: { locked: () => tangent } },
    });
    const said = (): string => ks.live.textContent!;
    key(v.canvas, 'ArrowUp');
    const c0 = { ...v.keyboardCursor! };
    expect(c0.mode).toBe('measure');
    expect(v.measureHoverSnap).toMatchObject({ snap: null });
    expect(barName(v.measureHoverSnap)).toBe('면 위 점');
    expect(said()).toMatch(/^가상 커서를 켰습니다\. 면 위 점: X /);
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(1);
    expect(said()).toMatch(/^첫 점을 찍었습니다\. 면 위 점: X /);
    // 오른쪽으로 30화소(걸음 5 × 6): 첫 점 X축(첫 점 높이의 화면 가로선) 위, Z축에서 30화소
    expect(v.keyboardSnap!.step).toBe(5);
    for (let i = 0; i < 6; i++) key(v.canvas, 'ArrowRight');
    expect(v.keyboardCursor).toMatchObject({ x: c0.x + 30, y: c0.y });
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    expect(barName(v.measureHoverSnap)).toBe('X축 방향');
    expect(said()).toMatch(/^X축 방향( 1\/\d)?: X .*, 거리 /);
    // 앱이 건 나란함 잠금(곡선 접선 잠금과 같은 꼴 — X 방향) → 다음 그림에서 다시 구한 알림(코어 'refresh')
    tangent = true;
    expect(v.setMeasureInferenceLock({ direction: [1, 0, 0], kind: 'parallel' })).toBe(true);
    v.renderNow();
    expect(v.measureHoverSnap).toMatchObject({ snap: 'parallel', locked: true });
    expect(said()).toMatch(/^접선 방향 · 잠금( 1\/\d)?: X /);
    expect(said()).not.toContain('잠근 선 위');
    // 접선 잠금이 아니면(앱 화살표·잠금 버튼의 나란함 잠금) 상태 막대처럼 「모서리와 나란히 · 잠금」 — 한 걸음 옮긴 알림
    tangent = false;
    key(v.canvas, 'ArrowUp');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'parallel', locked: true });
    expect(barName(v.measureHoverSnap)).toBe('모서리와 나란히 · 잠금');
    expect(said()).toMatch(/^모서리와 나란히 · 잠금( 1\/\d)?: X /);
  });
});

describe('마우스 Tab 돌리기 스냅 이름의 차례·수(118차 — 코어 0.118.0 MeasureHoverSnap.cycle·앱이 할 일)', () => {
  const ko = (s: string): string => s;

  it('가상 커서 알림과 같은 틀 \'order\'(코어 기본 「{0} {1}/{2}」 — 사전에 옮기지 않는 자리 글 틀)로 「끝점 2/4」: 이름 마디는 한국어 그대로·차례 마디 따로, 이으면 keySnapText 글', () => {
    expect(keySnapCatalogKey('order')).toBeNull();
    const m = keySnapMessagesFor(ko);
    const c = hoverCycleLabel('끝점', { index: 1, count: 4 }, m, ko);
    expect(c).toEqual({ parts: ['끝점', ' 2/4'], said: '끝점 2/4' });
    expect(c.parts.join('')).toBe(keySnapText(keySnapMessages(m), 'order', ['끝점', 2, 4]));
    expect(hoverCycleLabel('모서리에 수직', { index: 0, count: 2 }, m, ko)).toEqual({ parts: ['모서리에 수직', ' 1/2'], said: '모서리에 수직 1/2' });
    // 앱이 틀을 옮겨 주면 그 틀(이름 자리가 가운데여도 이름은 한 마디)
    expect(hoverCycleLabel('끝점', { index: 2, count: 3 }, { order: '[{1}/{2}] {0} ·' }, ko)).toEqual({ parts: ['[3/3] ', '끝점', ' ·'], said: '[3/3] 끝점 ·' });
  });

  it('네 언어: 마디마다 옮기면(번역층) 알림 글(화면 언어 — 이름만 tr)과 같고 한글이 없다 — 가상 커서 후보 글의 차례 꼴과 같은 글', () => {
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      const m = keySnapMessagesFor(tr);
      for (const name of ['끝점', '모서리에 수직', '접선 방향 · 잠금']) {
        const c = hoverCycleLabel(name, { index: 1, count: 4 }, m, tr);
        expect(c.parts, `${code} ${name}`).toEqual([name, ' 2/4']);
        expect(c.parts.map(tr).join(''), `${code} ${name}`).toBe(c.said);
        expect(c.said, `${code} ${name}`).not.toMatch(hangul);
        expect(c.said).toBe(keySnapText(keySnapMessages(m), 'order', [tr(name), 2, 4]));
      }
    }
    expect(hoverCycleLabel('끝점', { index: 1, count: 4 }, keySnapMessagesFor((s) => translate(s, 'en')), (s) => translate(s, 'en')).said).toBe('Endpoint 2/4');
  });
});
