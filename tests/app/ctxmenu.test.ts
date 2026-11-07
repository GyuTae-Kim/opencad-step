// @vitest-environment jsdom
/**
 * 작업 메뉴 항목(src/app/ctxmenu.ts — 52차, 뷰어 조각): 손가락 기기에서 고른 것이 있으면 덜 쓰는 항목을 끝의 "그 밖의 작업…" 하나로 접는다.
 * 면을 고른 채 연 메뉴가 열한 항목·네 묶음이라 44px 줄로는 320×568에서 여섯만 보였다(Apple HIG 작업 메뉴: 항목은 적게, 묶음은 셋쯤, 하위 메뉴는 한 단계).
 * 마우스 메뉴는 그대로 열한 항목·같은 차례.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { contextItems, foldMenu, type CtxHost } from '../../src/app/ctxmenu';
import { createDoc } from '../../src/app/doc';
import type { FacePick } from '../../src/app/faces';
import { closeMenu, type MenuItem } from '../../src/app/menu';
import type { ParseResult } from '../../src/app/protocol';

const run = () => {};
/** 항목 목록을 "| 이름"(앞 구분선) 꼴로 */
const names = (items: MenuItem[]) => items.map((it) => `${it.sep ? '| ' : ''}${it.label}`);
const menuEl = () => document.querySelector('.menu') as HTMLElement;
const shown = () => [...menuEl().children].map((c) => (c.classList.contains('menu-sep') ? '|' : c.querySelector('.menu-label')!.textContent));

/** 부품 하나를 고른 문서와 앱 흉내(부른 것을 calls에 남긴다) */
function setup(touch: boolean, select = true) {
  const d = createDoc('a.stp', 1, { scene: { meshes: [], lines: [], meta: { products: [] } }, ms: 1 } as unknown as ParseResult);
  if (select) d.items = { ids: ['m1'], label: '부품' };
  const calls: string[] = [];
  const host = new Proxy({ doc: d, touch, faceMode: false, multiPick: false, explodeOpen: false, explodeAxis: 'free', tweakTool: null, groups: () => [] } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => calls.push(`${String(k)}${a.length ? ` ${a.map((x) => JSON.stringify(x)).join(' ')}` : ''}`)),
  }) as unknown as CtxHost;
  return { d, host, calls };
}
const FACE = { normal: [0, 0, 1] } as unknown as FacePick;

afterEach(() => {
  closeMenu();
  document.body.innerHTML = '';
});

describe('작업 메뉴: 손가락 기기', () => {
  it('면을 고른 채: 숨기기·이것만 보기·불투명도…·정면으로 보기·자르기와 "그 밖의 작업…"(여섯 항목·세 묶음), 고르면 같은 자리에 나머지(차례·구분선 그대로)', () => {
    const { host, calls } = setup(true);
    const top = contextItems(host, FACE, { x: 120, y: 300 });
    expect(names(top)).toEqual(['숨기기', '이것만 보기', '불투명도…', '| 정면으로 보기', '이 면으로 자르기', '| 그 밖의 작업…']);
    top.at(-1)!.run();
    const el = menuEl();
    expect(el.getAttribute('aria-label')).toBe('그 밖의 작업');
    // 하위 메뉴는 같은 자리(보이지 않는 기준점)에
    const pt = document.querySelector<HTMLElement>('.menu-point')!;
    expect([pt.style.left, pt.style.top]).toEqual(['120px', '300px']);
    expect(shown()).toEqual(['맞춰 보기', '나머지 흐리게', '속성', '|', '여러 개 고르기', '|', '모두 보이기', '고르기 풀기']);
    // 하위 메뉴 항목도 같은 명령(한 단계 — 그 안에 또 하위 메뉴는 없다)
    el.querySelectorAll<HTMLButtonElement>('.menu-item')[2]!.click();
    expect(calls).toEqual(['showProps']);
    expect(names(top).filter((n) => n.endsWith('…'))).toEqual(['불투명도…', '| 그 밖의 작업…']);
  });

  it('면 없이 부품만: 네 항목(숨기기·이것만 보기·불투명도…·그 밖의 작업…), 격리 중이면 격리 풀기, 불투명도를 바꿨으면 되돌리기는 하위 메뉴에', () => {
    const { d, host } = setup(true);
    expect(names(contextItems(host, null, { x: 0, y: 0 }))).toEqual(['숨기기', '이것만 보기', '불투명도…', '| 그 밖의 작업…']);
    d.vis.isolated = new Set(['m1']);
    d.opacity.set('m1', 0.5);
    const top = contextItems(host, null, { x: 0, y: 0 });
    expect(names(top)).toEqual(['숨기기', '격리 풀기', '불투명도…', '| 그 밖의 작업…']);
    top.at(-1)!.run();
    expect(shown()).toEqual(['맞춰 보기', '속성', '|', '여러 개 고르기', '|', '모두 보이기', '불투명도 모두 되돌리기', '고르기 풀기']);
  });

  it('고른 것이 없으면 접지 않는다(다섯 항목 이하)', () => {
    const { host } = setup(true, false);
    expect(names(contextItems(host, null, { x: 0, y: 0 }))).toEqual(['전체 보기', '| 여러 개 고르기', '| 모두 보이기']);
  });

  it('불투명도…는 같은 자리에 단계 메뉴(지금 값에 표시) — 고르면 그 값', () => {
    const { d, host, calls } = setup(true);
    d.opacity.set('m1', 0.5);
    contextItems(host, null, { x: 40, y: 60 })
      .find((it) => it.label === '불투명도…')!
      .run();
    expect(menuEl().getAttribute('aria-label')).toBe('불투명도');
    expect(shown()).toEqual(['100% (불투명)', '75%', '50%', '25%', '10%']);
    expect(menuEl().querySelector('.menu-item.checked .menu-label')!.textContent).toBe('50%');
    menuEl().querySelectorAll<HTMLButtonElement>('.menu-item')[3]!.click();
    expect(calls).toEqual(['setSelectionOpacity 0.25']);
  });
});

describe('작업 메뉴: 마우스(손가락 기기가 아님)', () => {
  it('그대로 열한 항목·네 묶음(51차와 같은 차례, 단축키 글 H·I)', () => {
    const { host } = setup(false);
    const items = contextItems(host, FACE, { x: 0, y: 0 });
    expect(names(items)).toEqual([
      '맞춰 보기', '숨기기', '이것만 보기', '나머지 흐리게', '불투명도…', '속성',
      '| 정면으로 보기', '이 면으로 자르기', '| 여러 개 고르기', '| 모두 보이기', '고르기 풀기',
    ]);
    expect(items.filter((it) => it.hint).map((it) => it.hint)).toEqual(['H', 'I']);
  });
});

describe('작업 메뉴 접기(foldMenu)', () => {
  it('접을 것이 없으면 같은 목록, 있으면 켜고 끄기·흐리게 같은 항목 상태를 그대로 넘긴다', () => {
    const plain: MenuItem[] = [{ label: '전체 보기', hint: 'F', run }, { label: '모두 보이기', sep: true, run }];
    expect(foldMenu(plain, () => {})).toBe(plain);
    let rest: MenuItem[] = [];
    const top = foldMenu([{ label: '숨기기', run }, { label: '여러 개 고르기', checked: true, toggle: true, sep: true, more: true, run }, { label: '모두 보이기', more: true, disabled: true, run }], (r) => (rest = r));
    expect(names(top)).toEqual(['숨기기', '| 그 밖의 작업…']);
    top[1]!.run();
    expect(rest.map((it) => [it.label, it.checked, it.toggle, it.disabled])).toEqual([
      ['여러 개 고르기', true, true, undefined],
      ['모두 보이기', undefined, undefined, true],
    ]);
  });
});
