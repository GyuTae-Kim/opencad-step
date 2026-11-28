/**
 * 201차: 쓰는 곳이 없는 사전 항목 정리(사용자에게 보이는 글은 그대로 — README 개발 절 201차 문단).
 * 네 사전(en·ja·zh-CN·de)에서 같이 뺀 열쇠는 앱 원문(src·index.html·site 사전 밖·public)·코어(opencad-viewer3d src)·site-kit 어디에도
 * 그대로 없고, 틀({0})·숫자만 다른 꼴·이어 붙여 만드는 글의 조각일 수도 없는 것뿐이다:
 * - 187차에 3D 보기 위 단면 손잡이를 화면 읽기에서 숨기며(aria-hidden) 쓰지 않게 된 이름 「단면 손잡이 — 끌어 옮기기」
 * - 원문을 바꾼 뒤 남은 옛 열쇠(168차 거르기 칸·「표현 PMI 보이기」 상자 이름, 169차 ✕ 이름, 옛 고르기·그림 저장 말풍선) — 지금 원문 열쇠는 그대로
 * - 처음 사전(#8)에 함께 들어와 이 앱이 쓰지 않은 사이트 글(소개 쪽·차례·방문 통계 묶음 이름 등)
 * - (처음에 함께 뺀 옛 앱 소개 글은 index.html 정적 소개가 줄을 나눠 쓰고 있어 PR CI check:i18n에서 걸려 되돌렸다 — 아래 KEPT·HTML 글 빈칸 모으기)
 * 숫자만 다른 꼴(「부품 1개」)·이어 붙인 글의 조각(「Z축 위」·「(이름 없음) 보이기」)·코어가 넘기는 글은 원문에 그대로 없어도 쓰여 두었다.
 * 210차: 209차에 해석기의 이름 없는 레이어 배정·제품 기본 이름을 앱 낱말 없는 STEP 번호 「#n」으로 바꾼 뒤 쓰는 곳이 없어진 「레이어 #{0}」·「제품 #{0}」(#8)도 같은 꼴로 뺐다
 * (화면의 「레이어 {이름}」은 이름이 FSI로 갇혀 「레이어 #」 앞머리와 맞지 않는다 — 「레이어 {0}」 틀).
 * 214차: 201차 뒤 다시 센 쓰는 곳 0 열쇠 18(README 개발 절 214차 문단) — 통째 열쇠가 따로 있어 조각 열쇠를 찾지 않는 것(「작성」 ⊂ 「작성자」·「소스 코드」·「코드」 ⊂ 「GitHub 소스 코드」·「소스 코드(MIT)」,
 * index.html 「OpenCAD STEP 뷰어 사용법·지원 범위」, 사이트 정보 「김규태 · Sean Kim」), 처음 사전(#8)에 함께 들어와 앱·코어·키트 코드에 없는 낱말(코어·키트는 주석뿐),
 * 원문을 바꾼 뒤 남은 옛 틀(59차 물리 속성 머리 나눔·PMI 글자 경고 글), 예제 레이어 이름 「본체」(파일 글 칸이라 번역하지 않는데 「바디」와 같은 값이라 거꾸로 찾기에서 이겼다 — 213차 겹침).
 * 예제 STEP 글(sample.ts `s('…')` — 파일 글)은 앱 원문 대조에서 뺀다(사전을 쓰지 않는 파일 자료).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const ROOT = join(__dirname, '..');

/** 201차(36)·210차(2)·214차(18)에 네 사전에서 뺀 열쇠(56) */
const REMOVED = [
  // 187차 단면 손잡이 이름
  '단면 손잡이 — 끌어 옮기기',
  // 원문을 바꾼 뒤 남은 옛 열쇠(지금 원문: 「이름·자리 이름·제품 번호로 거르기」·「표현 PMI 보이기」·「고르기 풀기」·「고르기 단위: …」·내보내기 메뉴)
  '모델 트리 이름 거르기',
  '표현 PMI 모두 보이기',
  '선택 해제',
  '누른 면(B-rep 면)이나 모서리를 골라 종류·넓이·지름·길이를 보고 강조합니다 (면은 Alt/⌥ + 누르기로도)',
  '지금 화면을 PNG 그림으로 저장',
  // 처음 사전에 함께 들어온 사이트 글(이 앱은 쓰지 않음)
  '3D 형상을 다룹니다', 'OpenCAD 가이드', 'OpenCAD 소개', '가공 데이터까지,', '가구 설계부터', '개념 모델', '개발 노트', '개발에 연결하는 방법', '갱신',
  '김규태 Sean Kim', '다음 문제를', '도면·3D 모델·공구 경로를 엽니다', '무료 캐드 뷰어로', '본문으로 건너뛰기', '시스템', '실제 화면', '어떤 도구인가요?', '연구', '연락',
  '오픈캐드', '정지', '주요 메뉴', '준비 중', '지금 쓸 수 있는 뷰어', '지원 범위와 확인할 점', '처음 사용하는 순서', '캐드 뷰어 사용 안내', '프로젝트',
  '함께 풀어 보고 싶습니다', '현재 위치',
  // 210차: 209차 뒤 해석기가 쓰지 않는 이름 없는 레이어 배정·제품의 옛 기본 이름(지금 「#n」)
  '레이어 #{0}', '제품 #{0}',
  // 214차: 통째 열쇠 안의 조각(통째 열쇠가 먼저 잡힘)
  '작성', '소스 코드', '코드', '사용법·지원 범위', '김규태',
  // 214차: 처음 사전(#8)의 낱말 — 앱은 긴 글 안에만, 코어·사이트 키트는 주석에만(「오류」는 #18, 「형상」은 4d3dd50 뒤 0)
  '도면층', '면 선택', '밝게', '어둡게', '오류', '설치', '확인', '모형', '형상', '비용',
  // 214차: 바뀐 원문의 옛 틀(지금 「물리 속성」 머리 조각·「PMI 글자(ANNOTATION_TEXT 등) {0}개는 그리지 못했다(…)」)
  '물리 속성 · {0}', 'PMI 글자(글꼴로 쓰는 ANNOTATION_TEXT 등) {0}개는 그리지 않았다',
  // 214차: 예제 레이어 이름(파일 글 — 「바디」와 같은 값이라 거꾸로 찾기에서 이겼다)
  '본체',
];

/** 남긴 열쇠: 바뀐 원문의 지금 열쇠, 사이트 정보의 작성자 이름, 원문에 그대로 없어도 쓰는 꼴(숫자만 다름·이어 붙인 조각) */
const KEPT = [
  '고르기 풀기', '표현 PMI 보이기', '이름·자리 이름·제품 번호로 거르기', '김규태 · Sean Kim',
  '부품 1개', '맞는 마디 1개 (조상 마디와 함께 보입니다)', 'Z축 위', '(이름 없음) 보이기',
  // index.html 정적 소개(줄을 나눈 HTML 글 — 빈칸을 하나로 모으면 이 원문)
  'STEP(ISO 10303-21, AP203·AP214·AP242) 3D CAD 파일(.stp·.step·.p21, 압축 .stp.gz·.stpZ·.zip)을 설치나 회원가입 없이 브라우저에서 엽니다. 조립 모델 트리, 부품 색, 단위, 레이어, 와이어프레임, PMI 주석, 파일 머리 정보를 보고, 부품이나 면을 고르거나 숨기고, 두 점 거리를 재고, 화면을 PNG로 저장할 수 있습니다.',
  // 214차: 뺀 조각·옛 틀의 지금 열쇠, 같은 값이던 쓰는 열쇠, 남긴 동적 조각(「잠근 ${what}」·` · ` 조각·끝 빈칸 리터럴)·시험 대조 낱말·예제 이름 fixture(ftext.test)
  '작성자', 'GitHub 소스 코드', '소스 코드(MIT)', 'OpenCAD STEP 뷰어 사용법·지원 범위', '물리 속성', '모형 전체 물리 속성',
  'PMI 글자(ANNOTATION_TEXT 등) {0}개는 그리지 못했다(글이 비었거나 배치가 없음)', '바디', '면 고르기', '레이어',
  '잠근 방향', '닫힌 입체', '열린 메시', '고른 면', '화면 평면', '블록-1', '받침판',
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
    expect(REMOVED).toHaveLength(56);
    expect(new Set(REMOVED).size).toBe(REMOVED.length);
    const keys = Object.keys(catalogs.en!).sort();
    for (const code of LANGS) {
      const catalog = catalogs[code]!;
      expect(REMOVED.filter((k) => k in catalog), code).toEqual([]);
      expect(Object.keys(catalog).sort(), code).toEqual(keys);
      for (const k of KEPT) expect(catalog[k], `${code} ${k}`).toBeTruthy();
    }
  });

  it('뺀 열쇠의 원문은 앱 원문의 글(따옴표·HTML 글 — 줄을 나눈 HTML 글은 빈칸을 하나로 모아) 어디에도 없다 — 다시 쓰면 사전에도 다시 넣을 것', () => {
    const files = appSources();
    expect(files.length).toBeGreaterThan(80);
    for (const f of files) {
      // 214차: 예제 STEP 글(stepString `s('…')` — 제품·레이어 이름 등 파일 글, 화면은 translate="no" 칸)은 사전을 쓰지 않으므로 뺀다
      const raw = readFileSync(f, 'utf8');
      const text = f === join(ROOT, 'src', 'app', 'sample.ts') ? raw.replace(/\bs\('[^']*'\)/g, '') : raw;
      const flat = text.replace(/\s+/g, ' ');
      const used = REMOVED.filter((k) => [`'${k}'`, `"${k}"`, `\`${k}\``].some((q) => text.includes(q)) || [`>${k}<`, `> ${k}<`, `>${k} <`, `> ${k} <`].some((q) => flat.includes(q)));
      expect(used, f).toEqual([]);
    }
  });

  it('옛 열쇠와 같은 값이던 「고르기 풀기」 번역은 거꾸로 찾으면 제 원문으로 돌아온다(같은 값이면 사전 뒤쪽 열쇠가 이긴다)', () => {
    for (const code of ['en', 'zh-CN', 'de'] as const) expect(sourceMessage(catalogs[code]!['고르기 풀기']!), code).toBe('고르기 풀기');
  });

  it('214차: 뺀 열쇠와 같은 값이던 쓰는 열쇠의 번역은 거꾸로 찾으면 제 원문(「본체」가 「바디」를, 「면 선택」이 「면 고르기」를 이기던 것이 풀림 — 213차 겹침)', () => {
    for (const code of ['en', 'de'] as const) expect(sourceMessage(catalogs[code]!['바디']!), code).toBe('바디');
    for (const code of LANGS) expect(sourceMessage(catalogs[code]!['면 고르기']!), code).toBe('면 고르기');
    for (const code of ['en', 'ja'] as const) expect(sourceMessage(catalogs[code]!['작성자']!), code).toBe('작성자');
    for (const code of ['zh-CN', 'de'] as const) expect(sourceMessage(catalogs[code]!['레이어']!), code).toBe('레이어');
    // 중국어 바디·솔리드·엔티티는 모두 实体(213차 근거 없음 — 남은 겹침), 사전 차례의 뒤 열쇠
    expect(sourceMessage(catalogs['zh-CN']!['바디']!)).toBe('엔티티');
  });
});
