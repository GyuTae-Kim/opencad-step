# OpenCAD STEP 뷰어·해석기

STEP(ISO 10303-21, AP203·AP214·AP242) 파일을 브라우저 안에서 읽고 B-rep 곡면을 삼각화해 3D로 보는 앱과 그 해석기입니다.
해석기는 DOM·WebGL에 기대지 않아 웹 워커에서 돌고, 결과 장면(`Scene3d`)은 [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)로 그립니다.
다른 CAD 커널이나 STEP 라이브러리를 쓰지 않고 공개 명세만 보고 새로 작성했습니다.

**앱 주소(배포 예정):** https://gyutae-kim.github.io/opencad-step/

함께 쓰는 저장소: [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)(3D 뷰어 코어) ·
[opencad-nc](https://github.com/GyuTae-Kim/opencad-nc) · [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp)

## 할 수 있는 것

- Part 21 글 읽기(머리, 개체, 복합 개체, 문자열 부호)
- B-rep 곡면 삼각화: 평면·원기둥·원뿔·구·원환·B-스플라인·회전·밀기 곡면, 구멍 있는 면, 틈 없는 이음
- 조립(제품·인스턴스 변환), 색, 단위, 제품 나무(`StepProductNode`)
- 틈·넓이·부피 검사(`watertightness`, `meshArea`, `meshVolume`)
- 공개 STEP 21개를 실패 면 없이 읽었고, NIST 시험 모형 9개는 모두 틈이 없습니다.

## 앱 쓰는 법

- **열기**: 제목 막대의 "열기"(Ctrl+O)로 `.stp`·`.step`·`.p21` 파일을 고르거나, 창 어디에나 끌어다 놓습니다. "예제 열기"는 우리가 만든 작은 조립 모형(받침판·블록 둘·핀 묶음)을 엽니다.
  한 번에 문서 하나를 열며 새로 열면 바꿉니다. 큰 파일은 해석 중 덮개의 "취소"(또는 Esc)로 멈출 수 있습니다.
- **파일은 이 브라우저 밖으로 나가지 않습니다.** 읽기(웹 워커)와 그리기(WebGL2)를 모두 이 컴퓨터에서 합니다.
- **보기**: 왼쪽 끌기 회전, 오른쪽·가운데 끌기 이동, 휠 확대, 터치 회전·핀치. 도구 막대에 전체 보기(F), 표준 뷰(1 앞 · 2 뒤 · 3 왼쪽 · 4 오른쪽 · 5 위 · 6 아래 · 7 등각),
  원근/평행, 음영·음영+모서리·와이어프레임·X-ray, 격자(F7), 뷰 큐브, 좌표축, 두 점 측정(Esc = 지우기), PNG 저장, 패널 열고 닫기가 있습니다.
  키는 캔버스에 초점이 없어도(입력 칸 제외) 듣습니다.
- **패널**(폭 760px 미만이면 아래 시트):
  - 제품 — 제품 나무(접고 펴기, 이름·자리 이름·인스턴스 수). 마디를 고르면 그 아래 형상을 3D에서 강조하고, 3D에서 부품을 누르면 나무에서 그 마디를 펼쳐 보입니다.
    눈 단추로 숨기기/보이기, "부품별 보이기"로 같은 부품 자리를 한꺼번에 켜고 끕니다.
  - 정보 — 문서(크기·범위·삼각형), 파일 머리(FILE_NAME·FILE_DESCRIPTION·FILE_SCHEMA 등), 단위, 통계(솔리드·면·삼각화 못 한 면·삼각형·인스턴스·읽기/삼각화 시간), 해석기 경고.
- **상태 막대**: 형식·스키마·단위·파일 크기·삼각형·부품 수·읽은 시간과 고른 것·측정 거리.
- **테마**: 기본은 시스템 설정을 따르고, 해·달 단추로 고른 테마는 이 브라우저에 기억합니다.
- **주소 인자**: `?sample`은 예제를 바로 엽니다. `?open=<주소>`는 같은 사이트의 파일만 엽니다(자동 확인용).
  자동 확인용으로 `window.opencadApp`(`state`: 열린 문서 이름·해석 끝났는지·진행률·삼각형 수 등, `openSample()`, `openUrl()`, `cancel()`, `selectProduct()`, `setTheme()`)을 둡니다.

## 해석기 쓰는 법

```ts
import { stepToScene } from 'opencad-step';

const scene = stepToScene(bytes, {
  name: 'part.step',
  onProgress: (fraction, stage) => console.log(fraction, stage),
});
// scene: Scene3d (opencad-viewer3d의 Viewer3d.setScene에 넘긴다), scene.meta에 제품 나무·단위 등
```

## 구조

| 경로 | 내용 |
|---|---|
| `index.html`, `public/` | 앱 진입 페이지, 아이콘 |
| `src/app/main.ts`, `src/app/app.ts` | 앱 진입점과 화면 골격(제목 막대·보기 도구 막대·3D 보기·패널·상태 막대), 열기·고르기·키 |
| `src/app/toolbar.ts`, `src/app/panel.ts`, `src/app/menu.ts`, `src/app/dom.ts`, `src/app/icons.ts`, `src/app/styles.css` | 보기 도구 막대, 제품·정보 패널, 메뉴, DOM 도우미, 아이콘, 스타일 |
| `src/app/doc.ts`, `src/app/tree.ts`, `src/app/format.ts`, `src/app/files.ts`, `src/app/keys.ts`, `src/app/theme.ts` | 순수 로직: 문서 모델·meta 읽기, 제품 나무 펼침·고르기, 글 만들기, 파일 이름·주소 인자, 키 규칙, 테마 |
| `src/app/protocol.ts`, `src/app/client.ts`, `src/worker/parse.worker.ts` | 해석 워커 메시지·이전 목록, 워커 손님(취소), 해석 워커 |
| `src/app/stepText.ts`, `src/app/sample.ts` | 작은 STEP 글쓴이(시험도 씀)와 예제 조립 모형 |
| `src/index.ts` | 해석기 공개 입구 |
| `src/part21.ts` | ISO 10303-21 글 해석 |
| `src/scene.ts`, `src/styles.ts`, `src/units.ts` | 제품·조립·색·단위 → `Scene3d` |
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
확인용으로 받은 공개 STEP 파일이나 임시 결과는 git이 무시하는 `.runtime/`에만 둡니다.
3D 뷰어 코어는 `github:GyuTae-Kim/opencad-viewer3d#v0.1.0`으로 받습니다.

## 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 typecheck → test → build를 거쳐 `dist/`를 `gh-pages` 가지에 올립니다
(GitHub Pages: https://gyutae-kim.github.io/opencad-step/). 빌드는 상대 경로(`base: './'`)라 어느 하위 경로에서도 돕니다.
끌어오기 요청은 `.github/workflows/ci.yml`이 같은 확인을 돌립니다.

## 남은 일

- 와이어프레임·PMI 주석
- 면 단위 고르기, 고른 부품으로 확대
- 레이어
- 압축 STEP(.stpZ·.stpx) 열기

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/2dcad-viewer)의 `src/formats/step/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 STEP 파일을 3D 탭으로 열던 화면(제품 나무 패널, 리본, 웹 워커 — `src/app/view3d/`)은 이 저장소의 혼자 도는 앱(`src/app/`)으로
새로 짰습니다(제품 나무·워커 프로토콜·이전 목록 등은 그 커밋의 코드를 옮겨 다듬었습니다).

## 라이선스

MIT. 의존성 earcut은 ISC입니다([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
