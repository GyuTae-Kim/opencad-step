import { describe, expect, it } from 'vitest';
import type { Scene3d } from 'opencad-viewer3d/types';
import { collectTransfers, errorText, friendlyError, sceneHasGeometry, sniffStep } from '../../src/app/protocol';
import { stepToScene } from '../../src/index';
import { sampleStepBytes } from '../../src/app/sample';

const enc = (s: string) => new TextEncoder().encode(s);

describe('collectTransfers', () => {
  it('형식 배열의 버퍼를 한 번씩, 같은 버퍼를 여러 곳이 가리켜도 한 번만', () => {
    const shared = new Float32Array(9);
    const idx = new Uint32Array(3);
    const value = {
      meshes: [
        { positions: shared, indices: idx },
        { positions: shared, indices: idx, matrix: new Float64Array(16) },
      ],
      meta: { map: new Map([['a', new Uint8Array(4)]]), set: new Set([new Int32Array(2)]) },
      raw: new ArrayBuffer(8),
      empty: new Float32Array(0),
    };
    const t = collectTransfers(value);
    expect(t).toHaveLength(6);
    expect(new Set(t).size).toBe(t.length);
    expect(t).toContain(shared.buffer);
    expect(t).toContain(value.raw);
  });

  it('부분 보기(subarray)는 바탕 버퍼를 넣고, 순환 참조에서 멈춘다', () => {
    const base = new Float32Array(12);
    const a: Record<string, unknown> = { v: base.subarray(3, 6), w: base };
    a.self = a;
    expect(collectTransfers(a)).toEqual([base.buffer]);
    expect(collectTransfers(null)).toEqual([]);
    expect(collectTransfers(42)).toEqual([]);
  });

  it('실제 STEP 장면: 넘긴 뒤 구조적 복제가 같은 버퍼 공유를 지킨다', () => {
    const scene = stepToScene(sampleStepBytes());
    const t = collectTransfers({ scene, ms: 1 });
    expect(new Set(t).size).toBe(t.length);
    // structuredClone은 postMessage와 같은 규칙(이전 목록에 중복이 있으면 실패)
    const copy = structuredClone({ scene }, { transfer: t });
    const blocks = copy.scene.meshes.filter((m) => m.group === '블록');
    expect(blocks[0]!.positions).toBe(blocks[1]!.positions);
    expect(scene.meshes[0]!.positions.length).toBe(0); // 원본은 비워짐(이전됨)
  });
});

describe('sceneHasGeometry', () => {
  const base: Scene3d = { name: 's', units: 'mm', meshes: [], lines: [] };
  it('그물·선분·점 가운데 하나라도 있으면 참', () => {
    expect(sceneHasGeometry(base)).toBe(false);
    expect(sceneHasGeometry({ ...base, meshes: [{ id: 'm', positions: new Float32Array(9), color: [1, 1, 1, 1] }] })).toBe(true);
    expect(sceneHasGeometry({ ...base, meshes: [{ id: 'm', positions: new Float32Array(6), color: [1, 1, 1, 1] }] })).toBe(false);
    expect(sceneHasGeometry({ ...base, lines: [{ id: 'l', positions: new Float32Array(6) }] })).toBe(true);
    expect(sceneHasGeometry({ ...base, points: [{ id: 'p', positions: new Float32Array(3) }] })).toBe(true);
  });
});

describe('sniffStep', () => {
  it('ISO-10303-21 머리(BOM·공백·주석 뒤도)', () => {
    expect(sniffStep(enc('ISO-10303-21;\nHEADER;')).ok).toBe(true);
    expect(sniffStep(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('ISO-10303-21;')])).ok).toBe(true);
    expect(sniffStep(enc('  \r\n/* 내보낸 프로그램 */\nISO-10303-21;')).ok).toBe(true);
  });
  it('빈 파일·다른 글·압축 파일은 이유와 함께 거절', () => {
    const r = (b: Uint8Array) => {
      const s = sniffStep(b);
      return s.ok ? '' : s.reason;
    };
    expect(r(new Uint8Array(0))).toMatch(/빈 파일/);
    expect(r(enc('<!doctype html>'))).toMatch(/STEP 파일이 아닙니다/);
    expect(r(enc('   '))).toMatch(/STEP 파일이 아닙니다/);
    expect(r(new Uint8Array([0x1f, 0x8b, 8, 0]))).toMatch(/gzip/);
    expect(r(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toMatch(/zip/);
    expect(r(enc('/* 닫히지 않은 주석'))).toMatch(/STEP 파일이 아닙니다/);
  });
});

describe('오류 글', () => {
  it('errorText와 friendlyError', () => {
    expect(errorText(new Error('나쁨'))).toBe('나쁨');
    expect(errorText('글')).toBe('글');
    expect(friendlyError('RangeError: Array buffer allocation failed')).toMatch(/메모리/);
    expect(friendlyError('Maximum call stack size exceeded')).toMatch(/너무 깊어/);
    expect(friendlyError('')).toMatch(/알 수 없는/);
    expect(friendlyError('STEP 파일이 아닙니다')).toBe('STEP 파일이 아닙니다');
  });
});

describe('형상이 없을 때 까닭(emptyReason)', () => {
  it('끊긴 파일이 먼저, 제품 구조만 있으면 그렇다고, 아니면 형상 없음 말고 첫 경고', async () => {
    const { emptyReason } = await import('../../src/app/protocol');
    const { TRUNCATED_WARNING } = await import('../../src/messages');
    const none = '그릴 형상을 찾지 못했다(B-rep·삼각형 형식 없음)';
    expect(emptyReason({ warnings: [TRUNCATED_WARNING, '삼각화하지 못한 면 3개 / 3개 (x 3)'] })).toBe(TRUNCATED_WARNING);
    expect(emptyReason({ warnings: [none], meta: { products: [{}] } })).toMatch(/^제품 구조만 있고 형상이 없는 파일입니다/);
    expect(emptyReason({ warnings: ['삼각화하지 못한 면 3개 / 3개 (x 3)', none], meta: { products: [{}] } })).toBe('삼각화하지 못한 면 3개 / 3개 (x 3)');
    expect(emptyReason({ warnings: [none] })).toBeUndefined();
  });
});
