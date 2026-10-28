/**
 * 실제 파일 훑기 도구(scripts/sweep) 시험: 합성 표본으로 고르기·중복 빼기·분류·품질 지표·요약·비교를 확인한다.
 * 끝의 시험은 CLI(node scripts/sweep/sweep.mjs → vite-node 일꾼)를 임시 폴더에서 실제로 돌린다.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STEP_XML_MESSAGE, stepToScene, TRUNCATED_WARNING } from '../src/index';
import { crc32 } from '../src/archive';
import { STEP_EXTENSIONS as APP_STEP_EXTENSIONS } from '../src/app/files';
import { IFC_MESSAGE } from '../src/app/protocol';
import { errorCode, failReasons, sceneClass, schemaLabel, warningCode } from '../scripts/sweep/classify';
import { areaMismatch, itemQuality, massPropsStats, propsSignature, sceneQuality, transferStats } from '../scripts/sweep/metrics';
import { qualityOptions } from '../scripts/sweep/quality';
import { sweepOne } from '../scripts/sweep/worker';
import { dedupe, extensionOf, keepOpenable, nameKind, STEP_EXTENSIONS, walkDirs } from '../scripts/sweep/files.mjs';
import { formatSummary, percentile, summarize, type SweepRecord } from '../scripts/sweep/summary.mjs';
import { compareRecords, formatCompare } from '../scripts/sweep/compare.mjs';
import { parseArgs } from '../scripts/sweep/sweep.mjs';
import { cube, cylinder, StepText } from './stepText';
import { curveStep } from './app/curvescene';
import { makeZip } from './zipText';

const root = resolve(__dirname, '..');

function partStep(build: (w: StepText) => number[]): string {
  const w = new StepText();
  const items = build(w);
  w.product('part', items, w.context());
  return w.toString();
}

/** FNAME(원래 이름)을 머리에 적은 gzip — node:zlib gzip은 이름을 적지 않아 직접 만든다 */
function gzipNamed(data: Uint8Array, name: string): Uint8Array {
  const head = Buffer.from([0x1f, 0x8b, 8, 0x08, 0, 0, 0, 0, 0, 3]);
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(crc32(data) >>> 0, 0);
  tail.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, Buffer.from(name + '\0', 'latin1'), deflateRawSync(data), tail]);
}

describe('훑기: 분류 코드', () => {
  it('경고 글 → 코드', () => {
    expect(warningCode(TRUNCATED_WARNING)).toBe('truncated');
    expect(warningCode('지원하지 않는 개체 OFFSET_SURFACE 3개')).toBe('unsupported:OFFSET_SURFACE');
    expect(warningCode('삼각화하지 못한 면 2개 / 10개 (지원하지 않는 곡면 2)')).toBe('failed-faces');
    expect(warningCode('그릴 형상을 찾지 못했다(B-rep·삼각형 형식 없음)')).toBe('no-geometry');
    expect(warningCode('새 경고 12개와 3.5')).toBe('other:새 경고 N개와 N');
  });
  it('실패 면 이유를 모은다', () => {
    expect(failReasons(['삼각화하지 못한 면 5개 / 10개 (지원하지 않는 곡면 3, 읽지 못함 2)', '다른 경고'])).toEqual({ '지원하지 않는 곡면': 3, '읽지 못함': 2 });
  });
  it('앱이 알고 거절하는 오류와 예외를 가른다', () => {
    expect(errorCode(STEP_XML_MESSAGE)).toEqual({ code: 'step-xml', rejected: true });
    expect(errorCode(IFC_MESSAGE)).toEqual({ code: 'ifc', rejected: true });
    expect(errorCode('STEP 파일이 아닙니다(ISO-10303-21 머리가 없습니다).')).toEqual({ code: 'not-step', rejected: true });
    expect(errorCode('ZIP 안에 STEP 파일(.stp·.step·.p21)이 없습니다. 빈 ZIP입니다.')).toEqual({ code: 'zip-no-step', rejected: true });
    expect(errorCode('Invalid array length')).toEqual({ code: 'out-of-memory', rejected: false });
    expect(errorCode('TypeError: x is undefined at 12')).toEqual({ code: 'exception:TypeError: x is undefined at N', rejected: false });
  });
  it('FILE_SCHEMA → 판', () => {
    expect(schemaLabel(['AUTOMOTIVE_DESIGN'])).toBe('AP214');
    expect(schemaLabel(['CONFIG_CONTROL_DESIGN'])).toBe('AP203');
    expect(schemaLabel(['AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_OF_MECHANICAL_PARTS_AND_ASSEMBLY_MIM_LF'])).toBe('AP203e2');
    expect(schemaLabel(['AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'])).toBe('AP242');
    expect(schemaLabel(['IFC4'])).toBe('IFC');
    expect(schemaLabel([])).toBe('none');
  });
  it('해석이 끝난 파일의 분류', () => {
    expect(sceneClass(false, 0, 1)).toBe('empty');
    expect(sceneClass(true, 2, 1)).toBe('partial');
    expect(sceneClass(true, 0, 1)).toBe('warning');
    expect(sceneClass(true, 0, 0)).toBe('ok');
  });
  it('곡면 품질 이름: 앱 이름은 앱 선택 그대로, 숫자는 최대 각만', () => {
    expect(qualityOptions('normal')).toEqual({});
    expect(qualityOptions('fine')).toEqual({ tolerance: 0.0003, angleTolerance: 10 });
    expect(qualityOptions('5')).toEqual({ angleTolerance: 5 });
    expect(() => qualityOptions('high')).toThrow();
  });
});

describe('훑기: 품질 지표', () => {
  // 바깥 법선으로 감긴 사면체
  const P = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const I = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  /** 정점 법선을 각 삼각형 감기 법선으로(삼각형마다 정점을 따로) */
  function flat(pos: Float32Array, idx: Uint32Array, flipNormalOf = -1) {
    const p: number[] = [];
    const n: number[] = [];
    for (let t = 0; t < idx.length / 3; t++) {
      const v = [0, 1, 2].map((k) => [pos[idx[t * 3 + k]! * 3]!, pos[idx[t * 3 + k]! * 3 + 1]!, pos[idx[t * 3 + k]! * 3 + 2]!]);
      const u = v[1]!.map((x, k) => x - v[0]![k]!);
      const w = v[2]!.map((x, k) => x - v[0]![k]!);
      let c = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
      if (t === flipNormalOf) c = c.map((x) => -x);
      for (const x of v) {
        p.push(...x);
        n.push(...c);
      }
    }
    return { positions: new Float32Array(p), normals: new Float32Array(n), indices: Uint32Array.from({ length: p.length / 3 }, (_, i) => i) };
  }

  it('바른 닫힌 입체: 감기·부피·접힘 문제 없음', () => {
    const q = itemQuality({ ...flat(P, I), closed: true });
    expect(q).toMatchObject({ solid: true, closedShell: true, windingEdges: 0, folded: 0, triangles: 4 });
    expect(q.volume).toBeCloseTo(1 / 6, 6);
  });
  it('안쪽으로 감긴 입체는 부피가 음수', () => {
    const rev = Uint32Array.from(I, (_, i) => I[i - (i % 3) + (2 - (i % 3))]!);
    const q = itemQuality({ ...flat(P, rev), closed: true });
    expect(q.volume).toBeLessThan(0);
    expect(q.windingEdges).toBe(0);
  });
  it('삼각형 하나만 거꾸로 감기면 감기가 어긋난 모서리', () => {
    const one = Uint32Array.from(I);
    [one[1], one[2]] = [one[2]!, one[1]!];
    const q = itemQuality({ positions: P, indices: one, closed: true });
    expect(q.windingEdges).toBe(3);
  });
  it('정점 법선이 감기와 반대인 삼각형은 접힘(개수·넓이 비율)', () => {
    const q = itemQuality({ ...flat(P, I, 3), doubleSided: true });
    expect(q.solid).toBe(false);
    expect(q.closedShell).toBe(false);
    expect(q.folded).toBe(1);
    expect(q.foldedRatio).toBeCloseTo(0.25, 6);
    const big = Math.sqrt(3) / 2;
    expect(q.foldedAreaRatio).toBeCloseTo(big / (1.5 + big), 6);
  });
  it('질량 속성 지표: 원기둥은 곡면 적분 정확, 삼각형 부피와의 차를 잰다, 같은 면 표는 한 번', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cylinder(w, 5, 20)], ctx);
    const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, w.ax2([0, 0, 0]), 'a');
    w.place(root, part, w.ax2([50, 0, 0]), 'b');
    const mp = massPropsStats(stepToScene(w.bytes()));
    expect(mp).toMatchObject({ solids: 1, exact: 1, approx: 0, triangles: 0, timeout: 0, maxRelBound: 0 });
    expect(mp.maxRelChange).toBeGreaterThan(1e-4);
    const timedOut = massPropsStats(stepToScene(w.bytes(), { propsBudget: { minMs: -1, share: 0 } }));
    expect(timedOut).toMatchObject({ solids: 1, timeout: 1, exact: 0 });
    // 값 지문: 같은 해석은 같고, 다른 길로 구한 값(삼각형)은 다르다
    expect(mp.sig).toMatch(/^[0-9a-f]{16}$/);
    expect(massPropsStats(stepToScene(w.bytes())).sig).toBe(mp.sig);
    expect(timedOut.sig).not.toBe(mp.sig);
  });
  it('질량 속성 값 지문: FNV-1a 64비트(float64 바이트), 한 비트만 달라도 바뀐다', () => {
    // 빈 목록은 FNV-1a 64의 시작 값
    expect(propsSignature([])).toBe('cbf29ce484222325');
    const a = propsSignature([Float64Array.of(1, 2.5, -3)]);
    expect(propsSignature([[1, 2.5, -3]])).toBe(a);
    const ulp = new Float64Array([2.5]);
    new BigUint64Array(ulp.buffer)[0]! += 1n;
    expect(propsSignature([[1, ulp[0]!, -3]])).not.toBe(a);
    // 입체 경계가 다르면 다르다
    expect(propsSignature([[1], [2.5, -3]])).not.toBe(a);
  });
  it('면 표 넓이와 삼각형 넓이 차', () => {
    const m = { positions: P, indices: I };
    // 면 0(삼각형 0) 넓이 0.5 정확, 면 1(삼각형 1~3) 넓이를 일부러 2배로
    const real = 0.5 + 0.5 + 0.5 + Math.sqrt(3) / 2;
    const r = areaMismatch(m, { triStart: [0, 1, 4], area: [0.5, (real - 0.5) * 2], exact: [1, 0] });
    expect(r.faces).toBe(1);
    expect(r.max).toBeCloseTo(0.5, 6);
  });
  it('장면 지표: 같은 형상 두 자리는 형상 항목 하나로 센다', () => {
    const text = partStep((w) => [cube(w, 10).solid, cylinder(w, 3, 8)]);
    const s = stepToScene(new TextEncoder().encode(text));
    const q = sceneQuality({ meshes: [...s.meshes, { ...s.meshes[0]!, id: 'again' }], meta: s.meta });
    expect(q).toMatchObject({ items: 2, closedShells: 2, solids: 2, openShells: 0, windingSolids: 0, negativeVolumeSolids: 0, nonFinite: 0, areaMismatchFaces: 0 });
  });
  it('전송량: 이전 버퍼 합, 모서리 표·곡선 정의 바이트, 곡선 모서리와 정의로 접선을 구하는 것', () => {
    // 원 둘(한 바퀴 — 정의는 params, 원기둥 표에는 기록 배열이 없다), 타원 판 표(모서리 셋 — 타원 호 기록 5수: 틀 x축 3수와 두 끝 매개변수 2수 — 16차까지 3수),
    // B-스플라인 판 표(모서리 넷 — 3차: 머리 6 + 매듭 8 + 조절점 12 = 26수)
    const x = transferStats({ scene: stepToScene(curveStep()) });
    expect(x).toMatchObject({ curved: 4, exact: 4, curves: (5 + 26) * 8 + (4 + 5) * 4 });
    expect(x.edges).toBeGreaterThan(x.curves);
    expect(x.xfer).toBeGreaterThan(x.edges);
    // 곡선 정의가 없는 표(곧은 모서리만)
    const box = transferStats({ scene: stepToScene(new TextEncoder().encode(partStep((w) => [cube(w, 10).solid]))) });
    expect(box).toMatchObject({ curved: 0, exact: 0, curves: 0 });
  });
});

describe('훑기: 표본 고르기와 CLI', () => {
  let dir = '';
  const box = partStep((w) => [cube(w, 10).solid]);
  const cyl = partStep((w) => [cylinder(w, 5, 20)]);
  const noGeom = partStep(() => []);
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'opencad-sweep-'));
    const s = join(dir, 'samples');
    mkdirSync(join(s, 'sub'), { recursive: true });
    mkdirSync(join(s, '.hidden'), { recursive: true });
    mkdirSync(join(s, 'node_modules'), { recursive: true });
    writeFileSync(join(s, 'box.stp'), box);
    writeFileSync(join(s, 'sub', 'box-copy.STEP'), box);
    writeFileSync(join(s, 'cyl.p21'), cyl);
    writeFileSync(join(s, 'empty-product.step'), noGeom);
    writeFileSync(join(s, 'not-step.stp'), 'just text\n');
    writeFileSync(join(s, 'cyl.stp.gz'), gzipSync(cyl));
    writeFileSync(join(s, 'named.gz'), gzipNamed(new TextEncoder().encode(box.replace('test model', 'named')), 'model.step'));
    writeFileSync(join(s, 'log.gz'), gzipNamed(new TextEncoder().encode('log'), 'server.log'));
    writeFileSync(join(s, 'pack.zip'), makeZip([{ name: 'part/cyl2.stp', data: new TextEncoder().encode(cyl.replace('test model', 'zipped')) }]));
    writeFileSync(join(s, 'other.zip'), makeZip([{ name: 'readme.txt', data: new TextEncoder().encode('hi') }]));
    writeFileSync(join(s, 'notes.txt'), 'x');
    writeFileSync(join(s, '.hidden', 'h.stp'), box);
    writeFileSync(join(s, 'node_modules', 'n.stp'), box);
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('앱과 같은 STEP 확장자', () => {
    expect(STEP_EXTENSIONS).toEqual([...APP_STEP_EXTENSIONS]);
    expect(nameKind('A.STP')).toBe('step');
    expect(nameKind('a.stp.gz')).toBe('packed');
    expect(nameKind('a.stpZ')).toBe('packed');
    expect(nameKind('a.gz')).toBe('gz');
    expect(nameKind('a.zip')).toBe('zip');
    expect(nameKind('a.igs')).toBeNull();
    expect(extensionOf('x/Y.STP.GZ')).toBe('.stp.gz');
    expect(extensionOf('x/y.step')).toBe('.step');
  });

  it('고르기: 숨은 폴더·node_modules는 건너뛰고, .gz·.zip은 안에 STEP이 있을 때만, 같은 내용은 하나로', async () => {
    const s = join(dir, 'samples');
    const walked = await walkDirs([s]);
    const rel = (ps: string[]) => ps.map((p) => p.slice(s.length + 1)).sort();
    expect(rel(walked)).toEqual(['box.stp', 'cyl.p21', 'cyl.stp.gz', 'empty-product.step', 'log.gz', 'named.gz', 'not-step.stp', 'other.zip', 'pack.zip', 'sub/box-copy.STEP']);
    const kept = await keepOpenable(walked);
    expect(rel(kept)).toEqual(['box.stp', 'cyl.p21', 'cyl.stp.gz', 'empty-product.step', 'named.gz', 'not-step.stp', 'pack.zip', 'sub/box-copy.STEP']);
    const { files, unreadable } = await dedupe(kept);
    expect(unreadable).toBe(0);
    expect(files).toHaveLength(7);
    const boxRec = files.find((f) => f.path.endsWith('box.stp'))!;
    expect(boxRec.copies).toBe(2);
    expect(boxRec.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('일꾼 한 파일: 앱 해석 길(압축 풀기·STEP 가리기)', async () => {
    const s = join(dir, 'samples');
    const ok = await sweepOne(join(s, 'cyl.stp.gz'), 'normal', {});
    expect(ok).toMatchObject({ class: 'ok', container: 'gzip', ap: 'AP214', failedFaces: 0, warnings: [] });
    expect(ok.q).toMatchObject({ solids: 1, windingSolids: 0 });
    const zip = await sweepOne(join(s, 'pack.zip'), 'normal', {});
    expect(zip).toMatchObject({ class: 'ok', container: 'zip' });
    const bad = await sweepOne(join(s, 'not-step.stp'), 'normal', {});
    expect(bad).toMatchObject({ class: 'rejected', error: 'not-step' });
    const empty = await sweepOne(join(s, 'empty-product.step'), 'normal', {});
    expect(empty).toMatchObject({ class: 'empty', warnings: ['no-geometry'] });
    const fine = await sweepOne(join(s, 'cyl.p21'), 'fine', qualityOptions('fine'));
    expect(fine.triangles!).toBeGreaterThan(ok.triangles!);
  });

  it('인자: 폴더가 없으면 쓰는 법만, 환경 변수로도 받는다', () => {
    expect(parseArgs([], {})).toMatchObject({ dirs: [], list: null, qualities: ['normal'] });
    expect(parseArgs([], { OPENCAD_SWEEP_DIRS: '/a:/b' }).dirs).toEqual(['/a', '/b']);
    expect(parseArgs(['--dirs', '/x', '--quality', 'normal,10,5', '--jobs', '2', '--limit', '5']).qualities).toEqual(['normal', '10', '5']);
    expect(() => parseArgs(['--quality', 'best'])).toThrow();
    expect(() => parseArgs(['--resume', '--force'])).toThrow();
    const r = spawnSync(process.execPath, [join(root, 'scripts/sweep/sweep.mjs')], { cwd: root, env: { ...process.env, OPENCAD_SWEEP_DIRS: '' }, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('npm run sweep');
  });

  it('CLI: 훑기 → records.jsonl·summary.json, 같은 결과끼리 비교하면 바뀐 것 없음', () => {
    const out = join(dir, 'out');
    const run = (args: string[]) => spawnSync(process.execPath, [join(root, 'scripts/sweep/sweep.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 110_000 });
    const r = run(['--dirs', join(dir, 'samples'), '--out', out, '--jobs', '2', '--quality', 'normal,10']);
    expect(r.status, r.stderr).toBe(0);
    const records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SweepRecord);
    expect(records).toHaveLength(14);
    expect(records.every((x) => /^[0-9a-f]{64}$/.test(x.hash))).toBe(true);
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    expect(summary.done).toBe(true);
    expect(summary.qualities).toEqual(['normal', '10']);
    expect(summary.input).toMatchObject({ found: 10, step: 8, unique: 7, duplicates: 1, swept: 7 });
    expect(JSON.stringify(summary)).not.toContain(dir);
    const n = summary.byQuality.normal;
    expect(n.classes).toMatchObject({ ok: 5, empty: 1, rejected: 1, error: 0, timeout: 0, crash: 0 });
    expect(n.containers).toEqual({ plain: 4, gzip: 2, zip: 1 });
    expect(n.errors).toEqual({ 'not-step': 1 });
    expect(n.quality).toMatchObject({ exceptions: 0, solids: 5, windingFiles: 0, negativeVolumeFiles: 0, foldedFiles: 0 });
    expect(summary.byQuality['10'].quality.triangles).toBeGreaterThan(n.quality.triangles);
    // 결과가 있으면 --resume·--force 없이는 덮어쓰지 않는다
    expect(run(['--dirs', join(dir, 'samples'), '--out', out]).status).toBe(2);
    const cmp = spawnSync(process.execPath, [join(root, 'scripts/sweep/compare.mjs'), out, out, '--fail-on-change'], { cwd: root, encoding: 'utf8' });
    expect(cmp.status, cmp.stderr).toBe(0);
    expect(cmp.stdout).toContain('바뀐 것이 없습니다');
    expect(cmp.stdout).not.toContain(dir);
  });
});

describe('훑기: 요약과 비교', () => {
  const rec = (hash: string, over: Partial<SweepRecord> = {}): SweepRecord => ({
    hash,
    quality: 'normal',
    class: 'ok',
    ms: 10,
    triangles: 100,
    failedFaces: 0,
    warnings: [],
    q: { closedShells: 1, solids: 1, openShells: 0, windingSolids: 0, windingEdges: 0, negativeVolumeSolids: 0, foldedTriangles: 0, foldedMaxRatio: 0, foldedMaxAreaRatio: 0, areaMismatchFaces: 0, nonFinite: 0 },
    ...over,
  });

  it('백분위(가까운 순위)', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect([percentile(v, 50), percentile(v, 90), percentile(v, 99), percentile([], 50)]).toEqual([50, 90, 99, 0]);
  });

  it('요약: 감기·부피·접힘 파일 수와 최대 비율', () => {
    const s = summarize([
      rec('a'),
      rec('b', { q: { ...rec('b').q!, windingSolids: 2, windingEdges: 6, foldedTriangles: 1, foldedMaxRatio: 0.002, foldedMaxAreaRatio: 0.0001 } }),
      rec('c', { q: { ...rec('c').q!, negativeVolumeSolids: 1, foldedTriangles: 1, foldedMaxRatio: 0.0005 } }),
      rec('d', { class: 'error', error: 'exception:x', triangles: undefined, q: undefined, ms: 50 }),
    ]);
    const q = s.byQuality.normal!.quality;
    expect(q).toMatchObject({ windingSolids: 2, windingFiles: 1, negativeVolumeFiles: 1, foldedFiles: 1, foldedAnyFiles: 2, foldedMaxRatio: 0.002, exceptions: 1, triangles: 300 });
    expect(s.byQuality.normal!.time).toMatchObject({ totalMs: 80, max: 50 });
    expect(s.byQuality.normal!.transfer).toBeUndefined();
    expect(s.done).toBe(true);
  });

  it('요약: 전송량(기록에 x가 있는 파일만) — 합·백분위·최대, 모서리 표·곡선 정의 바이트, 곡선 모서리 수', () => {
    const x = (xfer: number, edges: number, curves: number, curved: number, exact: number) => ({ x: { xfer, edges, curves, curved, exact } });
    const s = summarize([rec('a', x(1000, 400, 100, 5, 5)), rec('b', x(3000, 800, 0, 2, 1)), rec('c'), rec('d', x(2000, 0, 0, 0, 0))]);
    expect(s.byQuality.normal!.transfer).toEqual({ files: 3, totalBytes: 6000, p50: 2000, p90: 3000, max: 3000, edgeBytes: 1200, curveBytes: 100, curvedEdges: 7, exactEdges: 6 });
    expect(formatSummary(s)).toContain('곡선 모서리 7개 가운데 정의로 접선 6개');
  });

  it('비교: 분류·새 예외·지표가 바뀐 파일, 한쪽에 없는 값은 건너뜀', () => {
    const before = [rec('a'), rec('b'), rec('c'), rec('d'), rec('e', { q: undefined })];
    const after = [
      rec('a'),
      rec('b', { class: 'error', error: 'exception:x', triangles: undefined, q: undefined }),
      rec('c', { triangles: 120 }),
      rec('d', { q: { ...rec('d').q!, windingSolids: 1, windingEdges: 3 }, warnings: ['truncated'] }),
      rec('e'),
      rec('f'),
    ];
    const res = compareRecords(before, after, { top: 10 });
    const q = res.qualities.normal!;
    expect(res.changed).toBe(true);
    expect(q).toMatchObject({ pairs: 5, onlyBefore: 0, onlyAfter: 1, classChanged: 1, classChanges: { 'ok→error': 1 }, metricChanged: 3 });
    expect(q.newExceptions.map((e) => e.hash)).toEqual(['b']);
    expect(q.top.map((c) => c.hash)).toEqual(['b', 'd', 'c']);
    expect(q.top[1]!.diff).toMatchObject({ windingSolids: [0, 1], windingEdges: [0, 3], warnings: { added: ['truncated'], removed: [] } });
    expect(q.summary.windingFiles).toEqual([0, 1]);
    expect(formatCompare(res)).toContain('분류가 바뀐 파일 1개');
    expect(compareRecords(before, before).changed).toBe(false);
  });

  it('비교: 질량 속성 값 지문·구한 길이 바뀐 파일(옛 결과에 없으면 건너뜀)', () => {
    const mp = { solids: 2, exact: 2, approx: 0, triangles: 0, timeout: 0, maxRelBound: 0, maxRelChange: 0.01, sig: '0123456789abcdef' };
    const before = [rec('a', { mp }), rec('b', { mp }), rec('c')];
    const after = [rec('a', { mp }), rec('b', { mp: { ...mp, exact: 1, timeout: 1, sig: 'fedcba9876543210' } }), rec('c', { mp })];
    const q = compareRecords(before, after).qualities.normal!;
    expect(q.metricChanged).toBe(1);
    expect(q.top[0]!.diff).toEqual({ propsExact: [2, 1], propsTimeout: [0, 1], propsSig: ['0123456789abcdef', 'fedcba9876543210'] });
  });
});
