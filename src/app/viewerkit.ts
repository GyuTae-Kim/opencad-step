/**
 * 문서를 열 때 받는 3D 뷰어 조각(core.ts loadViewerCore의 import() 하나로만 받는다 — 첫 화면 JS 밖).
 * 코어 입구(opencad-viewer3d — 뷰어·그리기·고르기)와, 뷰어를 만든 뒤에만 쓰는 앱 모듈을 한 조각에 묶는다(받는 요청은 그대로 하나).
 * - TouchAim(aim.ts — 정밀 조준·길게 눌러 작업 메뉴): 뷰어를 만들 때 캔버스에 단다. 코어의 터치 끌기 문턱(pointer 모듈)도 함께 이 조각에
 * - 개체 측정(entpick.ts — 누른 면·모서리·꼭짓점을 개체로 보고 두 개체 사이 거리·각과 덧그림을 만든다): 뷰어의 누르기로만 쓴다.
 *   해석적으로 재는 entmeasure.ts와 최소 거리용 코어 bvh·closest 모듈도 함께 이 조각에
 * - 그래픽 문맥 잃음·되찾음 안내(gpucontext.ts — 코어 0.25.0 알림): 뷰어를 만들 때 단다
 * - 끌어온 점 나란함·수직의 기준 선분 거르기(trackdir.ts — 코어 0.28.0 trackDirs { edge }, 0.29.0 parallelEdge): 뷰어를 만들 때 쥐어 측정 붙잡기 선택에 넘긴다.
 *   그 선이 만나는 점의 이름(trackDirMeetLabel — 코어 0.29.0 trackDirs { meets })도 같은 모듈에 — 상태 막대·측정 띠·결과 이름을 고를 때 쓴다
 * - 나무 조각(treeview.ts — 49차, 제품 나무·부품별 보이기 표를 보이는 줄만 그리는 가상 목록): 뷰어를 만들 때 패널에 넣는다(패널은 문서를 보일 때 나무를 그린다)
 * - 작업 메뉴 항목·불투명도 메뉴(ctxmenu.ts — 52차): 작업 메뉴는 뷰어가 있어야 열린다(3D 오른쪽 누르기·길게 누르기, 나무 줄, 여러 개 고르기 띠).
 *   64차: 3D 보기 화면 점에서 여는 길(contextAt — 앱 입구에서 옮김)과 겹친 것 고르기 목록(picklist.ts — 코어 0.47.0 pickCandidates)도
 * - 키보드 길잡이(keynav.ts — 53차): 패널 탭·라디오 묶음·도구 막대의 화살표와 띠·막대·패널을 닫을 때 초점 돌려주기 — 모두 문서가 있어야 쓴다
 * - 물리 속성 계산(physics.ts — 53차에 첫 화면 JS에서 옮김): 속성 탭의 부피·질량·무게중심·관성은 문서가 있어야 그린다(앱이 패널에 넣는다)
 * - PMI 탭 본문(pmiview.ts — 54차에 첫 화면 JS에서 옮김): 표현·의미 PMI 표를 보이는 줄만 그리는 가상 목록, 나무 조각과 함께 패널에 넣는다
 * - (55~60차의 카메라 옮기기·움직임 줄이기 motion.ts는 61차에 뺐다 — 코어 0.48.0 animate 'auto'와 0.49.0 flyTo가 맡는다)
 * - 큰 장면 나눠 올리기(upload.ts — 58차, 앱 입구에서 옮김): 문서를 뷰어에 올릴 때 나눠 올릴지와 그물 수에 맞춘 몫
 * - 연 뒤 알림(opennotice.ts — 58차, 앱 입구에서 옮김): 끊긴 파일·조립 자리 상한·경고 수, 코어가 빼거나 고쳐 그린 장면 입력의 경고 글(61차 — 코어 0.50.0 onSceneIssues)
 * - 패널 정보 탭 본문(infoview.ts — 59차, panel.ts에서 옮김): 문서·파일 머리·단위·통계·경고 — 나무 조각과 함께 패널에 넣는다.
 *   나눠 올리기 걸음마다 몫(upload.ts stepBudgetMs — 59차, 앞 두 걸음 8 ms)과 다시 그리기 간격(61차 — 코어 0.51.0 공개 선택으로, uploadOptions)도 같은 모듈
 * - 키보드로 3D 붙잡기·고르기(keysnap.ts — 62차, 코어 0.46.0·0.47.0 setKeyboardSnap): 뷰어를 만들 때 켜고 알림 영역·캔버스 키 안내를 단다, 도움말 키 표도
 * - 큰 그림 저장 대화 상자 본문(imagedlg.ts — 62차, 앱 입구에서 옮김): 뷰어가 있어야 연다
 * - 면 기준 보기·자르기 계산(viewhelp.ts — 63차, 앱 입구에서 옮김)과 저장된 보기의 방향 → 각(코어 camera dirToAngles), 개체 측정의 장면 범위(코어 sceneBounds —
 *   코어 입구가 내보낸다): 모두 뷰어가 있어야 쓴다
 * - 3D 강조 그리기(hipaint.ts — 65차, 앱 입구의 showFace를 옮김): 고른 것의 항목·구간 강조와 면·모서리 강조 선을 함께 그린다(앱은 그린 것을 기억해 겹친 것 목록 미리 강조 뒤 되돌린다).
 *   겹친 것 고르기 후보 묶음 열쇠(picklist.ts pickGroup — 코어 0.53.0 group)는 가상 커서 Tab에도 준다
 * - 부품 겉모습 걸기(looks.ts LookSync — 66차, 앱 입구에서 옮김): 불투명도·흐리게·부품 색·분해 행렬을 바뀐 묶음만 코어에 건다(뷰어가 있어야 건다 —
 *   앱의 반투명 보기 판정 translucentView는 doc.ts). 코어가 묶어 그리기 조각을 기다려 미룬 올리기의 상태 표시(upload.ts holdUpload — 69차, 코어 0.56.0)도
 * - 묶어 그리기 조각 미리 받기(upload.ts warmMerging — 74차, 코어 0.60.0): 이 조각이 들어오면 곧 받기 시작한다(기다리지 않는다 — 아래)
 * 여기에 더한 모듈은 앱 입구에서 값으로 가져오지 않는다(타입만 — tests/app/core-split.test.ts가 본다).
 */
import { warmMerging } from './upload';

export * from 'opencad-viewer3d';
export { TouchAim } from './aim';
export { contextAt, contextItems } from './ctxmenu';
export * from './entpick';
export { watchGraphicsContext } from './gpucontext';
export { paintHi } from './hipaint';
export { imageDialogBody } from './imagedlg';
export { infoView } from './infoview';
export { installKeyNav } from './keynav';
export { installKeySnap, keyHelpBody } from './keysnap';
// 66차: 부품 겉모습 걸기(looks.ts LookSync — 불투명도·흐리게·부품 색·분해 행렬, 뷰어가 있어야 건다 — 첫 화면 JS에서 옮김)
export { LookSync } from './looks';
export { openNotice, sceneIssueLines } from './opennotice';
export { pickGroup } from './picklist';
// 뷰 큐브 면 글(코어가 캔버스에 그린다 — 앱이 화면 언어로 바꾼다, app.ts relabelCube). 61차: 코어 0.44.0에서 커진 viewcube 모듈을 첫 화면 JS에서 빼려고
// i18n.ts에서 이 조각으로 옮겼다(코어 뷰어가 이미 이 모듈을 쓴다)
export { CUBE_FACES } from 'opencad-viewer3d/viewcube';
export { accuracyText, inertiaText, MATERIALS, massText, meshNodes, physProps } from './physics';
export { pmiView } from './pmiview';
export { straightEdgeFilter, trackDirMeetLabel } from './trackdir';
export { groupGrid, treeView } from './treeview';
export { holdUpload, sceneUpload, uploadOptions } from './upload';
// 면 기준 보기·자르기 계산(viewhelp.ts — 63차에 첫 화면 JS에서 옮김: 면을 고른 뒤에만 쓴다)과 저장된 보기 방향 → 각(코어 camera dirToAngles —
// 첫 화면은 같은 모듈의 뷰 이름·숫자 키 표만 쓴다)
export { cameraBack, cameraLooking, faceBox, faceSectionPlane, faceViewDir, movedFace } from './viewhelp';
export { dirToAngles } from 'opencad-viewer3d/camera';

// 74차(코어 0.60.0): 이 조각은 문서를 열 것 같을 때(열기 상자·끌어 오기) 또는 열기 시작할 때 받으므로, 들어오면 곧 묶어 그리기 조각도 받기 시작한다 — 파일 읽기·워커 해석과 겹쳐
// setScene 때 와 있으면 큰 조립의 나눠 올리기가 첫 걸음 그물 64개로 멈추지 않고 한 번에 올리기도 미루지 않는다(기다리지 않는다 — 늦으면 코어가 지금처럼 맡는다)
warmMerging();
