/**
 * OpenCAD STEP 뷰어 앱: 화면 골격(제목 막대·보기 도구 막대·3D 보기·패널·상태 막대)과 문서 열기·고르기·키 처리.
 *
 * - 한 번에 문서 하나를 연다(새로 열면 바꾼다). 해석은 웹 워커(src/worker/parse.worker.ts)에서 하고
 *   진행률·단계는 3D 보기 위 덮개에 보이며, 덮개의 취소 단추는 워커를 끝낸다.
 * - Viewer3d는 처음 문서를 열 때 하나 만들어 계속 쓴다(WebGL 문맥 수 한계).
 * - 키: 캔버스에 초점이 있으면 뷰어가 F·1~7·Esc를 직접 받는다. 그 밖(입력 칸 제외)에서는 창이 받아
 *   `Viewer3d.handleKey`로 넘긴다(뷰어 키 규칙은 코어 것을 그대로 쓴다). F7·Ctrl/⌘+O·Esc 순서는 앱이 정한다.
 * - 면 고르기: 도구 막대의 "면 고르기"를 켜거나 Alt(⌥)를 누른 채 누르면(onPick의 e.altKey), 부품 고르기와 함께 누른 B-rep 면을 찾아
 *   면 자체(highlightRanges — 면 표의 삼각형 범위)와 경계 모서리(setHighlightSegments)를 강조하고 종류·넓이·법선 등을 패널 아래 띠에 보인다.
 *   3D에서 두 번 누르면(e.clicks) 나무처럼 그 부품으로 맞춰 본다.
 * - 단면: 도구 막대·단면 막대에서 바꾸고, 막대 표시는 코어 onSectionChange 알림으로만 맞춘다(새 문서에서 꺼짐 등).
 * - 보이기: 나무 눈 단추·레이어·PMI 켜고 끄기를 doc.vis(visibility.ts)가 함께 따져 뷰어 setItemVisible로 넘긴다.
 * - 휴대폰·터치: 측정·면 고르기 중에는 3D 보기 아래 가운데 띠(measure.ts)에 안내·거리·고른 면 치수와 다시 재기·끝내기 단추를 두고,
 *   길게 누르면 손가락 위 십자선으로 정밀 조준한다(aim.ts — 코어 포인터 처리를 그대로 쓴다).
 * - 최근 문서: 파일 고르기·끌어다 놓기로 잘 연 파일을 이 브라우저(IndexedDB, recent.ts)에 남겨 시작 화면에서 다시 연다
 *   (휴대폰 브라우저가 뒤로 간 탭을 버렸다가 다시 불러와도 파일 앱을 다시 거치지 않게). 예제·주소로 연 것은 남기지 않는다.
 */
import { Viewer3d, type MeasureResult, type Pick3d, type Projection, type RenderMode, type SectionAxis, type SectionState, type ViewName } from 'opencad-viewer3d';
import { isStepXml, isStepXmlName, sniffContainer, STEP_XML_MESSAGE } from '../archive';
import { ParseCancelled, ParseClient } from './client';
import { beginOpen, showAnalyticsSettings, trackExport, type InputKind, type OpenAttempt } from './analytics';
import { TouchAim } from './aim';
import { h, icon, iconButton } from './dom';
import { DEFAULT_DISPLAY, Fmt, MAX_DECIMALS, numberLocale, QUALITY_OPTIONS, readDisplaySettings, writeDisplaySettings, type DisplaySettings } from './display';
import { closeDialog, openDialog, selectRow } from './dialog';
import { carryDocState, createDoc, docStatus, productAt, selectionItemIds, subtreeItemIds, type StepDoc } from './doc';
import { edgeAt, edgeDetails, snapOnEdge, type EdgePick } from './edges';
import { armSize, lineValue, measurePicked, pickedAnnotations, pickedClosest, pickedEdge, pickedFace, pickedPoint, pickedSection, type Picked } from './entpick';
import { faceAt, faceDetails, faceKindLabel, faceRangesByStepId, type FacePick } from './faces';
import type { StepSavedView } from '../scene';
import { dirToAngles } from 'opencad-viewer3d/camera';
import { boxIsEmpty, sceneBounds } from 'opencad-viewer3d/bounds';
import { baseName, isOpenableName, isStepName, OPEN_ACCEPT, parseStartQuery, stemName, withoutOnceParams } from './files';
import { consumeLaunchQueue, registerServiceWorker } from './pwa';
import { formatBytes, fmtCount, fmtPercent, stageLabel } from './format';
import { isTextTarget, routeKey } from './keys';
import { edgeSummary, edgeTitle, entityHint, faceHint, faceSummary, measureHint, measureLabelLines, measureLines, selectionSize } from './measure';
import { closeMenu, openMenu, openMenuAt, type MenuItem } from './menu';
import { Panel, pmiTypeLabel, semanticLabel } from './panel';
import { errorText, friendlyError, sceneHasGeometry, sniffStep } from './protocol';
import { RecentStore, recentTimeLabel, type RecentEntry } from './recent';
import { SectionBar } from './sectionbar';
import { measureRows, meshesToObj, meshesToStl, toCsv, type MeasureRecord } from './export';
import { decodeViewLink, viewUrl, type ViewLink } from './viewlink';
import { triRanges, type CheckRequest, type CheckResponse, type InterferencePair } from './interference';
import { translate as translateCatalog } from '../../site/i18n-core.mjs';
import { animateCamera, cameraBack, cameraLooking, faceBox, faceSectionPlane, faceViewDir } from './viewhelp';
import { PanelResizer } from './resize';
import { SAMPLE_NAME, sampleStepBytes } from './sample';
import { readStoredTheme, resolveTheme, safeLocalStorage, writeStoredTheme, type Theme } from './theme';
import { Toolbar } from './toolbar';
import { desiredLooks, lookKey, OPACITY_STEPS } from './looks';
import { filterRows, nodeLabel, selectFromPick } from './tree';

const NARROW = '(max-width: 759.98px)';
/**
 * 휴대폰: 좁은 화면이거나 손가락 기기의 낮은 가로 화면(폭은 760px을 넘을 수 있다).
 * 한 줄 도구 막대(styles.css)·작은 뷰 큐브·처음엔 닫힌 패널로 3D 보기 자리를 지킨다
 */
const PHONE = `${NARROW}, (pointer: coarse) and (max-height: 499.98px)`;
/** 손가락이 주인 기기(휴대폰·태블릿): 안내 글·파일 고르기를 맞춘다 */
const COARSE = '(pointer: coarse)';
const TOOLS_URL = 'https://gyutae-kim.github.io/opencad';
const REPO_URL = 'https://github.com/GyuTae-Kim/opencad-step';
// The initial title comes from the shared site metadata generated into HTML.
const APP_TITLE = document.title;
/** 뷰 큐브 한 변(CSS 화소): 넓은 화면은 코어 기본, 좁은 화면(760px 미만)은 작게 */
const WIDE_CUBE = 112;
const NARROW_CUBE = 76;
/** 이보다 삼각형·그물이 많으면 GPU에 나눠 올린다 */
const BIG_TRIANGLES = 400_000;
const BIG_MESHES = 3000;
/** 고른 면 경계 색(청록) */
const FACE_EDGE = [0.05, 0.8, 0.95, 1] as const;

interface Loading {
  name: string;
  fraction: number;
  stage: string;
}

/** window.opencadApp.state 꼴(자동 확인용) */
export interface AppState {
  docName: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  progress: number;
  stage: string;
  theme: Theme;
  panelOpen: boolean;
  panelTab: string | null;
  renderMode: RenderMode;
  projection: Projection;
  grid: boolean;
  measuring: boolean;
  /** 측정 종류: 두 점(코어) · 개체(면·모서리·꼭짓점 두 개) */
  measureKind: MeasureKind;
  /** 개체 측정: 누른 개체 이름과 결과 줄(값은 장면 단위·도) */
  entity: { picks: string[]; lines: { label: string; unit: string; value: number }[] } | null;
  /** 정밀 조준 중(터치 길게 누르기) */
  aiming: boolean;
  triangles: number;
  meshes: number;
  products: string[];
  warnings: number;
  selKey: string | null;
  picked: string | null;
  /** 면 고르기 모드 */
  faceMode: boolean;
  /** 고른 면(종류·STEP 번호·넓이) */
  face: { kind: string; stepId: number; area: number; boundarySegments: number } | null;
  /** 고른 모서리(종류·STEP 번호·길이·반지름) */
  edge: { kind: string; stepId: number; length: number; radius: number | null; segments: number } | null;
  /** 선 묶음(곡선·PMI)·레이어·표현 PMI 수 */
  lines: number;
  layers: number;
  pmi: number;
  /** 압축을 풀어 열었으면 그 형식들 */
  containers: string[];
  /** 단면(꺼져 있으면 null) */
  section: { axis: string | null; t: number; position: number; flip: boolean } | null;
}

/** 측정 종류 */
export type MeasureKind = 'points' | 'entities';

export class StepApp {
  doc: StepDoc | null = null;
  private viewer: Viewer3d | null = null;
  private readonly client = new ParseClient();
  private loading: Loading | null = null;
  private loadSeq = 0;
  private abort: AbortController | null = null;
  private lastError: string | null = null;
  private theme: Theme;
  private storedTheme: Theme | null;
  private readonly systemDark: MediaQueryList | null;
  private readonly narrow: MediaQueryList | null;
  private readonly phone: MediaQueryList | null;
  private readonly coarse: MediaQueryList | null;
  /** 정밀 조준(터치 길게 누르기, 뷰어를 만들 때 붙인다) */
  private aim: TouchAim | null = null;
  /** 표시 설정(길이 단위·소수 자리) — 이 브라우저에 기억한다 */
  private display: DisplaySettings = { ...DEFAULT_DISPLAY };
  /** 수 꼴(표시 설정·장면 단위·화면 언어) */
  fmt: Fmt = new Fmt();

  panelOpen: boolean;

  // ── 화면 요소 ──
  readonly root: HTMLElement;
  private readonly toolbar: Toolbar;
  private readonly panel: Panel;
  private readonly viewEl: HTMLElement;
  private readonly hostEl: HTMLElement;
  private readonly startEl: HTMLElement;
  private readonly startError: HTMLElement;
  private readonly busyEl: HTMLElement;
  private readonly busyName: HTMLElement;
  private readonly busyStage: HTMLElement;
  private readonly busyBar: HTMLElement;
  private readonly busyPct: HTMLElement;
  private readonly dropEl: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly docNameEl: HTMLElement;
  private readonly statusDoc: HTMLElement;
  private readonly statusSel: HTMLElement;
  private readonly themeBtn: HTMLButtonElement;
  private readonly fileInput: HTMLInputElement;
  private readonly resizer: PanelResizer;
  /** 면 고르기 모드(도구 막대) */
  faceMode = false;
  /** 측정 종류(측정 띠에서 고른다): 두 점(코어 측정) · 개체(앱이 잰다) */
  measureKind: MeasureKind = 'points';
  /** 개체 측정 중(코어 측정 모드는 꺼 두고 고르기 알림으로 개체를 모은다) */
  private entMeasuring = false;
  private readonly measureKindBtns = new Map<MeasureKind, HTMLButtonElement>();
  private readonly measureKindSeg: HTMLElement;
  // ── 단면 막대·손잡이 ──
  private readonly sectionBar: SectionBar;
  // ── 측정 띠(휴대폰·터치) ──
  private readonly measureBar: HTMLElement;
  private readonly selFit: HTMLButtonElement;
  private readonly selProps: HTMLButtonElement;
  private readonly faceLook: HTMLButtonElement;
  private readonly faceCut: HTMLButtonElement;
  /** 작업 메뉴를 연 자리의 B-rep 면(정면으로 보기·면으로 자르기) */
  private ctxFace: FacePick | null = null;
  /** 주소 해시의 보기 링크(다음에 연 문서에 한 번 적용) */
  private pendingView: ViewLink | null = null;
  /** 연 문서를 다시 읽을 방법(곡면 품질을 바꿔 다시 삼각화) */
  private source: { name: string; read: (signal: AbortSignal, progress: (fraction: number, stage: string) => void) => Promise<ArrayBuffer>; input: InputKind } | null = null;
  /** 큰 장면을 GPU에 나눠 올리는 중이면 0~1 */
  private upload: number | null = null;
  private readonly measureText: HTMLElement;
  private readonly measureClear: HTMLButtonElement;
  private readonly measureClose: HTMLButtonElement;
  private barMode: 'measure' | 'face' | 'select' | null = null;
  private readonly aimLayer: HTMLElement;
  // ── 격리 띠(이것만 보기·나머지 흐리게 중) ──
  private readonly isoBar: HTMLElement;
  private readonly isoText: HTMLElement;
  private readonly isoLabel: HTMLElement;
  // ── 부품 겉모습(불투명도·흐리게·부품 색·분해) ──
  /** 부품 색 구분(같은 제품은 같은 색) — 문서를 바꿔도 켜 둔다 */
  partColors = false;
  /** 코어에 건 겉모습(그물 id → 비교 열쇠) — 새 장면이면 비운다(코어가 푼다) */
  private readonly appliedLooks = new Map<string, string>();
  // ── 분해 막대 ──
  private readonly explodeBar: HTMLElement;
  private readonly explodeSlider: HTMLInputElement;
  private readonly explodeValue: HTMLElement;
  /** 분해 막대를 열었는지(문서를 바꾸면 닫는다) */
  explodeOpen = false;
  // ── 최근 문서(시작 화면) ──
  private readonly recent = new RecentStore();
  private readonly recentList = h('ul', { class: 'recent-list' });
  private readonly recentCard = h('section', { class: 'recent', 'aria-labelledby': 'recent-title', hidden: true });
  private recentSeq = 0;

  constructor(root: HTMLElement) {
    root.addEventListener('languagechange', () => {
      if (this.viewer) this.viewer.setViewCubeSize(this.viewer.viewCubeSize);
      // 시각 표기(오후 3:04 ↔ 3:04 PM)를 새 언어로
      void this.refreshRecent();
      // 수 꼴(소수점·자리 구분)을 새 언어로
      this.refreshFmt();
    });
    this.root = root;
    this.systemDark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    this.narrow = typeof matchMedia === 'function' ? matchMedia(NARROW) : null;
    this.phone = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
    this.coarse = typeof matchMedia === 'function' ? matchMedia(COARSE) : null;
    this.storedTheme = readStoredTheme(safeLocalStorage());
    this.display = readDisplaySettings(safeLocalStorage());
    this.fmt = new Fmt('mm', this.display, numberLocale(document.documentElement.lang));
    this.theme = resolveTheme(this.storedTheme, this.systemDark?.matches ?? true);
    this.panelOpen = !this.phone?.matches;
    this.applyTheme();

    // ── 제목 막대 ──
    // 휴대폰은 accept의 확장자(.stp 등)를 시스템 형식으로 못 바꾸면 파일을 흐리게 해 못 고르게 한다(iOS) — 거르지 않고 고른 뒤 앞부분을 보고 가린다
    this.fileInput = h('input', { type: 'file', accept: this.coarse?.matches ? null : OPEN_ACCEPT, hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    this.fileInput.addEventListener('change', () => {
      const f = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (f) void this.openFile(f);
    });
    const openBtn = iconButton('open', '열기', { title: 'STEP 파일 열기 (Ctrl+O)', cls: 'primary' });
    openBtn.addEventListener('click', () => this.pickFile());
    const sampleBtn = iconButton('sample', '예제 열기', { title: '예제 조립 모형 열기' });
    sampleBtn.addEventListener('click', () => void this.openSample());
    this.themeBtn = iconButton('moon', '테마', { title: '', hideLabel: true });
    this.themeBtn.setAttribute('aria-haspopup', 'menu');
    this.themeBtn.setAttribute('aria-expanded', 'false');
    this.themeBtn.addEventListener('click', () => openMenu(this.themeBtn, [
      { label: this.theme === 'dark' ? '밝은 테마로 바꾸기' : '어두운 테마로 바꾸기', run: () => this.setTheme(this.theme === 'dark' ? 'light' : 'dark') },
      { label: '표시 설정…', run: () => this.showDisplaySettings() },
      { label: '방문 통계 설정', run: showAnalyticsSettings },
    ], '앱 설정'));
    this.applyTheme();
    const tools = h('a', { class: 'btn link', href: TOOLS_URL, target: '_blank', rel: 'noopener', title: 'OpenCAD 도구 모음' }, icon('apps'), h('span', { class: 'btn-label' }, 'OpenCAD 도구'));
    const gh = h('a', { class: 'btn link', href: REPO_URL, target: '_blank', rel: 'noopener', title: 'GitHub 소스 코드', 'aria-label': 'GitHub 소스 코드' }, icon('code'), h('span', { class: 'btn-label' }, 'GitHub'));
    this.docNameEl = h('span', { class: 'doc-name' });
    const favicon = h('img', { class: 'brand-icon', src: './favicon.svg', alt: '', width: '20', height: '20' });
    const title = h(
      'header',
      { class: 'titlebar' },
      h('h1', { class: 'brand' }, favicon, h('b', {}, 'OpenCAD'), h('span', {}, '\u00a0STEP 뷰어')),
      this.docNameEl,
      h('div', { class: 'title-actions' }, openBtn, sampleBtn, this.themeBtn, tools, gh),
    );

    // ── 도구 막대·패널 ──
    this.toolbar = new Toolbar(this);
    this.panel = new Panel(this);

    // ── 3D 보기 ──
    this.hostEl = h('div', { class: 'viewer-host' });
    this.startError = h('div', { class: 'start-error', role: 'alert', hidden: true });
    this.startEl = this.buildStart();
    this.busyName = h('div', { class: 'busy-name' });
    this.busyStage = h('div', { class: 'busy-stage' });
    this.busyBar = h('div', { class: 'busy-fill' });
    this.busyPct = h('span', { class: 'busy-pct' });
    const cancel = h('button', { type: 'button', class: 'btn' }, '취소');
    cancel.addEventListener('click', () => this.cancel());
    this.busyEl = h(
      'div',
      { class: 'busy', hidden: true, role: 'status', 'aria-live': 'polite' },
      h(
        'div',
        { class: 'busy-card' },
        this.busyName,
        h('div', { class: 'busy-row' }, this.busyStage, this.busyPct),
        h('div', { class: 'busy-bar', role: 'progressbar', 'aria-label': '해석 진행률', 'aria-valuemin': '0', 'aria-valuemax': '100' }, this.busyBar),
        h('div', { class: 'busy-actions' }, cancel),
      ),
    );
    this.dropEl = h('div', { class: 'drop-hint', hidden: true, 'aria-hidden': 'true' }, h('div', {}, icon('upload', 40), h('p', {}, '놓으면 STEP 파일을 엽니다')));
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    // ── 단면 막대(단면을 켜면 3D 보기 왼쪽 위에): 축 · 위치 슬라이더 · 위치 숫자 · 뒤집기 · 끄기, 3D 보기 위 끌기 손잡이 ──
    this.sectionBar = new SectionBar(this);
    // ── 측정 띠(좁은 화면·터치에서 측정·면 고르기 중): 안내·결과를 크게 보이고, Esc 대신 다시 재기·끝내기 단추 ──
    this.measureText = h('div', { class: 'mb-text', 'aria-live': 'polite' });
    this.measureClear = h('button', { type: 'button', class: 'mb-btn', title: '찍은 점과 결과 지우기' }, icon('reset', 16), h('span', {}, '다시 재기'));
    this.measureClear.addEventListener('click', () => {
      if (this.entMeasuring) this.clearEntities();
      else this.viewer?.clearMeasure();
      this.refreshBar();
    });
    // 측정 종류(두 점 · 개체)
    this.measureKindSeg = h('div', { class: 'seg mb-kind', role: 'radiogroup', 'aria-label': '측정 종류' });
    for (const [k, label, title] of [
      ['points', '두 점', '두 점 사이 거리와 dx·dy·dz'],
      ['entities', '개체', '면·모서리·꼭짓점 두 개 사이 거리·각(평행 면 거리, 구멍 축 거리 등)'],
    ] as const) {
      const b = h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false', title }, label);
      b.addEventListener('click', () => this.setMeasureKind(k));
      this.measureKindBtns.set(k, b);
      this.measureKindSeg.append(b);
    }
    // 고른 부품 카드(측정·면 고르기가 아닐 때): 맞춰 보기
    this.selFit = h('button', { type: 'button', class: 'mb-btn', title: '고른 부품 보기' }, icon('fit', 16), h('span', {}, '맞춰 보기'));
    this.selFit.addEventListener('click', () => this.fitSelection());
    // 고른 부품 카드: 속성(패널 속성 탭을 연다 — 휴대폰은 아래 시트)
    this.selProps = h('button', { type: 'button', class: 'mb-btn', title: '고른 부품의 속성' }, icon('info', 16), h('span', {}, '속성'));
    this.selProps.addEventListener('click', () => this.showProps());
    // 면 고르기 띠: 고른 면을 정면으로 보기·그 면으로 자르기
    this.faceLook = h('button', { type: 'button', class: 'mb-btn', title: '고른 면을 정면으로 보기' }, icon('focus', 16), h('span', {}, '정면'));
    this.faceLook.addEventListener('click', () => this.lookAtFace());
    this.faceCut = h('button', { type: 'button', class: 'mb-btn', title: '고른 면으로 자르기' }, icon('section', 16), h('span', {}, '자르기'));
    this.faceCut.addEventListener('click', () => this.sectionByFace());
    this.measureClose = h('button', { type: 'button', class: 'mb-btn icon' }, icon('close', 16));
    this.measureClose.addEventListener('click', () => {
      if (this.measuring) this.toggleMeasure(false);
      else if (this.faceMode) this.toggleFaceMode(false);
      else if (this.clearSelection()) this.selectionChanged();
    });
    this.measureBar = h('div', { class: 'measure-bar', role: 'status', hidden: true }, this.measureKindSeg, this.measureText, h('div', { class: 'mb-acts' }, this.measureClear, this.selFit, this.selProps, this.faceLook, this.faceCut, this.measureClose));
    // 정밀 조준 십자선 층(캔버스 위, 누르기는 받지 않는다)
    this.aimLayer = h('div', { class: 'aim-layer', 'aria-hidden': 'true' });
    // 격리 띠(3D 보기 위 가운데): 무엇만 보이는지와 격리 풀기
    this.isoText = h('span', { class: 'iso-text' });
    const isoOff = h('button', { type: 'button', class: 'mb-btn', title: '격리 풀기 (I)' }, icon('eye', 16), h('span', {}, '격리 풀기'));
    isoOff.addEventListener('click', () => this.unisolate());
    this.isoLabel = h('span', { class: 'iso-label' }, '이것만 보기');
    this.isoBar = h('div', { class: 'iso-bar', role: 'status', hidden: true }, this.isoLabel, this.isoText, isoOff);
    // 분해 막대(3D 보기 위 가운데): 분해 정도 0~100%와 닫기(제자리로)
    this.explodeSlider = h('input', { type: 'range', class: 'explode-slider', min: '0', max: '100', step: '1', value: '0', 'aria-label': '분해 정도' });
    this.explodeSlider.addEventListener('input', () => this.setExplode(Number(this.explodeSlider.value) / 100));
    this.explodeValue = h('span', { class: 'explode-val' }, '0%');
    const explodeOff = h('button', { type: 'button', class: 'icon-btn', title: '분해 끄기(제자리로)', 'aria-label': '분해 끄기(제자리로)' });
    explodeOff.append(icon('close', 16));
    explodeOff.addEventListener('click', () => this.toggleExplode(false));
    this.explodeBar = h('div', { class: 'explode-bar', role: 'group', 'aria-label': '분해 보기', hidden: true }, icon('explode', 16), h('span', { class: 'explode-label' }, '분해'), this.explodeSlider, this.explodeValue, explodeOff);
    const topBars = h('div', { class: 'top-bars' }, this.explodeBar, this.isoBar);
    this.viewEl = h('section', { class: 'view', 'aria-label': '3D 보기' }, this.hostEl, this.aimLayer, this.sectionBar.handle, this.startEl, this.busyEl, this.dropEl, this.sectionBar.el, topBars, this.measureBar, this.toasts);

    // ── 상태 막대 ──
    this.statusDoc = h('div', { class: 'status-doc' });
    this.statusSel = h('div', { class: 'status-sel' });
    const status = h('footer', { class: 'statusbar' }, this.statusDoc, this.statusSel);

    const workspace = h('main', { class: 'workspace' }, this.viewEl, this.panel.el);
    this.resizer = new PanelResizer(root, this.panel.el, workspace, this.narrow, safeLocalStorage());
    this.panel.el.prepend(this.resizer.el);
    root.replaceChildren(title, this.toolbar.el, workspace, status, this.fileInput);
    root.classList.add('app');

    this.bindWindow();
    this.updateAll();
  }

  // ───────────────────────── 시작 화면 ─────────────────────────

  private buildStart(): HTMLElement {
    const open = h('button', { type: 'button', class: 'btn primary large' }, icon('open'), h('span', {}, '파일 열기'));
    open.addEventListener('click', () => this.pickFile());
    const sample = h('button', { type: 'button', class: 'btn large' }, icon('sample'), h('span', {}, '예제 열기'));
    sample.addEventListener('click', () => void this.openSample());
    const drop = h(
      'div',
      { class: 'dropzone' },
      icon('upload', 44),
      h('p', { class: 'drop-title fine-only' }, 'STEP 파일을 여기에 끌어다 놓으세요'),
      h('p', { class: 'dim fine-only' }, '또는'),
      h('p', { class: 'drop-title coarse-only' }, 'STEP 파일을 골라 여세요'),
      h('div', { class: 'start-actions' }, open, sample),
    );
    drop.addEventListener('click', (e) => {
      if (e.target === drop) this.pickFile();
    });
    const clearRecent = h('button', { type: 'button', class: 'recent-clear' }, '모두 지우기');
    clearRecent.addEventListener('click', () => void this.recent.clear().then(() => this.refreshRecent()));
    this.recentCard.append(
      h('div', { class: 'recent-head' }, h('h3', { id: 'recent-title' }, '최근 문서'), clearRecent),
      this.recentList,
      h('p', { class: 'recent-note' }, icon('lock', 14), h('span', {}, '파일은 이 기기의 이 브라우저에만 남고 서버로 보내지 않습니다.')),
    );
    return h(
      'div',
      { class: 'start' },
      h(
        'div',
        { class: 'start-card' },
        h('h2', {}, 'STEP 3D 모델 보기'),
        h('p', { class: 'lead' }, 'STEP(ISO 10303-21) 파일을 열어 돌려 보고, 부품을 고르고, 거리를 잽니다.'),
        drop,
        this.startError,
        this.recentCard,
        h(
          'ul',
          { class: 'start-facts' },
          h('li', {}, icon('info', 16), h('span', {}, '지원 형식: STEP AP203 · AP214 · AP242 (B-rep·조립·색·단위·레이어·와이어프레임·PMI) — .stp .step .p21, 압축 .stp.gz .stpZ .zip')),
          h('li', {}, icon('lock', 16), h('span', {}, '파일은 이 브라우저 밖으로 나가지 않습니다. 읽기와 그리기를 모두 이 컴퓨터에서 합니다.')),
          h('li', { class: 'fine-only' }, icon('views', 16), h('span', {}, '끌기 회전 · 오른쪽 끌기 이동 · 휠 확대 · F 전체 보기 · 1~7 표준 뷰 · F7 격자')),
          h('li', { class: 'coarse-only' }, icon('views', 16), h('span', {}, '한 손가락 끌기 회전 · 두 손가락 이동·확대 · 측정·면 고르기는 길게 눌러 정밀 조준')),
        ),
      ),
    );
  }

  // ───────────────────────── 열기 ─────────────────────────

  /** 열기 상자 */
  pickFile(): void {
    this.fileInput.click();
  }

  /**
   * 파일 열기. 확장자가 STEP이 아니면 앞부분을 보고 가린다: STEP 글·gzip·ZIP(워커가 푼다)은 열고,
   * STEP-XML(.stpx)과 그 밖의 것은 알기 쉬운 이유로 거절한다. remember면 잘 열었을 때 최근 문서에 남긴다(고르기·끌어다 놓기).
   */
  async openFile(file: File, remember = true): Promise<boolean> {
    const attempt = beginOpen('local', file.name.split('.').pop() ?? 'other');
    if (isStepXmlName(file.name)) {
      attempt.error('unsupported');
      this.showError(`${file.name}: ${STEP_XML_MESSAGE}`);
      return false;
    }
    if (!isStepName(file.name)) {
      let head: Uint8Array;
      try {
        head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
      } catch (e) {
        this.showError(`${file.name}: 파일을 읽지 못했습니다. ${errorText(e)}`);
        attempt.error('read_error');
        return false;
      }
      const kind = sniffContainer(head);
      if (kind === 'xml') {
        attempt.error('unsupported');
        this.showError(`${file.name}: ${isStepXml(head) ? STEP_XML_MESSAGE : 'XML 파일입니다. STEP Part 21(.stp·.step) 파일만 열 수 있습니다.'}`);
        return false;
      }
      if (kind !== 'step' && kind !== 'gzip' && kind !== 'zip') {
        attempt.error('unsupported');
        const sn = sniffStep(head);
        this.showError(`${file.name}: STEP 파일(.stp·.step·.p21, 압축 .stp.gz·.stpZ·.zip)만 열 수 있습니다. ${sn.ok ? '' : sn.reason}`.trim());
        return false;
      }
    }
    const ok = await this.load(file.name, () => file.arrayBuffer(), 'local', attempt);
    if (ok && remember)
      void this.recent.add(file.name, file).then((saved) => {
        if (saved) void this.refreshRecent();
      });
    return ok;
  }

  // ───────────────────────── 최근 문서 ─────────────────────────

  /** 시작 화면의 최근 문서 목록을 다시 그린다(비었으면 카드를 숨긴다) */
  private async refreshRecent(): Promise<void> {
    const seq = ++this.recentSeq;
    const list = await this.recent.list();
    if (seq !== this.recentSeq) return;
    const now = Date.now();
    const locale = document.documentElement.lang || 'ko';
    this.recentList.replaceChildren(...list.map((r) => this.recentRow(r, now, locale)));
    this.recentCard.hidden = !list.length;
  }

  private recentRow(r: RecentEntry, now: number, locale: string): HTMLElement {
    // 파일 이름은 번역하지 않는다
    const open = h('button', { type: 'button', class: 'recent-open' }, h('span', { class: 'recent-name', translate: 'no' }, r.name), h('span', { class: 'recent-meta' }, `${formatBytes(r.size)} · ${recentTimeLabel(r.time, now, locale)}`));
    open.addEventListener('click', () => void this.openRecent(r));
    const del = h('button', { type: 'button', class: 'icon-btn recent-del', title: '목록에서 지우기', 'aria-label': `최근 문서에서 지우기: ${r.name}` });
    del.append(icon('close', 16));
    del.addEventListener('click', () => void this.recent.remove(r.id).then(() => this.refreshRecent()));
    return h('li', { class: 'recent-row' }, open, del);
  }

  /**
   * 최근 문서 다시 열기(다시 남기지 않고 순서만 맨 앞으로). 파일이 없으면 목록에서 지우고,
   * 잠깐 못 읽었으면(저장소 오류 — 휴대폰이 뒤에서 연결을 끊는 등) 항목을 남겨 다시 누를 수 있게 한다
   */
  private async openRecent(r: RecentEntry): Promise<boolean> {
    const got = await this.recent.read(r.id);
    if (got.kind === 'missing') {
      this.toast('저장해 둔 파일을 찾지 못해 목록에서 지웠습니다.', 'warn');
      await this.recent.remove(r.id);
      void this.refreshRecent();
      return false;
    }
    if (got.kind === 'error') {
      this.toast('저장해 둔 파일을 지금 읽지 못했습니다. 잠시 뒤 다시 눌러 보세요.', 'warn');
      return false;
    }
    const ok = await this.openFile(got.file, false);
    if (ok) void this.recent.touch(r.id).then(() => this.refreshRecent());
    return ok;
  }

  /** 최근 문서를 id로 열기(공유 받기 — 서비스 워커가 넣은 파일) */
  private async openRecentId(id: string): Promise<boolean> {
    const list = await this.recent.list();
    const r = list.find((x) => x.id === id);
    if (!r) {
      this.toast('공유한 파일을 찾지 못했습니다.', 'warn');
      return false;
    }
    return this.openRecent(r);
  }

  /** 예제 모형 열기 */
  openSample(): Promise<boolean> {
    return this.load(SAMPLE_NAME, async () => sampleStepBytes().buffer as ArrayBuffer, 'sample');
  }

  /** 같은 출처 주소의 파일 열기(?open=). 받는 동안 진행률(크기를 모르면 받은 양)을 보인다 */
  openUrl(url: string): Promise<boolean> {
    const name = baseName(url) || 'model.stp';
    return this.load(name, async (signal, progress) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`주소에서 파일을 받지 못했습니다(HTTP ${res.status}).`);
      const total = Number(res.headers.get('content-length')) || 0;
      if (!res.body) return res.arrayBuffer();
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      let last = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        const now = performance.now();
        if (now - last > 80) {
          last = now;
          // 전송 압축(content-encoding)이면 받은 양이 머리 크기를 넘을 수 있다 — 그때는 양만 보인다
          if (total > 0 && got <= total) progress(got / total, `받기 ${formatBytes(got)} / ${formatBytes(total)}`);
          else progress(0, `받기 ${formatBytes(got)}`);
        }
      }
      const out = new Uint8Array(got);
      let p = 0;
      for (const c of chunks) {
        out.set(c, p);
        p += c.length;
      }
      return out.buffer;
    }, 'url');
  }

  /** 열고 있는 것을 멈춘다 */
  cancel(): void {
    if (!this.loading) return;
    this.loadSeq++;
    this.abort?.abort();
    this.abort = null;
    this.client.cancel();
    this.setLoading(null);
    this.toast('열기를 취소했습니다.');
  }

  private async load(
    name: string,
    read: (signal: AbortSignal, progress: (fraction: number, stage: string) => void) => Promise<ArrayBuffer>,
    input: InputKind = 'local',
    attempt: OpenAttempt = beginOpen(input, name.split('.').pop() ?? 'other'),
    /** 같은 파일을 다시 삼각화할 때(곡면 품질) 앞 문서 — 보기·고르기·보이기를 이어 간다 */
    carry: StepDoc | null = null,
  ): Promise<boolean> {
    let reading = true;
    closeMenu();
    const seq = ++this.loadSeq;
    this.abort?.abort();
    this.client.cancel();
    const ac = new AbortController();
    this.abort = ac;
    const t0 = performance.now();
    this.setLoading({ name, fraction: 0, stage: '파일 읽는 중' });
    try {
      const buf = await read(ac.signal, (fraction, stage) => {
        if (seq === this.loadSeq) this.setLoading({ name, fraction, stage: stage.startsWith('받기 ') ? `파일 받는 중 (${stage.slice(3)})` : stageLabel(stage) });
      });
      if (seq !== this.loadSeq) return false;
      reading = false;
      const size = buf.byteLength;
      const res = await this.client.parse(
        name,
        buf,
        (f, stage) => {
          if (seq === this.loadSeq) this.setLoading({ name, fraction: f, stage: stageLabel(stage) });
        },
        QUALITY_OPTIONS[this.display.quality],
      );
      if (seq !== this.loadSeq) return false;
      if (!sceneHasGeometry(res.scene)) {
        attempt.error('empty');
        const why = res.scene.warnings?.find((w) => w.includes('형상')) ?? res.scene.warnings?.[0];
        throw new Error(`그릴 형상(B-rep·삼각형)을 찾지 못했습니다.${why ? ` (${why})` : ''}`);
      }
      this.setLoading({ name, fraction: 1, stage: '화면에 올리는 중' });
      await nextPaint();
      if (seq !== this.loadSeq) return false;
      const doc = createDoc(name, size, res);
      this.showDoc(doc, carry);
      this.source = { name, read, input };
      doc.openMs = performance.now() - t0;
      this.lastError = null;
      this.updateAll();
      const w = res.scene.warnings?.length ?? 0;
      if (w) this.toast(`해석기 경고 ${w}개 — 패널의 "정보" 탭에서 볼 수 있습니다.`, 'warn');
      attempt.success();
      return true;
    } catch (e) {
      if (seq !== this.loadSeq) return false;
      if (e instanceof ParseCancelled || (e instanceof DOMException && e.name === 'AbortError')) return false;
      attempt.error(reading ? (input === 'url' ? 'fetch_error' : 'read_error') : 'parse_error');
      this.showError(`${name}: 파일을 열지 못했습니다. ${friendlyError(errorText(e))}`);
      return false;
    } finally {
      if (seq === this.loadSeq) {
        this.abort = null;
        this.setLoading(null);
      }
    }
  }

  private showDoc(doc: StepDoc, carry: StepDoc | null = null): void {
    const v = this.ensureViewer();
    // 아주 큰 장면은 GPU 올리기를 프레임마다 나눠(코어 incremental) 화면이 멈추지 않게 한다
    let tris = 0;
    for (const m of doc.scene.meshes) tris += (m.indices ? m.indices.length : m.positions.length / 3) / 3;
    const big = tris > BIG_TRIANGLES || doc.scene.meshes.length > BIG_MESHES;
    this.upload = null;
    v.setScene(doc.scene, {
      keepView: !!carry,
      ...(big
        ? {
            incremental: { budgetMs: 8 },
            onProgress: (done: number, total: number) => {
              this.upload = done < total ? done / Math.max(1, total) : null;
              this.updateStatus();
            },
          }
        : {}),
    });
    if (carry) carryDocState(carry, doc);
    // 코어는 새 장면에서 묶음 겉모습을 모두 푼다 — 문서의 겉모습을 다시 건다(아래 this.doc = doc 뒤)
    this.appliedLooks.clear();
    if (!carry) this.explodeOpen = false;
    v.highlight(null);
    this.showFace(null);
    // 개체 측정 덧그림은 장면을 바꿔도 남으므로 지운다(새 문서는 개체가 비어 있다)
    v.setAnnotations(null);
    this.aim?.cancel();
    if (v.measureMode) v.clearMeasure();
    this.doc = doc;
    this.fmt = this.makeFmt();
    // 파일이 숨긴 레이어 등 처음 보이기
    this.applyVisibility();
    this.applyLooks();
    this.syncExplode();
    // 새 장면은 단면이 꺼진 채로 온다(코어 setScene → onSectionChange가 막대를 맞춘다). 문서가 바뀐 것만 다시 그린다
    this.syncSection(v.section);
    this.syncIsolate();
    this.panel.show(doc);
    this.panel.setOpen(this.panelOpen);
    document.title = `${doc.name} - OpenCAD STEP 뷰어`;
    if (carry) {
      // 다시 삼각화: 카메라·단면은 그대로(keepView), 고른 것·격리를 다시 그린다
      if (doc.selKey) this.viewer?.highlight(selectionItemIds(doc));
      this.toast(`곡면 품질을 바꿔 다시 삼각화했습니다(삼각형 ${fmtCount(Math.round(tris))}개).`);
      return;
    }
    // 좁은 화면에서 시트가 보기 높이를 바꾸므로 크기가 정해진 뒤 다시 맞춘다
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.viewer?.fit(false);
        // 처음 맞춘 보기가 홈 뷰
        if (this.doc === doc && this.viewer) doc.home = this.viewer.getCamera();
        // 주소의 보기 링크(카메라·단면·고른 것)
        const link = this.pendingView;
        if (link && this.doc === doc) {
          this.pendingView = null;
          this.applyViewLink(link);
          this.toast('주소의 보기(카메라·단면·고른 것)를 적용했습니다.');
        }
      }),
    );
  }

  private ensureViewer(): Viewer3d {
    if (this.viewer) return this.viewer;
    const v = new Viewer3d(this.hostEl, { theme: this.theme, viewCubeSize: this.cubeSize() });
    v.onPick((p, e) => {
      // 개체 측정: 고르기 대신 누른 면·모서리·꼭짓점을 모은다
      if (this.entMeasuring) {
        this.onEntityPick(p, e.pointerType);
        return;
      }
      this.onPick(p, this.faceMode || e.altKey);
      // 두 번 누르기: 나무에서처럼 그 부품으로 맞춰 본다
      if (p && e.clicks === 2 && !v.measureMode) this.fitSelection();
    });
    v.onMeasure((m) => this.onMeasure(m));
    // 3D 보기 위 측정 글도 표시 단위·소수 자리·화면 언어로(캔버스 글이라 이름표는 직접 번역)
    v.setMeasureFormat((m) => measureLabelLines(m, this.fmt, translateUi));
    // 단면 막대·도구 막대는 코어 알림으로만 맞춘다(막대·메뉴 조작, 손잡이 끌기, 새 장면에서 꺼짐, 범위 바뀜)
    v.onSectionChange((st) => this.syncSection(st));
    // 카메라가 바뀌면 단면 손잡이 자리를 다시 잡는다
    v.onCameraChange(() => this.sectionBar.place());
    // 측정·면 고르기 중 길게 눌러 정밀 조준(떼면 코어가 십자선 자리를 누른 것으로 처리한다)
    // 측정·면 고르기가 아니면 길게 눌러 작업 메뉴(오른쪽 누르기와 같다)
    this.aim = new TouchAim(v.canvas, {
      enabled: () => !!this.doc && (v.measureMode || this.entMeasuring || this.faceMode),
      layer: this.aimLayer,
      onHold: (x, y) => this.contextMenuAt(x, y),
    });
    // 오른쪽 누르기(끌어 이동하지 않았을 때)로 작업 메뉴. 코어는 캔버스의 기본 메뉴만 막는다
    let rightDown: { x: number; y: number } | null = null;
    this.hostEl.addEventListener('pointerdown', (e) => {
      if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
    });
    this.hostEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const d = rightDown;
      rightDown = null;
      // 터치 길게 누르기의 contextmenu는 TouchAim이 이미 다뤘다
      if ((e as PointerEvent).pointerType === 'touch' || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this.contextMenuAt(e.clientX, e.clientY);
    });
    // 첫 측정 점은 코어 알림이 없어(결과가 생길 때만) 떼기 뒤에 띠를 맞춘다(코어 듣기 다음, 버블 단계)
    this.hostEl.addEventListener('pointerup', () => {
      if (v.measureMode) this.refreshBar();
    });
    this.viewer = v;
    return v;
  }

  /** 뷰 큐브 크기: 휴대폰(좁은 화면·낮은 가로 화면)에서는 작게 */
  private cubeSize(): number {
    return this.phone?.matches ? NARROW_CUBE : WIDE_CUBE;
  }

  // ───────────────────────── 고르기 ─────────────────────────

  private onPick(p: Pick3d | null, wantFace = this.faceMode): void {
    const d = this.doc;
    if (!d) return;
    if (this.viewer?.measureMode) return;
    d.pick = p;
    d.items = null;
    d.face = null;
    d.edge = null;
    if (!p) {
      d.selKey = null;
      this.viewer?.highlight(null);
    } else {
      this.viewer?.highlight([p.id]);
      const isPmi = d.vis.pmiIds.has(p.id);
      const s = isPmi ? null : selectFromPick(d.products, d.expanded, p.id);
      d.selKey = s?.key ?? null;
      if (s) d.expanded = s.expanded;
      // 이름 거르기 중이면 고른 마디가 보이지 않을 때 거르기를 푼다
      if (s && d.treeFilter.trim() && !filterRows(d.products, d.treeFilter, d.expanded, Infinity).rows.some((r) => r.key === s.key)) d.treeFilter = '';
      if (s && d.panelTab !== 'tree' && d.panelTab !== 'layers' && d.panelTab !== 'props' && this.panel.open) this.panel.setTab('tree');
      // 잘린 면(단면 채움)을 누르면 면 고르기 대신 부품만(아래 띠에 "단면" 표시)
      if (p.kind === 'mesh' && wantFace && !p.section) d.face = this.findFace(d, p);
      // 윤곽선(모서리)을 눌렀으면(면 고르기 중에만 코어가 고른다) 그 B-rep 모서리
      if (p.kind === 'edge' && wantFace) d.edge = this.findEdge(d, p);
      if (d.face) logMeasure(d, { type: 'face', kind: d.face.kind, stepId: d.face.stepId, ...(d.face.radius !== undefined ? { radius: d.face.radius } : {}), area: d.face.area, perimeter: d.face.perimeter, exact: d.face.exact });
      if (d.edge) logMeasure(d, { type: 'edge', kind: d.edge.kind, stepId: d.edge.stepId, length: d.edge.length, ...(d.edge.radius !== undefined ? { radius: d.edge.radius } : {}) });
      // 면·모서리를 골랐으면 부품 통째 강조 대신 그것만(나무에서는 부품이 골라져 있다)
      if (d.face || d.edge) this.viewer?.highlight(null);
    }
    this.showFace(d.face, d.edge);
    this.selectionChanged(true);
  }

  /**
   * 고른 면·모서리 강조: 면은 삼각형 범위(highlightRanges) + 경계 모서리, 모서리는 윤곽선 범위 + 그 선(부품 강조색과 다른 색).
   * 둘 다 null이면 푼다
   */
  private showFace(face: FacePick | null, edge: EdgePick | null = null): void {
    const v = this.viewer;
    if (!v) return;
    if (face) {
      v.highlightRanges({ [face.meshId]: [{ start: face.triStart, count: face.triangles }] });
      v.setHighlightSegments(face.boundary, { width: 3.5, hidden: 0.3, color: FACE_EDGE, ...(face.boundaryOrigin ? { origin: face.boundaryOrigin } : {}) });
    } else if (edge) {
      v.highlightRanges({ [edge.meshId]: { edges: [{ start: edge.segStart, count: edge.segCount }] } });
      v.setHighlightSegments(edge.segs, { width: 4, hidden: 0.3, color: FACE_EDGE, origin: edge.segOrigin });
    } else {
      v.highlightRanges(null);
      v.setHighlightSegments(null);
    }
  }

  /** 누른 윤곽선 선분의 B-rep 모서리(모서리 표가 없거나 못 찾으면 null) */
  private findEdge(d: StepDoc, p: Pick3d): EdgePick | null {
    const ex = d.edges;
    const ti = ex?.tableOf.get(p.id);
    if (!ex || ti === undefined) return null;
    const mesh = d.scene.meshes.find((m) => m.id === p.id);
    const table = ex.tables[ti];
    if (!mesh || !table) return null;
    const e = edgeAt(table, p.raw ?? p.index);
    return e < 0 ? null : edgeDetails(mesh, table, e, ex.kinds);
  }

  /** 누른 삼각형의 B-rep 면(면 표가 없거나 못 찾으면 null) */
  private findFace(d: StepDoc, p: Pick3d) {
    const fx = d.faces;
    const ti = fx?.tableOf.get(p.id);
    if (!fx || ti === undefined) return null;
    const mesh = d.scene.meshes.find((m) => m.id === p.id);
    const table = fx.tables[ti];
    if (!mesh || !table) return null;
    const tri = p.raw ?? p.index;
    const f = faceAt(table, tri);
    return f < 0 ? null : faceDetails(mesh, table, f, fx.kinds);
  }

  // ───────────────────────── 단면 ─────────────────────────

  /** 지금 단면 축(꺼져 있거나 축 단면이 아니면 null) */
  get sectionAxis(): SectionAxis | null {
    return this.viewer?.section?.axis ?? null;
  }

  /** 단면 축 고르기(null = 끄기). 같은 축을 다시 고르면 위치·방향을 지키고, 처음이면 가운데(0.5) */
  setSectionAxis(axis: SectionAxis | null): void {
    const v = this.viewer;
    if (!v || !this.doc) return;
    if (!axis) v.setSection(null);
    else {
      const cur = v.section;
      v.setSectionAxis(axis, cur?.axis === axis ? cur.t : 0.5);
    }
  }

  /** 단면 위치(장면 범위 안 0~1) */
  setSectionPosition(t: number): void {
    this.viewer?.setSectionPosition(Math.max(0, Math.min(1, t)));
  }

  /** 단면 막대·손잡이·도구 막대를 단면 상태에 맞춘다(코어 onSectionChange 알림에서) */
  private syncSection(st: SectionState | null): void {
    this.sectionBar.sync(st);
    this.toolbar.refresh();
  }

  /** 단면이 켜져 있는지(축 단면이든 면 단면이든) */
  get sectionOn(): boolean {
    return !!this.viewer?.section;
  }

  // ───────────────────────── 면 기준 보기·자르기, 홈 뷰 ─────────────────────────

  /** 면을 정면으로 보기(평면은 바깥 법선 쪽에서, 축이 있는 면은 축 방향에서) */
  lookAtFace(face: FacePick | null = this.doc?.face ?? null): boolean {
    const v = this.viewer;
    if (!v || !face) return false;
    const cam = v.getCamera();
    const dir = faceViewDir(face, cameraBack(cam));
    if (!dir) {
      this.toast('이 면은 정면 방향을 정할 수 없습니다(평면과 원기둥·원뿔·원환 면만).', 'warn');
      return false;
    }
    animateCamera(v, cameraLooking(cam, dir, faceBox(face), v.canvas.clientWidth / Math.max(1, v.canvas.clientHeight)));
    return true;
  }

  /** 면으로 자르기(평면은 그 자리에서, 축이 있는 면은 축을 지나며 눈 쪽 절반을) */
  sectionByFace(face: FacePick | null = this.doc?.face ?? null): boolean {
    const v = this.viewer;
    if (!v || !face) return false;
    const pl = faceSectionPlane(face, cameraBack(v.getCamera()));
    if (!pl) {
      this.toast('이 면으로는 자를 평면을 정할 수 없습니다(평면이거나 축이 있는 면만).', 'warn');
      return false;
    }
    v.setSection(pl);
    return true;
  }

  /** 홈 뷰(처음 연 보기 또는 정해 둔 보기) */
  goHome(): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    if (d.home) animateCamera(v, d.home);
    else v.fit();
  }

  /** 지금 보기를 홈 뷰로 */
  setHome(): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    d.home = v.getCamera();
    this.toast('지금 보기를 홈 뷰로 정했습니다.');
  }

  /** 면 고르기 모드 켜고 끄기 */
  toggleFaceMode(on = !this.faceMode): void {
    if (on !== this.faceMode) this.aim?.cancel();
    this.faceMode = on;
    if (on && this.measuring) this.toggleMeasure(false);
    if (on) this.collapseExplode();
    // 면 고르기 중에는 모서리 가까이 누르면 모서리(윤곽선)를 고른다
    this.viewer?.setPickEdges(on);
    if (!on && (this.doc?.face || this.doc?.edge)) {
      const d = this.doc;
      d.face = null;
      d.edge = null;
      this.showFace(null);
      if (d.pick) this.viewer?.highlight([d.pick.id]);
      this.selectionChanged();
    }
    this.toolbar.refresh();
    this.refreshBar();
    if (on && this.doc && !this.doc.faces) this.toast('이 문서에는 면 정보가 없어 면을 고를 수 없습니다.', 'warn');
  }

  /** 자동 확인용: 캔버스 점(CSS 화소)에서 고르기 */
  pickAt(x: number, y: number, face = false): Pick3d | null {
    const v = this.viewer;
    if (!v) return null;
    const p = v.pick(x, y);
    this.onPick(p, face || this.faceMode);
    return p;
  }

  private onMeasure(m: MeasureResult | null): void {
    const d = this.doc;
    if (!d) return;
    d.measure = m;
    // 측정 기록(CSV 복사용, 이 문서 동안)
    if (m) logMeasure(d, { type: 'distance', a: [...m.a], b: [...m.b], distance: m.distance, dx: m.dx, dy: m.dy, dz: m.dz });
    this.panel.onMeasure();
    this.updateStatus();
  }

  /** 나무 마디 고르기(그 아래 형상을 모두 강조) */
  selectKey(key: string | null): void {
    const d = this.doc;
    if (!d) return;
    const node = key ? productAt(d.products, key) : null;
    d.selKey = node ? key : null;
    d.pick = null;
    d.items = null;
    d.face = null;
    d.edge = null;
    this.showFace(null);
    this.viewer?.highlight(node ? subtreeItemIds(node) : null);
    this.selectionChanged();
  }

  /** 레이어·PMI 목록에서 항목 묶음 고르기(강조), fit이면 맞춰 보기 */
  selectItems(ids: readonly string[] | null, label: string, fit = false): void {
    const d = this.doc;
    if (!d) return;
    d.selKey = null;
    d.pick = null;
    d.face = null;
    d.edge = null;
    d.items = ids && ids.length ? { ids: [...ids], label } : null;
    this.showFace(null);
    this.viewer?.highlight(d.items ? d.items.ids : null);
    this.selectionChanged();
    if (fit && d.items) this.viewer?.fitItems(d.items.ids);
  }

  /** 나무 마디를 고르고 그 아래 형상(보이는 것)으로 맞춰 보기 */
  fitKey(key: string): void {
    const d = this.doc;
    if (!d) return;
    if (d.selKey !== key || d.pick) this.selectKey(key);
    this.fitSelection();
  }

  /** 고른 것이 있는지(나무 마디, 3D에서 고른 항목, 레이어·PMI에서 고른 묶음) */
  get hasSelection(): boolean {
    return !!this.doc && selectionItemIds(this.doc).length > 0;
  }

  /** 파일에 밀도가 없는 부품에 쓸 재질 밀도(kg/m³) — 속성 탭 다시 그리기 */
  setDensity(kgm3: number | null): void {
    if (!this.doc) return;
    this.doc.density = kgm3 && kgm3 > 0 ? kgm3 : null;
    this.panel.redraw();
  }

  /** 의미 PMI가 가리키는 B-rep 면을 강조하고 그 그물로 맞춰 본다(찾았으면 true) */
  showPmiFaces(stepIds: readonly number[], label: string): boolean {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v) return false;
    const ranges = faceRangesByStepId(d.faces, d.scene.meshes.map((m) => m.id), stepIds);
    if (!ranges.size) {
      this.toast('이 PMI에 이어진 면을 화면에서 찾지 못했습니다.', 'warn');
      return false;
    }
    const ids = [...ranges.keys()];
    d.selKey = null;
    d.pick = null;
    d.face = null;
    d.edge = null;
    d.items = { ids, label };
    v.setHighlightSegments(null);
    v.highlight(null);
    v.highlightRanges(Object.fromEntries(ranges));
    this.selectionChanged();
    v.fitItems(ids);
    return true;
  }

  /** 저장된 보기 적용: 카메라(투영·방향·대상·크기)와 그 보기의 표현 PMI만 보이기 */
  applySavedView(view: StepSavedView): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    const cam = v.getCamera();
    // 위·아래에서 똑바로 보는 보기는 방향만으로 돌림(yaw)을 정할 수 없다 — 보기의 위쪽(up)이 화면 위가 되게
    const a = dirToAngles(view.dir, Math.atan2(-view.up[0], view.up[1]));
    let distance = view.distance;
    if (view.projection === 'orthographic' || !(distance > 0)) distance = view.height > 0 ? view.height / 2 / Math.tan(cam.fovY / 2) : cam.distance;
    v.setProjection(view.projection);
    animateCamera(v, { ...v.getCamera(), target: [...view.target], distance, yaw: a.yaw, pitch: a.pitch, projection: view.projection });
    if (view.pmiIds?.length) {
      const show = new Set(view.pmiIds);
      d.vis.pmiOff = false;
      for (const id of d.vis.pmiIds) d.vis.setPmi(id, show.has(id));
      this.applyVisibility([...d.vis.pmiIds]);
      this.panel.onVisibility();
    }
    this.toolbar.refresh();
  }

  // ───────────────────────── 간섭 검사(워커) ─────────────────────────

  private checkWorker: Worker | null = null;
  private checkSeq = 0;

  /** 보이는 그물끼리 간섭 검사(워커). 다시 부르면 앞의 검사를 멈추고 새로 */
  runInterference(): void {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v) return;
    this.checkWorker?.terminate();
    const meshes = d.scene.meshes.filter((m) => v.isVisible(m.id));
    if (meshes.length < 2) {
      this.toast('보이는 그물이 둘 이상이어야 간섭을 검사합니다.', 'warn');
      return;
    }
    const id = ++this.checkSeq;
    d.interference = { running: true, done: 0, total: 0 };
    this.panel.onInterference();
    let w: Worker;
    try {
      w = new Worker(new URL('../worker/check.worker.ts', import.meta.url), { type: 'module', name: 'opencad-step-check' });
    } catch (e) {
      d.interference = { running: false, done: 0, total: 0, error: errorText(e) };
      this.panel.onInterference();
      return;
    }
    this.checkWorker = w;
    w.onmessage = (ev: MessageEvent<CheckResponse>) => {
      const m = ev.data;
      if (m.id !== id || this.doc !== d) return;
      if (m.type === 'progress') d.interference = { running: true, done: m.done, total: m.total };
      else {
        d.interference = m.type === 'done' ? { running: false, done: 0, total: 0, result: m.result } : { running: false, done: 0, total: 0, error: m.message };
        w.terminate();
        if (this.checkWorker === w) this.checkWorker = null;
        if (m.type === 'done') this.toast(m.result.pairs.length ? `간섭 ${fmtCount(m.result.pairs.length)}쌍을 찾았습니다.` : '간섭을 찾지 못했습니다(맞닿음은 간섭으로 치지 않습니다).', m.result.pairs.length ? 'warn' : 'info');
      }
      this.panel.onInterference();
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      d.interference = { running: false, done: 0, total: 0, error: ev.message || '검사 워커가 멈췄습니다' };
      w.terminate();
      this.panel.onInterference();
    };
    const req: CheckRequest = {
      id,
      type: 'interference',
      meshes: meshes.map((m) => ({ id: m.id, positions: m.positions, ...(m.indices ? { indices: m.indices } : {}), ...(m.matrix ? { matrix: Array.from(m.matrix) } : {}), ...(m.origin ? { origin: [...m.origin] } : {}) })),
    };
    w.postMessage(req);
  }

  /** 간섭 검사 멈추기·결과 지우기 */
  clearInterference(): void {
    this.checkWorker?.terminate();
    this.checkWorker = null;
    if (this.doc) this.doc.interference = undefined;
    this.viewer?.highlightRanges(null);
    this.panel.onInterference();
  }

  /** 간섭 한 쌍: 교차 삼각형을 강조하고 두 그물로 맞춰 본다 */
  showInterference(p: InterferencePair): void {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v) return;
    const name = (id: string) => d.scene.meshes.find((m) => m.id === id)?.name ?? id;
    d.selKey = null;
    d.pick = null;
    d.face = null;
    d.edge = null;
    d.items = { ids: [p.a, p.b], label: `${name(p.a)} ↔ ${name(p.b)}` };
    v.setHighlightSegments(null);
    v.highlight(null);
    v.highlightRanges({ [p.a]: triRanges(p.trisA), [p.b]: triRanges(p.trisB) });
    this.selectionChanged();
    v.fitItems([p.a, p.b]);
  }

  /** 패널을 열고 속성 탭으로 */
  showProps(): void {
    if (!this.doc) return;
    if (!this.panelOpen) this.togglePanel(true);
    this.panel.setTab('props');
  }

  /** 고른 것으로 맞춰 보기(코어 fitItems: 숨긴 것은 빼고, 보이는 것이 없으면 전체 보기) */
  fitSelection(): void {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v) return;
    const ids = selectionItemIds(d);
    if (ids.length) v.fitItems(ids);
  }

  private selectionChanged(reveal = false): void {
    this.panel.onSelection(reveal);
    this.toolbar.refresh();
    this.updateStatus();
  }

  private clearSelection(): boolean {
    const d = this.doc;
    if (!d || (!d.selKey && !d.pick && !d.items && !d.face && !d.edge)) return false;
    this.selectKey(null);
    return true;
  }

  /** 모든 항목(그물·선·점)의 뷰어 보이기를 doc.vis에 맞춘다(ids를 주면 그것만) */
  private applyVisibility(ids?: readonly string[]): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    const set = (id: string) => {
      const on = d.vis.visible(id);
      if (v.isVisible(id) !== on || !on) v.setItemVisible(id, on);
    };
    if (ids) for (const id of ids) set(id);
    else {
      for (const m of d.scene.meshes) set(m.id);
      for (const l of d.scene.lines) set(l.id);
      for (const p of d.scene.points ?? []) set(p.id);
    }
  }

  setItemsVisible(ids: readonly string[], on: boolean): void {
    const d = this.doc;
    if (!d) return;
    d.vis.setUser(ids, on);
    this.applyVisibility(ids);
    if (on) {
      const blocked = ids.find((id) => d.vis.hiddenBy(id) === 'layer');
      if (blocked) this.toast('레이어가 꺼져 있어 보이지 않는 형상이 있습니다 — 레이어 탭에서 켜십시오.', 'warn');
    }
    this.panel.onVisibility();
  }

  setGroupVisible(group: string, on: boolean): void {
    this.viewer?.setGroupVisible(group, on);
    this.panel.onVisibility();
  }

  /** 레이어 켜고 끄기(NO_LAYER = 레이어 없음) */
  setLayerVisible(layer: number, on: boolean): void {
    const d = this.doc;
    if (!d) return;
    d.vis.setLayer(layer, on);
    this.applyVisibility();
    this.panel.onVisibility();
  }

  setAllLayersVisible(on: boolean): void {
    const d = this.doc;
    if (!d) return;
    d.layers.forEach((_, i) => d.vis.setLayer(i, on));
    d.vis.setLayer(-1, on);
    this.applyVisibility();
    this.panel.onVisibility();
  }

  /** 표현 PMI 하나(id) 또는 모두(null) 켜고 끄기 */
  setPmiVisible(id: string | null, on: boolean): void {
    const d = this.doc;
    if (!d) return;
    if (id === null) d.vis.pmiOff = !on;
    else d.vis.setPmi(id, on);
    this.applyVisibility(id === null ? [...d.vis.pmiIds] : [id]);
    this.panel.onVisibility();
  }

  /** 숨긴 부품·묶음 모두 보이기, 격리도 푼다(레이어·PMI 켜고 끄기는 그대로) */
  showAll(): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    for (const g of v.groups()) if (!g.visible) v.setGroupVisible(g.name, true);
    const ids = [...d.vis.userHidden];
    d.vis.userHidden.clear();
    if (d.vis.isolated) {
      d.vis.isolated = null;
      this.applyVisibility();
    } else this.applyVisibility(ids);
    if (d.dim) {
      d.dim = null;
      this.applyLooks();
    }
    this.syncIsolate();
    this.panel.onVisibility();
  }

  // ───────────────────────── 숨기기·격리·작업 메뉴 ─────────────────────────

  /** 고른 것 숨기기(H) — 고르기는 푼다 */
  hideSelection(): boolean {
    const d = this.doc;
    if (!d) return false;
    const ids = selectionItemIds(d);
    if (!ids.length) return false;
    this.clearSelection();
    this.setItemsVisible(ids, false);
    this.selectionChanged();
    return true;
  }

  /** 격리 중인지(이것만 보기·나머지 흐리게) */
  get isolated(): boolean {
    return !!this.doc?.vis.isolated || !!this.doc?.dim;
  }

  /**
   * 고른 것만 보기(I, mode 'hide') 또는 나머지 흐리게(mode 'dim' — 다른 부품은 반투명하고 고를 수 없다).
   * 이미 격리 중이면 푼다
   */
  isolateSelection(mode: 'hide' | 'dim' = 'hide'): boolean {
    const d = this.doc;
    if (!d) return false;
    if (d.vis.isolated || d.dim) {
      this.unisolate();
      return true;
    }
    const ids = selectionItemIds(d);
    if (!ids.length) {
      this.toast('먼저 부품을 고르십시오(3D에서 누르거나 제품 나무에서).');
      return false;
    }
    d.isoLabel = this.selectionName(d);
    if (mode === 'dim') {
      d.dim = new Set(ids);
      this.applyLooks();
    } else {
      d.vis.isolated = new Set(ids);
      this.applyVisibility();
    }
    this.syncIsolate();
    this.panel.onVisibility();
    return true;
  }

  /** 격리 풀기(이것만 보기·나머지 흐리게 모두) */
  unisolate(): void {
    const d = this.doc;
    if (!d || (!d.vis.isolated && !d.dim)) return;
    if (d.vis.isolated) {
      d.vis.isolated = null;
      this.applyVisibility();
    }
    if (d.dim) {
      d.dim = null;
      this.applyLooks();
    }
    this.syncIsolate();
    this.panel.onVisibility();
  }

  /** 격리 띠 맞추기 */
  private syncIsolate(): void {
    const d = this.doc;
    const on = !!d?.vis.isolated || !!d?.dim;
    this.isoBar.hidden = !on;
    this.isoLabel.textContent = d?.dim ? '나머지 흐리게' : '이것만 보기';
    this.isoText.textContent = on ? (d!.isoLabel ?? '') : '';
    this.isoText.setAttribute('translate', 'no');
    this.toolbar.refresh();
  }

  // ───────────────────────── 부품 겉모습(불투명도·부품 색·분해) ─────────────────────────

  /** 문서의 겉모습(불투명도·흐리게·부품 색·분해)을 코어에 건다 — 바뀐 그물만 */
  private applyLooks(): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    const want = desiredLooks({
      items: [...d.scene.meshes, ...d.scene.lines, ...(d.scene.points ?? [])],
      products: d.products,
      opacity: d.opacity,
      dim: d.dim,
      partColors: this.partColors,
      explode: d.explode,
      fixed: d.vis.pmiIds,
    });
    for (const id of [...this.appliedLooks.keys()])
      if (!want.has(id)) {
        v.setItemOpacity(id, null);
        v.setItemColor(id, null);
        v.setItemMatrix(id, null);
        this.appliedLooks.delete(id);
      }
    for (const [id, l] of want) {
      const k = lookKey(l);
      if (this.appliedLooks.get(id) === k) continue;
      v.setItemOpacity(id, l.alpha, { pickable: l.pickable });
      v.setItemColor(id, l.color);
      v.setItemMatrix(id, l.matrix);
      this.appliedLooks.set(id, k);
    }
  }

  /** 고른 것의 불투명도(1 또는 null = 되돌리기) */
  setSelectionOpacity(alpha: number | null): void {
    const d = this.doc;
    if (!d) return;
    const ids = selectionItemIds(d);
    if (!ids.length) return;
    for (const id of ids) {
      if (alpha === null || alpha >= 1) d.opacity.delete(id);
      else d.opacity.set(id, Math.max(0.02, alpha));
    }
    this.applyLooks();
  }

  /** 모든 부품 불투명도 되돌리기 */
  resetOpacity(): void {
    const d = this.doc;
    if (!d || !d.opacity.size) return;
    d.opacity.clear();
    this.applyLooks();
  }

  /** 고른 것의 불투명도 메뉴(작업 메뉴를 연 자리에 다시 연다) */
  private openOpacityMenu(x: number, y: number): void {
    const d = this.doc;
    if (!d) return;
    const ids = selectionItemIds(d);
    const vals = new Set(ids.map((id) => d.opacity.get(id) ?? 1));
    const cur = vals.size === 1 ? [...vals][0]! : NaN;
    openMenuAt(
      x,
      y,
      OPACITY_STEPS.map((a, i): MenuItem => ({ label: i === 0 ? '100% (불투명)' : `${Math.round(a * 100)}%`, checked: Math.abs(cur - a) < 1e-6, run: () => this.setSelectionOpacity(a) })),
      '불투명도',
    );
  }

  /** 부품 색 구분 켜고 끄기(같은 제품은 같은 색) */
  togglePartColors(on = !this.partColors): void {
    this.partColors = on;
    this.applyLooks();
    this.toolbar.refresh();
  }

  /** 분해 정도(0~1) */
  setExplode(t: number): void {
    const d = this.doc;
    if (!d) return;
    const k = Math.max(0, Math.min(1, t));
    if (k > 0 && (this.measuring || this.faceMode)) {
      // 측정·면 정보는 제자리 형상으로 잰다
      if (this.measuring) this.toggleMeasure(false);
      if (this.faceMode) this.toggleFaceMode(false);
      this.toast('분해 보기 동안은 측정·면 고르기를 끕니다(제자리 형상으로 잽니다).');
    }
    d.explode = k;
    this.applyLooks();
    this.syncExplode();
  }

  /** 분해 막대 열고 닫기(닫으면 제자리로) */
  toggleExplode(on = !this.explodeOpen): void {
    this.explodeOpen = on && !!this.doc;
    if (!this.explodeOpen && this.doc?.explode) this.setExplode(0);
    else if (this.explodeOpen && this.doc && !this.doc.explode) this.setExplode(0.5);
    this.syncExplode();
  }

  /** 측정·면 고르기를 켜면 분해를 접는다(제자리 형상으로 잰다) */
  private collapseExplode(): void {
    if (!this.doc?.explode) return;
    this.doc.explode = 0;
    this.applyLooks();
    this.syncExplode();
  }

  private syncExplode(): void {
    const t = this.doc?.explode ?? 0;
    this.explodeBar.hidden = !this.explodeOpen || !this.doc;
    if (document.activeElement !== this.explodeSlider) this.explodeSlider.value = String(Math.round(t * 100));
    this.explodeValue.textContent = `${Math.round(t * 100)}%`;
    this.toolbar.refresh();
  }

  /** 화면 점(client 좌표)에서 작업 메뉴: 그 자리 항목을 고르고(없으면 고르기 그대로) 메뉴를 연다. 열었으면 true */
  contextMenuAt(clientX: number, clientY: number): boolean {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d || this.loading || v.measureMode || this.entMeasuring) return false;
    const r = v.canvas.getBoundingClientRect();
    const p = v.pick(clientX - r.left, clientY - r.top, 'touch');
    if (p && !selectionItemIds(d).includes(p.id)) this.onPick(p, this.faceMode);
    // 그 자리 B-rep 면(정면으로 보기·면으로 자르기)
    this.ctxFace = p && p.kind === 'mesh' && !p.section ? this.findFace(d, p) : null;
    this.openContextMenu(clientX, clientY);
    return true;
  }

  /** 작업 메뉴 항목(고른 것이 있으면 그것에 대해) */
  contextItems(): MenuItem[] {
    const d = this.doc;
    if (!d) return [];
    const has = selectionItemIds(d).length > 0;
    const iso = !!d.vis.isolated || !!d.dim;
    const items: MenuItem[] = [];
    if (has) {
      items.push({ label: '맞춰 보기', run: () => this.fitSelection() });
      items.push({ label: '숨기기', hint: 'H', run: () => this.hideSelection() });
      if (iso) items.push({ label: '격리 풀기', hint: 'I', run: () => this.unisolate() });
      else {
        items.push({ label: '이것만 보기', hint: 'I', run: () => this.isolateSelection('hide') });
        items.push({ label: '나머지 흐리게', run: () => this.isolateSelection('dim') });
      }
      const at = this.ctxAt;
      items.push({ label: '불투명도…', run: () => this.openOpacityMenu(at.x, at.y) });
      items.push({ label: '속성', run: () => this.showProps() });
      const face = this.ctxFace ?? d.face;
      if (face && (face.normal || face.axis)) {
        items.push({ label: '정면으로 보기', sep: true, run: () => this.lookAtFace(face) });
        items.push({ label: face.normal ? '이 면으로 자르기' : '축을 지나게 자르기', run: () => this.sectionByFace(face) });
      }
    } else {
      items.push({ label: '전체 보기', hint: 'F', run: () => this.fit() });
      if (iso) items.push({ label: '격리 풀기', hint: 'I', run: () => this.unisolate() });
    }
    items.push({ label: '모두 보이기', sep: true, disabled: !iso && !d.vis.userHidden.size && !this.groups().some((g) => !g.visible), run: () => this.showAll() });
    if (d.opacity.size) items.push({ label: '불투명도 모두 되돌리기', run: () => this.resetOpacity() });
    if (has) items.push({ label: '고르기 풀기', run: () => void this.clearSelection() });
    return items;
  }

  /** 작업 메뉴를 연 화면 점(불투명도 메뉴를 같은 자리에 연다) */
  private ctxAt = { x: 0, y: 0 };

  /** 작업 메뉴 열기(화면 점, 나무 줄에서도 쓴다) */
  openContextMenu(clientX: number, clientY: number): void {
    this.ctxAt = { x: clientX, y: clientY };
    const items = this.contextItems();
    if (items.length) openMenuAt(clientX, clientY, items, '작업 메뉴');
  }

  isVisible(id: string): boolean {
    return this.viewer?.isVisible(id) ?? true;
  }

  groups() {
    return this.viewer?.groups() ?? [];
  }

  // ───────────────────────── 보기 명령(도구 막대) ─────────────────────────

  get hasDoc(): boolean {
    return !!this.doc && !!this.viewer;
  }

  get projection(): Projection {
    return this.viewer?.getProjection() ?? 'perspective';
  }

  get renderMode(): RenderMode {
    return this.viewer?.getRenderMode() ?? 'shadedEdges';
  }

  get measuring(): boolean {
    return !!this.viewer?.measureMode || this.entMeasuring;
  }

  /** 손가락이 주인 기기인지: 안내에서 키(Esc) 설명을 빼고 길게 누르기(정밀 조준)를 알린다 */
  get touch(): boolean {
    return !!this.coarse?.matches;
  }

  fit(): void {
    this.viewer?.fit();
  }

  setView(v: ViewName): void {
    this.viewer?.setView(v);
  }

  setProjection(p: Projection): void {
    this.viewer?.setProjection(p);
    this.toolbar.refresh();
  }

  setRenderMode(m: RenderMode): void {
    this.viewer?.setRenderMode(m);
    this.toolbar.refresh();
  }

  /** 숨은선 모드에서 가려진 모서리를 흐린 점선으로(코어 hiddenEdges) */
  hiddenEdges = false;
  /** 외곽선(실루엣) 강조(코어 profiles) */
  profiles = false;

  toggleHiddenEdges(on = !this.hiddenEdges): void {
    this.hiddenEdges = on;
    this.viewer?.setRenderOptions({ hiddenEdges: on });
    this.toolbar.refresh();
  }

  toggleProfiles(on = !this.profiles): void {
    this.profiles = on;
    this.viewer?.setRenderOptions({ profiles: on });
    this.toolbar.refresh();
  }

  // 격자·뷰 큐브·좌표축 상태는 뷰어(코어)가 든다. 뷰어가 아직 없으면 코어 기본값(켜짐)

  get gridOn(): boolean {
    return this.viewer?.gridVisible ?? true;
  }

  get cubeOn(): boolean {
    return this.viewer?.viewCubeVisible ?? true;
  }

  get axesOn(): boolean {
    return this.viewer?.axesVisible ?? true;
  }

  toggleGrid(): void {
    const v = this.viewer;
    if (!v) return;
    v.setGridVisible(!v.gridVisible);
    this.toolbar.refresh();
  }

  toggleCube(): void {
    const v = this.viewer;
    if (!v) return;
    v.setViewCubeVisible(!v.viewCubeVisible);
    this.toolbar.refresh();
  }

  toggleAxes(): void {
    const v = this.viewer;
    if (!v) return;
    v.setAxesVisible(!v.axesVisible);
    this.toolbar.refresh();
  }

  toggleMeasure(on = !this.measuring): void {
    const v = this.viewer;
    if (!v) return;
    if (on !== this.measuring) this.aim?.cancel();
    const ent = on && this.measureKind === 'entities';
    // 측정은 제자리 형상으로(분해를 접는다)
    if (on) this.collapseExplode();
    // 두 점은 코어 측정 모드, 개체는 코어 측정을 끄고 고르기 알림(윤곽선 포함)으로 모은다
    v.setMeasureMode(on && !ent);
    this.setEntMeasuring(ent);
    if (this.doc && !on) this.doc.measure = null;
    if (on) {
      this.viewer?.highlight(null);
      this.showFace(null);
      if (this.faceMode) this.faceMode = false;
      if (this.doc) {
        this.doc.pick = null;
        this.doc.selKey = null;
        this.doc.items = null;
        this.doc.face = null;
        this.doc.edge = null;
      }
      this.panel.onSelection();
    }
    v.setPickEdges(ent || this.faceMode);
    this.panel.onMeasure();
    this.toolbar.refresh();
    this.updateStatus();
  }

  /** 측정 종류 바꾸기(측정 중이면 그 종류로 다시 시작) */
  setMeasureKind(k: MeasureKind): void {
    if (this.measureKind === k) return;
    this.measureKind = k;
    if (this.measuring) {
      this.toggleMeasure(false);
      this.toggleMeasure(true);
    } else this.refreshBar();
  }

  /** 개체 측정 켜고 끄기(끄면 누른 개체·덧그림을 지운다) */
  private setEntMeasuring(on: boolean): void {
    const v = this.viewer;
    if (this.entMeasuring && !on) this.clearEntities();
    this.entMeasuring = on;
    if (v) v.canvas.style.cursor = on || v.measureMode ? 'crosshair' : '';
  }

  /** 개체 측정: 누른 개체와 결과·강조·덧그림 지우기 */
  clearEntities(): void {
    const d = this.doc;
    const v = this.viewer;
    if (d) d.ent = { picks: [], result: null };
    v?.setAnnotations(null);
    v?.highlightRanges(null);
    this.panel.onMeasure();
    this.updateStatus();
  }

  /** 누른 것 → 개체(면·모서리·꼭짓점·가운데 점·단면·점) */
  private toPicked(d: StepDoc, v: Viewer3d, p: Pick3d, pointerType: string): Picked | null {
    if (p.section && p.normal) return pickedSection(p.id, [...p.point], [...p.normal]);
    if (p.kind === 'edge') {
      const ep = this.findEdge(d, p);
      if (!ep) return pickedPoint(p.id, [...p.point], '모서리 위 점');
      // 화면에서 끝점·가운데 점 가까이면 그 점(터치는 넓게)
      const snap = snapOnEdge(ep, p.point, (q) => v.project(q), pointerType === 'touch' ? 18 : 9);
      return pickedEdge(ep, [...p.point], snap);
    }
    if (p.kind === 'mesh') {
      const fp = this.findFace(d, p);
      return fp ? pickedFace(fp, [...p.point]) : pickedPoint(p.id, [...p.point], '면 위 점');
    }
    return pickedPoint(p.id, [...p.point]);
  }

  /** 개체 측정의 누르기: 둘째 개체면 재고, 셋째면 새로 시작한다(빈 곳은 무시) */
  private onEntityPick(p: Pick3d | null, pointerType: string): void {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v || !p) return;
    const picked = this.toPicked(d, v, p, pointerType);
    if (!picked) return;
    if (d.ent.picks.length >= 2) d.ent = { picks: [], result: null };
    d.ent.picks.push(picked);
    if (d.ent.picks.length === 2) {
      const [a, b] = d.ent.picks as [Picked, Picked];
      const diag = this.sceneDiag(d);
      const meshOf = (id: string) => d.scene.meshes.find((m) => m.id === id);
      d.ent.result = measurePicked(a, b, {
        size: armSize(a, b, diag),
        closest: (x, y) => pickedClosest(x, y, meshOf),
        parts: (x, y) => v.closestPoints(x, y),
      });
      for (const l of d.ent.result.lines) logMeasure(d, { type: 'entity', label: l.label, unit: l.unit, value: l.value, ...(l.approx ? { approx: true } : {}), a: a.title, b: b.title });
    } else d.ent.result = null;
    this.showEntities();
    this.panel.onMeasure();
    this.updateStatus();
  }

  private diagOf = new WeakMap<StepDoc, number>();
  /** 장면 범위 대각선(문서마다 한 번 잰다) */
  private sceneDiag(d: StepDoc): number {
    let r = this.diagOf.get(d);
    if (r === undefined) {
      const b = d.scene.bounds && !boxIsEmpty(d.scene.bounds) ? d.scene.bounds : sceneBounds(d.scene);
      r = boxIsEmpty(b) ? 0 : Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      this.diagOf.set(d, r);
    }
    return r;
  }

  /** 개체 측정 강조(누른 면 삼각형·모서리 윤곽선)와 덧그림(거리·각 선, 값 글, 원 중심) */
  private showEntities(): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    const ranges = new Map<string, { prims: { start: number; count: number }[]; edges: { start: number; count: number }[] }>();
    for (const p of d.ent.picks) {
      const r = ranges.get(p.meshId) ?? { prims: [], edges: [] };
      if (p.what === 'face' && p.face) r.prims.push({ start: p.face.triStart, count: p.face.triangles });
      else if (p.what === 'edge' && p.edge) r.edges.push({ start: p.edge.segStart, count: p.edge.segCount });
      else continue;
      ranges.set(p.meshId, r);
    }
    v.highlight(null);
    v.setHighlightSegments(null);
    v.highlightRanges(ranges.size ? ranges : null);
    v.setAnnotations(d.ent.picks.length ? pickedAnnotations(d.ent.picks, d.ent.result, this.fmt) : null);
  }

  /** 지금 화면을 PNG로(손가락 기기는 공유 시트가 되면 공유, 아니면 내려받기) */
  async savePng(): Promise<void> {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    try {
      const b = await v.toBlob('image/png');
      const how = await this.deliver(b, `${stemName(d.name)}.png`);
      if (how === 'cancelled') return;
      trackExport('png');
      this.toast(how === 'shared' ? '지금 화면 그림을 공유했습니다.' : '지금 화면을 PNG로 저장했습니다.');
    } catch (e) {
      this.toast(`그림을 저장하지 못했습니다: ${errorText(e)}`, 'error');
    }
  }

  // ───────────────────────── 내보내기·공유·보기 링크 ─────────────────────────

  /** 파일 건네기: 손가락 기기에서 파일 공유가 되면 공유 시트, 아니면 내려받기 */
  private async deliver(blob: Blob, name: string): Promise<'shared' | 'saved' | 'cancelled'> {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (this.touch && typeof nav.share === 'function' && typeof File === 'function') {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      try {
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: name });
          return 'shared';
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        // 공유가 막히면(권한·형식) 내려받기로
      }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  }

  /** 보이는(또는 고른 것 가운데 보이는) 그물을 STL·OBJ로 */
  async exportMesh(format: 'stl' | 'obj', which: 'visible' | 'selected'): Promise<void> {
    const d = this.doc;
    const v = this.viewer;
    if (!d || !v) return;
    const pick = which === 'selected' ? new Set(selectionItemIds(d)) : null;
    const meshes = d.scene.meshes.filter((m) => (!pick || pick.has(m.id)) && v.isVisible(m.id));
    if (!meshes.length) {
      this.toast('내보낼 형상이 없습니다(보이는 그물이 없음).', 'warn');
      return;
    }
    const u = this.doc?.scene.units ?? 'unknown';
    const head = `OpenCAD STEP viewer - ${d.name} - units ${u}`;
    const blob = format === 'stl' ? new Blob([meshesToStl(meshes, head)], { type: 'model/stl' }) : new Blob([meshesToObj(meshes, head)], { type: 'model/obj' });
    const how = await this.deliver(blob, `${stemName(d.name)}${pick ? '-selection' : ''}.${format}`);
    if (how === 'cancelled') return;
    trackExport(format);
    let tris = 0;
    for (const m of meshes) tris += Math.floor((m.indices ? m.indices.length : m.positions.length / 3) / 3);
    this.toast(`${format.toUpperCase()}로 내보냈습니다: 그물 ${fmtCount(meshes.length)}개 · 삼각형 ${fmtCount(tris)}개 · 단위 ${u === 'unknown' ? '모름' : u === 'inch' ? 'in' : u}`);
  }

  /** 글을 클립보드로(안 되면 파일로 건넨다) */
  private async copyText(text: string, fileName: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(`${what}을(를) 클립보드에 복사했습니다.`);
    } catch {
      await this.deliver(new Blob([text], { type: fileName.endsWith('.csv') ? 'text/csv' : 'text/plain' }), fileName);
      this.toast(`클립보드를 쓸 수 없어 ${what}을(를) 파일로 저장했습니다.`, 'warn');
    }
  }

  /** 측정 기록(거리·고른 면)을 CSV로 복사 */
  async copyMeasureCsv(): Promise<void> {
    const d = this.doc;
    if (!d || !d.measureLog.length) return;
    const rows = measureRows(d.measureLog, this.fmt, (k) => translateUi(k));
    await this.copyText(`\ufeff${toCsv(rows)}`, `${stemName(d.name)}-measure.csv`, translateUi('측정 기록 CSV'));
    trackExport('csv');
  }

  /** 의미 PMI 표를 CSV로 복사 */
  async copyPmiCsv(): Promise<void> {
    const d = this.doc;
    if (!d || !d.pmi.semantic.length) return;
    const rows: (string | number)[][] = [[translateUi('종류'), translateUi('이름'), translateUi('값'), translateUi('이어진 면 수'), 'STEP #']];
    for (const x of d.pmi.semantic) rows.push([translateUi(semanticLabel(x.type)), x.name, x.value, x.faces?.length ?? 0, x.stepId]);
    await this.copyText(`\ufeff${toCsv(rows)}`, `${stemName(d.name)}-pmi.csv`, translateUi('PMI 표 CSV'));
    trackExport('csv');
  }

  /** 지금 보기(카메라·단면·고른 것)를 담은 주소 — 파일은 담지 않는다 */
  viewLinkUrl(): string {
    const v = this.viewer;
    const d = this.doc;
    const link: ViewLink = {};
    if (v) {
      const c = v.getCamera();
      link.cam = { target: c.target, distance: c.distance, yaw: c.yaw, pitch: c.pitch, projection: c.projection };
      const st = v.section;
      if (st) link.sec = { normal: st.normal, offset: st.offset };
    }
    if (d?.selKey) {
      link.sel = d.selKey;
      if (d.vis.isolated) link.iso = true;
    }
    return viewUrl(location.href, link);
  }

  async copyViewLink(): Promise<void> {
    if (!this.doc) return;
    const url = this.viewLinkUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.toast('보기 링크를 복사했습니다(카메라·단면·고른 것 — 파일은 담지 않으니 받는 사람도 같은 파일을 여십시오).');
    } catch {
      history.replaceState(history.state, '', url);
      this.toast('클립보드를 쓸 수 없어 주소 막대에 보기 링크를 넣었습니다.', 'warn');
    }
  }

  /** 보기 링크 적용(지금 문서에) */
  applyViewLink(link: ViewLink): void {
    const v = this.viewer;
    const d = this.doc;
    if (!v || !d) return;
    if (link.sel && productAt(d.products, link.sel)) {
      this.selectKey(link.sel);
      if (link.iso && !d.vis.isolated) this.isolateSelection();
    }
    if (link.cam) {
      v.setProjection(link.cam.projection);
      v.setCamera({ ...v.getCamera(), ...link.cam, target: [...link.cam.target] });
    }
    if (link.sec) v.setSection(link.sec);
    this.toolbar.refresh();
  }

  /** 내보내기 메뉴 항목(도구 막대·휴대폰 보기 설정) */
  exportItems(): MenuItem[] {
    const d = this.doc;
    const sel = !!d && selectionItemIds(d).length > 0;
    return [
      { label: 'PNG 그림', run: () => void this.savePng() },
      { label: 'STL — 보이는 것', sep: true, run: () => void this.exportMesh('stl', 'visible') },
      { label: 'STL — 고른 것', disabled: !sel, run: () => void this.exportMesh('stl', 'selected') },
      { label: 'OBJ — 보이는 것', run: () => void this.exportMesh('obj', 'visible') },
      { label: 'OBJ — 고른 것', disabled: !sel, run: () => void this.exportMesh('obj', 'selected') },
      { label: '측정 기록 CSV 복사', sep: true, disabled: !d?.measureLog.length, run: () => void this.copyMeasureCsv() },
      { label: 'PMI 표 CSV 복사', disabled: !d?.pmi.semantic.length, run: () => void this.copyPmiCsv() },
      { label: '보기 링크 복사', sep: true, run: () => void this.copyViewLink() },
    ];
  }

  togglePanel(on = !this.panelOpen): void {
    this.panelOpen = on;
    this.panel.setOpen(on);
    this.toolbar.refresh();
    // 고른 부품 카드는 패널이 닫혀 있을 때만(열면 패널 아래 띠가 같은 것을 보인다)
    this.refreshBar();
    if (this.narrow?.matches && this.viewer) requestAnimationFrame(() => requestAnimationFrame(() => this.viewer?.fit(false)));
  }

  // ───────────────────────── 표시 설정(단위·소수 자리) ─────────────────────────

  /** 지금 문서·설정·언어로 수 꼴 만들기 */
  private makeFmt(): Fmt {
    return new Fmt(this.doc?.scene.units ?? 'mm', this.display, numberLocale(document.documentElement.lang));
  }

  /** 수 꼴을 다시 만들고 숫자가 든 화면(패널·띠·상태 막대·단면 값)을 다시 그린다 */
  refreshFmt(): void {
    this.fmt = this.makeFmt();
    // 코어 측정 글을 새 꼴로 다시 그린다(같은 함수를 다시 넘기면 다시 그린다)
    this.viewer?.setMeasureFormat((m) => measureLabelLines(m, this.fmt, translateUi));
    // 개체 측정 덧그림 글도 새 단위·자리 수로
    if (this.entMeasuring && this.doc?.ent.picks.length) this.showEntities();
    this.panel.redraw();
    this.updateStatus();
    if (this.viewer) this.syncSection(this.viewer.section);
  }

  /** 표시 설정 바꾸기(기억한다). 곡면 품질이 바뀌면 연 문서를 다시 삼각화한다 */
  setDisplay(next: Partial<DisplaySettings>): void {
    const quality = this.display.quality;
    this.display = { ...this.display, ...next };
    writeDisplaySettings(safeLocalStorage(), this.display);
    this.refreshFmt();
    if (this.display.quality !== quality) void this.retessellate();
  }

  /** 연 문서를 지금 곡면 품질로 다시 삼각화(같은 파일을 다시 읽는다 — 보기·고르기·보이기는 이어 간다) */
  async retessellate(): Promise<boolean> {
    const src = this.source;
    const d = this.doc;
    if (!src || !d || this.loading) return false;
    return this.load(src.name, src.read, src.input, { success() {}, error() {} }, d);
  }

  get displaySettings(): DisplaySettings {
    return { ...this.display };
  }

  /** 표시 설정 대화 상자: 길이 단위·소수 자리(바로 적용) */
  showDisplaySettings(): void {
    const u = this.doc?.scene.units;
    const file = u === 'mm' ? 'mm' : u === 'inch' ? 'in' : u === 'm' ? 'm' : '';
    const known = u !== 'unknown';
    const unit = selectRow(
      '길이 단위',
      [
        ['file', file ? `파일 단위 (${file})` : '파일 단위'],
        ['mm', '밀리미터 (mm)'],
        ['in', '인치 (in)'],
      ],
      this.display.unit,
      (v) => this.setDisplay({ unit: v === 'mm' || v === 'in' ? v : 'file' }),
      known ? '측정(3D 보기 위 글자 포함)·면 정보·속성·단면 값에 씁니다.' : '이 파일은 길이 단위를 모릅니다 — 값을 바꾸지 않고 그대로 보입니다.',
    );
    const decimals = selectRow(
      '소수 자리',
      Array.from({ length: MAX_DECIMALS + 1 }, (_, i): [string, string] => [String(i), String(i)]),
      String(this.display.decimals),
      (v) => this.setDisplay({ decimals: Number(v) }),
    );
    const quality = selectRow(
      '곡면 품질',
      [
        ['normal', '보통(빠름)'],
        ['fine', '세밀(각 10°)'],
        ['finest', '아주 세밀(각 5°)'],
      ],
      this.display.quality,
      (v) => this.setDisplay({ quality: v === 'fine' || v === 'finest' ? v : 'normal' }),
      '곡면을 나누는 삼각형을 촘촘히 해 둥근 면이 매끈해지고 부피·측정 점이 정확해집니다. 바꾸면 연 파일을 다시 삼각화합니다(큰 파일은 오래 걸리고 메모리를 더 씁니다).',
    );
    openDialog('표시 설정', [unit, decimals, quality]);
  }

  // ───────────────────────── 테마 ─────────────────────────

  setTheme(t: Theme | null): void {
    this.storedTheme = t;
    writeStoredTheme(safeLocalStorage(), t);
    this.theme = resolveTheme(t, this.systemDark?.matches ?? true);
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.theme === 'dark' ? '#232830' : '#ffffff');
    this.viewer?.setTheme(this.theme);
    if (this.themeBtn) {
      const dark = this.theme === 'dark';
      const label = '앱 설정';
      this.themeBtn.title = label;
      this.themeBtn.setAttribute('aria-label', label);
      const svg = this.themeBtn.querySelector('svg');
      svg?.replaceWith(icon(dark ? 'sun' : 'moon'));
    }
  }

  // ───────────────────────── 창 이벤트 ─────────────────────────

  private bindWindow(): void {
    // 키: bubble 단계(캔버스가 받은 키는 뷰어가 전파를 멈춘다)
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    // 끌어다 놓기: 창 어디에나
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      this.dropEl.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) this.dropEl.hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      this.dropEl.hidden = true;
      // 여러 개를 놓으면 이름으로 열 만한 첫 파일(없으면 첫 파일)
      const files = [...(e.dataTransfer?.files ?? [])];
      const f = files.find((x) => isOpenableName(x.name)) ?? files[0];
      if (f) void this.openFile(f);
      if (files.length > 1) this.toast(`한 번에 파일 하나만 엽니다 — ${f?.name ?? ''}을(를) 엽니다.`);
    });
    // 시스템 테마가 바뀌면(사용자가 고르지 않았을 때만) 따라간다
    this.systemDark?.addEventListener('change', () => {
      if (this.storedTheme) return;
      this.theme = resolveTheme(null, this.systemDark?.matches ?? true);
      this.applyTheme();
    });
    // 휴대폰 ↔ 넓은 화면을 넘나들면 패널 기본값을 다시 정한다(휴대폰을 세로에서 가로로 돌려도 패널이 저절로 열리지 않게)
    this.phone?.addEventListener('change', () => {
      this.viewer?.setViewCubeSize(this.cubeSize());
      this.togglePanel(!this.phone?.matches);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    const action = routeKey({ key: ev.key, ctrl: ev.ctrlKey, meta: ev.metaKey, alt: ev.altKey, inText: isTextTarget(ev.target), hasDoc: this.hasDoc });
    if (!action) return;
    const v = this.viewer;
    switch (action) {
      case 'open':
        ev.preventDefault();
        this.pickFile();
        return;
      case 'viewer':
        // F·1~7 등 뷰어 키: 코어 규칙대로(처리하면 코어가 preventDefault)
        v?.handleKey(ev);
        return;
      case 'grid':
        this.toggleGrid();
        break;
      case 'hide':
        if (!this.hideSelection()) return;
        break;
      case 'isolate':
        if (!this.isolateSelection()) return;
        break;
      case 'home':
        this.goHome();
        break;
      case 'escape':
        // 대화 상자·메뉴 닫기 → 해석 취소 → 측정 지우기(점이 있으면 코어가)·끄기 → 고르기 풀기
        if (closeDialog()) break;
        if (closeMenu()) break;
        if (this.loading) {
          this.cancel();
          break;
        }
        if (this.entMeasuring) {
          // 누른 개체가 있으면 지우고, 없으면 측정을 끝낸다
          if (this.doc?.ent.picks.length) this.clearEntities();
          else this.toggleMeasure(false);
          break;
        }
        if (v?.measureMode) {
          if (v.measurePointCount > 0 && v.handleKey(ev)) return;
          this.toggleMeasure(false);
          break;
        }
        if (this.clearSelection()) break;
        return;
    }
    ev.preventDefault();
  }

  // ───────────────────────── 상태 ─────────────────────────

  private setLoading(l: Loading | null): void {
    this.loading = l;
    this.busyEl.hidden = !l;
    if (l) {
      this.busyName.textContent = l.name;
      this.busyStage.textContent = `${l.stage}…`;
      this.busyPct.textContent = fmtPercent(l.fraction);
      this.busyBar.style.width = `${Math.round(Math.max(0.02, l.fraction) * 1000) / 10}%`;
      this.busyBar.parentElement?.setAttribute('aria-valuenow', String(Math.round(l.fraction * 100)));
    }
    this.updateStatus();
  }

  private showError(msg: string): void {
    this.lastError = msg;
    this.toast(msg, 'error', 9000);
    this.updateAll();
  }

  /** 잠깐 보이는 알림(action을 주면 단추 하나 — 누르면 실행하고 닫는다) */
  toast(msg: string, kind: 'info' | 'warn' | 'error' = 'info', ms = 3500, action?: { label: string; run: () => void }): void {
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '알림 닫기' });
    close.append(icon('close', 14));
    const act = action ? h('button', { type: 'button', class: 'btn small toast-act' }, action.label) : null;
    const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, icon(kind === 'info' ? 'info' : 'warn', 16), h('span', {}, msg), act, close);
    act?.addEventListener('click', () => {
      t.remove();
      action!.run();
    });
    const remove = () => t.remove();
    close.addEventListener('click', remove);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(remove, ms);
  }

  private updateAll(): void {
    const d = this.doc;
    this.startEl.hidden = !!d;
    // 문서가 없을 때 시작 화면 뒤에 미리 만든 캔버스로 초점이 가지 않게
    this.hostEl.inert = !d;
    this.startError.hidden = !this.lastError || !!d;
    this.startError.textContent = this.lastError ?? '';
    this.docNameEl.textContent = d ? d.name : '';
    this.docNameEl.title = d ? d.name : '';
    if (!d) document.title = APP_TITLE;
    this.toolbar.refresh();
    this.panel.setOpen(this.panelOpen);
    this.updateStatus();
  }

  private updateStatus(): void {
    const d = this.doc;
    this.statusDoc.innerHTML = '';
    if (this.loading) {
      this.statusDoc.append(h('span', {}, `${this.loading.name} 여는 중… ${fmtPercent(this.loading.fraction)}`));
    } else if (d) {
      if (this.upload !== null) this.statusDoc.append(h('span', {}, `화면에 올리는 중 ${fmtPercent(this.upload)}`));
      for (const it of docStatus(d)) this.statusDoc.append(h('span', { title: it.title ?? null }, it.text));
    } else {
      this.statusDoc.append(h('span', {}, 'STEP 파일을 열거나 끌어다 놓으세요'));
    }
    const sel = d ? this.selectionText(d) : '';
    const detail = d && sel ? this.selectionDetail(d) : [];
    this.statusSel.replaceChildren(sel, ...detail.flatMap((x) => [' · ', h('span', {}, x)]));
    this.refreshBar();
  }

  /**
   * 측정 띠: 측정 중이면 다음에 누를 곳 안내나 결과(거리와 dx·dy·dz), 면 고르기 중이면 고른 면의 종류·주요 치수·넓이,
   * 둘 다 아니고 패널이 닫혀 있으면 고른 부품의 이름과 외형 크기(고른 부품 카드)
   */
  private refreshBar(): void {
    const d = this.doc;
    const v = this.viewer;
    const mode = !d || !v || this.loading ? null : this.measuring ? 'measure' : this.faceMode ? 'face' : !this.panelOpen && selectionItemIds(d).length ? 'select' : null;
    this.measureBar.hidden = !mode;
    // 측정 중에는 넓은 화면에도 띠를 보인다(측정 종류 고르기)
    this.measureBar.classList.toggle('measuring', mode === 'measure');
    this.measureKindSeg.hidden = mode !== 'measure';
    for (const [k, b] of this.measureKindBtns) {
      const on = k === this.measureKind;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (mode !== this.barMode) {
      this.barMode = mode;
      const close = mode === 'face' ? '면 고르기 끝내기' : mode === 'select' ? '선택 해제' : '측정 끝내기';
      this.measureClose.title = close;
      this.measureClose.setAttribute('aria-label', close);
      this.measureClear.hidden = mode !== 'measure';
      this.selFit.hidden = mode !== 'select';
      this.selProps.hidden = mode !== 'select';
    }
    // 면 고르기에서 면을 골랐으면 정면·자르기(정할 수 있는 면만)
    const faceOk = mode === 'face' && !!d?.face && !!(d.face.normal || d.face.axis);
    this.faceLook.hidden = !faceOk;
    this.faceCut.hidden = !faceOk;
    if (!mode || !d || !v) return;
    const fm = this.fmt;
    const t = this.measureText;
    t.replaceChildren();
    if (mode === 'measure' && this.entMeasuring) {
      this.entityBarText(d, t);
      this.measureClear.disabled = !d.ent.picks.length;
    } else if (mode === 'measure') {
      if (d.measure) {
        const m = measureLines(d.measure, fm);
        t.append(h('b', { class: 'mb-value' }, m.value), h('span', { class: 'mb-sub' }, m.axes));
      } else t.append(h('span', { class: 'mb-hint' }, measureHint(v.measurePointCount, false, this.touch)));
      this.measureClear.disabled = !d.measure && !v.measurePointCount;
    } else if (d.face || d.edge) {
      const f = d.face ? faceSummary(d.face, fm) : edgeSummary(d.edge!, fm);
      const facts: (Node | string)[] = [];
      f.facts.forEach(([k, val], i) => facts.push(...(i ? [' · '] : []), h('span', {}, k), ` ${val}`));
      t.append(h('b', { class: 'mb-value' }, h('span', {}, f.kind), f.main ? ` ${f.main}` : null), h('span', { class: 'mb-sub' }, ...facts));
    } else if (mode === 'face') t.append(h('span', { class: 'mb-hint' }, faceHint(this.touch)));
    else {
      // 부품 이름은 파일 글이라 번역하지 않는다
      t.append(h('b', { class: 'mb-value', 'data-i18n-skip': '' }, this.selectionName(d)));
      const size = selectionSize(d.scene, selectionItemIds(d));
      // 화면용 삼각형으로 잰 범위라 곡면은 실제보다 조금 작을 수 있어 근삿값(≈)으로 보인다. 정확한 지름은 면 고르기
      if (size)
        t.append(
          h('span', { class: 'mb-sub', title: '화면에 그리는 삼각형으로 잰 외형 크기입니다. 구멍·원기둥의 정확한 지름은 면 고르기로 확인하십시오.' }, h('span', {}, '크기'), ` ≈ ${fm.lenNum(size[0])} × ${fm.lenNum(size[1])} × ${fm.lenNum(size[2])}${fm.unit ? ` ${fm.unit}` : ''}`),
        );
    }
  }

  /** 측정 띠의 개체 측정 글: 안내, 첫 개체(이름·주요 치수), 결과(첫 줄 굵게, 나머지와 두 개체 이름) */
  private entityBarText(d: StepDoc, t: HTMLElement): void {
    const fm = this.fmt;
    const { picks, result } = d.ent;
    if (result && picks.length === 2) {
      const [first, ...rest] = result.lines;
      if (first) t.append(h('b', { class: 'mb-value' }, h('span', {}, first.label), ` ${lineValue(first, fm)}`));
      const sub: (Node | string)[] = [];
      for (const l of rest) sub.push(h('span', {}, l.label), ` ${lineValue(l, fm)} · `);
      sub.push(h('span', {}, picks[0]!.title), ' ↔ ', h('span', {}, picks[1]!.title));
      t.append(h('span', { class: 'mb-sub' }, ...sub));
      return;
    }
    const p = picks[0];
    if (p) {
      const main = p.face ? faceSummary(p.face, fm).main : p.edge && p.what === 'edge' ? edgeSummary(p.edge, fm).main : null;
      t.append(h('b', { class: 'mb-value' }, h('span', {}, p.title), main ? ` ${main}` : null));
    }
    t.append(h('span', { class: p ? 'mb-sub' : 'mb-hint' }, entityHint(picks.length, this.touch)));
  }

  /** 고른 것의 이름(고른 부품 카드 제목) */
  private selectionName(d: StepDoc): string {
    const node = d.selKey ? productAt(d.products, d.selKey) : null;
    if (node) {
      const n = nodeLabel(node);
      return `${n.name}${n.instance ? ` · ${n.instance}` : ''}`;
    }
    if (d.pick) {
      const m = d.scene.meshes.find((x) => x.id === d.pick!.id) ?? d.scene.lines.find((x) => x.id === d.pick!.id);
      return m?.name ?? d.pick.id;
    }
    return d.items?.label ?? '';
  }

  /** 상태 막대 오른쪽: 거리·측정 안내 또는 고른 것(이름) — 고른 면·모서리는 조각마다 따로 번역되게 덧붙인다 */
  private selectionText(d: StepDoc): string {
    const fm = this.fmt;
    if (d.measure) return `거리 ${fm.len(d.measure.distance)}`.trim();
    if (this.entMeasuring) return '개체 측정';
    if (this.measuring) return '측정: 두 점을 누르십시오';
    const node = d.selKey ? productAt(d.products, d.selKey) : null;
    if (node) {
      const n = nodeLabel(node);
      return `고른 것: ${n.name}${n.instance ? ` · ${n.instance}` : ''}`;
    }
    if (d.pick) {
      const pm = d.pmi.presentations.find((x) => x.id === d.pick!.id);
      if (pm) return `고른 PMI: ${pm.name || pmiTypeLabel(pm.type)}`;
      const m = d.scene.meshes.find((x) => x.id === d.pick!.id) ?? d.scene.lines.find((x) => x.id === d.pick!.id);
      return `고른 것: ${m?.name ?? d.pick.id}`;
    }
    if (d.items) return `고른 것: ${d.items.label}`;
    return '';
  }

  /** 고른 면·모서리 조각(종류 이름, 치수) — 측정 중이 아닐 때만 */
  private selectionDetail(d: StepDoc): string[] {
    const fm = this.fmt;
    if (this.entMeasuring) {
      const l = d.ent.result?.lines[0];
      return l ? [l.label, lineValue(l, fm)] : d.ent.picks.map((p) => p.title);
    }
    if (d.measure || this.measuring) return [];
    if (d.face) return [faceKindLabel(d.face.kind), ...(d.face.radius !== undefined ? [`R${fm.len(d.face.radius)}`] : [])];
    if (d.edge) return [edgeTitle(d.edge), d.edge.radius !== undefined ? `R${fm.len(d.edge.radius)}` : fm.len(d.edge.length)];
    return [];
  }

  // ───────────────────────── 자동 확인 ─────────────────────────

  get viewerRef(): Viewer3d | null {
    return this.viewer;
  }

  snapshot(): AppState {
    const d = this.doc;
    let triangles = 0;
    if (d) for (const m of d.scene.meshes) triangles += (m.indices ? m.indices.length : m.positions.length / 3) / 3;
    return {
      docName: d?.name ?? null,
      loading: !!this.loading,
      loaded: !!d && !this.loading,
      error: this.lastError,
      progress: this.loading?.fraction ?? (d ? 1 : 0),
      stage: this.loading?.stage ?? '',
      theme: this.theme,
      panelOpen: this.panel.open,
      panelTab: d?.panelTab ?? null,
      renderMode: this.renderMode,
      projection: this.projection,
      grid: this.gridOn,
      measuring: this.measuring,
      measureKind: this.measureKind,
      entity: this.entMeasuring && d ? { picks: d.ent.picks.map((p) => p.title), lines: (d.ent.result?.lines ?? []).map((l) => ({ label: l.label, unit: l.unit, value: l.value })) } : null,
      aiming: !!this.aim?.aiming,
      triangles: Math.round(triangles),
      meshes: d?.scene.meshes.length ?? 0,
      products: d ? d.products.map((p) => p.name) : [],
      warnings: d?.scene.warnings?.length ?? 0,
      selKey: d?.selKey ?? null,
      picked: d?.pick?.id ?? null,
      faceMode: this.faceMode,
      face: d?.face ? { kind: d.face.kind, stepId: d.face.stepId, area: d.face.area, boundarySegments: d.face.boundary.length / 6 } : null,
      edge: d?.edge ? { kind: d.edge.kind, stepId: d.edge.stepId, length: d.edge.length, radius: d.edge.radius ?? null, segments: d.edge.segCount } : null,
      lines: d?.scene.lines.length ?? 0,
      layers: d?.layers.length ?? 0,
      pmi: d?.pmi.presentations.length ?? 0,
      containers: d?.source?.containers ?? [],
      section: (() => {
        const st = this.viewer?.section;
        return st ? { axis: st.axis, t: st.t, position: st.position, flip: st.flip } : null;
      })(),
    };
  }

  /** 시작 주소 인자(?open=·?sample) 처리 */
  async start(): Promise<void> {
    void this.refreshRecent();
    // 홈 화면 앱: 오프라인 서비스 워커와 새 판 알림, 데스크톱 "연결 프로그램"으로 연 파일
    registerServiceWorker((apply) => this.toast('새 버전이 있습니다.', 'info', 60_000, { label: '새로 고침', run: apply }));
    consumeLaunchQueue((file) => void this.openFile(file));
    // 보기 링크(#view=…): 다음에 여는 문서에 적용, 문서가 열린 뒤 바뀌면 바로
    this.pendingView = decodeViewLink(location.hash);
    window.addEventListener('hashchange', () => {
      const link = decodeViewLink(location.hash);
      if (!link) return;
      if (this.doc && !this.loading) this.applyViewLink(link);
      else this.pendingView = link;
    });
    const q = parseStartQuery(location.search, location.href);
    if (q.openError) this.showError(q.openError);
    // 공유 받기(?recent=·?share-error=)는 한 번만: 주소에서 지운다(다시 읽어도 또 열지 않게)
    if (q.recent || q.shareError) history.replaceState(history.state, '', withoutOnceParams(location.href));
    if (q.shareError) this.toast(q.shareError === 'too-big' ? '공유한 파일이 60MB보다 커서 받지 못했습니다 — 파일 열기로 여십시오.' : '공유한 파일을 받지 못했습니다 — 파일 열기로 여십시오.', 'warn', 8000);
    if (q.recent) await this.openRecentId(q.recent);
    else if (q.open) await this.openUrl(q.open);
    else if (q.sample) await this.openSample();
    else {
      // 파일을 고르는 동안 해석 워커와 3D 보기(WebGL 문맥·셰이더 준비)를 미리 띄운다
      const warm = () => {
        this.client.warm();
        if (this.doc || this.loading) return;
        try {
          this.ensureViewer();
        } catch {
          /* WebGL2가 없으면 열 때 알기 쉬운 오류로 알린다 */
        }
      };
      const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(warm, { timeout: 2000 });
      else setTimeout(warm, 500);
    }
  }
}

/** 덮개 글이 그려질 틈을 준다 */
function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

/** 측정 기록에 한 줄(이 문서 동안 500줄까지) */
function logMeasure(d: StepDoc, r: MeasureRecord): void {
  d.measureLog.push(r);
  if (d.measureLog.length > 500) d.measureLog.shift();
}

/** 파일·클립보드로 나가는 글(DOM 밖이라 번역층이 못 바꾼다)을 지금 화면 언어로 */
function translateUi(ko: string): string {
  return translateCatalog(ko, document.documentElement.lang || 'ko');
}
