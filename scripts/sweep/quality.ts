/**
 * 훑기 곡면 품질 이름 → 해석 선택.
 * - 앱의 표시 설정 이름(normal·fine·finest): 앱의 곡면 품질과 같은 선택(QUALITY_OPTIONS — 현 높이와 최대 각)
 * - 각도 숫자(예: 20·10·5): 최대 각만 바꾼다(현 높이는 기본) — 5차 훑기(20°·10°·5°)와 같은 선택
 */
import { QUALITY_OPTIONS, type Quality } from '../../src/app/display';
import type { ParseOptions } from '../../src/app/protocol';

export function qualityOptions(name: string): ParseOptions {
  if (Object.hasOwn(QUALITY_OPTIONS, name)) return { ...QUALITY_OPTIONS[name as Quality] };
  const deg = Number(name);
  if (/^\d+(\.\d+)?$/.test(name) && deg > 0 && deg <= 90) return { angleTolerance: deg };
  throw new Error(`모르는 곡면 품질: ${name} (normal·fine·finest 또는 각도 숫자)`);
}
