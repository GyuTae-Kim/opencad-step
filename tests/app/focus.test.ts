// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeDialog, dialogOpen, openDialog, selectRow } from '../../src/app/dialog';
import { controlOf, isTextTarget, routeKey } from '../../src/app/keys';
import { closeMenu, menuOpen, openMenu } from '../../src/app/menu';
import { recentFocus } from '../../src/app/recent';
import { findToFilter } from '../../src/app/treeview';

describe('초점 돌려주기(키보드 사용)', () => {
  it('메뉴 항목을 고르면 초점이 메뉴를 연 단추로 돌아온 뒤 명령이 돈다', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    let focusedAtRun: Element | null = null;
    openMenu(anchor, [{ label: '표시 설정…', run: () => (focusedAtRun = document.activeElement) }], '설정');
    const item = document.querySelector<HTMLButtonElement>('.menu .menu-item')!;
    item.focus();
    item.click();
    expect(document.querySelector('.menu')).toBeNull();
    expect(focusedAtRun).toBe(anchor);
    anchor.remove();
  });

  it('대화 상자를 닫으면 연 단추로 초점이 돌아온다', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const d = openDialog('표시 설정', [document.createElement('p')]);
    d.el.querySelector<HTMLButtonElement>('.dlg-close')!.focus();
    d.el.querySelector<HTMLButtonElement>('.dlg-close')!.click();
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('시작 화면 최근 문서 ✕·「모두 지우기」를 키보드로 누르면 지운 줄 자리의 열기 버튼(끝 줄이면 앞 줄), 목록이 비면 「파일 열기」로 — 초점이 그 버튼에 없었으면 그대로(142차)', () => {
    const open = document.createElement('button');
    const head = document.createElement('div');
    const clear = document.createElement('button');
    head.append(clear);
    const list = document.createElement('ul');
    const other = document.createElement('button');
    document.body.append(open, head, list, other);
    // 앱 refreshRecent·recentRow 꼴: 줄(li — 열기 버튼, ✕)을 모두 새로 만든다
    const draw = (names: string[]) =>
      list.replaceChildren(
        ...names.map((n) => {
          const li = document.createElement('li');
          const o = document.createElement('button');
          o.className = 'recent-open';
          o.textContent = n;
          li.append(o, document.createElement('button'));
          return li;
        }),
      );
    const del = (i: number) => list.children[i]!.lastElementChild as HTMLElement;
    const now = () => document.activeElement;
    // 가운데 줄 ✕ → 다시 그리면 초점이 body로 빠지고(전에는 그대로) → 그 자리에 온 다음 줄(c)의 열기 버튼
    draw(['a', 'b', 'c']);
    del(1).focus();
    let back = recentFocus(del(1), list, open);
    draw(['a', 'c']);
    expect(now()).toBe(document.body);
    back();
    expect(now()).toBe(list.children[1]!.firstElementChild);
    expect(now()?.textContent).toBe('c');
    // 끝 줄 ✕ → 앞 줄(a)
    del(1).focus();
    back = recentFocus(del(1), list, open);
    draw(['a']);
    back();
    expect(now()?.textContent).toBe('a');
    // 하나 남은 줄 ✕ → 목록이 비면(앱은 카드를 숨김) 「파일 열기」
    del(0).focus();
    back = recentFocus(del(0), list, open);
    draw([]);
    back();
    expect(now()).toBe(open);
    // 「모두 지우기」: 카드와 함께 숨는다(jsdom은 숨은 버튼의 초점을 떼지 않아 그대로 남음) → 「파일 열기」
    draw(['a', 'b']);
    clear.focus();
    back = recentFocus(clear, list, open);
    draw([]);
    head.hidden = true;
    expect(now()).toBe(clear);
    back();
    expect(now()).toBe(open);
    head.hidden = false;
    // 누를 때 초점이 그 버튼에 없으면(마우스로 눌러 초점을 두지 않는 브라우저 — body, 다른 칸) 그대로
    draw(['a', 'b']);
    (now() as HTMLElement).blur();
    back = recentFocus(del(0), list, open);
    draw(['b']);
    back();
    expect(now()).toBe(document.body);
    other.focus();
    back = recentFocus(del(0), list, open);
    draw([]);
    back();
    expect(now()).toBe(other);
    // 지우는 사이(저장소 기다림) 사용자가 다른 칸으로 옮겼으면 그대로
    draw(['a', 'b']);
    del(0).focus();
    back = recentFocus(del(0), list, open);
    other.focus();
    draw(['b']);
    back();
    expect(now()).toBe(other);
    for (const el of [open, head, list, other]) el.remove();
  });

  it('앱(원문): 최근 문서 ✕·「모두 지우기」가 누를 때 recentFocus를 부르고 지운 뒤 다시 그린 다음 돌려준 함수를 부른다(142차)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/const back = recentFocus\(del, this\.recentList, this\.startOpen\);\s*void this\.recent\.remove\(r\.id\)\.then\(\(\) => this\.refreshRecent\(\)\)\.then\(back\);/);
    expect(app).toMatch(/const back = recentFocus\(clearRecent, this\.recentList, open\);\s*void this\.recent\.clear\(\)\.then\(\(\) => this\.refreshRecent\(\)\)\.then\(back\);/);
    expect(app).toMatch(/this\.startOpen = open;/);
  });

  it('최근 문서 이름을 눌렀는데 저장한 파일이 없어 그 줄을 지우고 다시 그려도 ✕와 같은 자리 — 그 자리에 온 줄(끝 줄이면 앞 줄)의 이름 버튼, 목록이 비면 「파일 열기」(148차)', () => {
    const open = document.createElement('button');
    const list = document.createElement('ul');
    document.body.append(open, list);
    // 앱 refreshRecent·recentRow 꼴: 줄(li — 이름 버튼, ✕)을 모두 새로 만든다
    const draw = (names: string[]) =>
      list.replaceChildren(
        ...names.map((n) => {
          const li = document.createElement('li');
          const o = document.createElement('button');
          o.textContent = n;
          li.append(o, document.createElement('button'));
          return li;
        }),
      );
    const name = (i: number) => list.children[i]!.firstElementChild as HTMLElement;
    const now = () => document.activeElement;
    // 가운데 줄(b) 이름 → 파일 없음 → 그 줄 없이 다시 그리면 초점이 body로 빠지고 → 그 자리에 온 줄(c)의 이름 버튼
    draw(['a', 'b', 'c']);
    name(1).focus();
    let back = recentFocus(name(1), list, open);
    draw(['a', 'c']);
    expect(now()).toBe(document.body);
    back();
    expect(now()).toBe(name(1));
    expect(now()?.textContent).toBe('c');
    // 끝 줄 → 앞 줄(a), 하나 남은 줄 → 목록이 비면 「파일 열기」
    back = recentFocus(name(1), list, open);
    draw(['a']);
    back();
    expect(now()?.textContent).toBe('a');
    back = recentFocus(name(0), list, open);
    draw([]);
    back();
    expect(now()).toBe(open);
    open.remove();
    list.remove();
    // 앱(원문): 이름 버튼은 누를 때 recentFocus를 재 openRecent에 넘기고, 파일이 없으면 지운 뒤 목록을 다시 그린 다음 그 함수를 부른다(142차 ✕ 꼴)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/open\.addEventListener\('click', \(\) => void this\.openRecent\(r, recentFocus\(open, this\.recentList, this\.startOpen\)\)\);/);
    expect(app).toMatch(/private async openRecent\(r: RecentEntry, back\?: \(\) => void\): Promise<boolean>/);
    expect(app).toMatch(/await this\.recent\.remove\(r\.id\);\s*(\/\/[^\n]*\n\s*)*void this\.refreshRecent\(\)\.then\(back\);\s*return false;/);
  });

  it('154차: 모달 대화 상자가 열린 동안(showModal이 없는 open 속성 갈래도) 앱 창 글쇠는 Esc 말고 받지 않는다 — 열린 것은 dialog.ts가 쥔 상태로 안다', () => {
    // 앱(원문): 창 bubble onKey 판정에 그 상태를 넘기고, 창 캡처 리스너(곡선 접선 Shift·분해 손질 글쇠·3D 보기 화살표)도 맨 앞에서 돌아선다
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/const action = routeKey\(\{ [^\n]*, modal: dialogOpen\(\) \}\);/);
    expect(app).toMatch(/\(ev\) => \{\n\s*if \(dialogOpen\(\)\) return;\n\s*if \(this\.tangentShift\(ev\) \|\| /);
    const opener = document.createElement('button');
    document.body.append(opener);
    // app.ts onKey와 같은 판정(창 bubble)
    const routed: (string | null)[] = [];
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      routed.push(routeKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, inText: isTextTarget(e.target), control: controlOf(e.target), hasDoc: true, modal: dialogOpen() }));
    };
    const press = (el: Element, key: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    addEventListener('keydown', onKey);
    try {
      expect(dialogOpen()).toBe(false);
      opener.focus();
      const d = openDialog('표시 설정', [selectRow('단위', [['mm', 'mm'], ['in', 'in']], 'mm', () => {})]);
      // jsdom에는 showModal이 없어 open 속성 갈래로 뜬다
      expect(d.el.hasAttribute('open')).toBe(true);
      expect(dialogOpen()).toBe(true);
      const close = d.el.querySelector<HTMLButtonElement>('.dlg-close')!;
      close.focus();
      // 전에는 숨기기·격리·홈 뷰·격자·전체 보기·표준 뷰·방향 잠금·화살표·파일 열기·분해 되돌리기·다시 하기가 대화 상자 뒤에 들었다
      for (const k of ['h', 'i', 'Home', 'F7', 'f', '1', 'Shift', 'ArrowLeft']) press(close, k);
      press(close, 'o', { ctrlKey: true });
      press(close, 'z', { metaKey: true });
      press(close, 'y', { ctrlKey: true });
      expect(routed).toEqual(Array(11).fill(null));
      // 고르기 칸은 전처럼 글 칸, Esc는 앱의 대화 상자 닫기(Esc 차례의 첫 칸)
      routed.length = 0;
      press(d.el.querySelector('select')!, 'h');
      press(close, 'Escape');
      expect(routed).toEqual([null, 'escape']);
      // 닫으면 글쇠가 다시 앱 것
      expect(closeDialog()).toBe(true);
      expect(dialogOpen()).toBe(false);
      routed.length = 0;
      press(opener, 'h');
      press(opener, 'Home');
      expect(routed).toEqual(['hide', 'home']);
      // 닫기 단추로 닫아도 풀린다
      openDialog('그림 저장', [document.createElement('p')]).el.querySelector<HTMLButtonElement>('.dlg-close')!.click();
      expect(dialogOpen()).toBe(false);
    } finally {
      removeEventListener('keydown', onKey);
      opener.remove();
    }
  });

  it('158차: 메뉴가 열려 그 항목에 초점이 있으면 앱 창 글쇠(H·I·F·1~7·F7 — 수식 글쇠 없는 키)는 메뉴 것이라 메뉴를 연 채 뒤가 바뀌지 않는다 — 닫으면 다시 앱 것', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    // app.ts onKey와 같은 판정(창 bubble — 메뉴 문서 캡처가 막은 키는 건너뜀)
    const routed: (string | null)[] = [];
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      routed.push(routeKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, inText: isTextTarget(e.target), control: controlOf(e.target), hasDoc: true, modal: dialogOpen() }));
    };
    const press = (el: Element, key: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    addEventListener('keydown', onKey);
    try {
      // 작업 메뉴·보기 설정 꼴: 명령(단축키 글 H)·켜고 끄기(격자)·하나 고르기
      openMenu(
        anchor,
        [
          { label: '숨기기', hint: 'H', run: () => {} },
          { label: '격자', checked: true, toggle: true, run: () => {} },
          { label: '원근 투영', checked: false, run: () => {} },
        ],
        '작업 메뉴',
      );
      const items = [...document.querySelectorAll<HTMLButtonElement>('.menu .menu-item')];
      expect(items.map((b) => b.getAttribute('role'))).toEqual(['menuitem', 'menuitemcheckbox', 'menuitemradio']);
      // 전에는 메뉴를 연 채 숨기기·격리·전체 보기·표준 뷰·격자가 들어 메뉴의 항목 글·켜짐 표시가 문서와 어긋났다
      for (const item of items) {
        item.focus();
        for (const k of ['h', 'I', 'f', '1', '7', 'F7']) press(item, k);
        press(item, 'H', { shiftKey: true });
      }
      expect(routed).toEqual(Array(21).fill(null));
      expect(menuOpen()).toBe(true);
      // 수식 글쇠 명령(파일 열기·분해 손질 되돌리기)은 메뉴가 쓰지 않는 키라 그대로 앱 것
      routed.length = 0;
      press(items[0]!, 'o', { ctrlKey: true });
      press(items[0]!, 'z', { metaKey: true });
      expect(routed).toEqual(['open', 'undo']);
      // Esc는 메뉴가 문서 캡처에서 먼저 받아 닫고 연 단추로(창 판정에 오지 않음), 닫은 뒤 글쇠는 다시 앱 것
      routed.length = 0;
      items[0]!.focus();
      press(items[0]!, 'Escape');
      expect(menuOpen()).toBe(false);
      expect(document.activeElement).toBe(anchor);
      expect(routed).toEqual([]);
      press(anchor, 'h');
      press(anchor, '1');
      expect(routed).toEqual(['hide', 'viewer']);
    } finally {
      closeMenu();
      removeEventListener('keydown', onKey);
      anchor.remove();
    }
  });

  it('159차: 메뉴 항목에서 Ctrl·⌘+F로 앱이 초점을 나무 거르기 칸에 옮기면 메뉴를 닫는다 — 그 칸의 Esc·↓·Home·End는 칸 것(전에는 메뉴가 닫고 연 단추로·메뉴 항목으로 가져감), 닫은 뒤 글쇠도 158차 판정 그대로', () => {
    const anchor = document.createElement('button');
    const filter = document.createElement('input');
    filter.type = 'search';
    document.body.append(anchor, filter);
    // 앱처럼 창 bubble: onKey 판정(bindWindow — 먼저 붙음) 뒤 나무의 Ctrl·⌘+F(findToFilter — 첫 나무를 그릴 때 붙음)
    const routed: (string | null)[] = [];
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      routed.push(routeKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey, inText: isTextTarget(e.target), control: controlOf(e.target), hasDoc: true, modal: dialogOpen() }));
    };
    const find = (e: KeyboardEvent): void => void findToFilter(e, filter);
    const press = (el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      el.dispatchEvent(e);
      return e;
    };
    addEventListener('keydown', onKey);
    addEventListener('keydown', find);
    try {
      openMenu(
        anchor,
        [
          { label: '숨기기', hint: 'H', run: () => {} },
          { label: '격자', checked: true, toggle: true, run: () => {} },
        ],
        '작업 메뉴',
      );
      const item = document.querySelector<HTMLButtonElement>('.menu .menu-item')!;
      // 연 때 초점은 켜진 항목(격자 ✓) — 메뉴 안에서 첫 항목으로 옮겨도 열린 채
      item.focus();
      expect(document.activeElement).toBe(item);
      expect(menuOpen()).toBe(true);
      expect(press(item, 'f', { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(filter);
      expect([menuOpen(), anchor.getAttribute('aria-expanded')]).toEqual([false, 'false']);
      routed.length = 0;
      for (const k of ['Escape', 'ArrowDown', 'Home', 'End']) expect([k, press(filter, k).defaultPrevented]).toEqual([k, false]);
      expect(document.activeElement).toBe(filter);
      expect(routed).toEqual([null, null, null, null]);
      press(anchor, 'h');
      expect(routed.at(-1)).toBe('hide');
    } finally {
      closeMenu();
      removeEventListener('keydown', onKey);
      removeEventListener('keydown', find);
      anchor.remove();
      filter.remove();
    }
  });
});
