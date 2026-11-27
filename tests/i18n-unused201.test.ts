/**
 * 201차: 쓰는 곳이 없는 사전 항목 정리(사용자에게 보이는 글은 그대로 — README 개발 절 201차 문단).
 * 네 사전(en·ja·zh-CN·de)에서 같이 뺀 열쇠는 앱 원문(src·index.html·site 사전 밖·public)·코어(opencad-viewer3d src)·site-kit 어디에도
 * 그대로 없고, 틀({0})·숫자만 다른 꼴·이어 붙여 만드는 글의 조각일 수도 없는 것뿐이다:
 * - 187차에 3D 보기 위 단면 손잡이를 화면 읽기에서 숨기며(aria-hidden) 쓰지 않게 된 이름 「단면 손잡이 — 끌어 옮기기」
 * - 원문을 바꾼 뒤 남은 옛 열쇠(168차 거르기 칸·「표현 PMI 보이기」 상자 이름, 169차 ✕ 이름, 옛 고르기·그림 저장 말풍선) — 지금 원문 열쇠는 그대로
 * - 처음 사전(#8)에 함께 들어와 이 앱이 쓰지 않은 사이트 글(소개 쪽·차례·방문 통계 묶음 이름 등)과 옛 앱 소개 글
 * 숫자만 다른 꼴(「부품 1개」)·이어 붙인 글의 조각(「Z축 위」·「(이름 없음) 보이기」)·코어가 넘기는 글은 원문에 그대로 없어도 쓰여 두었다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const ROOT = join(__dirname, '..');

/** 201차에 네 사전에서 뺀 열쇠(37) */
const REMOVED = [
  // 187차 단면 손잡이 이름
  '단면 손잡이 — 끌어 옮기기',
  // 원문을 바꾼 뒤 남은 옛 열쇠(지금 원문: 「이름·자리 이름·제품 번호로 거르기」·「표현 PMI 보이기」·「고르기 풀기」·「고르기 단위: …」·내보내기 메뉴)
  '모델 트리 이름 거르기',
  '표현 PMI 모두 보이기',
  '선택 해제',
  '누른 면(B-rep 면)이나 모서리를 골라 종류·넓이·지름·길이를 보고 강조합니다 (면은 Alt/⌥ + 누르기로도)',
  '지금 화면을 PNG 그림으로 저장',
  // 옛 앱 소개
  'STEP(ISO 10303-21, AP203·AP214·AP242) 3D CAD 파일(.stp·.step·.p21, 압축 .stp.gz·.stpZ·.zip)을 설치나 회원가입 없이 브라우저에서 엽니다. 조립 모델 트리, 부품 색, 단위, 레이어, 와이어프레임, PMI 주석, 파일 머리 정보를 보고, 부품이나 면을 고르거나 숨기고, 두 점 거리를 재고, 화면을 PNG로 저장할 수 있습니다.',
  // 처음 사전에 함께 들어온 사이트 글(이 앱은 쓰지 않음)
  '3D 형상을 다룹니다', 'OpenCAD 가이드', 'OpenCAD 소개', '가공 데이터까지,', '가구 설계부터', '개념 모델', '개발 노트', '개발에 연결하는 방법', '갱신',
  '김규태 Sean Kim', '다음 문제를', '도면·3D 모델·공구 경로를 엽니다', '무료 캐드 뷰어로', '본문으로 건너뛰기', '시스템', '실제 화면', '어떤 도구인가요?', '연구', '연락',
  '오픈캐드', '정지', '주요 메뉴', '준비 중', '지금 쓸 수 있는 뷰어', '지원 범위와 확인할 점', '처음 사용하는 순서', '캐드 뷰어 사용 안내', '프로젝트',
  '함께 풀어 보고 싶습니다', '현재 위치',
];

/** 남긴 열쇠: 바뀐 원문의 지금 열쇠, 사이트 정보의 작성자 이름, 원문에 그대로 없어도 쓰는 꼴(숫자만 다름·이어 붙인 조각) */
const KEPT = [
  '고르기 풀기', '표현 PMI 보이기', '이름·자리 이름·제품 번호로 거르기', '김규태 · Sean Kim',
  '부품 1개', '맞는 마디 1개 (조상 마디와 함께 보입니다)', 'Z축 위', '(이름 없음) 보이기',
];

/** 앱 원문 파일(사전 밖): src 전체·index.html·vite.config.ts·site의 사전 밖·public의 글 파일 */
function appSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'locales') walk(p); } else if (/\.(ts|mjs|mts|css|json|html|webmanifest)$/.test(e.name)) out.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'site'));
  out.push(join(ROOT, 'index.html'), join(ROOT, 'vite.config.ts'), join(ROOT, 'public', 'manifest.webmanifest'));
  return out;
}

describe('쓰는 곳이 없는 사전 항목(201차)', () => {
  it('뺀 열쇠는 네 사전 어디에도 없고, 언어끼리 열쇠 집합이 같으며, 남긴 열쇠는 그대로 있다', () => {
    expect(REMOVED).toHaveLength(37);
    expect(new Set(REMOVED).size).toBe(REMOVED.length);
    const keys = Object.keys(catalogs.en!).sort();
    for (const code of LANGS) {
      const catalog = catalogs[code]!;
      expect(REMOVED.filter((k) => k in catalog), code).toEqual([]);
      expect(Object.keys(catalog).sort(), code).toEqual(keys);
      for (const k of KEPT) expect(catalog[k], `${code} ${k}`).toBeTruthy();
    }
  });

  it('뺀 열쇠의 원문은 앱 원문의 글(따옴표·HTML 글) 어디에도 없다 — 다시 쓰면 사전에도 다시 넣을 것', () => {
    const files = appSources();
    expect(files.length).toBeGreaterThan(80);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const used = REMOVED.filter((k) => [`'${k}'`, `"${k}"`, `\`${k}\``, `>${k}<`].some((q) => text.includes(q)));
      expect(used, f).toEqual([]);
    }
  });

  it('옛 열쇠와 같은 값이던 「고르기 풀기」 번역은 거꾸로 찾으면 제 원문으로 돌아온다(같은 값이면 사전 뒤쪽 열쇠가 이긴다)', () => {
    for (const code of ['en', 'zh-CN', 'de'] as const) expect(sourceMessage(catalogs[code]!['고르기 풀기']!), code).toBe('고르기 풀기');
  });
});
