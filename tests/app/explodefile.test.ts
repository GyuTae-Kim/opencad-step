// 분해 손질 파일(38차): 내보내는 꼴(필드·나무 차례·부품 이름), 글 왕복, 같은 문서·다른 문서(이름과 자리가 맞는 부품만)·단위, 망가진 파일·다른 판, 받은 뒤 방향
// 39차: 판 2(줄마다 부품 지문 — 묶음 수·범위 상자 크기)와 판 1 읽기, 지문이 다른 부품 거르기·같은 부품(삼각화가 조금 달라도) 받기,
// 크기·줄 수·낱말·이름·성분 한도와 이상값, 모르는 필드 무시, 내보내는 줄 최대 바이트로 정한 크기 한도
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
  sameFingerprint,
  TWEAK_FILE_FORMAT,
  TWEAK_FILE_HEAD_MAX,
  TWEAK_FILE_LINE_MAX,
  TWEAK_FILE_MAX_BYTES,
  TWEAK_FILE_MAX_ENTRIES,
  TWEAK_FILE_MAX_PER_AXIS,
  TWEAK_FILE_REACH,
  tweakFileFits,
  tweakFileName,
  tweakFileText,
  tweakTokenName,
  unitFingerprint,
  type TweakFile,
  type TweakFileDoc,
} from '../../src/app/explodefile';
import { ExplodeTweaks, TWEAK_AXES } from '../../src/app/explodetweak';

/** 한 변 2s인 상자 그물(가운데 c) */
const box = (id: string, c: [number, number, number], s = 1): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - s, c[1] - s, c[2] - s, c[0] + s, c[1] + s, c[2] + s, c[0] + s, c[1] - s, c[2] - s]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });
const meshes = [box('p1', [-10, 0, 0]), box('p2', [-6, 0, 0]), box('p3', [6, 0, 0]), box('p5', [10, 4, 0]), box('p6', [10, -4, 0]), box('p7', [0, 10, 0])];
/** 합성 조립 A: S1(p1·p2), S2(p3, S3(p5·p6)), p7 — 자리 0/0/0 = p1 … 0/1/1/1 = p6, 0/2 = p7 */
const tree = (): ProductNode[] => [N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p5', ['p5']), N('p6', ['p6'])])]), N('p7', ['p7'])])];
const docOf = (products: ProductNode[], name = 'asm.stp', size = 1234, units: TweakFileDoc['scene']['units'] = 'mm'): TweakFileDoc => ({ name, size, products, scene: { units } });
const planOf = (products: readonly ProductNode[], items: Mesh3d[] = meshes) => explodePlan(items, products, 'step');
const bytes = (s: string) => new TextEncoder().encode(s).length;

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
/** 38차(판 1) 앱이 내보낸 꼴 */
const v1 = (doc: TweakFileDoc['name'] = 'asm.stp', size = 1234): TweakFile => ({
  format: TWEAK_FILE_FORMAT,
  v: 1,
  doc: { name: doc, size, units: 'mm' },
  axis: 'x',
  axes: { free: [['0/1/1/0', 'p5', 1, 0, 0], ['0/2', 'p7', 0.5, 1.25, -3]], x: [['0/0', 'S1', 4]], sp: [['0/1/1/1', 'p6', 2, -1]] },
});

describe('분해 손질 파일 꼴', () => {
  it('내보내기(판 2): format·v·doc(이름·크기·단위)·axis·view와 방향마다 [낱말, 부품 이름, 지문, 성분…](나무 차례), 글은 JSON으로 그대로 읽힌다', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'sp', { yaw: 0.5, pitch: -0.25 }, planOf(d.products))!;
    expect(f).toEqual({
      format: TWEAK_FILE_FORMAT,
      v: 2,
      doc: { name: 'asm.stp', size: 1234, units: 'mm' },
      axis: 'sp',
      view: { yaw: 0.5, pitch: -0.25 },
      axes: {
        free: [
          ['0/1/1/0', 'p5', [1, 2, 2, 2], 1, 0, 0],
          ['0/2', 'p7', [1, 2, 2, 2], 0.5, 1.25, -3],
        ],
        // S1 = p1·p2(묶음 둘, X로 −11~−5)
        x: [['0/0', 'S1', [2, 6, 2, 2], 4]],
        sp: [['0/1/1/1', 'p6', [1, 2, 2, 2], 2, -1]],
      },
    });
    const text = tweakFileText(f);
    expect(JSON.parse(text)).toEqual(f);
    // 손질 한 줄은 한 줄 글(작고 읽을 만하게)
    expect(text.split('\n')).toContain('      ["0/2","p7",[1,2,2,2],0.5,1.25,-3]');
    expect(readTweakFile(text)).toEqual({ kind: 'ok', file: f });
    expect(tweakFileName('asm')).toBe('asm-explode.json');
    // 손질이 없으면 파일도 없다, 카메라 각이 없으면 view는 빼고
    expect(makeTweakFile(d, new ExplodeTweaks(), 'free', null, planOf(d.products))).toBeNull();
    expect('view' in makeTweakFile(d, tweaked(), 'x', null, planOf(d.products))!).toBe(false);
    // 바로 놓인 형상 덩어리(.0)는 그 마디 이름
    expect(tweakTokenName([N('R', ['m'], [N('k', ['n'])])], '0.0')).toBe('R');
    expect(tweakTokenName(tree(), '9/9')).toBe('');
    // 지문: 하위 조립 S2 = p3·p5·p6(묶음 셋, X 5~11·Y −5~5)
    expect(unitFingerprint(planOf(tree()).units.get('0/1'))).toEqual([3, 6, 10, 2]);
    expect(unitFingerprint(undefined)).toBeNull();
  });

  it('부품 이름은 앞 120자만(제어 글자는 빈칸), 내보낸 줄은 줄 최대 바이트 안 — 크기 한도는 줄 한도 × 줄 최대 바이트 + 머리를 MiB로 올린 23 MiB', () => {
    const long = `P\nQ${'가'.repeat(200)}`;
    const products = [N('A', [], [N(long, ['p1']), N('p2', ['p2'])])];
    const t = new ExplodeTweaks();
    t.replace('x', [['0/0', [1]]]);
    const f = makeTweakFile(docOf(products), t, 'x', null, explodePlan(meshes.slice(0, 2), products, 'step'))!;
    expect(f.axes.x![0]![1]).toBe(`P Q${'가'.repeat(117)}`);
    // 다른 문서에서도 같은 긴 이름이면(앞 120자) 받는다
    expect(matchTweakFile(f, docOf(products, 'other.stp'), explodePlan(meshes.slice(0, 2), products, 'step')).taken).toBe(1);
    // 가장 긴 줄: 낱말 255자, 이름 119자(3바이트) + 잘린 반쪽 대리 글자(\uXXXX), 가장 긴 지문·성분
    const token = `${'1/'.repeat(127)}1`;
    const worst = -2.2250738585072014e-308;
    const big: TweakFile = {
      format: TWEAK_FILE_FORMAT,
      v: 2,
      doc: { name: '가'.repeat(1024), size: 9007199254740991, units: 'unknown' },
      axis: 'free',
      view: { yaw: worst, pitch: worst },
      axes: Object.fromEntries(TWEAK_AXES.map((a) => [a, [[token, `${'가'.repeat(119)}\ud83d`, [9999999, 1.2345e299, 1.2345e299, 1.2345e299], worst, worst, worst]]])),
    };
    const text = tweakFileText(big);
    const lines = text.split('\n').filter((l) => l.startsWith('      ['));
    expect(lines).toHaveLength(7);
    for (const l of lines) expect(bytes(`${l},\n`)).toBeLessThanOrEqual(TWEAK_FILE_LINE_MAX);
    expect(bytes(text) - lines.reduce((s, l) => s + bytes(`${l}\n`), 0)).toBeLessThanOrEqual(TWEAK_FILE_HEAD_MAX);
    expect(TWEAK_FILE_MAX_ENTRIES).toBe(7 * TWEAK_FILE_MAX_PER_AXIS);
    expect(TWEAK_FILE_MAX_ENTRIES * TWEAK_FILE_LINE_MAX + TWEAK_FILE_HEAD_MAX).toBeLessThanOrEqual(TWEAK_FILE_MAX_BYTES);
    expect([TWEAK_FILE_LINE_MAX, TWEAK_FILE_MAX_BYTES]).toEqual([811, 23 * 2 ** 20]);
    // 그 꼴은 읽힌다(줄 한도 안)
    expect(readTweakFile(text).kind).toBe('ok');
    // 내보내기 쪽 한도: 방향 하나에 4,096개 넘게 손질했으면 내보내지 않는다
    const many = new ExplodeTweaks();
    many.replace('free', Array.from({ length: TWEAK_FILE_MAX_PER_AXIS }, (_, i) => [`0/${i}`, [1, 0, 0]] as const));
    expect(tweakFileFits(many)).toBe(true);
    many.replace('free', Array.from({ length: TWEAK_FILE_MAX_PER_AXIS + 1 }, (_, i) => [`0/${i}`, [1, 0, 0]] as const));
    expect(tweakFileFits(many)).toBe(false);
  });

  it('같은 문서(이름·크기가 같음)면 나무에 있는 손질을 모두 받는다 — 값은 그대로, 지문은 보지 않는다', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'x', null, planOf(d.products))!;
    const m = matchTweakFile(f, d, planOf(d.products));
    expect(m).toEqual({
      same: true,
      fp: false,
      axes: [
        ['free', [['0/1/1/0', [1, 0, 0]], ['0/2', [0.5, 1.25, -3]]]],
        ['x', [['0/0', [4]]]],
        ['sp', [['0/1/1/1', [2, -1]]]],
      ],
      taken: 4,
      skipped: 0,
      outliers: 0,
    });
    // 받아 건 손질은 내보낸 것과 같고(방향마다 한 단계), 다시 내보내면 같은 파일
    const t = new ExplodeTweaks();
    for (const [a, list] of m.axes) t.replace(a, list);
    expect(makeTweakFile(d, t, 'x', null, planOf(d.products))).toEqual(f);
    expect(['free', 'x', 'sp'].map((a) => t.canUndo(a as 'x'))).toEqual([true, true, true]);
    // 같은 문서면 지문이 달라도(곡면 품질을 바꿔 다시 연 것 등) 받는다
    const odd = JSON.parse(tweakFileText(f)) as TweakFile;
    (odd.axes.x![0] as unknown[])[2] = [9, 99, 99, 99];
    expect(matchTweakFile(odd, d, planOf(d.products)).taken).toBe(4);
    // 줄인 마디의 다른 낱말(바로 놓인 형상 덩어리 .0 — 감싼 뿌리를 둔 나무)은 그 나무의 단위 낱말로
    const wrapped = [N('W', [], tree())];
    const g: TweakFile = { ...f, axes: { x: [['0/0/2.0', 'p7', [1, 2, 2, 2], 2]] } };
    expect(matchTweakFile(g, docOf(wrapped), planOf(wrapped)).axes).toEqual([['x', [['0/0/2', [2]]]]]);
  });

  it('다른 문서(이름이나 크기가 다름)면 자리·부품 이름·지문이 맞는 것만 받고 나머지는 센다 — 단위가 다르면 바꿔 받는다', () => {
    const f = makeTweakFile(docOf(tree()), tweaked(), 'free', null, planOf(tree()))!;
    // 고쳐 저장한 판: p7 이름이 바뀌고 S3 안에 부품이 하나 앞에 늘어 p5·p6 자리가 밀렸다
    const rev = (): ProductNode[] => [
      N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p4', ['p6']), N('p5', ['p5'])])]), N('p7b', ['p7'])]),
    ];
    const other = docOf(rev(), 'asm.stp', 1300);
    const m = matchTweakFile(f, other, planOf(other.products));
    // 0/1/1/0은 이제 p4, 0/1/1/1은 p5(파일은 p6), 0/2는 p7b — S1(0/0)만 맞는다
    expect(m).toEqual({ same: false, fp: true, axes: [['x', [['0/0', [4]]]]], taken: 1, skipped: 3, outliers: 0 });
    // 이름만 바꾼 같은 나무(다른 파일 이름)는 모두 맞는다
    const renamed = docOf(tree(), 'asm-v2.stp', 1234);
    expect(matchTweakFile(f, renamed, planOf(renamed.products)).taken).toBe(4);
    // 아무것도 맞지 않는 문서
    const none = [N('Z', [], [N('q1', ['p1']), N('q2', ['p2'])])];
    expect(matchTweakFile(f, docOf(none, 'z.stp', 9), planOf(none))).toEqual({ same: false, fp: true, axes: [], taken: 0, skipped: 4, outliers: 0 });
    // 인치 문서에 받으면 성분·지문을 인치로(25.4 mm = 1 in — 상자도 인치로 그린 같은 부품이면 맞는다), 단위를 모르면 그대로
    const inchMeshes = meshes.map((x) => box(x.id, [...x.positions.slice(0, 3)].map((v) => (v + 1) / 25.4) as [number, number, number], 1 / 25.4));
    const inch = matchTweakFile(f, docOf(tree(), 'asm-in.stp', 99, 'inch'), planOf(tree(), inchMeshes));
    expect(inch.taken).toBe(4);
    expect(inch.axes[1]![0]).toBe('x');
    expect(inch.axes[1]![1][0]![1][0]).toBeCloseTo(4 / 25.4, 12);
    expect(matchTweakFile(f, docOf(tree(), 'asm.stp', 1234, 'unknown'), planOf(tree())).axes[1]).toEqual(['x', [['0/0', [4]]]]);
  });

  it('지문(39차): 자리·이름이 같아도 묶음 수나 크기가 다른 부품은 받지 않고, 삼각화가 조금 다른(1%) 같은 부품은 받는다', () => {
    const f = makeTweakFile(docOf(tree()), tweaked(), 'free', null, planOf(tree()))!;
    // 고쳐 저장한 판: p2가 커져 S1 상자가 X로 6 → 7, p7은 같은 이름에 몸체가 둘(묶음 수 1 → 2), p5·p6은 1% 커짐(곡면 품질을 바꾼 것처럼)
    const items = [box('p1', [-10, 0, 0]), box('p2', [-5.5, 0, 0], 1.5), box('p3', [6, 0, 0]), box('p5', [10, 4, 0], 1.01), box('p6', [10, -4, 0], 1.01), box('p7', [0, 10, 0]), box('p7b', [0, 10, 0], 0.5)];
    const rev = [N('A', [], [N('S1', [], [N('p1', ['p1']), N('p2', ['p2'])]), N('S2', [], [N('p3', ['p3']), N('S3', [], [N('p5', ['p5']), N('p6', ['p6'])])]), N('p7', ['p7', 'p7b'])])];
    const plan = planOf(rev, items);
    const m = matchTweakFile(f, docOf(rev, 'asm-v3.stp', 1500), plan);
    expect(m.axes).toEqual([
      ['free', [['0/1/1/0', [1, 0, 0]]]],
      ['sp', [['0/1/1/1', [2, -1]]]],
    ]);
    expect([m.taken, m.skipped, m.fp]).toEqual([2, 2, true]);
    // 지문 견주기: 묶음 수가 다르면 아님, 크기 차가 대각선의 2% 안이면 같음, 단위 배율
    expect(sameFingerprint([1, 2, 2, 2], [1, 2.04, 2, 1.97])).toBe(true);
    expect(sameFingerprint([1, 2, 2, 2], [1, 2.1, 2, 2])).toBe(false);
    expect(sameFingerprint([1, 2, 2, 2], [2, 2, 2, 2])).toBe(false);
    expect(sameFingerprint([1, 25.4, 50.8, 2.54], [1, 1, 2, 0.1], 1 / 25.4)).toBe(true);
    expect(sameFingerprint([1, 2, 2, 2], null)).toBe(false);
    // 판 2라도 지문이 null인 줄은 이름만 본다
    const nul = JSON.parse(tweakFileText(f)) as TweakFile;
    (nul.axes.x![0] as unknown[])[2] = null;
    expect(matchTweakFile(nul, docOf(rev, 'asm-v3.stp', 1500), plan).axes.find(([a]) => a === 'x')).toEqual(['x', [['0/0', [4]]]]);
  });

  it('판 1(38차 꼴) 파일도 읽는다 — 같은 문서는 그대로, 다른 문서는 지문 없이 자리·이름으로만', () => {
    const r = readTweakFile(JSON.stringify(v1()));
    expect(r).toEqual({ kind: 'ok', file: v1() });
    const f = (r as { file: TweakFile }).file;
    const same = matchTweakFile(f, docOf(tree()), planOf(tree()));
    expect([same.same, same.fp, same.taken, same.skipped]).toEqual([true, false, 4, 0]);
    expect(same.axes[0]).toEqual(['free', [['0/1/1/0', [1, 0, 0]], ['0/2', [0.5, 1.25, -3]]]]);
    // S1 상자가 바뀐 다른 문서: 판 1에는 지문이 없어 이름으로 받는다(38차와 같음)
    const items = [box('p1', [-10, 0, 0]), box('p2', [-5.5, 0, 0], 1.5), ...meshes.slice(2)];
    const diff = matchTweakFile(f, docOf(tree(), 'asm-v3.stp', 1500), planOf(tree(), items));
    expect([diff.same, diff.fp, diff.taken]).toEqual([false, false, 4]);
  });

  it('한도: 줄이 너무 많은 파일, 망가진 파일·다른 판은 읽지 않는다, 모르는 필드·방향은 무시한다', () => {
    const base = JSON.parse(tweakFileText(makeTweakFile(docOf(tree()), tweaked(), 'x', null, planOf(tree()))!)) as Record<string, unknown> & TweakFile;
    for (const bad of [
      '',
      'not json',
      '[]',
      'null',
      '{"format":"other","v":2}',
      JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, axes: {} }),
      JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, doc: { name: 'a', size: '1' }, axes: {} }),
      JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, doc: { name: 'a', size: 1 }, axes: [] }),
      JSON.stringify({ format: TWEAK_FILE_FORMAT, v: '2', doc: { name: 'a', size: 1 }, axes: {} }),
      JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, doc: { name: 'a'.repeat(1025), size: 1 }, axes: {} }),
      '['.repeat(100000),
    ])
      expect(readTweakFile(bad).kind, bad.slice(0, 40)).toBe('broken');
    expect(readTweakFile(JSON.stringify({ ...base, v: 3 }))).toEqual({ kind: 'version', v: 3 });
    // 방향 하나에 4,096줄까지는 읽고, 넘으면 통째로 읽지 않는다
    const row = ['0/0', 'S1', [2, 6, 2, 2], 1];
    expect(readTweakFile(JSON.stringify({ ...base, axes: { x: Array(TWEAK_FILE_MAX_PER_AXIS).fill(row) } })).kind).toBe('ok');
    expect(readTweakFile(JSON.stringify({ ...base, axes: { x: Array(TWEAK_FILE_MAX_PER_AXIS + 1).fill(row) } }))).toEqual({ kind: 'toomany' });
    // 모르는 필드·방향·문서 필드는 무시(받는 손질은 같다), 틀린 view·긴 units는 뺀다
    const extra = { ...base, note: 'x', doc: { ...base.doc, owner: 'x' }, axes: { ...base.axes, w: [row] }, view: { yaw: 'a' } };
    const r = readTweakFile(JSON.stringify(extra));
    expect(r.kind).toBe('ok');
    const f = (r as { file: TweakFile }).file;
    expect(Object.keys(f).sort()).toEqual(['axes', 'axis', 'doc', 'format', 'v']);
    expect(f.doc).toEqual({ name: 'asm.stp', size: 1234, units: 'mm' });
    expect(matchTweakFile(f, docOf(tree()), planOf(tree())).taken).toBe(4);
    expect((readTweakFile(JSON.stringify({ ...base, doc: { ...base.doc, units: 'x'.repeat(17) } })) as { file: TweakFile }).file.doc).toEqual({ name: 'asm.stp', size: 1234 });
    // 크기 한도는 글 길이로도 본다(파일 크기는 읽기 전에 도구가 본다)
    expect(TWEAK_FILE_MAX_BYTES).toBeGreaterThan(20e6);
  });

  it('줄마다: 꼴이 틀린 줄·0인 손질·나무에 없는 낱말·긴 낱말·긴 이름은 건너뛰고, 유한하지 않거나 조립 대각선의 1만 배를 넘는 성분은 이상값으로 센다', () => {
    const plan = planOf(tree());
    const reach = TWEAK_FILE_REACH * plan.size;
    const fp = [2, 6, 2, 2];
    const rows = [
      ['0/0', 'S1', fp, 1],
      ['0/0', 'S1', fp, 1, 2],
      ['bad', 'S1', fp, 1],
      ['0/0', 7, fp, 1],
      ['0/0', 'S1', fp, 0],
      ['9/9', 'Q', fp, 1],
      ['0/0', 'S1', fp, 'x'],
      'row',
      ['0/0', 'S1', [0, 1, 1, 1], 1],
      ['0/0', 'S1', [1.5, 1, 1, 1], 1],
      ['0/0', 'S1', [1, 1, -1, 1], 1],
      ['0/0', 'S1', [1, 1, 1], 1],
      [`${'1/'.repeat(128)}1`, 'S1', fp, 1],
      ['0/0', 'S'.repeat(4097), fp, 1],
      ['0/1', 'S2', [3, 6, 10, 2], -2],
    ];
    // 이상값: JSON의 1e400(= 무한), 한도를 조금 넘은 것, 1e15
    const text = JSON.stringify({ format: TWEAK_FILE_FORMAT, v: 2, doc: { name: 'asm.stp', size: 1234, units: 'mm' }, axis: 'x', axes: { x: rows, z: [['0/2', 'p7', [1, 2, 2, 2], reach * 1.001], ['0/2', 'p7', [1, 2, 2, 2], 1e15], ['0/2', 'p7', [1, 2, 2, 2], reach * 0.999]] } }).replace(
      '"z":[',
      '"y":[["0/2","p7",[1,2,2,2],1e400]],"z":[',
    );
    const r = readTweakFile(text);
    expect(r.kind).toBe('ok');
    const m = matchTweakFile((r as { file: TweakFile }).file, docOf(tree()), plan);
    expect(m.axes).toEqual([
      ['x', [['0/0', [1]], ['0/1', [-2]]]],
      ['z', [['0/2', [reach * 0.999]]]],
    ]);
    expect([m.taken, m.skipped, m.outliers]).toEqual([3, 13, 3]);
  });

  it('받은 뒤 보일 방향: 내보낸 때의 방향을 받았으면 그것, 아니면 지금 방향(받았으면), 아니면 받은 첫 방향 — 화면 방향을 받았으면 파일의 카메라 각', () => {
    const d = docOf(tree());
    const f = makeTweakFile(d, tweaked(), 'sp', { yaw: 1, pitch: 0.5 }, planOf(d.products))!;
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
