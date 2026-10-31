// 분해 손질(35차): 계획의 단위 낱말·단계, 덧이동을 더한 이동, 방향마다 손질·되돌리기, 저장 꼴, 보기 링크 꼴 왕복·옛 링크, 끄는 길·끌 단위
// 38차: 다시 하기(방향마다, 새 손질이면 비움, 모두 되돌리기 뒤), 끄는 동안 옮긴 거리 글과 그 자리
import { describe, expect, it } from 'vitest';
import { basisFromAngles, computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { LineSet3d, Mesh3d } from 'opencad-viewer3d/types';
import { Fmt } from '../../src/app/display';
import type { ProductNode } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, type ExplodeAxis, type ExplodePlan } from '../../src/app/explode';
import { measureLabelLines } from '../../src/app/measure';
import {
  canonicalTweaks,
  decodeTweakLink,
  DRAG_LABEL_LIFT,
  DRAG_MIN_FRACTION,
  dragConstraint,
  dragDelta,
  dragDistanceLines,
  dragLabelSpot,
  dragUnits,
  encodeTweakLink,
  ExplodeTweaks,
  TWEAK_LINK_MAX,
  TWEAK_UNDO_MAX,
  tweakDims,
  tweakQuantum,
  tweakWorld,
  worldComps,
} from '../../src/app/explodetweak';
import { decodeViewLink, encodeViewLink } from '../../src/app/viewlink';

/** 한 변 2인 상자 그물(가운데 c) */
const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], lineIds?: string[]): ProductNode => ({ name, productId: name, meshIds, children, ...(lineIds ? { lineIds } : {}) });

/**
 * explode.test.ts와 같은 세 단계 합성 조립 A(가운데 (0, 3, 0)): S1(p1·p2), S2(p3, S3(p5·p6)), p7(선 형상 w7 함께).
 * 나무 자리: A = 0, S1 = 0/0, p1 = 0/0/0, p2 = 0/0/1, S2 = 0/1, p3 = 0/1/0, S3 = 0/1/1, p5 = 0/1/1/0, p6 = 0/1/1/1, p7 = 0/2
 */
const meshes = [box('p1', [-10, 0, 0]), box('p2', [-6, 0, 0]), box('p3', [6, 0, 0]), box('p5', [10, 4, 0]), box('p6', [10, -4, 0]), box('p7', [0, 10, 0])];
const wire: LineSet3d = { id: 'w7', positions: Float32Array.from([-1, 10, 0, 1, 10, 0]), color: [1, 1, 1, 1] };
const items = [...meshes, wire];
const asm = (): ProductNode => N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p5', ['p5']), N('p6', ['p6'])])]), N('p7', ['p7'], [], ['w7'])]);
const unitOf = (plan: ExplodePlan, id: string) => plan.owner.get(id)!;
const r9 = (v: readonly number[]) => v.map((x) => Math.round(x * 1e9) / 1e9 + 0);
const at = (plan: ExplodePlan, t: number, id: string, tw?: ExplodeTweaks, axis: ExplodeAxis = 'free') => r9(explodeMoves(plan, t, EXPLODE_SCALE, tw?.resolve(plan, axis, plan.view)).get(id) ?? [0, 0, 0]);

describe('분해 계획의 단위 낱말·단계(손질을 걸 자리)', () => {
  it('낱말은 나무 마디 경로, 줄인 마디는 가장 위 마디의 낱말, 부품과 그 선 형상은 한 단위', () => {
    const plan = explodePlan(items, [asm()], 'step');
    expect(unitOf(plan, 'p5').token).toBe('0/1/1/0');
    expect(unitOf(plan, 'p7')).toBe(unitOf(plan, 'w7'));
    expect(unitOf(plan, 'p7').token).toBe('0/2');
    // 부품 마디에 바로 놓인 형상 덩어리(0/2.0)와 마디(0/2)가 같은 단위를 가리킨다
    expect(plan.units.get('0/2.0')).toBe(plan.units.get('0/2'));
    expect(unitOf(plan, 'p5').parent?.token).toBe('0/1/1');
    expect(unitOf(plan, 'p5').parent?.parent?.token).toBe('0/1');
    expect(plan.units.get('0')?.level).toBe(0);
    expect(plan.size).toBeCloseTo(Math.hypot(22, 16, 2), 9);
  });

  it('감싼 뿌리(자식 하나)는 그 아래 조립과 같은 단위 — 낱말은 감싼 뿌리 것, 맨 위 전체는 손질하지 않는다', () => {
    const plan = explodePlan(items, [N('W', [], [asm()])], 'step');
    expect(plan.units.get('0')).toBe(plan.units.get('0/0'));
    expect(plan.units.get('0')!.token).toBe('0');
    expect(plan.units.get('0')!.level).toBe(0);
    expect(unitOf(plan, 'p1').token).toBe('0/0/0/0');
  });

  it('조립 단계별: 단위가 벌어지는 단계, 한꺼번에: 모두 1', () => {
    const step = explodePlan(items, [asm()], 'step');
    expect(['0/0', '0/1', '0/2', '0/0/0', '0/1/0', '0/1/1', '0/1/1/0'].map((k) => step.units.get(k)!.level)).toEqual([1, 1, 1, 2, 2, 2, 3]);
    const all = explodePlan(items, [asm()], 'all');
    expect(['0/0', '0/1', '0/1/1', '0/1/1/0', '0/2'].map((k) => all.units.get(k)!.level)).toEqual([1, 1, 1, 1, 1]);
    expect(all.units.get('0')!.level).toBe(0);
  });

  it('방향을 골라 건너뛴 단계의 단위는 그다음 남은 단계(없으면 마지막 단계)에서', () => {
    // X: S3 안(p5·p6 — X로 같은 자리)의 셋째 단계가 없다 → 마지막(둘째) 단계
    const x = explodePlan(items, [asm()], 'step', 'x');
    expect(x.levels).toBe(2);
    expect(x.units.get('0/1/1/0')!.level).toBe(2);
    // Y: 둘째 단계가 없다(S1·S2 안은 Y로 같은 자리) → 그 단위들은 다음 남은 단계(새 번호 2)
    const y = explodePlan(items, [asm()], 'step', 'y');
    expect(y.levels).toBe(2);
    expect(['0/0/0', '0/1/0', '0/1/1', '0/1/1/0'].map((k) => y.units.get(k)!.level)).toEqual([2, 2, 2, 2]);
  });
});

describe('손질을 더한 이동', () => {
  const plan = explodePlan(items, [asm()], 'step');

  it('손질은 그 단위의 단계 진행만큼(배율 없이) 더하고, 하위 조립 손질은 그 안 부품이 함께 받는다', () => {
    const tw = new ExplodeTweaks();
    tw.begin('free');
    tw.put('0/1', [0, 0, 10]);
    tw.put('0/1/1/0', [0, 0, 4]);
    tw.commit();
    const base = (t: number, id: string) => at(plan, t, id);
    // S2는 첫 단계(0~⅓)
    expect(at(plan, 1 / 6, 'p3', tw)).toEqual(r9([base(1 / 6, 'p3')[0]!, base(1 / 6, 'p3')[1]!, 5]));
    expect(at(plan, 1 / 3, 'p6', tw)).toEqual(r9([base(1 / 3, 'p6')[0]!, base(1 / 3, 'p6')[1]!, 10]));
    // p5는 셋째 단계(⅔~1): 그 전에는 S2 몫만
    expect(at(plan, 2 / 3, 'p5', tw)[2]).toBe(10);
    expect(at(plan, 5 / 6, 'p5', tw)[2]).toBe(12);
    expect(at(plan, 1, 'p5', tw)[2]).toBe(14);
    // 다른 곳은 그대로, 0%는 모두 제자리
    expect(at(plan, 1, 'p1', tw)).toEqual(base(1, 'p1'));
    expect(explodeMoves(plan, 0, EXPLODE_SCALE, tw.resolve(plan, 'free', undefined)).size).toBe(0);
  });

  it('한꺼번에는 밀대 그대로, 옮길 것이 없는 계획(부품 하나)도 손질은 밀대와 함께', () => {
    const all = explodePlan(items, [asm()], 'all');
    const tw = new ExplodeTweaks();
    tw.replace('free', [['0/1', [0, 0, 8]]]);
    expect(at(all, 0.25, 'p5', tw)[2]).toBe(2);
    const one = explodePlan([box('a', [0, 0, 0])], [N('R', [], [N('a', ['a'])])], 'step');
    expect(one.levels).toBe(0);
    expect(one.units.get('0')!.level).toBe(0);
    const solo = explodePlan([box('a', [0, 0, 0]), box('b', [0, 0, 0])], [N('R', [], [N('a', ['a']), N('b', ['b'])])], 'step');
    expect(solo.levels).toBe(0);
    const tw2 = new ExplodeTweaks();
    tw2.replace('free', [['0/1', [3, 0, 0]]]);
    expect(at(solo, 0.5, 'b', tw2)).toEqual([1.5, 0, 0]);
  });

  it('장면 축·화면 방향의 성분 → 세계 이동, 세계 이동 → 성분(그 방향 자유도에 비춘 것)', () => {
    const v = { yaw: 0.6, pitch: 0.3 };
    const b = basisFromAngles(v.yaw, v.pitch);
    expect(tweakWorld('y', null, [2])).toEqual([0, 2, 0]);
    expect(r9(tweakWorld('sx', v, [2]))).toEqual(r9(b.right.map((x) => x * 2)));
    expect(r9(tweakWorld('sp', v, [1, -2]))).toEqual(r9(b.right.map((x, i) => x - 2 * b.up[i]!)));
    for (const a of ['free', 'x', 'y', 'z', 'sx', 'sy', 'sp'] as ExplodeAxis[]) {
      const c = worldComps(a, v, tweakWorld(a, v, [1.5, -0.5, 2].slice(0, tweakDims(a))));
      expect(r9(c), a).toEqual(r9([1.5, -0.5, 2].slice(0, tweakDims(a))));
    }
    // 보는 방향(뒤) 성분은 화면 방향 성분에 들지 않는다
    expect(r9(worldComps('sp', v, b.back))).toEqual([0, 0]);
  });
});

describe('방향마다 손질·되돌리기·저장 꼴', () => {
  it('끌기 한 번(여러 단위)이 한 단계, 취소는 앞 값으로, 바뀐 것이 없으면 단계를 남기지 않는다', () => {
    const tw = new ExplodeTweaks();
    tw.begin('z');
    tw.put('0/1', [4]);
    tw.put('0/0', [-2]);
    expect(tw.editing).toBe(true);
    expect(tw.commit()).toBe(true);
    expect([...tw.moves('z')]).toEqual([['0/1', [4]], ['0/0', [-2]]]);
    tw.begin('z');
    tw.put('0/1', [9]);
    tw.cancel();
    expect(tw.moves('z').get('0/1')).toEqual([4]);
    tw.begin('z');
    tw.put('0/1', [7]);
    tw.put('0/1', [4]);
    expect(tw.commit()).toBe(false);
    expect(tw.undo('z')).toBe(true);
    expect(tw.count('z')).toBe(0);
    expect(tw.undo('z')).toBe(false);
  });

  it('방향마다 따로(바꿨다 돌아오면 그대로), 모두 지우기·링크로 바꾸기도 되돌릴 수 있는 한 단계, 0이면 지운다', () => {
    const tw = new ExplodeTweaks();
    tw.replace('x', [['0/1', [3]]]);
    tw.replace('free', [['0/2', [1, 2, 3]]]);
    expect(tw.count('x')).toBe(1);
    expect(tw.moves('y').size).toBe(0);
    expect(tw.clear('x')).toBe(true);
    expect(tw.count('x')).toBe(0);
    expect(tw.clear('x')).toBe(false);
    expect(tw.undo('x')).toBe(true);
    expect(tw.moves('x').get('0/1')).toEqual([3]);
    tw.replace('x', [['0/0', [5]]]);
    expect([...tw.moves('x').keys()]).toEqual(['0/0']);
    tw.undo('x');
    expect([...tw.moves('x').keys()]).toEqual(['0/1']);
    tw.begin('x');
    tw.put('0/1', [0]);
    tw.commit();
    expect(tw.count('x')).toBe(0);
    expect(tw.moves('free').get('0/2')).toEqual([1, 2, 3]);
  });

  it(`되돌리기는 방향마다 ${TWEAK_UNDO_MAX}단계까지`, () => {
    const tw = new ExplodeTweaks();
    for (let i = 1; i <= TWEAK_UNDO_MAX + 5; i++) tw.replace('z', [['0/1', [i]]]);
    let n = 0;
    while (tw.undo('z')) n++;
    expect(n).toBe(TWEAK_UNDO_MAX);
    expect(tw.moves('z').get('0/1')).toEqual([5]);
    // 되돌린 것은 모두 다시 할 수 있고, 다 다시 하면 처음 끝 자리로(되돌리기 단계도 그대로 한도만큼)
    let k = 0;
    while (tw.redo('z')) k++;
    expect(k).toBe(TWEAK_UNDO_MAX);
    expect(tw.moves('z').get('0/1')).toEqual([TWEAK_UNDO_MAX + 5]);
    expect(tw.canRedo('z')).toBe(false);
    n = 0;
    while (tw.undo('z')) n++;
    expect(n).toBe(TWEAK_UNDO_MAX);
  });

  it('다시 하기(38차): 되돌린 단계를 차례로 다시 걸고, 새 손질을 하면 그 방향의 다시 할 목록을 비운다 — 방향마다 따로', () => {
    const tw = new ExplodeTweaks();
    tw.begin('x');
    tw.put('0/1', [3]);
    tw.put('0/2', [-1]);
    tw.commit();
    tw.begin('x');
    tw.put('0/1', [5]);
    tw.commit();
    tw.replace('z', [['0/2', [2]]]);
    expect([tw.canRedo('x'), tw.redo('x')]).toEqual([false, false]);
    expect(tw.undo('x')).toBe(true);
    expect([...tw.moves('x')]).toEqual([['0/1', [3]], ['0/2', [-1]]]);
    expect(tw.undo('x')).toBe(true);
    expect(tw.count('x')).toBe(0);
    expect([tw.canUndo('x'), tw.canRedo('x'), tw.canRedo('z')]).toEqual([false, true, false]);
    // 다른 방향의 손질은 x의 다시 할 목록을 건드리지 않는다
    tw.replace('z', [['0/2', [7]]]);
    expect(tw.canRedo('x')).toBe(true);
    expect(tw.redo('x')).toBe(true);
    expect([...tw.moves('x')].sort()).toEqual([['0/1', [3]], ['0/2', [-1]]]);
    expect(tw.redo('x')).toBe(true);
    expect(tw.moves('x').get('0/1')).toEqual([5]);
    expect(tw.redo('x')).toBe(false);
    // 다시 한 것은 되돌리기 단계로 돌아가 다시 되돌린다
    expect(tw.undo('x')).toBe(true);
    expect(tw.moves('x').get('0/1')).toEqual([3]);
    // 새 손질(끌기 한 번)은 다시 할 목록을 비운다
    tw.begin('x');
    tw.put('0/2', [9]);
    expect(tw.commit()).toBe(true);
    expect(tw.canRedo('x')).toBe(false);
    // 바뀐 것이 없는 끌기·취소한 끌기는 비우지 않는다
    tw.undo('x');
    tw.begin('x');
    tw.put('0/1', [8]);
    tw.cancel();
    tw.begin('x');
    tw.put('0/1', [4]);
    tw.put('0/1', [3]);
    expect(tw.commit()).toBe(false);
    expect(tw.canRedo('x')).toBe(true);
    // 남은 다시 할 단계는 그대로 다시 건다
    expect(tw.redo('x')).toBe(true);
    expect(tw.moves('x').get('0/2')).toEqual([9]);
  });

  it('모두 되돌리기 뒤 다시 하기: 모두 지우기도 되돌리고 다시 할 수 있는 한 단계, 모두 지우면 다시 할 목록은 빈다', () => {
    const tw = new ExplodeTweaks();
    tw.replace('free', [['0/1', [1, 2, 3]], ['0/2', [0, 0, 4]]]);
    tw.replace('free', [['0/1', [1, 2, 5]], ['0/2', [0, 0, 4]]]);
    expect(tw.undo('free')).toBe(true);
    expect(tw.canRedo('free')).toBe(true);
    // 모두 되돌리기(새 단계)는 다시 할 목록을 비운다
    expect(tw.clear('free')).toBe(true);
    expect([tw.count('free'), tw.canRedo('free')]).toEqual([0, false]);
    // 되돌리면 지우기 전 손질, 다시 하면 다시 비운다
    expect(tw.undo('free')).toBe(true);
    expect([...tw.moves('free')]).toEqual([['0/1', [1, 2, 3]], ['0/2', [0, 0, 4]]]);
    expect(tw.redo('free')).toBe(true);
    expect(tw.count('free')).toBe(0);
    expect(tw.undo('free')).toBe(true);
    expect(tw.undo('free')).toBe(true);
    expect(tw.count('free')).toBe(0);
    expect(tw.redo('free')).toBe(true);
    expect(tw.redo('free')).toBe(true);
    expect(tw.count('free')).toBe(0);
    // 저장 꼴은 지금 손질만(되돌리기·다시 하기 단계는 남기지 않는다), 다시 할 것만 남은 방향은 저장해 둔 손질로 채우지 않는다
    expect(tw.toJSON()).toBeNull();
    tw.undo('free');
    expect(tw.toJSON()).toEqual({ v: 1, axes: { free: [['0/1', 1, 2, 3], ['0/2', 0, 0, 4]] } });
    const b = new ExplodeTweaks();
    b.replace('x', [['0/1', [2]]]);
    b.undo('x');
    expect([b.count('x'), b.canUndo('x'), b.canRedo('x')]).toEqual([0, false, true]);
    expect(b.absorb({ v: 1, axes: { x: [['0/3', 1]], z: [['0/3', 1]] } })).toBe(true);
    expect([b.count('x'), b.count('z')]).toEqual([0, 1]);
    expect(b.axes()).toEqual(['z']);
  });

  it('저장 꼴 왕복: 되돌리기 단계는 남기지 않고, 받을 때는 손질·되돌리기가 없는 방향만 채운다(꼴이 틀린 항목은 버린다)', () => {
    const a = new ExplodeTweaks();
    a.replace('x', [['0/1', [3]]]);
    a.replace('sp', [['0/2', [1, -1]], ['0/0/1', [0.5, 0]]]);
    const json = JSON.parse(JSON.stringify(a.toJSON()));
    expect(json).toEqual({ v: 1, axes: { x: [['0/1', 3]], sp: [['0/2', 1, -1], ['0/0/1', 0.5, 0]] } });
    const b = new ExplodeTweaks();
    b.replace('x', [['0/9', [1]]]);
    expect(b.absorb({ ...json, axes: { ...json.axes, z: [['bad', 1], ['0/1', 'x'], ['0/1', 1, 2], ['0/2', 0], ['0/3', 2]] } })).toBe(true);
    expect([...b.moves('x')]).toEqual([['0/9', [1]]]);
    expect([...b.moves('sp')]).toEqual([['0/2', [1, -1]], ['0/0/1', [0.5, 0]]]);
    expect([...b.moves('z')]).toEqual([['0/3', [2]]]);
    expect(b.canUndo('sp')).toBe(false);
    expect(new ExplodeTweaks().absorb({ v: 2, axes: {} })).toBe(false);
    expect(new ExplodeTweaks().absorb(null)).toBe(false);
    expect(new ExplodeTweaks().toJSON()).toBeNull();
  });

  it('이 계획에 없는 낱말은 걸지 않고, 줄인 마디의 다른 낱말은 그 단위 낱말로 맞춘다', () => {
    const plan = explodePlan(items, [N('W', [], [asm()])], 'step');
    const got = canonicalTweaks(plan, [['0/0/2.0', [1, 0, 0]], ['9/9', [1, 0, 0]], ['0/0', [5, 0, 0]], ['0/0/1/1', [0, 2, 0]]]);
    expect(got).toEqual([['0/0/2', [1, 0, 0]], ['0/0/1/1', [0, 2, 0]]]);
    const tw = new ExplodeTweaks();
    tw.replace('free', [['9/9', [1, 1, 1]], ['0/0/2', [0, 0, 1]]]);
    expect(tw.resolve(plan, 'free', undefined)).toEqual([{ ids: ['p7', 'w7'], level: 1, d: [0, 0, 1] }]);
  });
});

describe('보기 링크의 손질(exm)', () => {
  it('왕복: 양자(조립 대각선의 2⁻¹²)로 반올림, 나무 차례, 앞 낱말 끝 마디만 바꾼 것은 /로 줄인다', () => {
    const q = tweakQuantum(4096 * 0.5);
    expect(q).toBe(0.5);
    const moves = new Map([
      ['0/3/12/4/8', [2.2]],
      ['0/3/12/4/7', [-3]],
      ['0/3/12/5', [1]],
      ['0/1', [0.1]],
      ['0/3/12/4/7.0', [10]],
    ]);
    const s = encodeTweakLink(moves, q)!;
    // 0.1은 양자의 반보다 작아 0 → 빠진다
    expect(s).toBe('0.5+0/3/12/4/7:-6+/7.0:20+/8:4+//5:2');
    const back = decodeTweakLink(s, 1)!;
    expect(back).toEqual([['0/3/12/4/7', [-3]], ['0/3/12/4/7.0', [10]], ['0/3/12/4/8', [2]], ['0/3/12/5', [1]]]);
    for (const [k, c] of back) expect(Math.abs(c[0]! - moves.get(k)![0]!)).toBeLessThanOrEqual(q / 2);
    expect(encodeTweakLink(new Map(), q)).toBe('');
    expect(encodeTweakLink(new Map([['0/1', [0.1]]]), q)).toBe('');
  });

  it('사방 세 성분·화면 평면 두 성분, 성분 수가 다르거나 꼴이 틀린 항목은 건너뛰고 양자가 틀리면 null', () => {
    const s = encodeTweakLink(new Map([['0/1', [1, -2, 3]], ['0/2', [0, 0, 0.75]]]), 0.25)!;
    expect(s).toBe('0.25+0/1:4,-8,12+/2:0,0,3');
    expect(decodeTweakLink(s, 3)).toEqual([['0/1', [1, -2, 3]], ['0/2', [0, 0, 0.75]]]);
    expect(decodeTweakLink(s, 2)).toEqual([]);
    expect(decodeTweakLink('0.25+0/1:4,,1+x/1:1,2,3+///5:1,1,1+0/2:1.5,0,0+0/3:0,0,0+0/4:1,2,3', 3)).toEqual([['0/4', [0.25, 0.5, 0.75]]]);
    expect(decodeTweakLink('+0/1:1', 1)).toBeNull();
    expect(decodeTweakLink('-1+0/1:1', 1)).toBeNull();
    expect(encodeTweakLink(new Map([['0/1', [1]]]), 0)).toBeNull();
  });

  it(`${TWEAK_LINK_MAX}자를 넘으면 담지 않는다(null) — 한 하위 조립의 형제 부품 120개(축 하나)는 담기고, 흩어진 부품 3,000개(사방)는 넘는다`, () => {
    const sib = new Map(Array.from({ length: 120 }, (_, i) => [`0/4/2/${i}`, [((i % 7) - 3) * 0.37]] as [string, number[]]));
    const s = encodeTweakLink(sib, 0.01)!;
    expect(s.length).toBeLessThanOrEqual(TWEAK_LINK_MAX);
    expect(decodeTweakLink(s, 1)!.length).toBe([...sib.values()].filter((c) => Math.round(c[0]! / 0.01) !== 0).length);
    const many = new Map(Array.from({ length: 3000 }, (_, i) => [`0/${i % 30}/${Math.floor(i / 30)}`, [i * 0.013, -i * 0.007, 1]] as [string, number[]]));
    expect(encodeTweakLink(many, 0.01)).toBeNull();
    expect(encodeTweakLink(many, 0.01, Infinity)!.length).toBeGreaterThan(TWEAK_LINK_MAX);
  });

  it('보기 링크는 exp 뒤에 exm을 글 그대로 나르고, exp 없는 exm·모르는 글자는 버린다. 34차 링크(exm 없음)·모르는 열쇠는 예전처럼', () => {
    const exm = '0.5+0/1:4+/2:-1';
    const h = encodeViewLink({ exp: { t: 0.6, mode: 'step', axis: 'z' }, exm });
    expect(h).toBe('view=exp:60,step,z;exm:0.5+0/1:4+/2:-1');
    expect(decodeViewLink(`#${h}`)).toEqual({ exp: { t: 0.6, mode: 'step', axis: 'z' }, exm });
    // 주소로 옮겨도(해시 설정) 글자가 바뀌지 않는다
    const u = new URL('https://example.test/opencad-step/');
    u.hash = h;
    expect(decodeViewLink(u.hash)?.exm).toBe(exm);
    expect(encodeViewLink({ exm })).toBe('');
    expect(decodeViewLink('#view=exm:0.5+0/1:4')).toBeNull();
    expect(decodeViewLink('#view=exp:60,all;exm:0.5+0/1:<b>')).toEqual({ exp: { t: 0.6, mode: 'all' } });
    expect(decodeViewLink('#view=exp:60,step,z;exq:1,2')).toEqual({ exp: { t: 0.6, mode: 'step', axis: 'z' } });
    expect(decodeViewLink('#view=exm:0.5+0/1:4;exp:40,step')).toEqual({ exp: { t: 0.4, mode: 'step' }, exm: '0.5+0/1:4' });
  });
});

describe('끄는 길(분해 방향)과 끌 단위', () => {
  // 앞에서 본 원근 카메라(오른쪽 +X, 위 +Z, 보는 방향 +Y), 캔버스 800×600
  const cam: CameraState = { target: [0, 0, 0], distance: 40, yaw: 0, pitch: 0, projection: 'perspective', fovY: (40 * Math.PI) / 180 };
  const W = 800;
  const H = 600;
  const f = computeFrame(cam, W, H, { center: cam.target, radius: cam.distance });
  const p0 = [1.25, 0.5, -0.75];
  const s0 = projectToScreen(f, p0)!;
  const add = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x + b[i]!);

  it('사방·화면 평면은 누른 점을 지나는 화면 면 위로 — 옮긴 점이 커서 아래에 온다', () => {
    const x = s0[0] + 73.3;
    const y = s0[1] - 41.7;
    for (const c of [dragConstraint('free', null, cam), dragConstraint('sp', { yaw: 0, pitch: 0 }, cam)]) {
      const d = dragDelta(cam, W, H, c, p0, x, y)!;
      const s = projectToScreen(f, add(p0, d))!;
      expect(Math.abs(s[0] - x) + Math.abs(s[1] - y)).toBeLessThan(1e-6);
      expect(Math.abs(d[1])).toBeLessThan(1e-9);
    }
  });

  it('축 하나는 그 축 위로만(커서에 가장 가까운 점), 시선과 나란한 축·옆에서 본 면은 정할 수 없다(null), 한도로 줄인다', () => {
    // 커서가 축의 화면 그림 위면 옮긴 점이 커서 아래, 비켜 있으면 그 축에서 커서 광선에 가장 가까운 점(원근이라 화면 x는 조금 다르다)
    const on = dragDelta(cam, W, H, dragConstraint('x', null, cam), p0, s0[0] + 50.5, s0[1])!;
    expect(Math.abs(projectToScreen(f, add(p0, on))![0] - (s0[0] + 50.5))).toBeLessThan(1e-6);
    const d = dragDelta(cam, W, H, dragConstraint('x', null, cam), p0, s0[0] + 50.5, s0[1] + 20.25)!;
    expect([d[1] + 0, d[2] + 0]).toEqual([0, 0]);
    expect(Math.abs(projectToScreen(f, add(p0, d))![0] - (s0[0] + 50.5))).toBeLessThan(0.5);
    expect(dragDelta(cam, W, H, dragConstraint('y', null, cam), p0, s0[0] + 50, s0[1])).toBeNull();
    expect(dragDelta(cam, W, H, dragConstraint('sp', { yaw: Math.PI / 2, pitch: 0 }, cam), p0, s0[0] + 20, s0[1])).toBeNull();
    // 가로로 움직이면 Z축 위로는 거의 움직이지 않는다
    const z = dragDelta(cam, W, H, dragConstraint('z', null, cam), p0, s0[0] + 50, s0[1])!;
    expect(Math.abs(z[2])).toBeLessThan(0.01);
    const lim = dragDelta(cam, W, H, dragConstraint('free', null, cam), p0, s0[0] + 300, s0[1], 0.5)!;
    expect(Math.hypot(...lim)).toBeCloseTo(0.5, 9);
    // 화면 가로(계획 카메라 각)는 그 카메라 오른쪽 위로
    const v = { yaw: 0.4, pitch: 0.2 };
    const sx = dragDelta(cam, W, H, dragConstraint('sx', v, cam), p0, s0[0] + 40, s0[1] - 10)!;
    const r = basisFromAngles(v.yaw, v.pitch).right;
    const k = sx[0] / r[0];
    expect(r9(sx)).toEqual(r9(r.map((x) => x * k)));
  });

  it('끌 단위: 다 벌어졌으면 누른 부품, 덜 벌어진 하위 조립 안이면 그 하위 조립, 고른 마디·여러 개는 그것, 맨 위·나무 밖은 끌지 않는다', () => {
    const plan = explodePlan(items, [asm()], 'step');
    const tok = (t: number, id: string, sel = {}, p = plan) => dragUnits(p, t, id, sel).map((u) => [u.token, +u.f.toFixed(3)]);
    expect(tok(1, 'p5')).toEqual([['0/1/1/0', 1]]);
    // 20%: 첫 단계 60% — S2(첫 단계)만 벌어지는 중
    expect(tok(0.2, 'p5')).toEqual([['0/1', 0.6]]);
    expect(tok(0.5, 'p5')).toEqual([['0/1/1', 0.5]]);
    expect(tok(1, 'p5', { node: '0/1' })).toEqual([['0/1', 1]]);
    // 고른 마디가 누른 것을 품지 않거나 맨 위면 누른 부품
    expect(tok(1, 'p5', { node: '0/0' })).toEqual([['0/1/1/0', 1]]);
    expect(tok(1, 'p5', { node: '0' })).toEqual([['0/1/1/0', 1]]);
    expect(tok(1, 'p1', { ids: ['p1', 'p5', 'p6'] })).toEqual([['0/0/0', 1], ['0/1/1/0', 1], ['0/1/1/1', 1]]);
    // 20%에는 p3·p5·p6이 모두 S2 안 — 하나로
    expect(tok(0.2, 'p3', { ids: ['p3', 'p5', 'p6'] })).toEqual([['0/1', 0.6]]);
    // 나무에 없는 묶음(낱말 없음)·모르는 묶음
    expect(tok(1, 'loose', {}, explodePlan([...items, box('loose', [0, -9, 0])], [asm()], 'step'))).toEqual([]);
    expect(tok(1, 'nope')).toEqual([]);
    const all = explodePlan(items, [asm()], 'all');
    expect(dragUnits(all, DRAG_MIN_FRACTION / 2, 'p5')).toEqual([]);
    expect(dragUnits(all, 0.4, 'p5', { node: '0/1/1' }).map((u) => [u.token, u.f])).toEqual([['0/1/1', 0.4]]);
  });

  it('끌어 담은 손질로 다시 그린 자리: 밀대 50%(한꺼번에)에서 끈 부품의 누른 점이 커서 아래에 온다(100%에서는 끈 거리의 두 배)', () => {
    const scene = [box('a', [-3, 0, 0]), box('b', [3, 0, 0])];
    const plan = explodePlan(scene, [N('R', [], [N('a', ['a']), N('b', ['b'])])], 'all');
    const t = 0.5;
    const pick = [3.5, -1, 0.5];
    const before = explodeMoves(plan, t).get('b')!;
    const shown = add(pick, before);
    const s = projectToScreen(f, shown)!;
    const [u] = dragUnits(plan, t, 'b');
    expect(u!.token).toBe('0/1');
    const tw = new ExplodeTweaks();
    tw.begin('free');
    const x = s[0] + 61.7;
    const y = s[1] + 33.1;
    const d = dragDelta(cam, W, H, dragConstraint('free', null, cam), shown, x, y)!;
    tw.put(u!.token, worldComps('free', null, d).map((c) => c / u!.f));
    tw.commit();
    const after = explodeMoves(plan, t, EXPLODE_SCALE, tw.resolve(plan, 'free', undefined)).get('b')!;
    const q = projectToScreen(f, add(pick, after))!;
    expect(Math.abs(q[0] - x) + Math.abs(q[1] - y)).toBeLessThan(1e-6);
    const full = explodeMoves(plan, 1, EXPLODE_SCALE, tw.resolve(plan, 'free', undefined)).get('b')!;
    const plain = explodeMoves(plan, 1).get('b')!;
    expect(r9(full.map((v, i) => v - plain[i]!))).toEqual(r9(d.map((v) => v * 2)));
  });
});

describe('끄는 동안 옮긴 거리 글(38차)', () => {
  /** 이름·값 조각을 측정 글상자처럼 한 줄 글로 */
  const text = (lines: [string, string][][]) => lines.map((l) => l.map(([w, v]) => `${w} ${v}`).join('  '));
  const add = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x + b[i]!);

  it('측정 글상자와 같은 수 꼴: 사방은 거리와 ΔX·ΔY·ΔZ(measureLabelLines 그대로), 장면 축은 그 성분 하나(부호 있음), 표시 단위·소수 자리·화면 언어를 따른다', () => {
    const f = new Fmt('mm');
    const d = [3, -4, 12];
    expect(text(dragDistanceLines('free', null, d, f))).toEqual(measureLabelLines({ distance: 13, dx: 3, dy: -4, dz: 12 }, f));
    expect(text(dragDistanceLines('free', null, d, f))).toEqual(['거리 13 mm', 'ΔX 3  ΔY -4  ΔZ 12']);
    expect(text(dragDistanceLines('x', null, [-2.25, 0, 0], f))).toEqual(['ΔX -2.25 mm']);
    expect(text(dragDistanceLines('z', null, [0, 0, 1 / 3], f))).toEqual(['ΔZ 0.333 mm']);
    // 인치로 보이기·소수 1자리·독일어(소수 쉼표) — 장면은 mm
    const g = new Fmt('mm', { unit: 'in', decimals: 1, quality: 'normal' }, 'de');
    expect(text(dragDistanceLines('y', null, [0, 25.4 * 1.5, 0], g))).toEqual(['ΔY 1,5 in']);
    // 단위를 모르는 장면은 수만
    expect(text(dragDistanceLines('x', null, [5, 0, 0], new Fmt('unknown')))).toEqual(['ΔX 5']);
  });

  it('화면 가로·세로는 계획 카메라 각 성분 하나, 화면 평면은 거리와 가로·세로 두 성분', () => {
    const f = new Fmt('mm');
    const v = { yaw: 0.6, pitch: 0.3 };
    const b = basisFromAngles(v.yaw, v.pitch);
    const d = add(b.right.map((x) => x * 6), b.up.map((x) => x * -8));
    expect(text(dragDistanceLines('sx', v, b.right.map((x) => x * 6), f))).toEqual(['가로 6 mm']);
    expect(text(dragDistanceLines('sy', v, b.up.map((x) => x * -8), f))).toEqual(['세로 -8 mm']);
    expect(text(dragDistanceLines('sp', v, d, f))).toEqual(['거리 10 mm', '가로 6  세로 -8']);
  });

  it('글 자리: 마우스는 커서 오른쪽 아래(넘치면 반대쪽), 손가락은 손가락 위 — 위에 자리가 없으면 옆, 늘 캔버스 안(375px 폭)', () => {
    const W2 = 375;
    const H2 = 560;
    const w = 120;
    const h = 40;
    expect(dragLabelSpot(100, 100, w, h, W2, H2, false)).toEqual({ left: 116, top: 118 });
    expect(dragLabelSpot(300, 540, w, h, W2, H2, false)).toEqual({ left: 164, top: 482 });
    /** 손가락 점 (x, y)와 그 둘레 반지름 r(화소)이 글과 겹치는지 */
    const covers = (x: number, y: number, s: { left: number; top: number }, r = 30) => x + r > s.left && x - r < s.left + w && y + r > s.top && y - r < s.top + h;
    for (const [x, y] of [
      [187.5, 300],
      [10, 300],
      [370, 300],
      [187.5, 60],
      [40, 20],
      [360, 20],
      [200, 555],
    ] as const) {
      const s = dragLabelSpot(x, y, w, h, W2, H2, true);
      expect(s.left >= 4 && s.left + w <= W2 - 4 && s.top >= 4 && s.top + h <= H2 - 4, `${x},${y} ${JSON.stringify(s)}`).toBe(true);
      expect(covers(x, y, s), `${x},${y} ${JSON.stringify(s)}`).toBe(false);
    }
    // 가운데에서는 손가락 바로 위 LIFT 너머
    expect(dragLabelSpot(187.5, 300, w, h, W2, H2, true)).toEqual({ left: 127.5, top: 300 - DRAG_LABEL_LIFT - h });
  });
});
