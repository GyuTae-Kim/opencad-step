/**
 * 문서를 연 뒤 띄울 알림 한 줄(58차 — 순수, DOM 없음. 뷰어 조각 viewerkit.ts에 든다 — 문서를 뷰어에 올린 뒤에만 쓴다, 앱 입구에서 옮김).
 * - 끊긴 파일: 읽은 데까지만 보이니 다시 받으라고
 * - 조립 자리 상한(해석기 MAX_PLACEMENTS — 경고 "조립 자리가 N개를 넘어…"): 앞부분만 보인다고. 예전에는 "해석기 경고 1개"로만 알려 지나치기 쉬웠다
 *   (같은 부품 25만 자리 합성 조립 — 그물 82,780개만 그린다). 수는 경고 글에서 읽는다(해석기 모듈을 이 조각에 끌어오지 않게)
 * - 그 밖의 경고: 개수와 정보 탭
 */
import { TRUNCATED_WARNING } from '../messages';
import { fmtCount } from './format';

/** 알림 글과 보이는 시간(ms). 경고가 없으면 null */
export function openNotice(warnings: readonly string[]): { text: string; ms: number } | null {
  if (warnings.includes(TRUNCATED_WARNING)) return { text: '파일이 중간에 끊긴 것 같습니다 — 읽은 데까지만 보입니다. 파일을 다시 받아 여십시오.', ms: 6000 };
  for (const w of warnings) {
    const m = /^조립 자리가 (\d+)개를 넘어/.exec(w);
    if (m) return { text: `조립 자리가 ${fmtCount(Number(m[1]))}개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).`, ms: 8000 };
  }
  return warnings.length ? { text: `해석기 경고 ${warnings.length}개 — 패널의 "정보" 탭에서 볼 수 있습니다.`, ms: 3500 } : null;
}
