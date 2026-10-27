// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { translate } from '../../site/i18n.mjs';
import { warningNodes, warningPieces } from '../../src/app/warnparts';
import { stepToScene } from '../../src/index';
import { cylinder, StepText } from '../stepText';

const LANGS = ['en', 'ja', 'zh-CN', 'de'];
const hangul = /[가-힣]/;

/** 해석기가 면 삼각화 실패 까닭으로 쓰는 글(src/brep.ts·src/tessellate.ts) */
const REASONS = [
  '면 개체 없음',
  '지원하지 않는 면 FACE_SURFACE',
  '지원하지 않는 곡면 OFFSET_SURFACE',
  '곡면 PLANE을(를) 읽지 못함(가리키는 개체가 없거나 값이 잘못됨)',
  '평면 삼각화 실패',
  '삼각형 없음',
  '한 바퀴 도는 경계 하나로는 닫을 수 없는 면',
  '경계 고리 없음',
  '경계 없는 면(정의역이 무한)',
];

/** 조각마다 옮겨 이은 글(화면의 다국어 층이 span마다 옮기는 것과 같게) */
const pieceTranslate = (w: string, lang: string) => warningPieces(w).map((p) => (hangul.test(p) ? translate(p, lang) : p)).join('');

describe('해석기 경고 안의 까닭 조각', () => {
  it('삼각화하지 못한 면 경고를 문장 틀·까닭·개수 조각으로 떼고, 이으면 원래 글이다', () => {
    const w = '삼각화하지 못한 면 5개 / 120개 (경계 고리 없음 3, 지원하지 않는 곡면 OFFSET_SURFACE 2)';
    const p = warningPieces(w);
    expect(p.join('')).toBe(w);
    expect(p).toEqual(['삼각화하지 못한 면 5개 / 120개', ' (', '경계 고리 없음', ' 3', ', ', '지원하지 않는 곡면 OFFSET_SURFACE', ' 2', ')']);
    expect(warningPieces('문법 오류로 건너뛴 문장 3개')).toEqual(['문법 오류로 건너뛴 문장 3개']);
  });

  it('네 언어에서 까닭이 모두 그 언어로 옮겨지고(한국어 없음) 형식 이름·개수는 그대로', () => {
    // 통째로 옮기면 자리 값({2})인 까닭 목록이 한국어로 남던 것
    const w = `삼각화하지 못한 면 ${REASONS.length * 2}개 / 300개 (${REASONS.map((r, i) => `${r} ${i + 1}`).join(', ')})`;
    expect(translate(w, 'en')).toMatch(hangul);
    for (const lang of LANGS) {
      const out = pieceTranslate(w, lang);
      expect(out, `${lang}: ${out}`).not.toMatch(hangul);
      expect(out).toContain('OFFSET_SURFACE 3');
      expect(out).toContain('FACE_SURFACE 2');
    }
    expect(pieceTranslate('삼각화하지 못한 면 3개 / 10개 (경계 고리 없음 3)', 'en')).toBe('Untriangulated faces 3 / 10 (No border ring 3)');
  });

  it('실제 해석 경고(곡면을 읽지 못해 실패한 면)도 조각마다 옮겨진다', () => {
    // 원기둥 면의 곡면 자리(AXIS2_PLACEMENT_3D)를 지운 파일: 옆면이 "곡면 CYLINDRICAL_SURFACE을(를) 읽지 못함"으로 실패한다
    const w = new StepText();
    const ctx = w.context();
    w.product('pin', [cylinder(w, 5, 10)], ctx);
    const text = w.toString();
    const cyl = /#(\d+)=CYLINDRICAL_SURFACE\('',#(\d+),/.exec(text)!;
    const broken = text.replace(new RegExp(`#${cyl[2]}=AXIS2_PLACEMENT_3D[^;]*;\\n`), '');
    const warnings = stepToScene(new TextEncoder().encode(broken)).warnings ?? [];
    const failed = warnings.find((x) => x.startsWith('삼각화하지 못한 면'))!;
    expect(failed).toContain('읽지 못함');
    for (const lang of LANGS) {
      expect(translate(failed, lang), lang).toMatch(hangul);
      expect(pieceTranslate(failed, lang), lang).not.toMatch(hangul);
    }
  });

  it('ZIP에서 고른 파일 안내는 다섯 개 넘는 나머지를 언어와 무관한 꼴(… +N)로 적어 네 언어에서 한국어가 남지 않는다', () => {
    const note = 'ZIP 안 STEP 파일 8개 가운데 가장 큰 a.stp을(를) 열었습니다(나머지: b.stp, c.stp, d.stp, e.stp, f.stp, … +2).';
    for (const lang of LANGS) {
      const out = translate(note, lang);
      expect(out, lang).not.toMatch(hangul);
      expect(out).toContain('f.stp, … +2');
    }
  });

  it('화면 노드: 한국어 조각만 따로 감싸고(다국어 층이 조각마다 옮기게) 글은 그대로', () => {
    const w = '삼각화하지 못한 면 1개 / 2개 (삼각형 없음 1)';
    const nodes = warningNodes(w);
    const li = document.createElement('li');
    li.append(...nodes);
    expect(li.textContent).toBe(w);
    expect([...li.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['삼각화하지 못한 면 1개 / 2개', '삼각형 없음']);
    expect(warningNodes('그릴 형상을 찾지 못했다(B-rep·삼각형 형식 없음)')).toEqual(['그릴 형상을 찾지 못했다(B-rep·삼각형 형식 없음)']);
  });
});
