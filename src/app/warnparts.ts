/**
 * 해석기 경고 한 줄 → 화면 조각. 다국어 층은 문장 틀("삼각화하지 못한 면 {0}개 / {1}개 ({2})")의 자리 값을 문서 자료로 보고
 * 그대로 두므로, 자리 안에 든 까닭 목록("경계 고리 없음 2, 평면 삼각화 실패 1")이 다른 언어에서도 한국어로 남았다.
 * 까닭을 조각으로 떼어 각각 따로 감싸면 다국어 층이 조각마다(사전 열쇠로) 옮긴다. 개수·쉼표·괄호는 그대로 둔다.
 */
import { h } from './dom';

const FAILED_FACES = /^(삼각화하지 못한 면 \d+개 \/ \d+개) \((.*)\)$/;

/** 경고 한 줄 → 조각들(이어 붙이면 원래 글). 까닭 목록이 없는 경고는 그대로 한 조각 */
export function warningPieces(w: string): string[] {
  const m = FAILED_FACES.exec(w);
  if (!m) return [w];
  const out = [m[1]!, ' ('];
  m[2]!.split(', ').forEach((part, i) => {
    if (i) out.push(', ');
    // "까닭 개수": 까닭과 개수를 떼어 까닭만 옮긴다
    const k = /^(.*\S) (\d+)$/.exec(part);
    if (k) out.push(k[1]!, ` ${k[2]}`);
    else out.push(part);
  });
  out.push(')');
  return out;
}

/** 경고 한 줄 → 화면 노드들: 한국어가 든 조각은 따로 감싼다(다국어 층이 조각마다 옮기게) */
export function warningNodes(w: string): (string | HTMLElement)[] {
  const pieces = warningPieces(w);
  if (pieces.length === 1) return [w];
  return pieces.map((p) => (/[가-힣]/.test(p) ? h('span', {}, p) : p));
}
