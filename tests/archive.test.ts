import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { crc32, inflate, isStepXml, sniffContainer, STEP_XML_MESSAGE, unpackStep, zipEntries } from '../src/archive';
import { parseStepFile } from '../src/app/job';
import { isPackedStepName, isOpenableName, OPEN_ACCEPT } from '../src/app/files';
import { stageLabel } from '../src/app/format';
import { cube, StepText } from './stepText';
import { makeZip } from './zipText';

const enc = (s: string) => new TextEncoder().encode(s);

function cubeStep(name = 'cube'): Uint8Array {
  const w = new StepText();
  const ctx = w.context('mm');
  w.product(name, [cube(w, 10).solid], ctx);
  return w.bytes(`${name}.stp`);
}

describe('sniffContainer·isStepXml', () => {
  it('gzip·ZIP·STEP·XML·빈 파일', () => {
    expect(sniffContainer(new Uint8Array([0x1f, 0x8b, 8]))).toBe('gzip');
    expect(sniffContainer(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip');
    expect(sniffContainer(new Uint8Array([0x50, 0x4b, 5, 6]))).toBe('zip');
    expect(sniffContainer(enc('﻿ /* c */ ISO-10303-21;'))).toBe('step');
    expect(sniffContainer(enc('<?xml version="1.0"?><iso_10303_28/>'))).toBe('xml');
    expect(sniffContainer(new Uint8Array(0))).toBe('empty');
    expect(sniffContainer(enc('hello'))).toBe('unknown');
    expect(isStepXml(enc('<?xml version="1.0"?>\n<p28:iso_10303_28 xmlns:p28="urn:oid:1.0.10303.28.2.1.1">'))).toBe(true);
    expect(isStepXml(enc('<?xml version="1.0"?><svg/>'))).toBe(false);
  });
  it('crc32는 알려진 값', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('inflate·unpackStep', () => {
  const step = cubeStep();

  it('gzip(.stp.gz)을 풀고 진행률을 알린다', async () => {
    const gz = new Uint8Array(gzipSync(step));
    const fr: number[] = [];
    const u = await unpackStep(gz, (f) => fr.push(f));
    expect(u.containers).toEqual(['gzip']);
    expect(u.packedSize).toBe(gz.length);
    expect(Buffer.from(u.bytes).equals(Buffer.from(step))).toBe(true);
    expect(fr.at(-1)).toBe(1);
  });

  it('압축이 아니면 그대로', async () => {
    const u = await unpackStep(step);
    expect(u.containers).toEqual([]);
    expect(u.bytes).toBe(step);
  });

  it('상한을 넘으면 멈춘다·손상된 gzip은 알기 쉬운 오류', async () => {
    const gz = new Uint8Array(gzipSync(new Uint8Array(200_000)));
    await expect(inflate(gz, 'gzip', { limit: 1000 })).rejects.toThrow(/넘어 열 수 없습니다/);
    const bad = gz.slice(0, 20);
    await expect(inflate(bad, 'gzip')).rejects.toThrow(/압축을 풀지 못했습니다/);
  });

  it('ZIP: deflate·저장, 가장 큰 STEP을 고르고 macOS 부스러기는 뺀다', async () => {
    const small = cubeStep('small');
    const z = makeZip([
      { name: '__MACOSX/._big.stp', data: enc('junk') },
      { name: 'readme.txt', data: enc('hi'), method: 0 },
      { name: 'dir/small.STEP', data: small, method: 0 },
      { name: 'dir/big.stp', data: step },
    ]);
    const list = zipEntries(z);
    expect(list.map((e) => e.name)).toEqual(['__MACOSX/._big.stp', 'readme.txt', 'dir/small.STEP', 'dir/big.stp']);
    const u = await unpackStep(z);
    expect(u.containers).toEqual(['zip']);
    const want = step.length >= small.length ? 'dir/big.stp' : 'dir/small.STEP';
    expect(u.entry).toBe(want);
    expect(u.notes[0]).toMatch(/STEP 파일 2개 가운데 가장 큰/);
  });

  it('ZIP64 끝 목록과 ZIP 안의 .stp.gz', async () => {
    const z = makeZip([{ name: 'part.stp.gz', data: new Uint8Array(gzipSync(step)), method: 0 }], { zip64: true });
    const u = await unpackStep(z);
    expect(u.containers).toEqual(['zip', 'gzip']);
    expect(u.entry).toBe('part.stp.gz');
    expect(Buffer.from(u.bytes).equals(Buffer.from(step))).toBe(true);
  });

  it('ZIP 오류: STEP 없음(목록 보임)·STEP-XML·암호·지원하지 않는 방식·CRC·잘린 파일', async () => {
    await expect(unpackStep(makeZip([{ name: 'a.txt', data: enc('a') }, { name: 'b.dxf', data: enc('b') }]))).rejects.toThrow(/STEP 파일\(\.stp·\.step·\.p21\)이 없습니다.*a\.txt, b\.dxf/);
    await expect(unpackStep(makeZip([{ name: 'model.stpx', data: enc('<?xml?>') }]))).rejects.toThrow(STEP_XML_MESSAGE);
    await expect(unpackStep(makeZip([{ name: 'a.stp', data: step, flags: 1 }]))).rejects.toThrow(/암호/);
    await expect(unpackStep(makeZip([{ name: 'a.stp', data: step, method: 0, fakeMethod: 14 }]))).rejects.toThrow(/LZMA/);
    await expect(unpackStep(makeZip([{ name: 'a.stp', data: step, badCrc: true }]))).rejects.toThrow(/CRC/);
    const z = makeZip([{ name: 'a.stp', data: step }]);
    await expect(unpackStep(z.subarray(0, z.length - 30))).rejects.toThrow(/중앙 디렉터리|손상/);
    await expect(unpackStep(enc('<?xml version="1.0"?><iso_10303_28 xmlns="urn:oid:1.0.10303.28.2.1.1"/>'))).rejects.toThrow(STEP_XML_MESSAGE);
  });
});

describe('parseStepFile(워커 일)', () => {
  const step = cubeStep();
  it('gzip STEP: 풀고 해석, 내력과 단계', async () => {
    const stages = new Set<string>();
    let last = 0;
    let monotonic = true;
    const res = await parseStepFile('cube.stp.gz', new Uint8Array(gzipSync(step)), (f, s) => {
      stages.add(s);
      if (f + 1e-9 < last) monotonic = false;
      last = f;
    });
    expect(res.scene.meshes).toHaveLength(1);
    expect(res.scene.name).toBe('cube.stp');
    expect(res.source?.containers).toEqual(['gzip']);
    expect(res.source?.size).toBe(step.length);
    expect(stages.has('압축 풀기')).toBe(true);
    expect(stages.has('삼각화')).toBe(true);
    expect(monotonic).toBe(true);
  });
  it('ZIP STEP과 알림, 평문 STEP은 내력 없음', async () => {
    const res = await parseStepFile('bundle.zip', makeZip([{ name: 'x/one.stp', data: step }, { name: 'x/two.stp', data: cubeStep('two') }]));
    expect(res.source?.entry).toMatch(/\.stp$/);
    expect(res.scene.warnings?.[0]).toMatch(/가운데 가장 큰/);
    const plain = await parseStepFile('cube.stp', step.slice().buffer);
    expect(plain.source).toBeUndefined();
    expect(plain.scene.meshes).toHaveLength(1);
  });
  it('STEP이 아닌 것', async () => {
    await expect(parseStepFile('a.stp.gz', new Uint8Array(gzipSync(enc('hello'))))).rejects.toThrow(/압축을 풀었지만 STEP 글이 아닙니다/);
    await expect(parseStepFile('a.stpx', enc('<?xml version="1.0"?><iso_10303_28/>'))).rejects.toThrow(STEP_XML_MESSAGE);
  });
});

describe('파일 이름·단계 글', () => {
  it('압축 STEP 이름·열기 상자 accept', () => {
    expect(isPackedStepName('a.stp.gz')).toBe(true);
    expect(isPackedStepName('A.STPZ')).toBe(true);
    expect(isPackedStepName('a.zip')).toBe(true);
    expect(isPackedStepName('a.stp')).toBe(false);
    expect(isOpenableName('a.step')).toBe(true);
    expect(isOpenableName('a.stpZ')).toBe(true);
    expect(isOpenableName('a.dxf')).toBe(false);
    for (const e of ['.stp', '.step', '.p21', '.stpz', '.gz', '.zip', '.STPZ', '.ZIP']) expect(OPEN_ACCEPT.split(',')).toContain(e);
    expect(stageLabel('압축 풀기')).toBe('압축 푸는 중');
    expect(stageLabel('받기')).toBe('파일 받는 중');
  });
});
