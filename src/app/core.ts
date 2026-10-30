/**
 * 3D 뷰어 코어(opencad-viewer3d)를 문서를 열 때 나눠 받는다(dynamic import — 첫 화면 JS에서 코어의 그리기·고르기를 뺀다).
 *
 * - 시작 화면(파일 열기·최근 문서·예제·언어 메뉴)은 코어 없이 그린다. 앱은 코어의 작은 모듈(camera 뷰 이름·카메라 계산,
 *   viewcube 뷰 큐브 글, bounds 상자, bvh·closest 개체 측정 계산)만 바로 가져오고,
 *   코어 입구(index → viewer·renderer)는 여기서만 가져온다(keys.ts의 VIEW_KEYS는 작은 camera 모듈의 같은 표).
 * - 받는 것은 코어 입구와 뷰어를 만든 뒤에만 쓰는 앱 모듈(정밀 조준 aim.ts — 코어 pointer 모듈과 함께)을 묶은 viewerkit.ts 조각이다.
 * - 열기 상자를 열거나 파일을 끌어 오면 받기 시작하고, 파일을 열기 시작할 때도(예제·주소·최근 문서·공유 받기) 워커 해석과 함께 받는다.
 *   오프라인 앱은 서비스 워커가 이 조각도 미리 담아 둔다.
 * - 받지 못하면(오프라인에서 새 판 등) 약속을 비워 다음 열기에서 다시 받는다.
 */
type Core = typeof import('./viewerkit');
type Tangents = typeof import('./tangent');

let pending: Promise<Core> | null = null;
let tangents: Promise<Tangents> | null = null;

/**
 * 측정 곡선 접선 잠금(tangent.ts)도 문서를 열 때 나눠 받는다(측정에서만 쓰므로 — 첫 화면 JS의 휴대폰 성능 예산을 지킨다).
 * 받지 못하면 약속을 비워 다음에 다시 받는다(그동안 곡선 끝에서는 코어 판정만)
 */
export function loadCurveTangents(): Promise<Tangents> {
  if (!tangents) {
    const p = import('./tangent');
    tangents = p;
    p.catch(() => {
      if (tangents === p) tangents = null;
    });
  }
  return tangents;
}

/** 코어 입구 모듈과 뷰어에 다는 앱 모듈(viewerkit.ts — 한 번만 받는다) */
export function loadViewerCore(): Promise<Core> {
  if (!pending) {
    const p = import('./viewerkit');
    pending = p;
    p.catch(() => {
      if (pending === p) pending = null;
    });
  }
  return pending;
}
