# OpenCAD STEP 뷰어·해석기

STEP(ISO 10303-21, AP203·AP214·AP242) 파일을 브라우저 안에서 읽고 B-rep 곡면을 삼각화해 3D로 보는 앱과 그 해석기입니다.
해석기는 DOM·WebGL에 기대지 않아 웹 워커에서 돌고, 결과 장면(`Scene3d`)은 [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)로 그립니다.
다른 CAD 커널이나 STEP 라이브러리를 쓰지 않고 공개 명세만 보고 새로 작성했습니다.

**앱 주소(배포 예정):** https://gyutae-kim.github.io/opencad-step/

함께 쓰는 저장소: [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)(3D 뷰어 코어) ·
[opencad-nc](https://github.com/GyuTae-Kim/opencad-nc) · [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp)

## 할 수 있는 것

- Part 21 글 읽기(머리, 개체, 복합 개체, 문자열 부호)
- 압축 STEP: gzip(.stp.gz·.stpZ)과 안에 .stp·.step·.p21이 든 ZIP(저장·deflate, ZIP64) — `unpackStep`(`src/archive.ts`).
  STEP-XML(ISO 10303-28, .stpx)은 지원하지 않는다고 알려 줍니다.
- B-rep 곡면 삼각화: 평면·원기둥·원뿔·구·원환·B-스플라인·회전·밀기 곡면, 구멍 있는 면, 틈 없는 이음
- 조립(제품·인스턴스 변환), 색, 단위, 제품 나무(`StepProductNode`)
- 레이어(PRESENTATION_LAYER_ASSIGNMENT, 레이어를 가리키는 INVISIBILITY) → `meta.layers`
- 와이어프레임·곡선 형상(GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION의 GEOMETRIC_CURVE_SET·GEOMETRIC_SET,
  EDGE_BASED·SHELL_BASED_WIREFRAME_MODEL, 형상 표현 안의 독립 곡선 — 선·원·잘린 곡선·복합 곡선·B-스플라인 등, 선 색 CURVE_STYLE) → `scene.lines`(점은 `scene.points`)
- 표현 PMI(ANNOTATION_CURVE_OCCURRENCE·TESSELLATED_ANNOTATION_OCCURRENCE 등, ANNOTATION_PLANE·DRAUGHTING_CALLOUT 안까지)를
  그 부품 자리에 선으로, 의미 PMI(치수 값·± 공차, 기하 공차 크기·데이텀, 데이텀) 목록 → `meta.pmi`
- 면 표(그물 삼각형 → B-rep 면, 면 종류·곡면 매개변수) → `meta.faceTables`·`meta.meshFaceTable`(면 단위 고르기)
- 닫힌 입체(닫힌 껍질, 실패한 면 없음, 삼각형이 틈 없이 맞물림)의 그물에 `Mesh3d.closed = true` — 단면에서 잘린 면을 채웁니다
- 큰 좌표(좌표 크기 1e4 단위 이상이면서 묶음 크기의 2000배 넘음 — 예: 공장·지도 좌표 1e5~1e6 mm)에 만든 형상은 묶음 가운데를
  `origin`으로 빼고 담아 float32로도 떨리지 않습니다(그 밖에는 예전과 같습니다)
- 틈·넓이·부피 검사(`watertightness`, `meshArea`, `meshVolume`)
- 공개 STEP 21개를 실패 면 없이 읽었고, NIST 시험 모형 9개는 모두 틈이 없습니다.

## 앱 쓰는 법

- **열기**: 제목 막대의 "열기"(Ctrl+O)로 `.stp`·`.step`·`.p21` 파일이나 압축 STEP(`.stp.gz`·`.stpZ`·STEP이 든 `.zip`)을 고르거나,
  창 어디에나 끌어다 놓습니다(여러 개를 놓으면 첫 STEP 하나). 압축은 워커가 "압축 푸는 중" 단계로 풀고, 정보 탭에 압축 형식·ZIP 항목·푼 크기를 보입니다.
  `.stpx`(STEP-XML)는 지원하지 않는다는 안내가 뜹니다.
  "예제 열기"는 우리가 만든 작은 조립 모형(받침판·블록 둘·핀 묶음, 레이어 셋, 받침판 PMI)을 엽니다.
  한 번에 문서 하나를 열며 새로 열면 바꿉니다. 큰 파일은 해석 중 덮개의 "취소"(또는 Esc)로 멈출 수 있습니다.
- **파일은 이 브라우저 밖으로 나가지 않습니다.** 읽기(웹 워커)와 그리기(WebGL2)를 모두 이 컴퓨터에서 합니다.
- **보기**: 왼쪽 끌기 회전, 오른쪽·가운데 끌기 이동, 휠 확대, 터치 회전·핀치. 도구 막대에 전체 보기(F), 고른 부품 보기, 표준 뷰(1 앞 · 2 뒤 · 3 왼쪽 · 4 오른쪽 · 5 위 · 6 아래 · 7 등각),
  원근/평행, 음영·음영+모서리·와이어프레임·X-ray, 단면, 격자(F7), 뷰 큐브, 좌표축, 면 고르기, 두 점 측정(Esc = 지우기), PNG 저장, 패널 열고 닫기가 있습니다.
  키는 캔버스에 초점이 없어도(입력 칸 제외) 듣습니다.
- **단면 보기**: 도구 막대 "단면"에서 축(끔·X·Y·Z)을 고르면 3D 보기 왼쪽 위에 막대가 나옵니다 — 축 바꾸기, 위치 슬라이더(좌표 값 표시),
  잘라 내는 쪽 뒤집기, 끄기. 닫힌 입체는 잘린 면이 채워지고, 잘린 면을 누르면 그 부품을 고르고 "단면(자른 면) 위 점"을 보입니다(면 고르기는 하지 않음).
  문서를 새로 열면 단면은 꺼집니다.
- **면 고르기**: 도구 막대의 "면 고르기"를 켜거나 **Alt(⌥)를 누른 채 누르면** 부품 고르기와 함께 누른 B-rep 면을 찾아 그 면(부품 통째 대신)과 경계 모서리(청록색)를 강조하고,
  패널 아래 띠에 면 종류(평면·원기둥 면·원뿔 면·구 면·원환 면·B-스플라인 곡면…)·STEP 번호·반지름/지름·축·법선·넓이·둘레를 보입니다. Esc로 풉니다.
- **선 형상·PMI**: 와이어프레임·곡선 형상은 부품의 선으로(나무 마디·부품별 보이기와 함께 켜고 끔), 표현 PMI는 파일의 선 색으로 그립니다. 선도 눌러 고를 수 있습니다.
- **패널**(폭 760px 미만이면 아래 시트):
  - 제품 — 이름 거르기 칸(이름·자리 이름·제품 번호, 맞는 마디와 조상만 펼쳐 보임, Esc = 지우기)과 제품 나무(접고 펴기, 이름·자리 이름·인스턴스 수).
    마디를 고르면 그 아래 형상을 3D에서 강조하고, 3D에서 부품을 누르면 나무에서 그 마디를 펼쳐 보입니다.
    **마디를 두 번 누르면(또는 마디를 고른 채 Enter, 3D에서 부품을 두 번 누르면) 그 부품으로 맞춰 봅니다.** 무엇을 고른 동안에는 도구 막대와 패널 아래 띠의 "고른 부품 보기" 단추로도 맞춥니다(숨긴 자리는 빼고).
    눈 단추로 숨기기/보이기, "부품별 보이기"로 같은 부품 자리를 한꺼번에 켜고 끕니다.
    나무는 한 번에 3,000줄까지 그리고, 넘으면 전체 줄 수와 "3,000줄 더 보기" 단추를 보입니다(접거나 이름으로 걸러도 됩니다).
  - 레이어(있을 때) — 레이어마다 켜고 끄기·항목 수, "(레이어 없음)", 모두 켜기/끄기. 파일이 숨긴 레이어(INVISIBILITY)는 처음에 꺼져 있습니다.
    이름을 누르면 그 레이어의 형상을 강조하고, 두 번 누르면 맞춰 봅니다. 레이어·눈 단추·PMI 켜고 끄기는 서로 겹쳐 따집니다(모두 켜져야 보임).
  - PMI(있을 때) — 표현 PMI 모두/하나씩 켜고 끄기(주석 평면 이름과 함께, 이름을 누르면 강조), 의미 PMI 표(치수 값·± 공차, 기하 공차 크기 | 데이텀, 데이텀).
  - 정보 — 문서(크기·압축·범위·삼각형), 파일 머리(FILE_NAME·FILE_DESCRIPTION·FILE_SCHEMA 등), 단위, 통계(솔리드·면·삼각화 못 한 면·삼각형·인스턴스·선 형상·레이어·PMI·읽기/삼각화 시간), 해석기 경고.
  - 패널 왼쪽 가장자리(아래 시트는 위 가장자리)를 끌어 폭(높이)을 바꿉니다. 손잡이에 초점을 두고 화살표 키로도, 두 번 누르면 기본 크기. 이 브라우저에 기억합니다.
- **상태 막대**: 형식·스키마·단위·파일 크기·삼각형·부품 수·읽은 시간과 고른 것·측정 거리.
- **테마**: 기본은 시스템 설정을 따르고, 해·달 단추로 고른 테마는 이 브라우저에 기억합니다.
- **주소 인자**: `?sample`은 예제를 바로 엽니다. `?open=<주소>`는 같은 사이트의 파일만 엽니다(자동 확인용, 받는 동안 받은 양·진행률을 보입니다).
  자동 확인용으로 `window.opencadApp`(`state`: 열린 문서 이름·해석 끝났는지·진행률·삼각형 수·고른 면·선/레이어/PMI 수·압축 형식 등, `openSample()`, `openUrl()`, `cancel()`,
  `selectProduct()`, `setTheme()`, `pickAt(x, y, face)`, `setFaceMode()`, `setLayerVisible()`, `setPmiVisible()`, `setSection(axis, t)`)을 둡니다.

## 해석기 쓰는 법

```ts
import { stepToScene } from 'opencad-step';

const scene = stepToScene(bytes, {
  name: 'part.step',
  onProgress: (fraction, stage) => console.log(fraction, stage),
  // 선택(모두 기본 true): curves — 와이어프레임·곡선 형상, pmi — 표현 PMI 선·의미 PMI, faceTable — 면 표
});
// scene: Scene3d (opencad-viewer3d의 Viewer3d.setScene에 넘긴다), scene.meta에 제품 나무·단위 등
// scene.lines: 곡선 형상(group = 부품 이름, 나무 마디의 lineIds)과 표현 PMI 선(group 없음, meta.pmi.presentations의 id)
// meta.layers?: 레이어(이름·설명·처음 보이기·meshIds·lineIds) — Mesh3d.group은 그대로 부품 이름
// meta.pmi?: { presentations, semantic }
// meta.faceKinds·faceTables·meshFaceTable?: 그물 삼각형 → B-rep 면(src/brep.ts FaceTableData)
// Mesh3d.closed: 닫힌 입체(단면 채우기) · Mesh3d/LineSet3d/PointSet3d.origin?: 큰 좌표일 때 묶음 원점(positions는 원점 기준)

// 압축 STEP(gzip·ZIP)은 먼저 푼다(비동기, DecompressionStream)
import { unpackStep } from 'opencad-step';
const { bytes: step } = await unpackStep(fileBytes);
```

## 구조

| 경로 | 내용 |
|---|---|
| `index.html`, `public/` | 앱 진입 페이지, 아이콘 |
| `src/app/main.ts`, `src/app/app.ts` | 앱 진입점과 화면 골격(제목 막대·보기 도구 막대·3D 보기·패널·상태 막대), 열기·고르기·면 고르기·보이기·키 |
| `src/app/toolbar.ts`, `src/app/panel.ts`, `src/app/resize.ts`, `src/app/menu.ts`, `src/app/dom.ts`, `src/app/icons.ts`, `src/app/styles.css` | 보기 도구 막대, 제품·레이어·PMI·정보 패널, 패널 크기 손잡이, 메뉴, DOM 도우미, 아이콘, 스타일 |
| `src/app/doc.ts`, `src/app/tree.ts`, `src/app/faces.ts`, `src/app/visibility.ts`, `src/app/format.ts`, `src/app/files.ts`, `src/app/keys.ts`, `src/app/theme.ts` | 순수 로직: 문서 모델·meta 읽기, 제품 나무 펼침·고르기·이름 거르기, 면 찾기·경계·넓이, 보이기(눈 단추·레이어·PMI), 글 만들기, 파일 이름·주소 인자, 키 규칙, 테마 |
| `src/app/protocol.ts`, `src/app/client.ts`, `src/app/job.ts`, `src/worker/parse.worker.ts` | 해석 워커 메시지·이전 목록, 워커 손님(취소), 해석 일(압축 풀기 → 해석), 해석 워커 |
| `src/app/stepText.ts`, `src/app/sample.ts` | 작은 STEP 글쓴이(시험도 씀)와 예제 조립 모형 |
| `src/index.ts` | 해석기 공개 입구 |
| `src/archive.ts` | 압축 STEP 풀기(gzip·ZIP), STEP-XML 알아보기 |
| `src/part21.ts` | ISO 10303-21 글 해석 |
| `src/scene.ts`, `src/styles.ts`, `src/units.ts`, `src/layers.ts` | 제품·조립·색·단위·레이어 → `Scene3d` |
| `src/wire.ts`, `src/pmi.ts` | 와이어프레임·곡선·PMI 그림 → 선분, PMI 찾기와 의미 PMI 읽기 |
| `src/brep.ts`, `src/geometry.ts`, `src/curves.ts`, `src/surfaces.ts`, `src/nurbs.ts` | B-rep 위상과 곡선·곡면 |
| `src/tessellate.ts`, `src/math.ts` | 삼각화 |
| `src/analysis.ts` | 틈·넓이·부피 검사 |

## 개발

```bash
npm install
npm run dev        # http://localhost:4402/ (예제 바로 열기: /?sample)
npm run typecheck
npm test           # 해석기 시험(tests/*.test.ts)과 앱 순수 로직 시험(tests/app/)
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # 빌드 결과 보기
```

시험은 `tests/stepText.ts`(본문은 `src/app/stepText.ts`)로 만든 작은 STEP 글로 돌립니다(외부 STEP 파일은 넣지 않습니다).
압축 시험은 `tests/zipText.ts`(시험용 ZIP 글쓴이, node:zlib)로 gzip·ZIP을 만듭니다.
확인용으로 받은 공개 STEP 파일이나 임시 결과는 git이 무시하는 `.runtime/`에만 둡니다.
3D 뷰어 코어는 `github:GyuTae-Kim/opencad-viewer3d#v0.4.0`(잠금 커밋 `2085f0e`)으로 받습니다 — 올릴 때는
`npm install "opencad-viewer3d@github:GyuTae-Kim/opencad-viewer3d#v0.4.0"`처럼 태그를 주어야 잠금 파일의 커밋이 바뀝니다(그냥 `npm install`은 옛 커밋을 남깁니다).
개발 서버가 옛 코어를 미리 묶어 둔 채라면 `npx vite --force`로 다시 묶습니다.

## 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 typecheck → test → build를 거쳐 `dist/`를 `gh-pages` 가지에 올립니다
(GitHub Pages: https://gyutae-kim.github.io/opencad-step/). 빌드는 상대 경로(`base: './'`)라 어느 하위 경로에서도 돕니다.
끌어오기 요청은 `.github/workflows/ci.yml`이 같은 확인을 돌립니다.

## 남은 일

- STEP-XML(.stpx, ISO 10303-28) 읽기
- PMI: 글꼴로 쓰는 글자(ANNOTATION_TEXT·TEXT_LITERAL)와 기호(DEFINED_SYMBOL), 저장된 보기(카메라·보이기 묶음),
  치수와 형상의 연결(어느 면의 치수인지 강조), 큰 조립에서 같은 부품의 둘째 자리부터는 PMI를 다시 그리지 않음
- 경계가 없는 곡면(GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION의 B-스플라인·잘린 곡면)을 그물로 그리기
- 면 고르기: 모서리 단위 고르기, 면 사이 거리·각도 재기
- 레이어: 면 단위 레이어 배정(지금은 형상 항목·껍질·첫 면까지 보고 형상 항목 하나를 한 레이어에 넣는다)

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/opencad-dwgdxf)의 `src/formats/step/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 STEP 파일을 3D 탭으로 열던 화면(제품 나무 패널, 리본, 웹 워커 — `src/app/view3d/`)은 이 저장소의 혼자 도는 앱(`src/app/`)으로
새로 짰습니다(제품 나무·워커 프로토콜·이전 목록 등은 그 커밋의 코드를 옮겨 다듬었습니다).

## 라이선스

MIT. 의존성 earcut은 ISC입니다([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).


## 검색·공유 메타데이터와 콘텐츠 수정일

`site/metadata.json`을 공통 원본으로 삼아 Vite 플러그인이 제목·설명·canonical·Open Graph·Twitter Card·JSON-LD를 초기 HTML에 넣습니다. 같은 원본으로 앱의 공개 주소를 담은 `sitemap.xml`도 생성합니다. 공유 이미지는 각 앱의 `public/og-opencad.jpg`이며 앱 파일과 함께 배포합니다. `robots.txt`는 같은 호스트 루트(`https://gyutae-kim.github.io/robots.txt`)의 설정이 적용됩니다.

`site/content-history.json`에는 실제 콘텐츠 수정 시각과 지문을 저장합니다. 초기 HTML 본문·메타데이터·공유 이미지와 빌드된 앱/워커 JavaScript·CSS를 비교하므로 앱 기능이 바뀌면 날짜 갱신이 필요합니다. 수정일 자체와 소스 맵은 비교에서 제외합니다.

1. 콘텐츠를 변경한 실제 UTC 시각을 기록하고 `npm run update:content-dates -- --at YYYY-MM-DDTHH:mm:ssZ`를 실행합니다.
2. `npm run build`로 다시 빌드합니다. 변경되지 않은 콘텐츠는 기존 날짜를 유지하며, 날짜가 오래되었거나 잘못된 경우 SEO 검사가 실패해 배포를 막습니다.
3. `npm run test:seo`와 기존 테스트를 실행하고 메타데이터·수정일 기록을 함께 커밋합니다.

일반 빌드나 배포 시각으로 날짜를 자동 갱신하지 않습니다. `sitemap.xml`의 `lastmod`와 앱 구조화 데이터의 `dateModified`는 동일한 기록을 사용합니다. 배포 뒤에는 앱·사이트맵·공유 이미지의 실제 공개 응답을 확인하고, 포트폴리오 통합 사이트맵의 연결 날짜도 새 앱 사이트맵과 맞춥니다. 사이트맵 게시와 검색엔진의 실제 수집·색인 완료는 별도로 확인합니다.
