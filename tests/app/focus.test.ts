// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDialog } from '../../src/app/dialog';
import { openMenu } from '../../src/app/menu';
import { recentFocus } from '../../src/app/recent';

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
});
