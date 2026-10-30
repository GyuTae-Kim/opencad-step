// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LineSet3d, Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, explodeStage, type ExplodeAxis, type ExplodeMode, type ExplodePlan } from '../../src/app/explode';
import { ExplodeControls } from '../../src/app/explodebar';
import { translate } from '../../site/i18n.mjs';

/** 한 변 2인 상자 그물(가운데 c) */
const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], lineIds?: string[]): ProductNode => ({ name, productId: name, meshIds, children, ...(lineIds ? { lineIds } : {}) });

/**
 * 세 단계 합성 조립 A(범위 x −11~11, y −5~11 → 가운데 (0, 3, 0)):
 * - 하위 조립 S1: 부품 p1(−10, 0)·p2(−6, 0) → 가운데 (−8, 0)
 * - 하위 조립 S2: 부품 p3(6, 0)과 하위 조립 S3(부품 p5(10, 4)·p6(10, −4) → 가운데 (10, 0)) → 가운데 (8, 0)
 * - 부품 p7(0, 10) — 선 형상 w7(같은 자리)을 함께 가진다
 */
const meshes = [box('p1', [-10, 0, 0]), box('p2', [-6, 0, 0]), box('p3', [6, 0, 0]), box('p5', [10, 4, 0]), box('p6', [10, -4, 0]), box('p7', [0, 10, 0])];
const wire: LineSet3d = { id: 'w7', positions: Float32Array.from([-1, 10, 0, 1, 10, 0]), color: [1, 1, 1, 1] };
const items = [...meshes, wire];
const asm = (): ProductNode => N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p5', ['p5']), N('p6', ['p6'])])]), N('p7', ['p7'], [], ['w7'])]);

const at = (plan: ExplodePlan, t: number, id: string) => {
  const v = explodeMoves(plan, t).get(id) ?? [0, 0, 0];
  return v.map((x) => Math.round(x * 1e9) / 1e9 + 0);
};
const k = EXPLODE_SCALE;

describe('분해 보기: 조립 단계별', () => {
  const plan = explodePlan(items, [asm()], 'step');

  it('단계 수는 조립 깊이(하위 조립 S2 안의 S3까지 셋)', () => {
    expect(plan.levels).toBe(3);
    expect([0, 0.2, 1 / 3, 0.34, 0.5, 2 / 3, 0.9, 1].map((t) => explodeStage(plan, t))).toEqual([0, 1, 1, 2, 2, 2, 3, 3]);
  });

  it('첫 단계(0~⅓): 하위 조립이 통째로 조립 가운데에서 멀어진다 — 안의 부품은 함께 움직인다', () => {
    // S1 가운데 (−8, 0) − A 가운데 (0, 3) = (−8, −3)
    expect(at(plan, 1 / 3, 'p1')).toEqual([-8 * k, -3 * k, 0]);
    expect(at(plan, 1 / 3, 'p2')).toEqual(at(plan, 1 / 3, 'p1'));
    // S2(S3 포함) 통째로 (8, −3)
    for (const id of ['p3', 'p5', 'p6']) expect(at(plan, 1 / 3, id)).toEqual([8 * k, -3 * k, 0]);
    // 부품과 그 선 형상은 한 덩어리로 (0, 7)
    expect(at(plan, 1 / 3, 'p7')).toEqual([0, 7 * k, 0]);
    expect(at(plan, 1 / 3, 'w7')).toEqual(at(plan, 1 / 3, 'p7'));
    // 첫 단계 가운데(⅙)는 그 절반
    expect(at(plan, 1 / 6, 'p1')).toEqual([-4 * k, -1.5 * k, 0]);
  });

  it('둘째 단계(⅓~⅔): 하위 조립 안의 부품·하위 조립이 그 하위 조립 가운데에서 — 가장 안쪽 S3는 아직 통째로', () => {
    expect(at(plan, 2 / 3, 'p1')).toEqual([(-8 - 2) * k, -3 * k, 0]);
    expect(at(plan, 2 / 3, 'p2')).toEqual([(-8 + 2) * k, -3 * k, 0]);
    expect(at(plan, 2 / 3, 'p3')).toEqual([(8 - 2) * k, -3 * k, 0]);
    expect(at(plan, 2 / 3, 'p5')).toEqual([(8 + 2) * k, -3 * k, 0]);
    expect(at(plan, 2 / 3, 'p6')).toEqual(at(plan, 2 / 3, 'p5'));
    // 부품 p7은 첫 단계에서 다 갔다
    expect(at(plan, 2 / 3, 'p7')).toEqual(at(plan, 1 / 3, 'p7'));
  });

  it('셋째 단계(⅔~1): S3 안의 부품이 벌어진다. 100%에서는 한꺼번에와 같은 자리(조상 이동의 합 = 부품 가운데 − 조립 가운데)', () => {
    expect(at(plan, 1, 'p5')).toEqual([10 * k, (-3 + 4) * k, 0]);
    expect(at(plan, 1, 'p6')).toEqual([10 * k, (-3 - 4) * k, 0]);
    const all = explodePlan(items, [asm()], 'all');
    expect(all.levels).toBe(1);
    for (const m of items) expect(at(plan, 1, m.id), m.id).toEqual(at(all, 1, m.id));
    // 한꺼번에는 모든 자리가 고르게: 50%면 100%의 절반
    expect(at(all, 0.5, 'p5')).toEqual(at(all, 1, 'p5').map((x) => x / 2));
    // 단계별 50%는 다르다(S3 안은 아직 붙어 있다)
    expect(at(plan, 0.5, 'p5')).toEqual(at(plan, 0.5, 'p6'));
    expect(at(all, 0.5, 'p5')).not.toEqual(at(all, 0.5, 'p6'));
  });

  it('자식이 하나뿐인 마디(감싼 뿌리·부품 하나짜리 하위 조립)는 단계로 치지 않는다', () => {
    const wrapped = explodePlan(items, [N('root', [], [N('wrap', [], [asm()])])], 'step');
    expect(wrapped.levels).toBe(3);
    for (const t of [0.25, 0.5, 0.8, 1]) for (const m of items) expect(at(wrapped, t, m.id)).toEqual(at(plan, t, m.id));
    // S1 안을 부품 하나로 줄이면(하위 조립 S1 = 부품 p1 하나) S1은 잎처럼
    const one = explodePlan([box('p1', [-10, 0, 0]), box('p7', [0, 10, 0])], [N('A', [], [N('S1', [], [N('p1', ['p1'])]), N('p7', ['p7'])])], 'step');
    expect(one.levels).toBe(1);
  });

  it('평평한 조립(단계 하나)은 한꺼번에와 같고, 나무에 없는 묶음은 맨 위 단계에서 하나씩, 빠진 묶음(표현 PMI)은 제자리', () => {
    const flat = [N('A', [], [N('a', ['p1']), N('b', ['p3']), N('c', ['p7'], [], ['w7'])])];
    const f = explodePlan(items.filter((m) => m.id !== 'p2' && m.id !== 'p5' && m.id !== 'p6'), flat, 'step');
    const g = explodePlan(items.filter((m) => m.id !== 'p2' && m.id !== 'p5' && m.id !== 'p6'), flat, 'all');
    expect(f.levels).toBe(1);
    for (const t of [0.3, 1]) for (const id of ['p1', 'p3', 'p7', 'w7']) expect(explodeMoves(f, t).get(id)).toEqual(explodeMoves(g, t).get(id));
    // 묶음 목록에서 뺀 것(표현 PMI처럼)은 나무에 있어도 제자리 — S3는 p5 하나만 남아 잎이 된다
    const o = explodePlan(items.filter((m) => m.id !== 'p6'), [asm()], 'step');
    expect(o.steps.has('p6')).toBe(false);
    expect(explodeMoves(o, 1).has('p6')).toBe(false);
    expect(o.levels).toBe(2);
    // 나무에 없는 묶음은 맨 위 단계에서 조립 A와 나란히 하나씩(그래서 A 안은 한 단계씩 밀린다)
    const free = explodePlan([...items, box('free', [0, -20, 0])], [asm()], 'step');
    expect(free.levels).toBe(4);
    expect(free.steps.get('free')!.slice(0, 1)).toEqual([1]);
    expect(at(free, 0.25, 'p1')).toEqual(at(free, 0.25, 'p7'));
  });

  it('부품 하나·빈 장면·0%는 옮길 것이 없다', () => {
    expect(explodePlan([box('p1', [5, 5, 5])], [N('p', ['p1'])], 'step').levels).toBe(0);
    expect(explodePlan([], [], 'step').levels).toBe(0);
    expect(explodeMoves(plan, 0).size).toBe(0);
    expect(explodeStage({ levels: 0 }, 0.5)).toBe(0);
  });

  it('부품 자리 3,000개(하위 조립 30개 × 100) 계획과 밀대 한 번이 가볍다', () => {
    const big: Mesh3d[] = [];
    const subs: ProductNode[] = [];
    for (let s = 0; s < 30; s++) {
      const kids: ProductNode[] = [];
      for (let i = 0; i < 100; i++) {
        const id = `q${s}-${i}`;
        big.push(box(id, [s * 30 + (i % 10) * 2.5, Math.floor(i / 10) * 2.5, 0]));
        kids.push(N(id, [id]));
      }
      subs.push(N(`sub${s}`, [], kids));
    }
    const t0 = performance.now();
    const p = explodePlan(big, [N('top', [], subs)], 'step');
    const t1 = performance.now();
    const moves = explodeMoves(p, 0.75);
    const t2 = performance.now();
    expect(p.levels).toBe(2);
    expect(moves.size).toBe(3000);
    // 기계 부하를 감안한 넉넉한 한도(보통 계획 수 ms, 밀대 1 ms 안)
    expect(t1 - t0).toBeLessThan(500);
    expect(t2 - t1).toBeLessThan(200);
  });
});

describe('분해 막대 조각: 방식 단추·단계 글·계획 한 번', () => {
  const doc = (t: number, pmi: string[] = []) =>
    ({ scene: { meshes, lines: [wire], units: 'mm' } as unknown as Scene3d, products: [asm()], vis: { pmiIds: new Set(pmi) }, explode: t }) as unknown as StepDoc;

  it('방식 단추(라디오)를 누르면 알리고, 조립 단계별이면 "단계 2/3", 한꺼번에·닫힌 막대면 단계 글을 숨긴다', () => {
    const picked: ExplodeMode[] = [];
    const c = new ExplodeControls((m) => picked.push(m));
    const [seg, , stage] = c.els as [HTMLElement, HTMLElement, HTMLElement];
    const btns = [...seg.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns.map((b) => b.textContent)).toEqual(['단계별', '한꺼번에']);
    btns[1]!.click();
    expect(picked).toEqual(['all']);
    const d = doc(0.5);
    c.sync(d, 'step', true);
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(stage.hidden).toBe(false);
    expect(stage.textContent).toBe('단계 2/3');
    d.explode = 0.9;
    c.sync(d, 'step', true);
    expect(stage.textContent).toBe('단계 3/3');
    c.sync(d, 'all', true);
    expect(btns.map((b) => b.classList.contains('on'))).toEqual([false, true]);
    expect(stage.hidden).toBe(true);
    c.sync(d, 'step', false);
    expect(stage.hidden).toBe(true);
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) {
      for (const text of ['단계 2/3', ...btns.flatMap((b) => [b.textContent!, b.title]), seg.getAttribute('aria-label')!]) expect(translate(text, lang), `${lang} ${text}`).not.toMatch(/[가-힣]/);
    }
  });

  it('계획은 장면·방식마다 한 번(밀대는 곱하기만), 표현 PMI는 제자리', () => {
    const c = new ExplodeControls(() => {});
    const d = doc(0.5, ['w7']);
    const p = c.plan(d, 'step');
    expect(c.plan(d, 'step')).toBe(p);
    expect(c.plan(d, 'all')).not.toBe(p);
    expect(p.steps.has('w7')).toBe(false);
    expect(c.moves(d, 'step', 1).get('p5')).toEqual(explodeMoves(explodePlan(meshes, [asm()], 'step'), 1).get('p5'));
    expect(c.moves(d, 'step', 1).has('w7')).toBe(false);
  });

  it('방향 단추(사방·X·Y·Z — 라디오)를 누르면 알리고, 단추·단계 글이 방향을 따르며, 계획은 방향마다 한 번', () => {
    const axes: ExplodeAxis[] = [];
    const c = new ExplodeControls(
      () => {},
      (a) => axes.push(a),
    );
    const [seg, group, stage] = c.els as [HTMLElement, HTMLElement, HTMLElement];
    const btns = [...group.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns.map((b) => b.textContent)).toEqual(['사방', 'X', 'Y', 'Z']);
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(btns.every((b) => b.getAttribute('role') === 'radio' && b.type === 'button')).toBe(true);
    btns[3]!.click();
    btns[1]!.click();
    expect(axes).toEqual(['z', 'x']);
    const d = doc(0.9);
    c.sync(d, 'step', true);
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(stage.textContent).toBe('단계 3/3');
    // X로만: 그 축으로 움직이는 단계가 둘(S3 안은 X로 움직이지 않는다)
    c.sync(d, 'step', true, 'x');
    expect(btns.map((b) => b.classList.contains('on'))).toEqual([false, true, false, false]);
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false']);
    expect(stage.textContent).toBe('단계 2/2');
    // Z로만: 움직일 것이 없어 단계 글을 숨긴다
    c.sync(d, 'step', true, 'z');
    expect(stage.hidden).toBe(true);
    // 계획: 방식·방향마다 한 번, 방향 없이 부르면 사방
    const px = c.plan(d, 'step', 'x');
    expect(c.plan(d, 'step', 'x')).toBe(px);
    expect(c.plan(d, 'step')).toBe(c.plan(d, 'step', 'free'));
    expect(c.plan(d, 'step')).not.toBe(px);
    expect(c.plan(d, 'all', 'x')).not.toBe(px);
    expect(c.moves(d, 'step', 1, 'x').get('p5')).toEqual([10 * k, 0, 0]);
    // 번역(4개 언어 사전)
    for (const lang of ['en', 'ja', 'zh-CN', 'de'])
      for (const text of [...btns.flatMap((b) => [b.textContent!, b.title]), group.getAttribute('aria-label')!]) expect(translate(text, lang), `${lang} ${text}`).not.toMatch(/[가-힣]/);
    expect(seg.getAttribute('aria-label')).not.toBe(group.getAttribute('aria-label'));
  });
});

describe('분해 보기: 한 축 방향으로만', () => {
  const free = explodePlan(items, [asm()], 'step');
  const only = (v: number[], axis: 'x' | 'y' | 'z') => v.map((x, i) => (i === 'xyz'.indexOf(axis) ? x : 0));

  it('방향을 주지 않으면 사방(예전과 같은 계획)', () => {
    expect(explodePlan(items, [asm()], 'step', 'free')).toEqual(free);
    expect(free.axis).toBe('free');
    expect(explodePlan(items, [asm()], 'all')).toEqual(explodePlan(items, [asm()], 'all', 'free'));
  });

  it('100%에서는 사방 분해 자리의 그 축 성분과 같다(두 방식 모두), 다른 축 성분은 0', () => {
    for (const mode of ['step', 'all'] as const) {
      const f = explodePlan(items, [asm()], mode);
      for (const axis of ['x', 'y', 'z'] as const) {
        const p = explodePlan(items, [asm()], mode, axis);
        for (const m of items) expect(at(p, 1, m.id), `${mode} ${axis} ${m.id}`).toEqual(only(at(f, 1, m.id), axis));
      }
    }
  });

  it('X로만(조립 단계별): 첫 단계에 하위 조립이 X로만 떨어지고 X로 같은 자리인 부품은 제자리, X로 움직이지 않는 셋째 단계는 건너뛴다', () => {
    const p = explodePlan(items, [asm()], 'step', 'x');
    expect(p.levels).toBe(2);
    expect([0.25, 0.5, 0.75, 1].map((t) => explodeStage(p, t))).toEqual([1, 1, 2, 2]);
    // 첫 단계 끝(50%): S1 통째로 −8, S2(S3 포함) +8, p7은 X로 조립 가운데라 제자리
    expect(at(p, 0.5, 'p1')).toEqual([-8 * k, 0, 0]);
    expect(at(p, 0.5, 'p2')).toEqual(at(p, 0.5, 'p1'));
    for (const id of ['p3', 'p5', 'p6']) expect(at(p, 0.5, id)).toEqual([8 * k, 0, 0]);
    expect(explodeMoves(p, 1).has('p7')).toBe(false);
    expect(explodeMoves(p, 1).has('w7')).toBe(false);
    // 둘째 단계 끝(100%): 하위 조립 안이 ±2, S3 안의 p5·p6은 X로 같은 자리라 함께
    expect(at(p, 1, 'p1')).toEqual([-10 * k, 0, 0]);
    expect(at(p, 1, 'p5')).toEqual(at(p, 1, 'p6'));
  });

  it('Y로만(조립 단계별): Y로 움직이는 것이 없는 둘째 단계를 건너뛰어 S3 안이 둘째 구간에 벌어진다', () => {
    const p = explodePlan(items, [asm()], 'step', 'y');
    expect(p.levels).toBe(2);
    expect(at(p, 0.5, 'p7')).toEqual([0, 7 * k, 0]);
    expect(at(p, 0.5, 'w7')).toEqual(at(p, 0.5, 'p7'));
    expect(at(p, 0.5, 'p5')).toEqual([0, -3 * k, 0]);
    expect(at(p, 0.5, 'p6')).toEqual(at(p, 0.5, 'p5'));
    expect(at(p, 0.75, 'p5')).toEqual([0, (-3 + 2) * k, 0]);
    expect(at(p, 1, 'p5')).toEqual([0, (-3 + 4) * k, 0]);
    expect(at(p, 1, 'p6')).toEqual([0, (-3 - 4) * k, 0]);
    // 같은 S1 안의 p1·p2는 Y로 같은 자리라 끝까지 함께
    expect(at(p, 1, 'p1')).toEqual(at(p, 1, 'p2'));
  });

  it('한꺼번에 + 축 하나: 모든 밀대 자리에서 사방 분해의 그 축 성분, 평평한 판(Z로 모두 같은 자리)을 Z로 벌리면 아무것도 움직이지 않는다', () => {
    const f = explodePlan(items, [asm()], 'all');
    const p = explodePlan(items, [asm()], 'all', 'y');
    expect(p.levels).toBe(1);
    for (const t of [0.2, 0.6]) for (const m of items) expect(at(p, t, m.id)).toEqual(only(at(f, t, m.id), 'y'));
    const z = explodePlan(items, [asm()], 'step', 'z');
    expect(z.levels).toBe(0);
    expect(explodeMoves(z, 1).size).toBe(0);
    expect(explodeStage(z, 0.7)).toBe(0);
  });

  it('방향을 바꿨다 사방으로 되돌리면 같은 이동(계획은 방향마다 따로라 앞 방향이 남지 않는다)', () => {
    const before = explodeMoves(explodePlan(items, [asm()], 'step'), 0.6);
    explodeMoves(explodePlan(items, [asm()], 'step', 'z'), 0.6);
    expect(explodeMoves(explodePlan(items, [asm()], 'step', 'free'), 0.6)).toEqual(before);
  });
});
