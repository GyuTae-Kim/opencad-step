// @vitest-environment jsdom
/**
 * 알림 칸 한도(셋)에서 빼는 차례(152차 — NC 147차 꼴): `src/app/dom.ts` `pushToast`는 넘치면 닫을 때까지 남기는 안내(data-keep — 144차)를 건너뛰고
 * 가장 오래된 안내(class info)부터, 안내가 없으면 가장 오래된 것부터 뺀다(모두 남길 것이면 맨 앞 — 한도는 늘 지킴).
 * 다시 볼 곳이 없는 오류(그림 저장 실패·문서를 연 채 열기 실패)와 경고(최근 문서·공유 받기·분해 손질 파일 등 — 경고 23자리 가운데 18자리가 알림 상자뿐)가
 * 뒤이은 안내(I 글쇠를 누를 때마다 뜨는 「먼저 부품을 고르십시오」 등)에 밀려 제 시간 전에 빠지지 않는다.
 * 알림은 app.ts `toast`와 같은 꼴(class `toast <종류>`, 오류 role=alert·그 밖 status, keep이면 data-keep)로 실제 `h`가 만든다.
 * 160차: 저절로 닫는 시간(ms)도 `pushToast`가 맡는다 — 마우스를 올려 두었거나 초점이 그 안(닫기·동작 버튼)이면 멈추고, 둘 다 떠나면 처음 시간을 다시 센다
 * (WCAG 2.2.1 시간 조절의 연장 — 전에는 읽거나 버튼에 가 있는 동안에도 3.2~9초(새 버전 60초) 뒤 사라졌고, 초점이 있던 버튼과 함께 사라지면 초점이 문서로 빠졌다).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, pushToast } from '../../src/app/dom';

type Kind = 'info' | 'warn' | 'error';

/** 앱 알림 칸(한도 셋)과 알림 하나 넣기 */
function box() {
  const el = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const toast = (msg: string, kind: Kind = 'info', keep = false) =>
    pushToast(el, h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status', 'data-keep': keep }, h('span', {}, msg)), 3);
  return { toast, shown: () => [...el.children].map((c) => c.textContent) };
}

const ERR = '그림을 저장하지 못했습니다: 3D 보기 문맥이 없어 그림을 만들 수 없습니다';
const WARN = '저장해 둔 파일을 찾지 못해 목록에서 지웠습니다.';
const LOST = '그래픽 장치가 다시 시작되어 3D 화면을 잠시 그리지 못합니다';

describe('알림 칸 한도에서 빼는 차례(152차)', () => {
  it('오류·경고가 떠 있는 동안 안내가 넘치면 가장 오래된 안내가 빠지고 오류·경고는 남는다', () => {
    const a = box();
    a.toast(ERR, 'error');
    for (const m of ['가', '나', '다']) a.toast(m);
    expect(a.shown()).toEqual([ERR, '나', '다']);
    a.toast('라');
    expect(a.shown()).toEqual([ERR, '다', '라']);
    // 경고도 오류와 같은 무게(다시 볼 곳이 없는 실패 알림이 대부분)
    const b = box();
    b.toast(WARN, 'warn');
    for (const m of ['가', '나', '다', '라']) b.toast(m);
    expect(b.shown()).toEqual([WARN, '다', '라']);
  });

  it('안내가 없으면 가장 오래된 것부터 — 안내뿐이면 전과 같고, 오류·경고만 셋이면 새 안내가 곧 빠진다', () => {
    const a = box();
    for (const m of ['가', '나', '다', '라']) a.toast(m);
    expect(a.shown()).toEqual(['나', '다', '라']);
    const b = box();
    b.toast('오류 1', 'error');
    b.toast('경고 1', 'warn');
    b.toast('오류 2', 'error');
    b.toast('안내');
    expect(b.shown()).toEqual(['오류 1', '경고 1', '오류 2']);
    b.toast('오류 3', 'error');
    expect(b.shown()).toEqual(['경고 1', '오류 2', '오류 3']);
  });

  it('닫을 때까지 남기는 안내(data-keep — 144차)는 건너뛰고 그다음 가장 오래된 안내부터, 모두 남길 것이면 맨 앞', () => {
    const a = box();
    a.toast(LOST, 'warn', true);
    a.toast(ERR, 'error');
    a.toast('가');
    a.toast('나');
    expect(a.shown()).toEqual([LOST, ERR, '나']);
    const b = box();
    for (const m of ['가', '나', '다', '라']) b.toast(m, 'warn', true);
    expect(b.shown()).toEqual(['나', '다', '라']);
  });

  it('앱(원문): 알림에 종류 class(기본 info)를 달고 pushToast로 넣는다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain("kind: 'info' | 'warn' | 'error' = 'info'");
    expect(app).toContain('class: `toast ${kind}`');
    expect(app).toContain('pushToast(this.toasts, t, 3');
  });
});

describe('알림이 저절로 닫히는 시간 — 마우스·초점이 그 안이면 멈춤(160차)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  /** 문서에 붙은 알림 칸과 app.ts 꼴 알림(글·동작 버튼·닫기 버튼) 하나 */
  function setup() {
    vi.useFakeTimers();
    const el = h('div', { class: 'toasts', 'aria-live': 'polite' });
    const out = h('button', { type: 'button' }, '밖');
    document.body.append(out, el);
    const make = (msg: string) => {
      const act = h('button', { type: 'button', class: 'btn small toast-act' }, '새로 고침');
      const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '알림 닫기' });
      return { t: h('div', { class: 'toast info', role: 'status' }, h('span', {}, msg), act, close), act, close };
    };
    return { el, out, make };
  }

  it('마우스·초점이 없으면 ms 뒤 닫히고, ms를 주지 않으면(144·152차 꼴) 닫지 않는다', () => {
    const { el, make } = setup();
    const a = make('PNG를 저장했습니다.');
    pushToast(el, a.t, 3, 3500);
    vi.advanceTimersByTime(3499);
    expect(a.t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.t.isConnected).toBe(false);
    const b = make('남는 알림');
    pushToast(el, b.t, 3);
    vi.advanceTimersByTime(60_000);
    expect(b.t.isConnected).toBe(true);
  });

  it('마우스를 올려 두면 멈추고, 떠나면 처음 시간을 다시 센다', () => {
    const { el, make } = setup();
    const a = make('보기 링크를 복사했습니다.');
    pushToast(el, a.t, 3, 3500);
    vi.advanceTimersByTime(3000);
    a.t.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(60_000);
    expect(a.t.isConnected).toBe(true);
    a.t.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(3499);
    expect(a.t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.t.isConnected).toBe(false);
  });

  it('초점이 동작·닫기 버튼에 있으면 멈추고 안에서 옮겨도 그대로, 마우스와 초점이 모두 떠나야 다시 센다(초점은 옮기지 않음)', () => {
    const { el, out, make } = setup();
    const a = make('그림을 저장하지 못했습니다');
    pushToast(el, a.t, 3, 9000);
    a.act.focus();
    vi.advanceTimersByTime(20_000);
    expect(a.t.isConnected).toBe(true);
    a.close.focus();
    vi.advanceTimersByTime(20_000);
    expect([a.t.isConnected, document.activeElement]).toEqual([true, a.close]);
    // 마우스가 올라 있으면 초점이 밖으로 가도 멈춘 채
    a.t.dispatchEvent(new Event('pointerenter'));
    out.focus();
    vi.advanceTimersByTime(20_000);
    expect(a.t.isConnected).toBe(true);
    a.t.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(8999);
    expect(a.t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect([a.t.isConnected, document.activeElement]).toEqual([false, out]);
    // 초점이 문서로 떠나도(blur — relatedTarget 문서) 다시 센다
    const b = make('새 버전이 있습니다.');
    pushToast(el, b.t, 3, 3500);
    b.close.focus();
    vi.advanceTimersByTime(10_000);
    expect(b.t.isConnected).toBe(true);
    b.close.blur();
    vi.advanceTimersByTime(3500);
    expect(b.t.isConnected).toBe(false);
  });

  it('앱(원문): 알림 시간을 pushToast에 넘기고 따로 setTimeout으로 닫지 않는다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain('pushToast(this.toasts, t, 3, ms);');
    expect(app).not.toContain('setTimeout(remove, ms)');
  });
});
