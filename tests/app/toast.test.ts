// @vitest-environment jsdom
/**
 * 알림 칸 한도(셋)에서 빼는 차례(152차 — NC 147차 꼴): `src/app/dom.ts` `pushToast`는 넘치면 닫을 때까지 남기는 안내(data-keep — 144차)를 건너뛰고
 * 가장 오래된 안내(class info)부터, 안내가 없으면 가장 오래된 것부터 뺀다(모두 남길 것이면 맨 앞 — 한도는 늘 지킴).
 * 다시 볼 곳이 없는 오류(그림 저장 실패·문서를 연 채 열기 실패)와 경고(최근 문서·공유 받기·분해 손질 파일 등 — 경고 23자리 가운데 18자리가 알림 상자뿐)가
 * 뒤이은 안내(I 글쇠를 누를 때마다 뜨는 「먼저 부품을 고르십시오」 등)에 밀려 제 시간 전에 빠지지 않는다.
 * 알림은 app.ts `toast`와 같은 꼴(class `toast <종류>`, 오류 role=alert·그 밖 status, keep이면 data-keep)로 실제 `h`가 만든다.
 * 160차: 저절로 닫는 시간(ms)도 `pushToast`가 맡는다 — 마우스를 올려 두었거나 초점이 그 안(닫기·동작 버튼)이면 멈추고, 둘 다 떠나면 처음 시간을 다시 센다
 * (WCAG 2.2.1 시간 조절의 연장 — 전에는 읽거나 버튼에 가 있는 동안에도 3.2~9초(새 버전 60초) 뒤 사라졌고, 초점이 있던 버튼과 함께 사라지면 초점이 문서로 빠졌다).
 * 166차: `pushToast`가 그 알림을 닫는 함수를 돌려주고, 닫기(✕)·동작 버튼·한도로 빼기·앱이 부르는 닫기(문맥 되찾음·잠금 실패 거두기)로 빠지는 알림 안에 초점이 있었으면
 * 알림 칸에 들어오기 전 자리로(없거나 빠졌으면 home — 앱은 3D 보기, 문서 전이면 「파일 열기」) 돌려준다(WCAG 2.4.3 — 전에는 초점이 문서로 빠져 다음 Tab이 처음부터 돌았다).
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
    expect(app).toContain('pushToast(this.toasts, t, 3, ms');
    expect(app).not.toContain('setTimeout(remove, ms)');
  });
});

describe('알림이 닫힐 때 초점 — 알림 칸에 들어오기 전 자리로(166차)', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  /**
   * 문서에 붙은 알림 칸, 알림 칸 밖 버튼(out), 갈 곳이 없을 때의 자리(home — 앱은 3D 보기, 문서 전이면 「파일 열기」), app.ts toast 꼴 알림 —
   * 닫기는 닫는 함수, 동작 버튼은 닫고 실행. 닫는 함수는 pushToast가 돌려준다(165차 pushToast는 돌려주지 않았다 — 그때처럼 알림만 떼어 고치기 전과 견줌)
   */
  function setup() {
    vi.useFakeTimers();
    const el = h('div', { class: 'toasts', 'aria-live': 'polite' });
    const out = h('button', { type: 'button' }, '밖');
    const home = h('button', { type: 'button' }, '3D 보기');
    document.body.append(out, home, el);
    const make = (msg: string, ms?: number, run?: () => void) => {
      const act = h('button', { type: 'button', class: 'btn small toast-act' }, '파일로 내보내기');
      const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '알림 닫기' });
      const t = h('div', { class: 'toast info', role: 'status' }, h('span', {}, msg), act, close);
      const r: unknown = pushToast(el, t, 3, ms, () => home);
      const shut = typeof r === 'function' ? (r as () => void) : () => t.remove();
      act.addEventListener('click', () => {
        shut();
        run?.();
      });
      close.addEventListener('click', shut);
      return { t, act, close, shut };
    };
    return { out, home, make };
  }

  it('닫기(✕)에 초점을 두고 누르면 알림 칸에 들어오기 전 자리로 — 알림끼리 옮겨 다녀도 처음 들어온 자리, 초점이 밖이면 그대로', () => {
    const { out, home, make } = setup();
    const a = make('PNG를 저장했습니다.', 3500);
    const b = make('보기 링크를 복사했습니다.', 3500);
    out.focus();
    a.close.focus();
    b.close.focus();
    b.close.click();
    expect([b.t.isConnected, document.activeElement]).toEqual([false, out]);
    // 초점이 알림 밖일 때 누름(누름이 초점을 주지 않는 브라우저)은 초점을 옮기지 않는다
    home.focus();
    a.close.click();
    expect([a.t.isConnected, document.activeElement]).toEqual([false, home]);
  });

  it('동작 버튼은 닫아 초점을 돌려준 뒤 실행해, 명령이 스스로 옮긴 초점(대화 상자 등)은 그대로', () => {
    const { out, make } = setup();
    let ran = 0;
    const a = make('보기 링크를 복사했습니다.', 9000, () => ran++);
    out.focus();
    a.act.focus();
    a.act.click();
    expect([ran, a.t.isConnected, document.activeElement]).toEqual([1, false, out]);
    const dlg = h('button', { type: 'button' }, '대화 상자 안 버튼');
    document.body.append(dlg);
    const b = make('새 버전이 있습니다.', 60_000, () => dlg.focus());
    out.focus();
    b.act.focus();
    b.act.click();
    expect([b.t.isConnected, document.activeElement]).toEqual([false, dlg]);
  });

  it('한도(셋)로 빠지는 알림 안에 초점이 있었으면 알림 칸에 들어오기 전 자리로', () => {
    const { out, make } = setup();
    const a = make('부품 단위로 고릅니다.', 3500);
    out.focus();
    a.close.focus();
    for (const m of ['가', '나', '다']) make(m, 3500);
    expect([a.t.isConnected, document.activeElement]).toEqual([false, out]);
  });

  it('앱이 부르는 닫기(문맥 되찾음·잠금 실패 거두기)도 같고, 들어오기 전 자리가 빠졌거나 문서에서 곧장 왔으면 home으로', () => {
    const { out, home, make } = setup();
    const gone = h('button', { type: 'button' }, '사라질 칸');
    document.body.append(gone);
    const a = make('그래픽 장치가 다시 시작되어 3D 화면을 잠시 그리지 못합니다', 24 * 60 * 60 * 1000);
    gone.focus();
    a.close.focus();
    gone.remove();
    a.shut();
    expect([a.t.isConnected, document.activeElement]).toEqual([false, home]);
    // 아무 칸에도 초점이 없다가(문서) 곧장 알림으로 왔으면(relatedTarget 없음)
    const b = make('잠글 방향이 없습니다', 3200);
    out.focus();
    out.blur();
    b.close.focus();
    b.shut();
    expect([b.t.isConnected, document.activeElement]).toEqual([false, home]);
    // 초점이 그 알림 밖이면 건드리지 않는다
    const c = make('지금 보기를 홈 뷰로 정했습니다.', 3500);
    out.focus();
    c.shut();
    expect([c.t.isConnected, document.activeElement]).toEqual([false, out]);
  });

  it('포인터로 누른 알림은 들어오기 전 자리가 글 칸이면 그 칸 대신 home으로(손가락 화면 자판이 다시 뜨지 않게) — 글쇠로 누르면 글 칸, 글 칸이 아니면 그 자리', () => {
    const { out, home, make } = setup();
    const field = h('input', { type: 'text', class: 'tree-filter' });
    document.body.append(field);
    // 누름이 버튼에 초점을 주는 브라우저(Chrome·Firefox — 안드로이드 손가락 포함): pointerdown → 초점 → click
    const a = make('먼저 부품을 고르십시오', 3500);
    field.focus();
    a.close.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    a.close.focus();
    a.close.click();
    expect([a.t.isConnected, document.activeElement]).toEqual([false, home]);
    // 동작 버튼도 같다
    const b = make('보기 링크를 복사했습니다.', 9000);
    field.focus();
    b.act.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    b.act.focus();
    b.act.click();
    expect([b.t.isConnected, document.activeElement]).toEqual([false, home]);
    // 글쇠(Enter·Space — 누름 없음)로 닫으면 글 칸으로(누른 뒤라도 그 알림 안에서 글쇠를 누르면 글쇠 쪽)
    const c = make('부품 단위로 고릅니다.', 3500);
    field.focus();
    c.close.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    c.close.focus();
    c.close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    c.close.click();
    expect([c.t.isConnected, document.activeElement]).toEqual([false, field]);
    // 포인터로 눌러도 들어오기 전 자리가 글 칸이 아니면 그 자리
    const d = make('지금 보기를 홈 뷰로 정했습니다.', 3500);
    out.focus();
    d.close.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    d.close.focus();
    d.close.click();
    expect([d.t.isConnected, document.activeElement]).toEqual([false, out]);
  });

  it('앱(원문): 알림 함수가 닫는 함수를 pushToast에서 받아 닫기·동작 버튼(닫고 실행)·돌려주는 값에 쓰고, 갈 곳이 없으면 3D 보기(문서 전이면 「파일 열기」)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain('const remove = pushToast(this.toasts, t, 3, ms, () => (this.doc ? this.viewer?.canvas : this.startOpen));');
    expect(app).toMatch(/act\?\.addEventListener\('click', \(\) => \{\s*remove\(\);\s*action!\.run\(\);\s*\}\);/);
    expect(app).toContain("close.addEventListener('click', remove);");
    expect(app).not.toContain('const remove = () => t.remove();');
  });
});
