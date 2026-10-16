/**
 * 앱 진입점: 화면을 세우고, 자동 확인용 window.opencadApp을 두고, 시작 주소 인자(?open=·?sample)를 처리한다.
 */
import './styles.css';
import { StepApp, type AppState } from './app';
import type { Theme } from './theme';

declare global {
  interface Window {
    /** 자동 확인·개발용 손잡이 */
    opencadApp?: {
      readonly app: StepApp;
      readonly state: AppState;
      readonly viewer: StepApp['viewerRef'];
      openSample(): Promise<boolean>;
      openUrl(url: string): Promise<boolean>;
      cancel(): void;
      selectProduct(key: string | null): void;
      setTheme(t: Theme | null): void;
    };
  }
}

const root = document.getElementById('app');
if (root) {
  const app = new StepApp(root);
  window.opencadApp = {
    app,
    get state() {
      return app.snapshot();
    },
    get viewer() {
      return app.viewerRef;
    },
    openSample: () => app.openSample(),
    openUrl: (url) => app.openUrl(url),
    cancel: () => app.cancel(),
    selectProduct: (key) => app.selectKey(key),
    setTheme: (t) => app.setTheme(t),
  };
  void app.start();
}
