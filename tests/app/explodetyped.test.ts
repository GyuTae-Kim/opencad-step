// @vitest-environment jsdom
// 43차 분해 손질 거리 쳐 넣기(순수 + 막대 거리 칸): 쳐 넣은 글 읽기(수·부호·단위·목록·쉼표 소수 언어), 끄는 길 위 세계 이동(끈 방향 거리·화면 평면 두 성분·사방 세 성분),
// 칸에 보일 수, 막 끈 되돌리기 단계 고치기(같은 단계 — 되돌리면 끌기 전, 제자리면 단계를 지운다), 분해 막대의 거리 칸(보이기·Enter·떠나기·Esc·글쇠로 들어가기)
import { describe, expect, it } from 'vitest';
import { basisFromAngles } from 'opencad-viewer3d/camera';
import { ExplodeControls, type DistField, type DistState } from '../../src/app/explodebar';
import { ExplodeTweaks, parseTypedLengths, plainLength, typedDelta, type DragConstraint } from '../../src/app/explodetweak';
import { translate } from '../../site/i18n.mjs';

const MM = { comma: false, factor: 1, sceneMm: 1 };

describe('쳐 넣은 거리 읽기(parseTypedLengths)', () => {
  it('수 하나: 부호(+·-·−)·소수점·앞뒤 빈칸, 단위가 없으면 표시 단위(factor — 장면 단위 1이 표시 단위 몇)', () => {
    expect(parseTypedLengths('25', MM)).toEqual([25]);
    expect(parseTypedLengths(' -12.5 ', MM)).toEqual([-12.5]);
    expect(parseTypedLengths('−3', MM)).toEqual([-3]);
    expect(parseTypedLengths('+.5', MM)).toEqual([0.5]);
    expect(parseTypedLengths('7.', MM)).toEqual([7]);
    // 장면 mm, 표시 인치(factor = 1/25.4): 1 → 25.4 mm
    expect(parseTypedLengths('1', { comma: false, factor: 1 / 25.4, sceneMm: 1 })![0]).toBeCloseTo(25.4, 12);
  });

  it('단위를 붙이면 그 단위(SketchUp 값 상자처럼 표시 단위보다 먼저) — 장면 단위를 모르면 unit', () => {
    expect(parseTypedLengths('25mm', MM)).toEqual([25]);
    expect(parseTypedLengths('2.5 cm', MM)).toEqual([25]);
    expect(parseTypedLengths('0.1m', MM)).toEqual([100]);
    expect(parseTypedLengths('1in', MM)).toEqual([25.4]);
    expect(parseTypedLengths('1"', MM)).toEqual([25.4]);
    expect(parseTypedLengths("2'", MM)).toEqual([609.6]);
    expect(parseTypedLengths('1FT', MM)).toEqual([304.8]);
    // 장면이 인치면 25.4mm = 1
    expect(parseTypedLengths('25.4mm', { comma: false, factor: 1, sceneMm: 25.4 })).toEqual([1]);
    expect(parseTypedLengths('25mm', { comma: false, factor: 1, sceneMm: NaN })).toBe('unit');
    // 단위가 없으면 단위를 몰라도 된다
    expect(parseTypedLengths('25', { comma: false, factor: 1, sceneMm: NaN })).toEqual([25]);
  });

  it('목록: 쌍반점, 점 소수 언어는 쉼표도 — 쉼표 소수 언어(독일어)는 쉼표·점 둘 다 소수점이고 목록은 쌍반점만, 둘레 <>(상대 좌표)는 뗀다', () => {
    expect(parseTypedLengths('3;4', MM)).toEqual([3, 4]);
    expect(parseTypedLengths('3, -4, 5mm', MM)).toEqual([3, -4, 5]);
    expect(parseTypedLengths('<1, 2, 3>', MM)).toEqual([1, 2, 3]);
    const de = { comma: true, factor: 1, sceneMm: 1 };
    expect(parseTypedLengths('12,5', de)).toEqual([12.5]);
    expect(parseTypedLengths('12.5', de)).toEqual([12.5]);
    expect(parseTypedLengths('1,5; -2,25', de)).toEqual([1.5, -2.25]);
    // 점 소수 언어에서 "12,5"는 두 수
    expect(parseTypedLengths('12,5', MM)).toEqual([12, 5]);
  });

  it('꼴이 틀리면 null: 빈 글·글자·[] 절대 좌표·빈 칸 목록·두 소수점·모르는 단위', () => {
    for (const s of ['', '   ', 'abc', '[1,2,3]', '1;', ';2', '1..2', '1.2.3', '5 km', '1e3', '--2', '<1,2', '2 3']) expect(parseTypedLengths(s, MM), s).toBeNull();
  });
});

describe('쳐 넣은 수 → 이번 끌기 이동(typedDelta)', () => {
  const X: DragConstraint = { line: [1, 0, 0] };
  const plane: DragConstraint = { plane: [0, 0, 1] };

  it('축 하나: 그 축 위 끈 쪽으로 그 거리(음수는 반대쪽), 아직 끌지 않았으면 +쪽', () => {
    expect(typedDelta('x', null, X, [-3, 0, 0], [10])).toEqual([-10, 0, 0]);
    expect(typedDelta('x', null, X, [-3, 0, 0], [-10])).toEqual([10, 0, 0]);
    expect(typedDelta('x', null, X, [3, 0, 0], [10])).toEqual([10, 0, 0]);
    expect(typedDelta('x', null, X, [0, 0, 0], [10])).toEqual([10, 0, 0]);
    // 화면 가로(계획 카메라 오른쪽)
    const v = { yaw: 0.6, pitch: 0.3 };
    const r = basisFromAngles(v.yaw, v.pitch).right;
    const d = typedDelta('sx', v, { line: r }, r.map((k) => -2 * k), [4]) as number[];
    d.forEach((k, i) => expect(k).toBeCloseTo(-4 * r[i]!, 14));
  });

  it('면(사방·화면 평면): 수 하나는 지금 끈 방향으로 그 거리, 아직 움직이지 않았으면 dir', () => {
    expect(typedDelta('free', null, plane, [3, 4, 0], [10])).toEqual([6, 8, 0]);
    expect(typedDelta('free', null, plane, [3, 4, 0], [-5])).toEqual([-3, -4, 0]);
    expect(typedDelta('sp', null, plane, [0, 0, 0], [5])).toBe('dir');
  });

  it('화면 평면은 가로·세로 두 수(계획 카메라 각), 사방은 ΔX·ΔY·ΔZ 세 수 — 다른 개수는 count, 끌기 한도보다 멀면 far', () => {
    const v = { yaw: -0.4, pitch: 0.7 };
    const b = basisFromAngles(v.yaw, v.pitch);
    const d = typedDelta('sp', v, { plane: b.back }, [0, 0, 0], [3, -2]) as number[];
    d.forEach((k, i) => expect(k).toBeCloseTo(3 * b.right[i]! - 2 * b.up[i]!, 14));
    expect(typedDelta('free', null, plane, [0, 0, 0], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(typedDelta('free', null, plane, [1, 0, 0], [1, 2])).toBe('count');
    expect(typedDelta('sp', v, { plane: b.back }, [1, 0, 0], [1, 2, 3])).toBe('count');
    expect(typedDelta('x', null, X, [1, 0, 0], [1, 2])).toBe('count');
    expect(typedDelta('x', null, X, [1, 0, 0], [])).toBe('count');
    expect(typedDelta('x', null, X, [1, 0, 0], [101], 100)).toBe('far');
    expect(typedDelta('x', null, X, [1, 0, 0], [100], 100)).toEqual([100, 0, 0]);
  });

  it('칸에 보일 수(plainLength): 표시 단위·소수 자리, 언어와 상관없이 점 소수, −0 없음', () => {
    expect(plainLength(12.34567, { factor: 1, decimals: 3 })).toBe('12.346');
    expect(plainLength(25.4, { factor: 1 / 25.4, decimals: 3 })).toBe('1');
    expect(plainLength(1e-9, { factor: 1, decimals: 3 })).toBe('0');
    expect(plainLength(1234.5, {})).toBe('1234.5');
  });
});

describe('막 끈 되돌리기 단계 고치기(ExplodeTweaks.lastStep·amend)', () => {
  it('끌기 한 번의 단계를 고치면 같은 단계(되돌리면 끌기 전 값·다시 하면 고친 값), 다른 방향·새 손질·되돌린 뒤에는 고치지 않는다', () => {
    const t = new ExplodeTweaks();
    t.replace('x', [['0/2', [5]]]);
    const before = t.lastStep('x');
    expect(before).not.toBeNull();
    t.begin('x');
    t.put('0/1', [3]);
    t.put('0/2', [7]);
    // 끄는 중(열린 단계)에는 없다
    expect(t.lastStep('x')).toBeNull();
    expect(t.commit()).toBe(true);
    const mark = t.lastStep('x')!;
    expect(mark).not.toBe(before);
    expect(t.amend('x', mark, [['0/1', [10]], ['0/2', [12]]])).toBe(true);
    expect([...t.moves('x')]).toEqual([
      ['0/2', [12]],
      ['0/1', [10]],
    ]);
    // 같은 단계: 되돌리기 한 번에 끌기 전(0/1 없음, 0/2 = 5)
    expect(t.lastStep('x')).toBe(mark);
    expect(t.undo('x')).toBe(true);
    expect([...t.moves('x')]).toEqual([['0/2', [5]]]);
    // 되돌린 뒤(다시 할 단계가 있다)는 고치지 않는다
    expect(t.lastStep('x')).toBeNull();
    expect(t.amend('x', mark, [['0/1', [1]]])).toBe(false);
    expect(t.redo('x')).toBe(true);
    expect([...t.moves('x')].sort()).toEqual([
      ['0/1', [10]],
      ['0/2', [12]],
    ]);
    // 다른 방향·다른 표지
    expect(t.amend('y', mark, [['0/1', [1]]])).toBe(false);
    expect(t.amend('x', {}, [['0/1', [1]]])).toBe(false);
    // 새 손질이 끼면 앞 단계는 고치지 않는다
    t.begin('x');
    t.put('0/3', [1]);
    t.commit();
    expect(t.amend('x', mark, [['0/1', [1]]])).toBe(false);
  });

  it('단계에 없던 낱말을 고치면 고치기 전 값을 단계에 더하고, 끌기 전 값으로 돌아온 낱말은 빼며 모두 돌아오면 단계를 지운다', () => {
    const t = new ExplodeTweaks();
    t.begin('free');
    t.put('0/1', [1, 2, 3]);
    t.commit();
    const mark = t.lastStep('free')!;
    expect(t.amend('free', mark, [['0/4', [0, 0, 9]]])).toBe(true);
    expect(t.undo('free')).toBe(true);
    expect(t.count('free')).toBe(0);
    expect(t.redo('free')).toBe(true);
    const again = t.lastStep('free')!;
    // 0/1을 끌기 전(없음 — 0)으로, 0/4도 없애면 바뀐 것이 없어 단계가 사라진다
    expect(t.amend('free', again, [['0/1', [0, 0, 0]], ['0/4', null]])).toBe(true);
    expect(t.count('free')).toBe(0);
    expect(t.canUndo('free')).toBe(false);
    expect(t.lastStep('free')).toBeNull();
  });
});

describe('분해 막대 거리 칸(ExplodeControls)', () => {
  const st = (value: string, axis: DistState['axis'] = 'x', unit = 'mm'): DistState => ({ value, unit, axis, live: false });
  function bar(ok = true) {
    const sent: string[] = [];
    let field: DistField | null = null;
    const c = new ExplodeControls(
      () => {},
      () => {},
      {
        // 손질 도구처럼: 걸면 새 거리를 칸에 알린다(칸에 초점이 있는 동안)
        typed: (s) => {
          sent.push(s);
          if (ok) field?.show(st(s));
          return ok;
        },
        bind: (f) => (field = f),
      },
    );
    document.body.append(...c.els);
    const tw = c.els[3]!;
    const label = tw.querySelector<HTMLElement>('.explode-distance')!;
    const input = label.querySelector<HTMLInputElement>('input')!;
    const unit = label.querySelector<HTMLElement>('.explode-unit')!;
    return { c, sent, field: () => field!, label, input, unit, tw };
  }
  const key = (el: HTMLElement, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  it('끄는 동안·막 끈 뒤에만 손질 칸 끝에 "거리 [수] 단위"(sync의 dist·손질 도구 show), 막대가 닫혔으면 숨긴다', () => {
    const b = bar();
    expect(b.label.hidden).toBe(true);
    expect(b.label.parentElement).toBe(b.tw);
    expect(b.input.getAttribute('inputmode')).toBe('decimal');
    expect(b.label.textContent).toBe('거리');
    b.c.sync(null, 'step', true, 'x', null, { on: true, count: 1, undo: true, dist: st('12.5') });
    expect([b.label.hidden, b.input.value, b.unit.textContent, b.unit.hidden]).toEqual([false, '12.5', 'mm', false]);
    expect(b.input.title).toContain('음수는 반대쪽');
    b.c.sync(null, 'step', false, 'x', null, { on: true, count: 1, undo: true, dist: st('12.5') });
    expect(b.label.hidden).toBe(true);
    b.field().show(st('3', 'sp', ''));
    expect([b.label.hidden, b.input.value, b.unit.hidden]).toEqual([false, '3', true]);
    expect(b.input.title).toContain('가로; 세로');
    b.field().show(st('3', 'free'));
    expect(b.input.title).toContain('ΔX; ΔY; ΔZ');
    b.field().show(null);
    expect(b.label.hidden).toBe(true);
    // 숨긴 칸에는 들어가지 않는다
    expect(b.field().seed('2')).toBe(false);
    expect(b.field().focus()).toBe(false);
  });

  it('Enter·칸을 떠나면 쳐 넣은 글을 건다(같은 글은 한 번) — 걸면 칸을 떠나 보일 값, 못 걸면 칸에 남아 글을 고른다. Esc는 칸만(쳐 넣던 것을 버린다)', () => {
    const b = bar();
    b.field().show(st('12.5'));
    // 끄는 동안 숫자 글쇠: 그 글자로 칸에 들어간다
    expect(b.field().seed('2')).toBe(true);
    expect([document.activeElement, b.input.value]).toEqual([b.input, '2']);
    b.input.value = '25';
    // 끄는 동안 도구가 알리는 거리는 칸에 초점이 있는 동안 쳐 넣던 글을 덮지 않는다
    b.field().show({ ...st('13.1'), live: true });
    expect(b.input.value).toBe('25');
    b.field().show(st('12.5'));
    expect(key(b.input, 'Enter').defaultPrevented).toBe(true);
    expect(b.sent).toEqual(['25']);
    expect(document.activeElement).not.toBe(b.input);
    // 같은 글로 다시 떠나도 두 번 걸지 않는다
    b.input.dispatchEvent(new Event('change'));
    expect(b.sent).toEqual(['25']);
    // 막 끈 뒤 Enter: 칸에 들어가 글을 고른다 → 떠나며 바뀐 글은 건다(손가락 숫자 자판에는 Enter가 없다)
    expect(b.field().focus()).toBe(true);
    b.input.value = '30';
    b.input.dispatchEvent(new Event('change'));
    expect(b.sent).toEqual(['25', '30']);
    // Esc: 쳐 넣던 것을 버리고 칸을 떠난다(창 Esc 차례로 넘기지 않는다)
    b.field().show(st('30'));
    b.field().focus();
    b.input.value = '99';
    let bubbled = 0;
    document.body.addEventListener('keydown', () => bubbled++);
    key(b.input, 'Escape');
    expect([b.input.value, document.activeElement === b.input, bubbled]).toEqual(['30', false, 0]);
    expect(b.sent).toEqual(['25', '30']);
  });

  it('못 걸면(읽지 못함 — 도구가 알린다) 칸에 남아 글을 고르고, 떠나면 보일 값으로 되돌린다', () => {
    const b = bar(false);
    b.field().show(st('5'));
    b.field().focus();
    b.input.value = 'x';
    key(b.input, 'Enter');
    expect(b.sent).toEqual(['x']);
    expect(document.activeElement).toBe(b.input);
    expect([b.input.selectionStart, b.input.selectionEnd]).toEqual([0, 1]);
    b.input.blur();
    expect(b.input.value).toBe('5');
  });

  it('새 글(칸 이름·설명·알림)은 네 언어 사전에 있다', () => {
    const b = bar();
    const texts = [
      b.input.getAttribute('aria-label')!,
      '거리',
      '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(음수는 반대쪽)',
      '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(가로; 세로 두 수도 됩니다)',
      '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(ΔX; ΔY; ΔZ 세 수도 됩니다)',
      '거리를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오(음수는 반대쪽, 25mm처럼 단위를 붙여도 됩니다).',
      '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 가로; 세로 두 수를 쳐 넣으십시오.',
      '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 ΔX; ΔY; ΔZ 세 수를 쳐 넣으십시오.',
      '아직 끈 방향이 없어 거리 하나로는 옮기지 못합니다 — 성분으로 쳐 넣으십시오.',
      '너무 멀어 옮기지 않았습니다 — 조립 대각선의 20배까지 옮깁니다.',
      '이 파일에는 길이 단위가 없어 단위를 붙인 거리는 받지 않습니다.',
    ];
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) for (const text of texts) expect(translate(text, lang), `${lang} ${text}`).not.toMatch(/[가-힣]/);
  });
});
