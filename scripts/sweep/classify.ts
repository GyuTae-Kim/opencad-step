/**
 * 훑기 결과 분류(순수 함수): 해석기 경고·오류 글 → 짧은 코드, FILE_SCHEMA 이름 → AP 판, 파일 한 개의 분류.
 * 코드는 기록·요약·비교의 열쇠라 글이 조금 바뀌어도 같은 코드가 되게 앞부분만 본다(모르는 글은 숫자를 N으로 바꾼 앞 60자).
 */
import { STEP_XML_MESSAGE } from '../../src/archive';
import { TRUNCATED_WARNING } from '../../src/messages';
import { IFC_MESSAGE } from '../../src/app/protocol';

export type SweepClass = 'ok' | 'warning' | 'partial' | 'empty' | 'rejected' | 'error' | 'timeout' | 'crash';

/** 숫자를 N으로 바꾸고 앞 60자 */
function generic(text: string): string {
  return text.replace(/\d+(?:\.\d+)?/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 60);
}

const WARNING_CODES: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^지원하지 않는 개체 (\S+) \d+개/, (m) => `unsupported:${m[1]}`],
  [/^문법 오류로 건너뛴 문장/, 'syntax-skipped'],
  [/^삼각화하지 못한 면/, 'failed-faces'],
  [/^끝이 없는 곡선/, 'unbounded-curves'],
  [/^선 형상 묶음 안의 곡면/, 'wire-surfaces-skipped'],
  [/^PMI 글자/, 'pmi-text-missing'],
  [/^그릴 형상을 찾지 못했다/, 'no-geometry'],
  [/^ZIP 안 STEP 파일 \d+개 가운데/, 'zip-several-steps'],
];

/** 해석기·압축 풀기 경고 글 → 코드 */
export function warningCode(text: string): string {
  if (text === TRUNCATED_WARNING) return 'truncated';
  for (const [re, code] of WARNING_CODES) {
    const m = re.exec(text);
    if (m) return typeof code === 'string' ? code : code(m);
  }
  return `other:${generic(text)}`;
}

/** "삼각화하지 못한 면 N개 / M개 (이유 k, 이유 k)" → 이유별 면 수 */
export function failReasons(warnings: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of warnings) {
    const m = /^삼각화하지 못한 면 \d+개 \/ \d+개 \((.*)\)$/.exec(w);
    if (!m) continue;
    for (const part of m[1]!.split(', ')) {
      const k = /^(.*) (\d+)$/.exec(part);
      if (k) out[k[1]!] = (out[k[1]!] ?? 0) + Number(k[2]);
    }
  }
  return out;
}

/** 앱이 알고 거절하는 경우(STEP 아님·STEP-XML·IFC·STEP 없는 ZIP 등) — 코드와 함께 */
const REJECT_CODES: [RegExp | string, string][] = [
  [STEP_XML_MESSAGE, 'step-xml'],
  [IFC_MESSAGE, 'ifc'],
  [/^빈 파일입니다/, 'empty-file'],
  [/^STEP 파일이 아닙니다/, 'not-step'],
  [/^압축을 풀었지만 STEP 글이 아닙니다/, 'packed-not-step'],
  [/^ZIP 안에 STEP 파일/, 'zip-no-step'],
  [/^암호가 걸린 ZIP 항목/, 'zip-encrypted'],
  [/^ZIP 압축 방식/, 'zip-method'],
  [/^압축을 푼 크기가/, 'unpacked-too-big'],
];
const ERROR_CODES: [RegExp, string][] = [
  [/out of memory|allocation failed|Array buffer allocation|Invalid array length|Invalid typed array length/i, 'out-of-memory'],
  [/Maximum call stack/i, 'stack-overflow'],
  [/^압축을 풀지 못했습니다/, 'unpack-failed'],
  [/^ZIP /, 'zip-damaged'],
];

/** 오류 글 → { code, rejected(앱이 알고 거절하는 것인지) } */
export function errorCode(message: string): { code: string; rejected: boolean } {
  const m = message.trim();
  for (const [re, code] of REJECT_CODES) if (typeof re === 'string' ? m === re : re.test(m)) return { code, rejected: true };
  for (const [re, code] of ERROR_CODES) if (re.test(m)) return { code, rejected: false };
  return { code: `exception:${generic(m)}`, rejected: false };
}

/** FILE_SCHEMA 이름들 → 판(AP203·AP203e2·AP214·AP242·IFC, 모르면 첫 이름의 첫 낱말, 없으면 none) */
export function schemaLabel(schemas: readonly string[]): string {
  const first = (schemas[0] ?? '').trim().toUpperCase();
  if (!first) return 'none';
  if (first.startsWith('CONFIG_CONTROL_DESIGN')) return 'AP203';
  if (first.startsWith('AP203')) return 'AP203e2';
  if (first.startsWith('AUTOMOTIVE_DESIGN') || first.startsWith('AP214')) return 'AP214';
  if (first.startsWith('AP242')) return 'AP242';
  if (first.startsWith('IFC')) return 'IFC';
  return /^[A-Z0-9_]+/.exec(first)?.[0] ?? 'other';
}

/** 해석이 끝난 파일의 분류: 형상 없음 → empty, 실패 면 → partial, 경고 → warning, 아니면 ok */
export function sceneClass(hasGeometry: boolean, failedFaces: number, warningCount: number): SweepClass {
  if (!hasGeometry) return 'empty';
  if (failedFaces > 0) return 'partial';
  return warningCount > 0 ? 'warning' : 'ok';
}
