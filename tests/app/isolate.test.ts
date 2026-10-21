// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { routeKey } from '../../src/app/keys';
import { HOLD_MENU_MS, TouchAim } from '../../src/app/aim';
import { Visibility } from '../../src/app/visibility';

describe('격리(이것만 보기)·숨기기 키', () => {
  it('격리하면 그 항목만 보이고 다른 켜고 끄기와 함께 따진다', () => {
    const v = new Visibility(new Map([['a', 0]]), new Set(['pmi']), true);
    v.isolated = new Set(['a', 'b']);
    expect(v.visible('a')).toBe(true);
    expect(v.visible('c')).toBe(false);
    expect(v.hiddenBy('c')).toBe('isolate');
    v.setUser(['b'], false);
    expect(v.visible('b')).toBe(false);
    v.setLayer(0, false);
    expect(v.visible('a')).toBe(false);
    v.isolated = null;
    expect(v.visible('c')).toBe(true);
  });

  it('H 숨기기·I 이것만 보기(문서가 있고 수정 키 없이, 입력 칸 제외)', () => {
    expect(routeKey({ key: 'h', hasDoc: true })).toBe('hide');
    expect(routeKey({ key: 'I', hasDoc: true })).toBe('isolate');
    expect(routeKey({ key: 'h', hasDoc: false })).toBeNull();
    expect(routeKey({ key: 'h', hasDoc: true, ctrl: true })).toBeNull();
    expect(routeKey({ key: 'i', hasDoc: true, inText: true })).toBeNull();
  });
});

describe('길게 누르기 작업 메뉴(측정·면 고르기 밖)', () => {
  it('움직이지 않고 HOLD_MENU_MS 누르면 onHold, 받아들이면 코어에 pointercancel을 보내고 떼기를 막는다', async () => {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.append(canvas);
    document.body.append(host);
    const layer = document.createElement('div');
    const held: [number, number][] = [];
    const seen: string[] = [];
    canvas.addEventListener('pointercancel', () => seen.push('cancel'));
    canvas.addEventListener('pointerup', () => seen.push('up'));
    const aim = new TouchAim(canvas, { enabled: () => false, layer, onHold: (x, y) => (held.push([x, y]), true) });
    const ev = (type: string, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(e, 'pointerId', { value: 7 });
      Object.defineProperty(e, 'pointerType', { value: 'touch' });
      canvas.dispatchEvent(e);
    };
    ev('pointerdown', 50, 60);
    await new Promise((r) => setTimeout(r, HOLD_MENU_MS + 60));
    expect(held).toEqual([[50, 60]]);
    expect(seen).toEqual(['cancel']);
    ev('pointerup', 50, 60);
    // 떼기는 코어(캔버스 듣기)로 가지 않는다
    expect(seen).toEqual(['cancel']);
    // 움직이면(10px 넘게) 길게 누르기가 아니다
    ev('pointerdown', 10, 10);
    ev('pointermove', 30, 10);
    await new Promise((r) => setTimeout(r, HOLD_MENU_MS + 60));
    expect(held).toHaveLength(1);
    ev('pointerup', 30, 10);
    aim.dispose();
    host.remove();
  });
});
