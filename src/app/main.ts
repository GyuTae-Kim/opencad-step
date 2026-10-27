import { installLocalization } from './i18n';
/**
 * 앱 진입점: 화면을 세우고, 자동 확인용 window.opencadApp을 두고, 시작 주소 인자(?open=·?sample)를 처리한다.
 */
import './styles.css';
import { initAnalytics } from 'opencad-site-kit/analytics';
import { GA4_MEASUREMENT_ID } from 'opencad-site-kit/analytics/config';
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
      /** 캔버스 점(CSS 화소)에서 고르기(face면 면 고르기도) */
      pickAt(x: number, y: number, face?: boolean): ReturnType<StepApp['pickAt']>;
      setFaceMode(on: boolean): void;
      setLayerVisible(layer: number, on: boolean): void;
      setPmiVisible(id: string | null, on: boolean): void;
      /** 단면 축(null = 끄기)과 위치(0~1, 선택) */
      setSection(axis: 'x' | 'y' | 'z' | null, t?: number): void;
    };
  }
}

const root = document.getElementById('app');
if (root) {
  initAnalytics(GA4_MEASUREMENT_ID, 'step');
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
    pickAt: (x, y, face) => app.pickAt(x, y, face),
    setFaceMode: (on) => app.toggleFaceMode(on),
    setLayerVisible: (layer, on) => app.setLayerVisible(layer, on),
    setPmiVisible: (id, on) => app.setPmiVisible(id, on),
    setSection: (axis, t) => {
      app.setSectionAxis(axis);
      if (axis && t !== undefined) app.setSectionPosition(t);
    },
  };
  void app.start();
}

if (root) void installLocalization(root);
