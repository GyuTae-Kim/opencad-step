import { describe, expect, it } from 'vitest';
import { TRUNCATED_WARNING } from '../../src/messages';
import { openNotice } from '../../src/app/opennotice';
import { MAX_PLACEMENTS } from '../../src/scene';

const CAP = `조립 자리가 ${MAX_PLACEMENTS}개를 넘어 나머지는 놓지 않았다(같은 하위 조립을 층마다 거듭 쓴 파일일 수 있음)`;

describe('연 뒤 알림(58차)', () => {
  it('끊긴 파일 > 조립 자리 상한 > 그 밖의 경고 수, 경고가 없으면 없음', () => {
    expect(openNotice([])).toBeNull();
    expect(openNotice(['다른 경고', '또 다른 경고'])).toEqual({ text: '해석기 경고 2개 — 패널의 "정보" 탭에서 볼 수 있습니다.', ms: 3500 });
    expect(openNotice([TRUNCATED_WARNING, CAP])!.ms).toBe(6000);
    // 상한에 닿으면 경고 수 대신 앞부분만 보인다고(해석기 경고 글의 수를 천 단위로)
    expect(openNotice(['다른 경고', CAP])).toEqual({ text: '조립 자리가 250,000개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).', ms: 8000 });
  });

  it('번역 사전의 틀로 옮겨진다(수는 그대로)', async () => {
    const { translate } = await import('../../site/i18n.mjs');
    const text = openNotice([CAP])!.text;
    expect(translate(text, 'en')).toBe('More than 250,000 assembly placements — only the first part is shown. The file may reuse the same subassembly at every level (see the "Info" tab of the panel).');
    for (const lang of ['de', 'ja', 'zh-CN'] as const) expect(translate(text, lang)).toContain('250,000');
  });
});
