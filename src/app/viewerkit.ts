/**
 * 문서를 열 때 받는 3D 뷰어 조각(core.ts loadViewerCore의 import() 하나로만 받는다 — 첫 화면 JS 밖).
 * 코어 입구(opencad-viewer3d — 뷰어·그리기·고르기)와, 뷰어를 만든 뒤에만 쓰는 앱 모듈을 한 조각에 묶는다(받는 요청은 그대로 하나).
 * - TouchAim(aim.ts — 정밀 조준·길게 눌러 작업 메뉴): 뷰어를 만들 때 캔버스에 단다. 코어의 터치 끌기 문턱(pointer 모듈)도 함께 이 조각에
 * - 개체 측정(entpick.ts — 누른 면·모서리·꼭짓점을 개체로 보고 두 개체 사이 거리·각과 덧그림을 만든다): 뷰어의 누르기로만 쓴다.
 *   해석적으로 재는 entmeasure.ts와 최소 거리용 코어 bvh·closest 모듈도 함께 이 조각에
 * - 그래픽 문맥 잃음·되찾음 안내(gpucontext.ts — 코어 0.25.0 알림): 뷰어를 만들 때 단다
 * 여기에 더한 모듈은 앱 입구에서 값으로 가져오지 않는다(타입만 — tests/app/core-split.test.ts가 본다).
 */
export * from 'opencad-viewer3d';
export { TouchAim } from './aim';
export * from './entpick';
export { watchGraphicsContext } from './gpucontext';
