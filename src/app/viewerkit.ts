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
 * - 작업 메뉴 항목·불투명도 메뉴(ctxmenu.ts — 52차): 작업 메뉴는 뷰어가 있어야 열린다(3D 오른쪽 누르기·길게 누르기, 나무 줄, 여러 개 고르기 띠)
 * - 키보드 길잡이(keynav.ts — 53차): 패널 탭·라디오 묶음·도구 막대의 화살표와 띠·막대·패널을 닫을 때 초점 돌려주기 — 모두 문서가 있어야 쓴다
 * - 물리 속성 계산(physics.ts — 53차에 첫 화면 JS에서 옮김): 속성 탭의 부피·질량·무게중심·관성은 문서가 있어야 그린다(앱이 패널에 넣는다)
 * - PMI 탭 본문(pmiview.ts — 54차에 첫 화면 JS에서 옮김): 표현·의미 PMI 표를 보이는 줄만 그리는 가상 목록, 나무 조각과 함께 패널에 넣는다
 * - 카메라 옮기기와 움직임 줄이기(motion.ts — 55차, 카메라 옮기기는 viewhelp.ts에서 옮김): 홈 뷰·면 정면·저장된 보기, 뷰어를 만들 때 코어 animate 선택
 * - 큰 장면 나눠 올리기(upload.ts — 58차, 앱 입구에서 옮김): 문서를 뷰어에 올릴 때 나눠 올릴지와 그물 수에 맞춘 몫
 * - 연 뒤 알림(opennotice.ts — 58차, 앱 입구에서 옮김): 끊긴 파일·조립 자리 상한·경고 수
 * 여기에 더한 모듈은 앱 입구에서 값으로 가져오지 않는다(타입만 — tests/app/core-split.test.ts가 본다).
 */
export * from 'opencad-viewer3d';
export { TouchAim } from './aim';
export { contextItems } from './ctxmenu';
export * from './entpick';
export { watchGraphicsContext } from './gpucontext';
export { installKeyNav } from './keynav';
export { animateCamera, reducedMotion } from './motion';
export { openNotice } from './opennotice';
export { accuracyText, inertiaText, MATERIALS, massText, meshNodes, physProps } from './physics';
export { pmiView } from './pmiview';
export { straightEdgeFilter, trackDirMeetLabel } from './trackdir';
export { groupGrid, treeView } from './treeview';
export { sceneUpload } from './upload';
