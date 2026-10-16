# OpenCAD STEP 해석기

STEP(ISO 10303-21, AP203·AP214·AP242) 파일을 브라우저 안에서 읽고 B-rep 곡면을 삼각화해 3D 장면으로 만듭니다.
DOM·WebGL에 기대지 않아 웹 워커에서 돌 수 있고, 결과 장면(`Scene3d`)은 [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)로 그립니다.
다른 CAD 커널이나 STEP 라이브러리를 쓰지 않고 공개 명세만 보고 새로 작성했습니다.

함께 쓰는 저장소: [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d)(3D 뷰어 코어) ·
[opencad-nc](https://github.com/GyuTae-Kim/opencad-nc) · [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp)

## 할 수 있는 것

- Part 21 글 읽기(머리, 개체, 복합 개체, 문자열 부호)
- B-rep 곡면 삼각화: 평면·원기둥·원뿔·구·원환·B-스플라인·회전·밀기 곡면, 구멍 있는 면, 틈 없는 이음
- 조립(제품·인스턴스 변환), 색, 단위, 제품 나무(`StepProductNode`)
- 틈·넓이·부피 검사(`watertightness`, `meshArea`, `meshVolume`)
- 공개 STEP 21개를 실패 면 없이 읽었고, NIST 시험 모형 9개는 모두 틈이 없습니다.

## 쓰는 법

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
| `src/index.ts` | 공개 입구 |
| `src/part21.ts` | ISO 10303-21 글 해석 |
| `src/scene.ts`, `src/styles.ts`, `src/units.ts` | 제품·조립·색·단위 → `Scene3d` |
| `src/brep.ts`, `src/geometry.ts`, `src/curves.ts`, `src/surfaces.ts`, `src/nurbs.ts` | B-rep 위상과 곡선·곡면 |
| `src/tessellate.ts`, `src/math.ts` | 삼각화 |
| `src/analysis.ts` | 틈·넓이·부피 검사 |

## 개발

```bash
npm install
npm run typecheck
npm test
```

시험은 `tests/stepText.ts`로 만든 작은 STEP 글로 돌립니다(외부 STEP 파일은 넣지 않습니다).
3D 뷰어 코어는 `github:GyuTae-Kim/opencad-viewer3d#v0.1.0`으로 받습니다.

## 남은 일

- 와이어프레임·PMI 주석
- 면 단위 고르기
- 레이어

## 내력

[2dcad-viewer](https://github.com/GyuTae-Kim/2dcad-viewer)의 `src/formats/step/`에서 분리했습니다(커밋 `d7c584a` 기준, 처음 들어온 것은 PR #7).
2D 뷰어 안에서 STEP 파일을 3D 탭으로 열던 화면(제품 나무 패널, 리본, 웹 워커 — `src/app/view3d/`)은 2D 뷰어 화면 골격에 붙어 있어 옮기지 않았고,
그 커밋의 2dcad-viewer에 남아 있습니다.

## 라이선스

MIT. 의존성 earcut은 ISC입니다([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
