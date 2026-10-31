// 분해 손질 파일(38차): 내보내는 꼴(필드·나무 차례·부품 이름), 글 왕복, 같은 문서·다른 문서(이름과 자리가 맞는 부품만)·단위, 망가진 파일·다른 판, 받은 뒤 방향
import { describe, expect, it } from 'vitest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { ProductNode } from '../../src/app/doc';
import { explodePlan } from '../../src/app/explode';
import {
  importedAxis,
  importedView,
  makeTweakFile,
  matchTweakFile,
  readTweakFile,
  TWEAK_FILE_FORMAT,
  tweakFileName,
  tweakFileText,
  tweakTokenName,
  type TweakFile,
  type TweakFileDoc,
} from '../../src/app/explodefile';
import { ExplodeTweaks } from '../../src/app/explodetweak';

const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });
const meshes = [box('p1', [-10, 0, 0]), box('p2', [-6, 0, 0]), box('p3', [6, 0, 0]), box('p5', [10, 4, 0]), box('p6', [10, -4, 0]), box('p7', [0, 10, 0])];
/** 합성 조립 A: S1(p1·p2), S2(p3, S3(p5·p6)), p7 — 자리 0/0/0 = p1 … 0/1/1/1 = p6, 0/2 = p7 */
const tree = (): ProductNode[] => [N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p5', ['p5']), N('p6', ['p6'])])]), N('p7', ['p7'])])];
const docOf = (products: ProductNode[], name = 'asm.stp', size = 1234, units: TweakFileDoc['scene']['units'] = 'mm'): TweakFileDoc => ({ name, size, products, scene: { units } });
const planOf = (products: readonly ProductNode[]) => explodePlan(meshes, products, 'step');

/** 세 방향에 손질한 것 */
function tweaked(): ExplodeTweaks {
  const t = new ExplodeTweaks();
  t.replace('free', [
    ['0/2', [0.5, 1.25, -3]],
    ['0/1/1/0', [1, 0, 0]],
  ]);
  t.replace('x', [['0/0', [4]]]);
  t.replace('sp', [['0/1/1/1', [2, -1]]]);
  return t;
}

describe('분해 손질 파일 꼴', () => {
  it('내보내기: format·v·doc(이름·크기·단위)·axis·view와 방향마다 [낱말, 부품 이름, 성분…](나무 차례), 글은 JSON으로 그대로 읽힌다', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'sp', { yaw: 0.5, pitch: -0.25 })!;
    expect(f).toEqual({
      format: TWEAK_FILE_FORMAT,
      v: 1,
      doc: { name: 'asm.stp', size: 1234, units: 'mm' },
      axis: 'sp',
      view: { yaw: 0.5, pitch: -0.25 },
      axes: {
        free: [
          ['0/1/1/0', 'p5', 1, 0, 0],
          ['0/2', 'p7', 0.5, 1.25, -3],
        ],
        x: [['0/0', 'S1', 4]],
        sp: [['0/1/1/1', 'p6', 2, -1]],
      },
    });
    const text = tweakFileText(f);
    expect(JSON.parse(text)).toEqual(f);
    // 손질 한 줄은 한 줄 글(작고 읽을 만하게)
    expect(text.split('\n')).toContain('      ["0/2","p7",0.5,1.25,-3]');
    expect(readTweakFile(text)).toEqual({ kind: 'ok', file: f });
    expect(tweakFileName('asm')).toBe('asm-explode.json');
    // 손질이 없으면 파일도 없다, 카메라 각이 없으면 view는 빼고
    expect(makeTweakFile(d, new ExplodeTweaks(), 'free')).toBeNull();
    expect('view' in makeTweakFile(d, tweaked(), 'x', null)!).toBe(false);
    // 바로 놓인 형상 덩어리(.0)는 그 마디 이름
    expect(tweakTokenName([N('R', ['m'], [N('k', ['n'])])], '0.0')).toBe('R');
    expect(tweakTokenName(tree(), '9/9')).toBe('');
  });

  it('같은 문서(이름·크기가 같음)면 나무에 있는 손질을 모두 받는다 — 값은 그대로, 줄인 마디의 다른 낱말은 단위 낱말로', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'x')!;
    const m = matchTweakFile(f, d, planOf(d.products));
    expect(m).toEqual({
      same: true,
      axes: [
        ['free', [['0/1/1/0', [1, 0, 0]], ['0/2', [0.5, 1.25, -3]]]],
        ['x', [['0/0', [4]]]],
        ['sp', [['0/1/1/1', [2, -1]]]],
      ],
      taken: 4,
      skipped: 0,
    });
    // 받아 건 손질은 내보낸 것과 같고(방향마다 한 단계), 다시 내보내면 같은 파일
    const t = new ExplodeTweaks();
    for (const [a, list] of m.axes) t.replace(a, list);
    expect(makeTweakFile(d, t, 'x')).toEqual(f);
    expect(['free', 'x', 'sp'].map((a) => t.canUndo(a as 'x'))).toEqual([true, true, true]);
    // 줄인 마디의 다른 낱말(바로 놓인 형상 덩어리 .0 — 감싼 뿌리를 둔 나무)은 그 나무의 단위 낱말로
    const wrapped = [N('W', [], tree())];
    const g: TweakFile = { ...f, axes: { x: [['0/0/2.0', 'p7', 2]] } };
    expect(matchTweakFile(g, docOf(wrapped), planOf(wrapped)).axes).toEqual([['x', [['0/0/2', [2]]]]]);
  });

  it('다른 문서(이름이나 크기가 다름)면 자리와 부품 이름이 맞는 것만 받고 나머지는 센다 — 단위가 다르면 바꿔 받는다', () => {
    const f = makeTweakFile(docOf(tree()), tweaked(), 'free')!;
    // 고쳐 저장한 판: p7 이름이 바뀌고 S3 안에 부품이 하나 앞에 늘어 p5·p6 자리가 밀렸다
    const rev = (): ProductNode[] => [
      N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p4', ['p6']), N('p5', ['p5'])])]), N('p7b', ['p7'])]),
    ];
    const other = docOf(rev(), 'asm.stp', 1300);
    const m = matchTweakFile(f, other, planOf(other.products));
    // 0/1/1/0은 이제 p4, 0/1/1/1은 p5(파일은 p6), 0/2는 p7b — S1(0/0)만 맞는다
    expect(m).toEqual({ same: false, axes: [['x', [['0/0', [4]]]]], taken: 1, skipped: 3 });
    // 이름만 바꾼 같은 나무(다른 파일 이름)는 모두 맞는다
    const renamed = docOf(tree(), 'asm-v2.stp', 1234);
    expect(matchTweakFile(f, renamed, planOf(renamed.products)).taken).toBe(4);
    // 아무것도 맞지 않는 문서
    const none = [N('Z', [], [N('q1', ['p1']), N('q2', ['p2'])])];
    expect(matchTweakFile(f, docOf(none, 'z.stp', 9), planOf(none))).toEqual({ same: false, axes: [], taken: 0, skipped: 4 });
    // 인치 문서에 받으면 성분을 인치로(25.4 mm = 1 in), 단위를 모르면 그대로
    const inch = matchTweakFile(f, docOf(tree(), 'asm.stp', 1234, 'inch'), planOf(tree()));
    expect(inch.axes[1]![0]).toBe('x');
    expect(inch.axes[1]![1][0]![1][0]).toBeCloseTo(4 / 25.4, 12);
    expect(matchTweakFile(f, docOf(tree(), 'asm.stp', 1234, 'unknown'), planOf(tree())).axes[1]).toEqual(['x', [['0/0', [4]]]]);
  });

  it('망가진 파일·다른 판은 읽지 않는다, 꼴이 틀린 줄·0인 손질·나무에 없는 낱말은 건너뛰고 센다', () => {
    for (const bad of ['', 'not json', '[]', 'null', '{"format":"other","v":1}', JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 1, axes: {} }), JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 1, doc: { name: 'a', size: '1' }, axes: {} }), JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 1, doc: { name: 'a', size: 1 }, axes: [] }), JSON.stringify({ format: TWEAK_FILE_FORMAT, v: '1', doc: { name: 'a', size: 1 }, axes: {} })])
      expect(readTweakFile(bad).kind, bad).toBe('broken');
    expect(readTweakFile(JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, doc: { name: 'a', size: 1 }, axes: {} }))).toEqual({ kind: 'version', v: 2 });
    // 모르는 방향 값은 사방으로, 틀린 view는 뺀다
    const r = readTweakFile(JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 1, doc: { name: 'asm.stp', size: 1234 }, axis: 'w', view: { yaw: 'a' }, axes: { x: [] } }));
    expect(r).toEqual({ kind: 'ok', file: { format: TWEAK_FILE_FORMAT, v: 1, doc: { name: 'asm.stp', size: 1234 }, axis: 'free', axes: { x: [] } } });
    const f = (r as { file: TweakFile }).file;
    const lines = [['0/0', 'S1', 1], ['0/0', 'S1', 1, 2], ['bad', 'S1', 1], ['0/0', 7, 1], ['0/0', 'S1', 0], ['9/9', 'Q', 1], ['0/0', 'S1', 'x'], 'row', ['0/1', 'S2', Infinity], ['0/1', 'S2', -2]];
    const m = matchTweakFile({ ...f, axes: { x: lines, nope: [['0/0', 'S1', 1]] } as unknown as TweakFile['axes'] }, docOf(tree()), planOf(tree()));
    expect(m).toEqual({ same: true, axes: [['x', [['0/0', [1]], ['0/1', [-2]]]]], taken: 2, skipped: 8 });
  });

  it('받은 뒤 보일 방향: 내보낸 때의 방향을 받았으면 그것, 아니면 지금 방향(받았으면), 아니면 받은 첫 방향 — 화면 방향을 받았으면 파일의 카메라 각', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'sp', { yaw: 1, pitch: 0.5 })!;
    const m = matchTweakFile(f, d, planOf(d.products));
    expect(importedAxis(f, m, 'z')).toBe('sp');
    expect(importedView(f, m)).toEqual({ yaw: 1, pitch: 0.5 });
    const noSp = { ...m, axes: m.axes.filter(([a]) => a !== 'sp') };
    expect(importedAxis(f, noSp, 'x')).toBe('x');
    expect(importedAxis(f, noSp, 'z')).toBe('free');
    expect(importedView(f, noSp)).toBeNull();
    expect(importedView({ ...f, view: undefined }, m)).toBeNull();
  });
});
