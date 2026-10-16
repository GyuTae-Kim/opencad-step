/**
 * 보기 도구 막대: 전체 보기·고른 부품 보기·표준 뷰·투영·그리기 모드·단면·격자·뷰 큐브·좌표축·면 고르기·측정·PNG 저장·패널.
 * 넓은 화면은 아이콘 + 글, 좁은 화면은 아이콘만 보이고 넘치면 가로로 스크롤한다(styles.css).
 */
import { VIEW_KEYS, VIEW_LABELS, type Projection, type RenderMode, type SectionAxis, type ViewName } from 'opencad-viewer3d';
import { h, iconButton } from './dom';
import type { IconName } from './icons';
import { VIEW_MENU, viewKeyOf } from './keys';
import { openMenu } from './menu';

export const SECTION_AXES: [SectionAxis | null, string][] = [
  [null, '끔'],
  ['x', 'X 단면(YZ 평면)'],
  ['y', 'Y 단면(ZX 평면)'],
  ['z', 'Z 단면(XY 평면)'],
];

export const RENDER_MODES: [RenderMode, string][] = [
  ['shaded', '음영'],
  ['shadedEdges', '음영 + 모서리'],
  ['wireframe', '와이어프레임'],
  ['xray', 'X-ray'],
];

/** 도구 막대가 부르는 앱 쪽 기능 */
export interface ToolbarHost {
  readonly hasDoc: boolean;
  /** 고른 제품(나무 마디·3D 고르기)이 있는지 */
  readonly hasSelection: boolean;
  readonly projection: Projection;
  readonly renderMode: RenderMode;
  readonly gridOn: boolean;
  readonly cubeOn: boolean;
  readonly axesOn: boolean;
  readonly measuring: boolean;
  readonly panelOpen: boolean;
  /** 면 고르기 모드 */
  readonly faceMode: boolean;
  /** 단면 축(꺼져 있으면 null) */
  readonly sectionAxis: SectionAxis | null;
  fit(): void;
  /** 고른 부품으로 맞춰 보기 */
  fitSelection(): void;
  setView(v: ViewName): void;
  setProjection(p: Projection): void;
  setRenderMode(m: RenderMode): void;
  toggleGrid(): void;
  toggleCube(): void;
  toggleAxes(): void;
  toggleMeasure(): void;
  toggleFaceMode(): void;
  /** 단면 축 고르기(null = 끄기) */
  setSectionAxis(axis: SectionAxis | null): void;
  savePng(): void;
  togglePanel(): void;
}

interface Tool {
  el: HTMLButtonElement;
  refresh: () => void;
}

export class Toolbar {
  readonly el: HTMLElement;
  private tools: Tool[] = [];

  constructor(private readonly host: ToolbarHost) {
    this.el = h('nav', { class: 'toolbar', role: 'toolbar', 'aria-label': '보기 도구' });
    const H = host;

    this.add('fit', '전체 보기', '전체 보기 (F)', () => H.fit());
    const focus = this.add('focus', '고른 부품 보기', '고른 부품으로 맞춰 보기 (제품 나무에서 마디를 두 번 눌러도 됩니다)', () => H.fitSelection(), () => {
      focus.el.disabled = !H.hasDoc || !H.hasSelection;
    });
    const keyHelp = Object.entries(VIEW_KEYS)
      .map(([k, v]) => `${k} ${VIEW_LABELS[v]}`)
      .join(' · ');
    const views = this.add('views', '표준 뷰', `표준 뷰 (${keyHelp})`, () =>
      openMenu(
        views.el,
        VIEW_MENU.map((v) => ({ label: VIEW_LABELS[v], hint: viewKeyOf(v), run: () => H.setView(v) })),
        '표준 뷰',
      ),
    );
    views.el.setAttribute('aria-haspopup', 'menu');
    views.el.setAttribute('aria-expanded', 'false');
    views.el.classList.add('has-menu');
    this.sep();

    const proj = this.add('perspective', '원근', '원근 / 평행 투영 바꾸기', () => H.setProjection(H.projection === 'perspective' ? 'orthographic' : 'perspective'), () => {
      const persp = H.projection === 'perspective';
      setLabel(proj.el, persp ? '원근' : '평행', persp ? 'perspective' : 'ortho');
      proj.el.title = persp ? '지금 원근 투영 — 눌러서 평행 투영으로' : '지금 평행 투영 — 눌러서 원근 투영으로';
    });
    const mode = this.add('shade', '음영 + 모서리', '그리기 모드: 음영 · 음영+모서리 · 와이어프레임 · X-ray', () =>
      openMenu(
        mode.el,
        RENDER_MODES.map(([m, label]) => ({ label, checked: H.renderMode === m, run: () => H.setRenderMode(m) })),
        '그리기 모드',
      ),
    () => setLabel(mode.el, RENDER_MODES.find(([m]) => m === H.renderMode)?.[1] ?? '그리기'));
    mode.el.setAttribute('aria-haspopup', 'menu');
    mode.el.setAttribute('aria-expanded', 'false');
    mode.el.classList.add('has-menu');
    const section = this.add(
      'section',
      '단면',
      '단면 보기: 축(X·Y·Z)에 수직인 평면으로 잘라 봅니다 — 위치 끌기·뒤집기는 3D 보기 위 막대에서',
      () =>
        openMenu(
          section.el,
          SECTION_AXES.map(([a, label]) => ({ label, checked: H.sectionAxis === a, run: () => H.setSectionAxis(a) })),
          '단면 보기',
        ),
      () => {
        const a = H.sectionAxis;
        setLabel(section.el, a ? `단면 ${a.toUpperCase()}` : '단면');
        section.el.classList.toggle('on', !!a);
        section.el.setAttribute('aria-pressed', String(!!a));
      },
    );
    section.el.setAttribute('aria-haspopup', 'menu');
    section.el.setAttribute('aria-expanded', 'false');
    section.el.classList.add('has-menu');
    this.sep();

    this.toggle('grid', '격자', '바닥 격자 (F7)', () => H.gridOn, () => H.toggleGrid());
    this.toggle('cube', '뷰 큐브', '뷰 큐브 보이기', () => H.cubeOn, () => H.toggleCube());
    this.toggle('axes', '좌표축', '좌표축 보이기', () => H.axesOn, () => H.toggleAxes());
    this.sep();
    this.toggle('face', '면 고르기', '누른 면(B-rep 면)을 골라 종류·넓이·법선을 보고 경계를 강조합니다 (Alt/⌥ + 누르기로도)', () => H.faceMode, () => H.toggleFaceMode());
    this.toggle('measure', '측정', '두 점 거리·dx·dy·dz 재기 (Esc = 지우기)', () => H.measuring, () => H.toggleMeasure());
    this.add('image', 'PNG 저장', '지금 화면을 PNG 그림으로 저장', () => H.savePng());
    this.sep();
    this.toggle('panel', '패널', '제품·정보 패널 열기/닫기', () => H.panelOpen, () => H.togglePanel());
    this.refresh();
  }

  /** 상태(켜짐·글·쓸 수 있음) 다시 그리기 */
  refresh(): void {
    for (const t of this.tools) {
      t.el.disabled = !this.host.hasDoc;
      t.refresh();
    }
  }

  private add(ic: IconName, label: string, title: string, run: () => void, refresh: () => void = () => {}): Tool {
    const el = iconButton(ic, label, { title, cls: 'tool' });
    el.addEventListener('click', run);
    const t = { el, refresh };
    this.tools.push(t);
    this.el.append(el);
    return t;
  }

  private toggle(ic: IconName, label: string, title: string, on: () => boolean, run: () => void): Tool {
    const t = this.add(ic, label, title, run, () => {
      const v = on();
      t.el.setAttribute('aria-pressed', String(v));
      t.el.classList.toggle('on', v);
    });
    return t;
  }

  private sep(): void {
    this.el.append(h('span', { class: 'tool-sep', 'aria-hidden': 'true' }));
  }
}

/** 단추 글(과 아이콘) 바꾸기 */
function setLabel(b: HTMLButtonElement, label: string, iconName?: IconName): void {
  const span = b.querySelector('.btn-label');
  if (span && span.textContent !== label) span.textContent = label;
  if (iconName && b.dataset.icon !== iconName) {
    b.dataset.icon = iconName;
    const old = b.querySelector('svg.icon');
    const tmp = iconButton(iconName, label);
    const svg = tmp.querySelector('svg.icon');
    if (old && svg) old.replaceWith(svg);
  }
}
