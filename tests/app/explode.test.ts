// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { basisFromAngles } from 'opencad-viewer3d/camera';
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

  it('방향 단추(사방·X·Y·Z | 화면 가로·세로·가로세로 — 한 라디오 묶음)를 누르면 알리고, 단추·단계 글이 방향을 따르며, 계획은 방향마다 한 번', () => {
    const axes: ExplodeAxis[] = [];
    const c = new ExplodeControls(
      () => {},
      (a) => axes.push(a),
    );
    const [seg, group, stage] = c.els as [HTMLElement, HTMLElement, HTMLElement];
    const btns = [...group.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns.map((b) => b.textContent)).toEqual(['사방', 'X', 'Y', 'Z', '가로', '세로', '가로세로']);
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(btns.every((b) => b.getAttribute('role') === 'radio' && b.type === 'button')).toBe(true);
    // 장면 축과 화면 방향은 두 칸(휴대폰 폭에서는 화면 칸이 다음 줄로), 화면 단추는 읽는 이름이 "화면 가로"처럼 온전하다
    const segs = [...group.querySelectorAll('.seg')];
    expect(segs.map((s) => s.querySelectorAll('button').length)).toEqual([4, 3]);
    expect(btns.slice(4).map((b) => b.getAttribute('aria-label'))).toEqual(['화면 가로', '화면 세로', '화면 평면']);
    expect(group.querySelector('.explode-screen-label')!.getAttribute('aria-hidden')).toBe('true');
    btns[3]!.click();
    btns[1]!.click();
    btns[5]!.click();
    btns[6]!.click();
    expect(axes).toEqual(['z', 'x', 'sy', 'sp']);
    const d = doc(0.9);
    c.sync(d, 'step', true);
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false']);
    expect(stage.textContent).toBe('단계 3/3');
    // X로만: 그 축으로 움직이는 단계가 둘(S3 안은 X로 움직이지 않는다)
    c.sync(d, 'step', true, 'x');
    expect(btns.map((b) => b.classList.contains('on'))).toEqual([false, true, false, false, false, false, false]);
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false']);
    expect(stage.textContent).toBe('단계 2/2');
    // 화면 가로(앞에서 본 카메라 — 오른쪽 = +X)는 X와 같은 단계
    c.sync(d, 'step', true, 'sx', { yaw: 0, pitch: 0 });
    expect(btns.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false', 'true', 'false', 'false']);
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
    const label = group.querySelector('.explode-screen-label')!.textContent!;
    for (const lang of ['en', 'ja', 'zh-CN', 'de'])
      for (const text of [...btns.flatMap((b) => [b.textContent!, b.title, b.getAttribute('aria-label') ?? '']), group.getAttribute('aria-label')!, label]) expect(translate(text, lang), `${lang} ${text}`).not.toMatch(/[가-힣]/);
    expect(seg.getAttribute('aria-label')).not.toBe(group.getAttribute('aria-label'));
  });

  it('화면 방향 계획은 카메라 각마다(같은 각이면 한 번), 각을 바꾸면 앞 각의 계획은 버린다', () => {
    const c = new ExplodeControls(() => {});
    const d = doc(1);
    const a = { yaw: 0.6, pitch: 0.3 };
    const p = c.plan(d, 'step', 'sx', a);
    expect(p.view).toEqual(a);
    expect(c.plan(d, 'step', 'sx', { ...a })).toBe(p);
    const q = c.plan(d, 'step', 'sx', { yaw: 1.2, pitch: 0.3 });
    expect(q).not.toBe(p);
    expect(c.plan(d, 'step', 'sx', a)).not.toBe(p);
    // 다른 화면 방향·방식은 따로
    expect(c.plan(d, 'step', 'sy', a)).not.toBe(c.plan(d, 'step', 'sx', a));
    expect(c.moves(d, 'step', 1, 'sx', a)).toEqual(explodeMoves(explodePlan(items, [asm()], 'step', 'sx', { view: a }), 1));
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

/** 축 나란한 상자(가운데 c, 세 축 반폭 r — 범위 상자만 쓰므로 삼각형 하나로 두 구석을 잡는다) */
const cuboid = (id: string, c: [number, number, number], r: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2], c[0] + r[0], c[1] - r[1], c[2] - r[2]]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const flat = (name: string, ids: string[]): ProductNode => N(name, [], ids.map((id) => N(id, [id])));
/** 100%에서 범위 상자가 겹친 쌍 수(서로 다른 묶음끼리, 겹친 부피가 있는 것만) */
function overlappingPairs(list: Mesh3d[], plan: ExplodePlan): number {
  const mv = explodeMoves(plan, 1);
  const boxes = list.map((m) => {
    const d = mv.get(m.id) ?? [0, 0, 0];
    const p = m.positions;
    const lo = [0, 1, 2].map((k) => Math.min(p[k]!, p[3 + k]!, p[6 + k]!) + d[k]!);
    const hi = [0, 1, 2].map((k) => Math.max(p[k]!, p[3 + k]!, p[6 + k]!) + d[k]!);
    return { lo, hi };
  });
  let n = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) if ([0, 1, 2].every((k) => Math.min(boxes[i]!.hi[k]!, boxes[j]!.hi[k]!) - Math.max(boxes[i]!.lo[k]!, boxes[j]!.lo[k]!) > 1e-9)) n++;
  return n;
}

describe('분해 보기: 화면 방향(보는 방향에 수직)', () => {
  const free = explodePlan(items, [asm()], 'step');
  const front = { yaw: 0, pitch: 0 };

  it('앞에서 본 카메라(오른쪽 +X, 위 +Z): 화면 가로 = X, 화면 세로 = Z, 화면 평면 = 사방에서 보는 방향(Y) 성분을 뺀 것', () => {
    for (const mode of ['step', 'all'] as const) {
      const pairs: [ExplodeAxis, ExplodeAxis][] = [
        ['sx', 'x'],
        ['sy', 'z'],
      ];
      for (const [s, w] of pairs) {
        const a = explodePlan(items, [asm()], mode, s, { view: front });
        const b = explodePlan(items, [asm()], mode, w);
        expect(a.levels, `${mode} ${s}`).toBe(b.levels);
        for (const t of [0.3, 0.7, 1]) for (const m of items) expect(at(a, t, m.id), `${mode} ${s} ${t} ${m.id}`).toEqual(at(b, t, m.id));
      }
      const sp = explodePlan(items, [asm()], mode, 'sp', { view: front });
      const f = explodePlan(items, [asm()], mode);
      for (const m of items) expect(at(sp, 1, m.id), `${mode} sp ${m.id}`).toEqual(at(f, 1, m.id).map((x, i) => (i === 1 ? 0 : x)));
    }
    // Y로만 움직이는 S3 안 단계는 화면 평면(앞에서 본 XZ)에서 건너뛴다
    expect(explodePlan(items, [asm()], 'step', 'sp', { view: front }).levels).toBe(2);
  });

  it('기운 카메라: 화면 가로 이동은 카메라 오른쪽과 나란하고 크기는 사방 이동의 오른쪽 성분, 화면 평면 이동은 보는 방향 성분이 0', () => {
    const view = { yaw: 0.6, pitch: 0.35 };
    const b = basisFromAngles(view.yaw, view.pitch);
    const dotv = (p: readonly number[], q: readonly number[]) => p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
    const sx = explodePlan(items, [asm()], 'step', 'sx', { view, stack: false });
    const sy = explodePlan(items, [asm()], 'step', 'sy', { view, stack: false });
    const sp = explodePlan(items, [asm()], 'step', 'sp', { view, stack: false });
    expect(sx.view).toEqual(view);
    for (const m of items) {
      const f = at(free, 1, m.id);
      for (const [p, v] of [
        [sx, b.right],
        [sy, b.up],
      ] as const) {
        const g = at(p, 1, m.id);
        const want = v.map((x) => x * dotv(f, v));
        for (let k = 0; k < 3; k++) expect(g[k]!).toBeCloseTo(want[k]!, 6);
      }
      const g = at(sp, 1, m.id);
      expect(dotv(g, b.back)).toBeCloseTo(0, 6);
      for (let k = 0; k < 3; k++) expect(g[k]!).toBeCloseTo(f[k]! - b.back[k]! * dotv(f, b.back), 6);
    }
    // 각을 주지 않으면 앞에서 본 각, 같은 각이면 같은 계획
    expect(explodePlan(items, [asm()], 'step', 'sx')).toEqual(explodePlan(items, [asm()], 'step', 'sx', { view: front }));
    expect(explodePlan(items, [asm()], 'step', 'sx', { view })).toEqual(explodePlan(items, [asm()], 'step', 'sx', { view: { ...view } }));
    // 장면 축·사방 계획에는 각이 없다
    expect('view' in explodePlan(items, [asm()], 'step', 'x', { view })).toBe(false);
  });

  it('화면 방향으로 부모 가운데와 같은 자리면 제자리(반올림 찌꺼기로 조금 움직이지 않는다)', () => {
    // 위에서 본 카메라(pitch 90°)의 화면 위는 +Y에 아주 작은 Z가 섞인다 — Z로만 쌓인 두 상자는 화면 세로로 움직이지 않는다
    const tower = [cuboid('lo', [0, 0, 0], [1, 1, 1]), cuboid('hi', [0, 0, 6], [1, 1, 1])];
    const p = explodePlan(tower, [flat('T', ['lo', 'hi'])], 'step', 'sy', { view: { yaw: 0, pitch: Math.PI / 2 } });
    expect(Math.abs(basisFromAngles(0, Math.PI / 2).up[2])).toBeGreaterThan(0);
    expect(p.levels).toBe(0);
    expect(explodeMoves(p, 1).size).toBe(0);
  });
});

describe('분해 보기: 축 하나로 벌릴 때 같은 자리에 겹친 부품 차례로 떼기', () => {
  // 같은 축(Z) 위 가운데가 같은 바깥 고리·안쪽 허브·긴 볼트와 옆으로 떨어진 부품(수직 면이 겹치지 않는다)
  const ring = cuboid('ring', [0, 0, 0], [5, 5, 1]);
  const hub = cuboid('hub', [0, 0, 0], [2, 2, 1]);
  const bolt = cuboid('bolt', [0, 0, 0], [0.5, 0.5, 3]);
  const side = cuboid('side', [20, 0, 0], [1, 1, 1]);
  const coax = [ring, hub, bolt, side];
  const tree = [flat('A', ['ring', 'hub', 'bolt', 'side'])];

  it('부모 가운데에 겹친 묶음: 수직 면이 가장 넓은 고리는 제자리, 허브·볼트는 넓이 차례로 +·− 번갈아 100%에서 겹치지 않게', () => {
    for (const mode of ['step', 'all'] as const) {
      const before = explodePlan(coax, tree, mode, 'z', { stack: false });
      const p = explodePlan(coax, tree, mode, 'z');
      // 떼기 전에는 Z로 모두 같은 자리라 아무것도 움직이지 않는다(31차)
      expect(before.levels).toBe(0);
      expect(p.levels).toBe(1);
      expect(p.stacked).toBe(2);
      // 허브: 고리 위 끝(1)에서 틈 (1 + 1)/4 = 0.5를 두고 반폭 1 → 가운데 2.5. 볼트: 고리 아래 끝(−1)에서 틈 (1 + 3)/4 = 1, 반폭 3 → −5
      expect(at(p, 1, 'hub')).toEqual([0, 0, 2.5]);
      expect(at(p, 1, 'bolt')).toEqual([0, 0, -5]);
      expect(explodeMoves(p, 1).has('ring')).toBe(false);
      expect(explodeMoves(p, 1).has('side')).toBe(false);
      expect(at(p, 0.5, 'hub')).toEqual([0, 0, 1.25]);
      // 100%에서 범위 상자가 겹친 쌍: 셋(고리·허브·볼트끼리) → 0
      expect(overlappingPairs(coax, before)).toBe(3);
      expect(overlappingPairs(coax, p)).toBe(0);
    }
  });

  it('부모 가운데에서 떨어진 묶음은 움직이는 쪽(바깥)으로만 늘어놓는다 — 같은 자리 와셔 둘', () => {
    const plate = cuboid('plate', [0, 0, 0], [10, 10, 1]);
    const w1 = cuboid('w1', [0, 0, 10], [2, 2, 0.5]);
    const w2 = cuboid('w2', [0, 0, 10], [2, 2, 0.5]);
    const p = explodePlan([plate, w1, w2], [flat('A', ['plate', 'w1', 'w2'])], 'all', 'z');
    // 조립 가운데 z = (−1 + 10.5)/2 = 4.75 → 와셔는 둘 다 +5.25 × 1.5 = 7.875. 앞 와셔는 그대로, 뒤 와셔는 그 위로 틈 0.25를 두고
    expect(at(p, 1, 'w1')).toEqual([0, 0, 7.875]);
    expect(at(p, 1, 'w2')).toEqual([0, 0, 9.125]);
    expect(at(p, 1, 'plate')).toEqual([0, 0, -4.75 * k]);
    expect(p.stacked).toBe(1);
    expect(overlappingPairs([plate, w1, w2], explodePlan([plate, w1, w2], [flat('A', ['plate', 'w1', 'w2'])], 'all', 'z', { stack: false }))).toBe(1);
    expect(overlappingPairs([plate, w1, w2], p)).toBe(0);
  });

  it('조립 단계별과 어긋나지 않는다: 하위 조립(같은 자리 와셔 둘)은 첫 단계에 통째로, 와셔끼리는 둘째 단계에 뗀다', () => {
    const plate = cuboid('plate', [0, 0, 0], [10, 10, 1]);
    const w1 = cuboid('w1', [0, 0, 10], [2, 2, 0.5]);
    const w2 = cuboid('w2', [0, 0, 10], [2, 2, 0.5]);
    const t = [N('A', [], [N('plate', ['plate']), flat('W', ['w1', 'w2'])])];
    const before = explodePlan([plate, w1, w2], t, 'step', 'z', { stack: false });
    const p = explodePlan([plate, w1, w2], t, 'step', 'z');
    expect(before.levels).toBe(1);
    expect(p.levels).toBe(2);
    // 첫 단계 끝(50%): 하위 조립 W가 통째로(와셔 둘이 함께) 7.875
    expect(at(p, 0.5, 'w1')).toEqual([0, 0, 7.875]);
    expect(at(p, 0.5, 'w2')).toEqual(at(p, 0.5, 'w1'));
    expect(at(p, 0.5, 'plate')).toEqual(at(before, 1, 'plate'));
    // 둘째 단계(100%): W 가운데에 있으니 뒤 와셔가 + 쪽으로 반폭 합의 ¼ 띄워(가운데 차 1.25)
    expect(at(p, 1, 'w1')).toEqual([0, 0, 7.875]);
    expect(at(p, 1, 'w2')).toEqual([0, 0, 9.125]);
    expect(explodeStage(p, 0.75)).toBe(2);
  });

  it('묶음 밖 형제도 피한다: 고리 바로 위(100%)에 놓인 얇은 판을 건너 허브를 그 위 비는 자리에', () => {
    // 판 P·Q는 고리 위·아래(가운데 ±1.25, 반폭 0.25) — 고리와 같은 자리가 아니라 묶음 밖. 100%에서 P는 z 2.875~3.375
    const list = [ring, hub, cuboid('P', [0, 0, 1.25], [1, 1, 0.25]), cuboid('Q', [0, 0, -1.25], [1, 1, 0.25])];
    const p = explodePlan(list, [flat('A', list.map((m) => m.id))], 'all', 'z');
    expect(p.stacked).toBe(1);
    // 고리 끝(2.5)이 아니라 P를 건넌 자리: 3.125 + 0.25 + 틈 (0.25 + 1)/4 + 반폭 1 = 4.6875
    expect(at(p, 1, 'hub')).toEqual([0, 0, 4.6875]);
    expect(overlappingPairs(list, p)).toBe(0);
  });

  it('너무 멀리 옮겨야 하면 그대로 둔다: 같은 자리 정육면체 일곱 개는 넷만 ±2.5·±5로(나머지는 (부모 반폭 + 제 반폭) × 2 + 대각선 절반을 넘는다)', () => {
    const cubes = Array.from({ length: 7 }, (_, i) => cuboid(`c${i}`, [0, 0, 0], [1, 1, 1]));
    const p = explodePlan(cubes, [flat('A', cubes.map((m) => m.id))], 'all', 'z');
    expect(p.stacked).toBe(4);
    expect(cubes.map((m) => at(p, 1, m.id)[2])).toEqual([0, 2.5, -2.5, 5, -5, 0, 0]);
  });

  it('떼지 않는 것: 수직 면이 안 겹치거나 축 위 가운데가 다른 것(볼트 끝 와셔), 사방·화면 평면, stack: false', () => {
    // 볼트(반폭 3) 위 끝 가까이의 와셔(가운데 2.5, 반폭 0.5) — 축 위 가운데 차 2.5가 작은 반폭 0.5보다 크다
    const washer = cuboid('washer', [0, 0, 2.5], [1, 1, 0.5]);
    const p = explodePlan([bolt, washer], [flat('A', ['bolt', 'washer'])], 'all', 'z');
    expect(p.stacked).toBe(0);
    expect(explodePlan(coax, tree, 'all').stacked).toBe(0);
    expect(explodePlan(coax, tree, 'all', 'sp', { view: { yaw: 0, pitch: Math.PI / 2 } }).stacked).toBe(0);
    expect(explodePlan(coax, tree, 'all', 'z', { stack: false }).stacked).toBe(0);
    // 31차 축 분해 그대로(합성 조립의 X·Y·Z는 떼기 전·후가 같다)
    for (const axis of ['x', 'y', 'z'] as const) expect(explodePlan(items, [asm()], 'step', axis)).toEqual(explodePlan(items, [asm()], 'step', axis, { stack: false }));
  });

  it('화면 가로(앞에서 본 카메라)로 X축에 꿴 묶음도 같은 차례로 뗀다', () => {
    const rx = cuboid('ring', [0, 0, 0], [1, 5, 5]);
    const hx = cuboid('hub', [0, 0, 0], [1, 2, 2]);
    const bx = cuboid('bolt', [0, 0, 0], [3, 0.5, 0.5]);
    const list = [rx, hx, bx, cuboid('side', [0, 20, 0], [1, 1, 1])];
    const x = explodePlan(list, tree, 'all', 'x');
    const s = explodePlan(list, tree, 'all', 'sx', { view: { yaw: 0, pitch: 0 } });
    expect(x.stacked).toBe(2);
    expect(s.stacked).toBe(2);
    for (const m of list) expect(at(s, 1, m.id)).toEqual(at(x, 1, m.id));
    expect(at(x, 1, 'hub')).toEqual([2.5, 0, 0]);
  });

  it('같은 자리 부품 3,000개(한꺼번에·Z — 모두 같은 높이)도 계획이 가볍다', () => {
    const big: Mesh3d[] = [];
    for (let i = 0; i < 3000; i++) big.push(cuboid(`q${i}`, [(i % 60) * 2.5, Math.floor(i / 60) * 2.5, 0], [1, 1, 1]));
    // 같은 자리에 겹친 열 쌍(나머지는 옆으로 떨어져 수직 면이 겹치지 않는다)
    for (let i = 0; i < 10; i++) big.push(cuboid(`dup${i}`, [i * 2.5, 0, 0], [1, 1, 1]));
    const t0 = performance.now();
    const p = explodePlan(big, [flat('top', big.map((m) => m.id))], 'all', 'z');
    const t1 = performance.now();
    expect(p.stacked).toBe(10);
    // 기계 부하를 감안한 넉넉한 한도(보통 수십 ms)
    expect(t1 - t0).toBeLessThan(1500);
  });
});
