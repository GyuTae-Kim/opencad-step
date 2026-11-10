// @vitest-environment jsdom
// 키보드로 3D 붙잡기·고르기(62차 — keysnap.ts, 코어 0.46.0 setKeyboardSnap·0.47.0 pickCycle·messages):
// - 알림 글 틀: 코어 기본 한국어 틀이 네 언어 사전 열쇠(짧은 틀은 KEYED_PREFIX를 붙인 열쇠)이고, 옮긴 틀은 자리가 같다. 한국어 화면이면 코어 기본
// - 앱 키(H·I·Home·F7·Ctrl/⌘+O·Z·Y·Delete와 뷰어 F·1~7)는 가상 커서 키와 겹치지 않는다. 두 점 측정 화살표: 커서가 꺼져 있고 마우스가 3D 보기 위면 앱 잠금이 먼저
//   (창 캡처에서 막으면 코어는 커서를 켜지 않는다), 아니면 코어가 받아 앱(창 버블)에 가지 않는다
// - 실제 코어 뷰어(jsdom): aria-keyshortcuts, 알림이 화면 밖 aria-live 영역에 화면 언어로, Enter 고르기는 pointerType 'keyboard', pickCycle은 앱 반투명 너머 고르기와 같다
// - 도움말 키 표(코어 keyLabel)
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_SNAP_KEYS, KEY_SNAP_MESSAGES, keySnapAction, type KeySnapMessageKey } from 'opencad-viewer3d';
import { catalogs, translate } from '../../site/i18n.mjs';
import { stepToScene } from '../../src/index';
import { arrowOwner, routeKey } from '../../src/app/keys';
import { installKeySnap, keyHelpBody, keyHelpRows, KEYED_PREFIX, keyShortcuts, keySnapCatalogKey, keySnapMessagesFor } from '../../src/app/keysnap';
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
    expect(keyShortcuts(KEY_SNAP_KEYS).split(' ')).toEqual(['ArrowLeft', 'Shift+ArrowLeft', 'ArrowRight', 'Shift+ArrowRight', 'ArrowUp', 'Shift+ArrowUp', 'ArrowDown', 'Shift+ArrowDown', 'Tab', 'Shift+Tab', 'Enter', 'Escape', 'F', '1', '2', '3', '4', '5', '6', '7']);
    const rows = keyHelpRows({ step: 5, bigStep: 50, keys: KEY_SNAP_KEYS });
    expect(rows.map((r) => r[0])).toEqual(['←→↑↓', 'Shift+←→↑↓', 'Tab · Shift+Tab', 'Enter', 'Esc', 'Shift+F10', 'F · 1~7']);
    expect(rows[0]![1]).toBe('가상 커서 켜기·옮기기(5화소)');
    // 65차: 커서 자리 작업 메뉴와 겹친 것 목록 줄 미리 강조 안내(네 언어)
    expect(rows[5]![1]).toBe('커서 자리 작업 메뉴(겹친 것 고르기… — 목록 줄에 초점을 두면 3D에 미리 강조)');
    for (const [, what] of rows) for (const code of CODES) expect(translate(what, code), `${code} ${what}`).not.toMatch(hangul);
    const { viewer: v } = cubeViewer();
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false });
    const body = keyHelpBody(v);
    expect(body.map((el) => el.tagName)).toEqual(['P', 'TABLE', 'P']);
    expect([...body[1]!.querySelectorAll('kbd')].map((k) => [k.textContent, k.getAttribute('translate')])).toEqual(rows.map((r) => [r[0], 'no']));
    for (const el of [body[0]!, body[2]!]) for (const code of CODES) expect(translate(el.textContent!, code)).not.toMatch(hangul);
  });
});
