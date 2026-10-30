/**
 * 그래픽 문맥 잃음·되찾음 안내(코어 0.25.0 onContextLost·onContextRestore — viewerkit.ts 조각에 든다, 첫 화면 JS 밖).
 *
 * GPU나 그 드라이버가 다시 시작되거나 휴대폰에서 탭을 오래 숨겼다 돌아오면 브라우저가 3D 보기의 그래픽 문맥을 거둔다.
 * 그동안 코어는 화면을 다시 그리지 않으므로(멈춘 그림 또는 빈 화면) 잃으면 되찾을 때까지 남는 안내를 띄우고,
 * 되찾으면(코어가 장면·덧그림·단면 테두리를 스스로 다시 올린 뒤) 그 안내를 거두고 짧게 알린다.
 * 앱은 코어의 놓기 선택(setScene의 release)을 쓰지 않으므로 되찾을 때 다시 줄 배열이 없다(need는 늘 빈 목록).
 */
import type { Viewer3d } from 'opencad-viewer3d';

/** 알림을 띄우고 닫는 함수를 돌려주는 곳(앱의 toast) */
export type ContextToast = (msg: string, kind: 'info' | 'warn', ms: number) => () => void;

/** 잃은 동안 남겨 두는 안내의 시간(ms) — 되찾으면 거둔다. setTimeout 한도(약 24.8일) 안 */
const LOST_MS = 24 * 60 * 60 * 1000;

export const CONTEXT_LOST_MESSAGE = '그래픽 장치가 다시 시작되어 3D 화면을 잠시 그리지 못합니다 — 되찾으면 바로 다시 그립니다.';
export const CONTEXT_RESTORED_MESSAGE = '3D 화면을 다시 그렸습니다.';

/**
 * 뷰어의 문맥 잃음·되찾음에 안내를 단다. 잃음이 거듭 와도 안내는 하나이고, 되찾음 알림은 잃음 안내를 띄운 뒤에만 띄운다.
 * 돌려준 함수는 듣기를 풀고 남은 안내를 닫는다(뷰어를 없애면 코어가 알림을 모두 푼다)
 */
export function watchGraphicsContext(v: Pick<Viewer3d, 'onContextLost' | 'onContextRestore'>, toast: ContextToast): () => void {
  let close: (() => void) | null = null;
  const offLost = v.onContextLost(() => {
    close?.();
    close = toast(CONTEXT_LOST_MESSAGE, 'warn', LOST_MS);
  });
  const offRestore = v.onContextRestore(() => {
    const c = close;
    if (!c) return;
    close = null;
    c();
    toast(CONTEXT_RESTORED_MESSAGE, 'info', 3500);
  });
  return () => {
    offLost();
    offRestore();
    close?.();
    close = null;
  };
}
