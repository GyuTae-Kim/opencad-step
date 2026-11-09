/**
 * 문서를 연 뒤 띄울 알림 한 줄(58차 — 순수, DOM 없음. 뷰어 조각 viewerkit.ts에 든다 — 문서를 뷰어에 올린 뒤에만 쓴다, 앱 입구에서 옮김).
 * - 끊긴 파일: 읽은 데까지만 보이니 다시 받으라고
 * - 조립 자리 상한(해석기 MAX_PLACEMENTS — 경고 "조립 자리가 N개를 넘어…"): 앞부분만 보인다고. 예전에는 "해석기 경고 1개"로만 알려 지나치기 쉬웠다
 *   (같은 부품 25만 자리 합성 조립 — 그물 82,780개만 그린다). 수는 경고 글에서 읽는다(해석기 모듈을 이 조각에 끌어오지 않게)
 * - 그 밖의 경고: 개수와 정보 탭
 * 61차: 코어가 장면을 받을 때 깨진 입력을 빼거나 고쳐 그린 알림(코어 0.50.0 onSceneIssues)도 경고 목록에 한 줄씩(sceneIssueLines — 종류마다 묶어서)
 */
import type { SceneIssue, SceneIssueCode } from 'opencad-viewer3d';
import { TRUNCATED_WARNING } from '../messages';
import { fmtCount } from './format';

/** 코어 장면 알림 종류 → 경고 묶음(값을 기본값으로 그린 종류는 하나로) */
const ISSUE_GROUP: Record<SceneIssueCode, 'placement' | 'positions' | 'indices' | 'value' | 'duplicate-id' | 'bounds'> = {
  placement: 'placement',
  positions: 'positions',
  indices: 'indices',
  'duplicate-id': 'duplicate-id',
  bounds: 'bounds',
  billboard: 'value',
  length: 'value',
  normals: 'value',
  colors: 'value',
  uvs: 'value',
  color: 'value',
  material: 'value',
  width: 'value',
  size: 'value',
  ids: 'value',
};

/**
 * 코어가 장면을 받을 때 빼거나 고쳐 그린 입력(코어 0.50.0 sceneIssues — 해석기가 거르지 못한 NaN·무한대·한도 밖 좌표, 없는 정점 색인 등) → 경고 글.
 * 묶음마다 한 줄: 형상 수(알림 수)와 정점·삼각형 수(알림 count 합). 빈 목록이면 빈 배열
 */
export function sceneIssueLines(issues: readonly SceneIssue[]): string[] {
  const by = new Map<string, { items: number; count: number }>();
  for (const i of issues) {
    const g = ISSUE_GROUP[i.code] ?? 'value';
    const s = by.get(g) ?? { items: 0, count: 0 };
    s.items++;
    s.count += Number.isFinite(i.count) ? i.count : 0;
    by.set(g, s);
  }
  const out: string[] = [];
  const s = (g: string) => by.get(g);
  const n = (x: number) => fmtCount(x);
  if (s('placement')) out.push(`3D 보기가 놓을 자리를 알 수 없어 뺀 형상 ${n(s('placement')!.items)}개`);
  if (s('positions')) out.push(`3D 보기가 좌표가 잘못된 정점 ${n(s('positions')!.count)}개를 쓰는 도형을 그리지 않았다(형상 ${n(s('positions')!.items)}개)`);
  if (s('indices')) out.push(`3D 보기가 없는 정점을 가리키는 삼각형 ${n(s('indices')!.count)}개를 그리지 않았다(형상 ${n(s('indices')!.items)}개)`);
  if (s('value')) out.push(`3D 보기가 잘못된 색·굵기·법선 같은 값을 기본값으로 그린 형상 ${n(s('value')!.items)}개`);
  if (s('duplicate-id')) out.push(`3D 보기에서 id가 겹친 형상 ${n(s('duplicate-id')!.items)}개는 고르기가 한 항목만 본다`);
  if (s('bounds')) out.push('3D 보기가 장면 범위를 형상에서 다시 셌다(파일의 범위가 잘못됨)');
  return out;
}

/** 알림 글과 보이는 시간(ms). 경고가 없으면 null */
export function openNotice(warnings: readonly string[]): { text: string; ms: number } | null {
  if (warnings.includes(TRUNCATED_WARNING)) return { text: '파일이 중간에 끊긴 것 같습니다 — 읽은 데까지만 보입니다. 파일을 다시 받아 여십시오.', ms: 6000 };
  for (const w of warnings) {
    const m = /^조립 자리가 (\d+)개를 넘어/.exec(w);
    if (m) return { text: `조립 자리가 ${fmtCount(Number(m[1]))}개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).`, ms: 8000 };
  }
  return warnings.length ? { text: `해석기 경고 ${warnings.length}개 — 패널의 "정보" 탭에서 볼 수 있습니다.`, ms: 3500 } : null;
}
