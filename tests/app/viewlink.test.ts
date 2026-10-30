import { describe, expect, it } from 'vitest';
import type { ProductNode } from '../../src/app/doc';
import { subtreeItemIds } from '../../src/app/doc';
import { decodeViewLink, encodeViewLink } from '../../src/app/viewlink';
import { fitTokens, resolveTokens, SEL_MAX_CHARS, selectionTokens } from '../../src/app/selink';

const N = (name: string, meshIds: string[] = [], children: ProductNode[] = [], lineIds?: string[]): ProductNode => ({ name, productId: name, meshIds, children, ...(lineIds ? { lineIds } : {}) });

// 조립 asm(0): 부품 p0~p5(0/0~0/5, 몸체 하나씩), 몸체 셋인 부품 multi(0/6), 하위 조립 sub(0/7: 자식 셋, 선 형상 있는 부품 하나)
const tree: ProductNode[] = [
  N('asm', [], [
    ...[0, 1, 2, 3, 4, 5].map((i) => N(`p${i}`, [`m${i}`])),
    N('multi', ['b1', 'b2', 'b3']),
    N('sub', [], [N('s0', ['s0']), N('s1', ['s1'], [], ['l1']), N('s2', ['s2'])]),
  ]),
  N('loose', ['x1']),
];

describe('보기 링크 고른 것: 나무 자리 낱말', () => {
  it('통째로 고른 마디는 위로 묶고, 이웃한 형제·몸체는 범위로 줄인다', () => {
    expect(selectionTokens(tree, subtreeItemIds(tree[0]!))).toEqual(['0']);
    expect(selectionTokens(tree, ['m1', 'm2', 'm3', 'm5'])).toEqual(['0/1-3', '0/5']);
    expect(selectionTokens(tree, ['b2'])).toEqual(['0/6.2']);
    expect(selectionTokens(tree, ['b1', 'b2', 'm0'])).toEqual(['0/0', '0/6.1-2']);
    expect(selectionTokens(tree, ['b1', 'b2', 'b3'])).toEqual(['0/6']);
    // 하위 조립의 자식을 모두(선 형상까지) 고르면 그 조립 하나, 선 형상을 빼면 몸체 낱말, 선 형상만이면 입체 다음 차례
    expect(selectionTokens(tree, ['s0', 's1', 'l1', 's2'])).toEqual(['0/7']);
    expect(selectionTokens(tree, ['s0', 's1', 's2'])).toEqual(['0/7/0', '0/7/1.1', '0/7/2']);
    expect(selectionTokens(tree, ['s0', 'l1'])).toEqual(['0/7/0', '0/7/1.2']);
    // 뿌리끼리도 범위, 나무에 없는 항목(표현 PMI 선)은 담지 않는다
    expect(selectionTokens(tree, [...subtreeItemIds(tree[0]!), 'x1', 'pmi-1'])).toEqual(['0-1']);
    expect(selectionTokens(tree, ['pmi-1'])).toEqual([]);
  });

  it('낱말 → 고를 것: 마디 하나는 마디 고르기, 몸체 하나는 몸체 고르기, 그 밖은 여러 개(없는 자리는 건너뜀)', () => {
    expect(resolveTokens(tree, ['0/7'])).toEqual({ ids: ['s0', 's1', 'l1', 's2'], open: [], key: '0/7' });
    // 몸체 낱말은 그 부품 마디를 펼칠 것(open)으로도 준다
    expect(resolveTokens(tree, ['0/6.2'])).toEqual({ ids: ['b2'], open: ['0/6'], body: 'b2' });
    expect(resolveTokens(tree, ['0/1-3', '0/6.1-2'])).toEqual({ ids: ['m1', 'm2', 'm3', 'b1', 'b2'], open: ['0/6'] });
    // 범위가 자식·몸체 수를 넘으면 있는 데까지, 없는 마디·몸체 0번은 버린다
    expect(resolveTokens(tree, ['0/7/1-99', '0/6.3-9', '9/1', '0/6.0', '3'])).toEqual({ ids: ['s1', 'l1', 's2', 'b3'], open: ['0/6'] });
    expect(resolveTokens(tree, ['5'])).toEqual({ ids: [], open: [] });
    expect(resolveTokens(tree, ['1'])).toEqual({ ids: ['x1'], open: [], key: '1' });
  });

  it('여러 고르기를 낱말로 바꿨다가 풀면 같은 항목(무작위 200번)', () => {
    const all = [...subtreeItemIds(tree[0]!), 'x1'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 200; k++) {
      const ids = all.filter(() => rnd() < 0.4);
      // 선 형상만 따로 고른 것도 낱말("0/7/1.2")로 담긴다
      const got = resolveTokens(tree, selectionTokens(tree, ids)).ids;
      expect(new Set(got), JSON.stringify(ids)).toEqual(new Set(ids));
    }
  });

  it('글 한도: 앞에서부터 들어가는 만큼(뺀 낱말 수), 수백 개 흩어진 고르기도 한도 안', () => {
    expect(fitTokens(['0/1', '0/3', '0/5'], 7)).toEqual({ tokens: ['0/1', '0/3'], dropped: 1 });
    expect(fitTokens(['0/1'], 2)).toEqual({ tokens: [], dropped: 1 });
    // 부품 1,000개 조립에서 짝수 자리 500개 → 범위로 줄지 않아 한도에서 자른다
    const big = [N('big', [], Array.from({ length: 1000 }, (_, i) => N(`q${i}`, [`q${i}`])))];
    const tokens = selectionTokens(big, Array.from({ length: 500 }, (_, i) => `q${i * 2}`));
    expect(tokens).toHaveLength(500);
    const fit = fitTokens(tokens);
    expect(fit.tokens.join(',').length).toBeLessThanOrEqual(SEL_MAX_CHARS);
    expect(fit.tokens.length + fit.dropped).toBe(500);
    expect(fit.dropped).toBeGreaterThan(0);
    // 이웃한 400개는 낱말 하나
    expect(selectionTokens(big, Array.from({ length: 400 }, (_, i) => `q${i + 100}`))).toEqual(['0/100-499']);
  });
});

describe('보기 링크 글(#view=…;sel:…)', () => {
  it('여러 개·몸체·범위를 담고 되읽는다, 예전 링크(마디 하나)도 그대로 열린다', () => {
    const v = { sel: ['0/1-3', '0/6.2', '1'], iso: true };
    const enc = encodeViewLink(v);
    expect(enc).toBe('view=sel:0/1-3,0/6.2,1;iso:1');
    expect(decodeViewLink(`#${enc}`)).toEqual(v);
    expect(decodeViewLink('#view=cam:1,2,3,50,0.5,-0.25,p;sel:0/2/1;iso:1')).toMatchObject({ sel: ['0/2/1'], iso: true });
    // 한 낱말이라도 꼴이 틀리면 고른 것은 버린다(격리도)
    expect(decodeViewLink('#view=sel:0/2,../x;iso:1')).toBeNull();
    expect(decodeViewLink('#view=sel:0/2,;iso:1')).toBeNull();
    expect(decodeViewLink('#view=sel:0/2.3.4')).toBeNull();
    expect(encodeViewLink({ sel: [], iso: true })).toBe('');
  });

  it('분해 정도(1~100%)와 방식(step·all)을 담고 되읽는다, 방식이 없으면 단계별, 0%·틀린 값은 담지 않는다', () => {
    expect(encodeViewLink({ sel: ['0/2'], exp: { t: 0.6, mode: 'step' } })).toBe('view=sel:0/2;exp:60,step');
    expect(decodeViewLink('#view=sel:0/2;exp:60,step')).toEqual({ sel: ['0/2'], exp: { t: 0.6, mode: 'step' } });
    expect(decodeViewLink(`#${encodeViewLink({ exp: { t: 0.35, mode: 'all' } })}`)).toEqual({ exp: { t: 0.35, mode: 'all' } });
    // 분해만 담은 링크도 보기다, 방식이 없거나 모르면 단계별, 100%를 넘으면 100%
    expect(decodeViewLink('#view=exp:40')).toEqual({ exp: { t: 0.4, mode: 'step' } });
    expect(decodeViewLink('#view=exp:250,zz')).toEqual({ exp: { t: 1, mode: 'step' } });
    for (const bad of ['exp:0', 'exp:-5', 'exp:', 'exp:x,all']) expect(decodeViewLink(`#view=${bad}`), bad).toBeNull();
    expect(encodeViewLink({ exp: { t: 0, mode: 'all' } })).toBe('');
    // 아주 작은 분해도 1%로 남긴다(링크를 열면 분해 막대가 열린 채)
    expect(encodeViewLink({ exp: { t: 0.001, mode: 'step' } })).toBe('view=exp:1,step');
    // 카메라와 함께(예전 앱은 모르는 열쇠 exp를 건너뛰고 카메라만 쓴다)
    expect(decodeViewLink('#view=cam:1,2,3,50,0.5,-0.25,o;exp:60,all')).toMatchObject({ cam: { projection: 'orthographic' }, exp: { t: 0.6, mode: 'all' } });
  });

  it('분해 방향: 축 하나(x·y·z)면 셋째 값으로 담고 되읽는다, 사방·없는 값·모르는 값은 담지 않고 사방으로 읽는다', () => {
    expect(encodeViewLink({ exp: { t: 0.6, mode: 'step', axis: 'z' } })).toBe('view=exp:60,step,z');
    expect(encodeViewLink({ exp: { t: 0.25, mode: 'all', axis: 'x' } })).toBe('view=exp:25,all,x');
    for (const axis of ['x', 'y', 'z'] as const) expect(decodeViewLink(`#${encodeViewLink({ exp: { t: 0.5, mode: 'step', axis } })}`)).toEqual({ exp: { t: 0.5, mode: 'step', axis } });
    // 사방(축 없음)은 예전 링크와 같은 꼴
    expect(encodeViewLink({ exp: { t: 0.6, mode: 'step' } })).toBe('view=exp:60,step');
    expect(decodeViewLink('#view=exp:60,step')).toEqual({ exp: { t: 0.6, mode: 'step' } });
    expect('axis' in decodeViewLink('#view=exp:60,step')!.exp!).toBe(false);
    // 모르는 축·대문자·빈 값은 건너뛴다(사방)
    for (const odd of ['exp:60,step,w', 'exp:60,step,X', 'exp:60,step,', 'exp:60,all,free']) expect(decodeViewLink(`#view=${odd}`)!.exp!.axis, odd).toBeUndefined();
    // 방식 없이 축만은 셋째 자리가 아니라 방식 자리라 단계별·사방
    expect(decodeViewLink('#view=exp:60,z')).toEqual({ exp: { t: 0.6, mode: 'step' } });
    // 다른 열쇠와 함께
    expect(decodeViewLink('#view=cam:1,2,3,50,0.5,-0.25,p;sel:0/2;exp:80,all,y')).toMatchObject({ sel: ['0/2'], exp: { t: 0.8, mode: 'all', axis: 'y' } });
  });
});
