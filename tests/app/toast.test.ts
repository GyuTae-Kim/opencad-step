// @vitest-environment jsdom
/**
 * 알림 칸 한도(셋)에서 빼는 차례(152차 — NC 147차 꼴): `src/app/dom.ts` `pushToast`는 넘치면 닫을 때까지 남기는 안내(data-keep — 144차)를 건너뛰고
 * 가장 오래된 안내(class info)부터, 안내가 없으면 가장 오래된 것부터 뺀다(모두 남길 것이면 맨 앞 — 한도는 늘 지킴).
 * 다시 볼 곳이 없는 오류(그림 저장 실패·문서를 연 채 열기 실패)와 경고(최근 문서·공유 받기·분해 손질 파일 등 — 경고 23자리 가운데 18자리가 알림 상자뿐)가
 * 뒤이은 안내(I 글쇠를 누를 때마다 뜨는 「먼저 부품을 고르십시오」 등)에 밀려 제 시간 전에 빠지지 않는다.
 * 알림은 app.ts `toast`와 같은 꼴(class `toast <종류>`, 오류 role=alert·그 밖 status, keep이면 data-keep)로 실제 `h`가 만든다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    expect(app).toContain('pushToast(this.toasts, t, 3);');
  });
});
