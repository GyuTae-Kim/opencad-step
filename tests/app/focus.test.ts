// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { openDialog } from '../../src/app/dialog';
import { openMenu } from '../../src/app/menu';

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
});
