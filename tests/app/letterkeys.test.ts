// @vitest-environment jsdom
/**
 * 172차: 한 글자 단축키(WCAG 2.1.4 문자 키 단축키). H·I·F·1~7은 수정 키 없이 한 글자로 돌고, 초점이 3D 보기 밖(문서·도구 막대·패널·모델 트리 줄)이어도
 * 창 글쇠(app.ts onKey → keys.ts routeKey)가 받아 음성 입력이 친 글자가 숨기기·격리·보기 바꿈으로 돌 수 있었다 — 끄기·바꾸기가 없었다.
 * 앱 설정 메뉴에 「3D 보기 밖에서도 한 글자 단축키(H·I·F·1~7)」 켜고 끄는 항목을 두고(기본 켬 — 지금과 같음), 끄면 한 글자 키는 3D 보기 안 초점일 때만 받는다
 * (그 상태가 2.1.4 「그 칸에 초점이 있을 때만」). 설정은 이 브라우저에 기억한다
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../../site/i18n.mjs';
import { controlOf, isTextTarget, readLetterKeys, routeKey, writeLetterKeys, type KeyInput } from '../../src/app/keys';
import { closeMenu, openMenu } from '../../src/app/menu';

const LABEL = '3D 보기 밖에서도 한 글자 단축키(H·I·F·1~7)';

describe('172차: 한 글자 단축키 끄기(WCAG 2.1.4)', () => {
  it('끄고 초점이 3D 보기 밖이면 수식 글쇠 없는 한 글자 키(Shift만 붙은 것도)는 받지 않고, 글자가 아닌 키·Ctrl·⌘ 명령은 그대로', () => {
    const r = (key: string, o: Partial<KeyInput> = {}) => routeKey({ key, hasDoc: true, ...o });
    const letters = ['h', 'H', 'i', 'I', 'f', 'F', '1', '5', '7', '8'];
    // 기본(켬 — viewOnly 없음)은 지금과 같다
    expect(letters.map((k) => r(k))).toEqual(['hide', 'hide', 'isolate', 'isolate', 'viewer', 'viewer', 'viewer', 'viewer', 'viewer', 'viewer']);
    expect(letters.map((k) => r(k, { viewOnly: true }))).toEqual(Array(letters.length).fill(null));
    expect(r('H', { viewOnly: true, shift: true })).toBeNull();
    expect(r('F', { viewOnly: true, shift: true })).toBeNull();
    // 글자가 아닌 키(Esc·F7·Home·화살표·Shift·Tab·Enter)와 Ctrl·⌘ 명령
    expect(['Escape', 'F7', 'Home', 'ArrowLeft', 'Shift', 'Tab', 'Enter'].map((k) => r(k, { viewOnly: true }))).toEqual(['escape', 'grid', 'home', 'viewer', 'viewer', 'viewer', 'viewer']);
    expect(r('o', { viewOnly: true, ctrl: true })).toBe('open');
    expect(r('z', { viewOnly: true, meta: true })).toBe('undo');
    expect(r('Z', { viewOnly: true, meta: true, shift: true })).toBe('redo');
    expect(r('y', { viewOnly: true, ctrl: true })).toBe('redo');
    // 앞 차수 거름은 그대로(글 칸·모달·메뉴 항목)
    expect(r('h', { inText: true })).toBeNull();
    expect(r('h', { modal: true })).toBeNull();
    expect(r('h', { control: 'menu' })).toBeNull();
  });

  it('설정은 이 브라우저에 기억한다 — 없거나 못 읽으면 켬(지금과 같음), 못 쓰면 이 창 동안만', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readLetterKeys(null)).toBe(true);
    expect(readLetterKeys(s)).toBe(true);
    expect(writeLetterKeys(s, false)).toBe(false);
    expect(readLetterKeys(s)).toBe(false);
    expect(writeLetterKeys(s, true)).toBe(true);
    expect(readLetterKeys(s)).toBe(true);
    const bad = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('denied');
      },
    };
    expect(readLetterKeys(bad)).toBe(true);
    expect(writeLetterKeys(bad, false)).toBe(false);
  });

  it('앱 설정 메뉴의 켜고 끄는 항목이 설정을 바꾸고, 끄면 3D 보기 밖 초점의 한 글자 키가 창 판정에서 빠진다(3D 보기 안은 그대로)', () => {
    // 앱(원문): 설정을 기억에서 읽고, 앱 설정 메뉴에 켜고 끄는 항목, 창 bubble onKey 판정에 「끄고 초점이 3D 보기 감싸개 밖」을 넘긴다
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain('private letterKeys = readLetterKeys(safeLocalStorage());');
    // 220차: 항목은 setLetterKeys(기억한 뒤 3D 보기 밖 버튼의 aria-keyshortcuts 한 글자 키를 다시 단다 — tests/app/keyshortcuts218.test.ts 220차 (ㄷ))
    expect(app).toContain(`{ label: '${LABEL}', toggle: true, checked: this.letterKeys, run: () => this.setLetterKeys(!this.letterKeys) },`);
    expect(app).toContain('this.letterKeys = writeLetterKeys(safeLocalStorage(), on);');
    expect(app).toMatch(/const action = routeKey\(\{ [^\n]*, viewOnly: !this\.letterKeys && !this\.hostEl\.contains\(ev\.target as Node\), modal: dialogOpen\(\) \}\);/);

    let on = true;
    const anchor = document.createElement('button');
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    host.append(canvas);
    document.body.append(anchor, host);
    const open = () => openMenu(anchor, [{ label: LABEL, toggle: true, checked: on, run: () => (on = !on) }], '앱 설정');
    // app.ts onKey와 같은 판정(창 bubble)
    const routed: (string | null)[] = [];
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      routed.push(routeKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, inText: isTextTarget(e.target), control: controlOf(e.target), hasDoc: true, viewOnly: !on && !host.contains(e.target as Node), modal: false }));
    };
    const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    addEventListener('keydown', onKey);
    try {
      open();
      let item = document.querySelector<HTMLButtonElement>('.menu .menu-item')!;
      expect(item.getAttribute('role')).toBe('menuitemcheckbox');
      expect(item.getAttribute('aria-checked')).toBe('true');
      // 켠 채(기본): 문서·버튼·3D 보기 어디서나 지금처럼
      for (const el of [document.body, anchor, canvas]) for (const k of ['h', 'I', 'f', '1']) press(el, k);
      expect(routed).toEqual(Array(3).fill(['hide', 'isolate', 'viewer', 'viewer']).flat());
      item.click();
      expect(on).toBe(false);
      expect(document.querySelector('.menu')).toBeNull();
      open();
      item = document.querySelector<HTMLButtonElement>('.menu .menu-item')!;
      expect(item.getAttribute('aria-checked')).toBe('false');
      closeMenu();
      // 끈 뒤: 문서(초점 없음)·도구 막대 같은 버튼에서는 한 글자 키가 빠지고 Esc·Home·F7은 그대로, 3D 보기에서는 그대로
      routed.length = 0;
      for (const el of [document.body, anchor]) for (const k of ['h', 'I', 'f', '1', 'Escape', 'Home', 'F7']) press(el, k);
      expect(routed).toEqual(Array(2).fill([null, null, null, null, 'escape', 'home', 'grid']).flat());
      routed.length = 0;
      for (const k of ['h', 'I', 'f', '1']) press(canvas, k);
      expect(routed).toEqual(['hide', 'isolate', 'viewer', 'viewer']);
    } finally {
      removeEventListener('keydown', onKey);
      closeMenu();
      anchor.remove();
      host.remove();
    }
  });

  it('새 글은 네 사전에 같은 사전의 「3D 보기」 낱말로 있고(키 글 그대로), 다른 열쇠와 값이 겹치지 않으며 거꾸로 찾으면 제 원문', () => {
    const term: Record<string, string> = { en: '3D view', ja: '3Dビュー', 'zh-CN': '3D 视图', de: '3D-Ansicht' };
    for (const [code, t] of Object.entries(term)) {
      const v = catalogs[code]![LABEL];
      expect(v, code).toBeTruthy();
      expect(v, code).toContain(t);
      expect(v, code).toContain('H·I·F·1~7');
      expect(v, code).not.toMatch(/[가-힣]/);
      expect(translate(LABEL, code), code).toBe(v);
      for (const other of Object.keys(term)) expect(Object.entries(catalogs[other]!).filter(([k, x]) => x === v && k !== LABEL).map(([k]) => k), `${code} → ${other}`).toEqual([]);
      // 번역층의 거꾸로 찾기(언어를 바꿀 때 옮긴 글을 원문으로 — 같은 값이면 뒤 열쇠가 이긴다)
      expect(sourceMessage(v!), code).toBe(LABEL);
    }
  });
});
