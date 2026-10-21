/**
 * 보기 도구 막대: 전체 보기·고른 부품 보기·표준 뷰·투영·그리기 모드(외곽선·부품 색 구분·분해 보기 포함)·단면·격자·뷰 큐브·좌표축·면 고르기·측정·내보내기·패널.
 * 넓은 화면은 아이콘 + 글, 920px 이하는 아이콘만(styles.css).
 * 좁은 화면(760px 미만, 휴대폰)은 보기·측정 단추(전체 보기·표준 뷰·보기 설정·단면·면 고르기·측정·패널)만 한 줄에 두고,
 * 나머지(wide-only)는 "보기 설정" 메뉴(narrow-only)로 모은다.
 */
import { VIEW_KEYS, VIEW_LABELS, type Projection, type RenderMode, type SectionAxis, type ViewName } from 'opencad-viewer3d';
import { h, iconButton } from './dom';
import type { IconName } from './icons';
import { VIEW_MENU, viewKeyOf } from './keys';
import { openMenu, type MenuItem } from './menu';

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
  ['hiddenLine', '숨은선 제거'],
  ['monochrome', '단색'],
];

/** 도구 막대가 부르는 앱 쪽 기능 */
/**
 * 선 모드(와이어프레임·숨은선 제거): B-rep 모서리만 그려(삼각형 변 없음 — 코어 0.7.1 triangleEdges) 모서리가 없는 매끈한 면(원환 고리·구)이
 * 사라지지 않게 1화소 외곽선을 늘 그린다(코어 0.7.2 — 와이어프레임 외곽선, 1화소 굵기)
 */
export function isLineMode(m: RenderMode): boolean {
  return m === 'wireframe' || m === 'hiddenLine';
}

/** 코어 setRenderOptions의 profiles: 선 모드는 1화소(모서리와 같은 굵기), 그 밖은 사용자의 "외곽선 강조"(기본 굵기) */
export function profilesFor(m: RenderMode, user: boolean): boolean | { width: number } {
  return isLineMode(m) ? { width: 1 } : user;
}

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
  /** 단면 축(꺼져 있거나 면 단면이면 null) */
  readonly sectionAxis: SectionAxis | null;
  /** 단면이 켜져 있는지(면 단면 포함) */
  readonly sectionOn: boolean;
  /** 숨은선 모드에서 가려진 모서리를 흐린 점선으로 */
  readonly hiddenEdges: boolean;
  /** 외곽선(실루엣) 강조 */
  readonly profiles: boolean;
  /** 부품 색 구분 */
  readonly partColors: boolean;
  /** 분해 막대가 열려 있는지 */
  readonly explodeOpen: boolean;
  fit(): void;
  /** 고른 부품으로 맞춰 보기 */
  fitSelection(): void;
  setView(v: ViewName): void;
  /** 홈 뷰로, 지금 보기를 홈으로 */
  goHome(): void;
  setHome(): void;
  setProjection(p: Projection): void;
  setRenderMode(m: RenderMode): void;
  toggleHiddenEdges(): void;
  toggleProfiles(): void;
  togglePartColors(): void;
  toggleExplode(): void;
  toggleGrid(): void;
  toggleCube(): void;
  toggleAxes(): void;
  toggleMeasure(): void;
  toggleFaceMode(): void;
  /** 단면 축 고르기(null = 끄기) */
  setSectionAxis(axis: SectionAxis | null): void;
  savePng(): void;
  /** 내보내기 메뉴 항목(PNG·STL·OBJ·CSV 복사·보기 링크) */
  exportItems(): MenuItem[];
  togglePanel(): void;
}

interface Tool {
  el: HTMLButtonElement;
  refresh: () => void;
}

export class Toolbar {
  readonly el: HTMLElement;
  private tools: Tool[] = [];
  private moreBtn: HTMLButtonElement | null = null;

  constructor(private readonly host: ToolbarHost) {
    this.el = h('nav', { class: 'toolbar', role: 'toolbar', 'aria-label': '보기 도구' });
    const H = host;

    this.add('fit', '전체 보기', '전체 보기 (F)', () => H.fit());
    const focus = this.add('focus', '고른 부품 보기', '고른 부품으로 맞춰 보기 (제품 나무에서 마디를 두 번 눌러도 됩니다)', () => H.fitSelection(), () => {
      focus.el.disabled = !H.hasDoc || !H.hasSelection;
    }, 'wide-only');
    const keyHelp = Object.entries(VIEW_KEYS)
      .map(([k, v]) => `${k} ${VIEW_LABELS[v]}`)
      .join(' · ');
    const views = this.add('views', '표준 뷰', `표준 뷰 (${keyHelp})`, () =>
      openMenu(
        views.el,
        [
          { label: '홈 뷰', hint: 'Home', run: () => H.goHome() },
          ...VIEW_MENU.map((v, i): MenuItem => ({ label: VIEW_LABELS[v], hint: viewKeyOf(v), sep: i === 0, run: () => H.setView(v) })),
          { label: '지금 보기를 홈 뷰로', sep: true, run: () => H.setHome() },
        ],
        '표준 뷰',
      ),
    );
    views.el.setAttribute('aria-haspopup', 'menu');
    views.el.setAttribute('aria-expanded', 'false');
    views.el.classList.add('has-menu');
    const more = this.add('sliders', '보기 설정', '보기 설정', () => openMenu(more.el, this.moreItems(), '보기 설정'), undefined, 'narrow-only');
    this.moreBtn = more.el;
    more.el.setAttribute('aria-haspopup', 'menu');
    more.el.setAttribute('aria-expanded', 'false');
    more.el.classList.add('has-menu');
    this.sep();

    const proj = this.add('perspective', '원근', '원근 / 평행 투영 바꾸기', () => H.setProjection(H.projection === 'perspective' ? 'orthographic' : 'perspective'), () => {
      const persp = H.projection === 'perspective';
      setLabel(proj.el, persp ? '원근' : '평행', persp ? 'perspective' : 'ortho');
      proj.el.title = persp ? '지금 원근 투영 — 눌러서 평행 투영으로' : '지금 평행 투영 — 눌러서 원근 투영으로';
    }, 'wide-only');
    const mode = this.add('shade', '음영 + 모서리', '그리기 모드: 음영 · 음영+모서리 · 와이어프레임 · X-ray · 숨은선 제거 · 단색, 외곽선·부품 색 구분·분해 보기', () =>
      openMenu(
        mode.el,
        [...RENDER_MODES.map(([m, label]): MenuItem => ({ label, checked: H.renderMode === m, run: () => H.setRenderMode(m) })), ...this.displayItems()],
        '그리기 모드',
      ),
    () => setLabel(mode.el, RENDER_MODES.find(([m]) => m === H.renderMode)?.[1] ?? '그리기'), 'wide-only');
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
          SECTION_AXES.map(([a, label]) => ({ label, checked: a === null ? !H.sectionOn : H.sectionAxis === a, run: () => H.setSectionAxis(a) })),
          '단면 보기',
        ),
      () => {
        const a = H.sectionAxis;
        const on = H.sectionOn;
        setLabel(section.el, a ? `단면 ${a.toUpperCase()}` : on ? '단면 면' : '단면');
        section.el.classList.toggle('on', on);
        section.el.setAttribute('aria-pressed', String(on));
      },
    );
    section.el.setAttribute('aria-haspopup', 'menu');
    section.el.setAttribute('aria-expanded', 'false');
    section.el.classList.add('has-menu');
    this.sep('wide-only');

    this.toggle('grid', '격자', '바닥 격자 (F7)', () => H.gridOn, () => H.toggleGrid(), 'wide-only');
    this.toggle('cube', '뷰 큐브', '뷰 큐브 보이기', () => H.cubeOn, () => H.toggleCube(), 'wide-only');
    this.toggle('axes', '좌표축', '좌표축 보이기', () => H.axesOn, () => H.toggleAxes(), 'wide-only');
    this.sep();
    this.toggle('face', '면 고르기', '누른 면(B-rep 면)이나 모서리를 골라 종류·넓이·지름·길이를 보고 강조합니다 (면은 Alt/⌥ + 누르기로도)', () => H.faceMode, () => H.toggleFaceMode());
    this.toggle('measure', '측정', '두 점 거리·dx·dy·dz 재기 (Esc = 지우기)', () => H.measuring, () => H.toggleMeasure());
    const exp = this.add('image', '내보내기', '내보내기: PNG 그림(크게·투명 배경) · STL·OBJ(보이는 것·고른 것) · 측정 기록·PMI 표 CSV 복사 · 보기 링크 복사', () => openMenu(exp.el, H.exportItems(), '내보내기'), undefined, 'wide-only');
    exp.el.setAttribute('aria-haspopup', 'menu');
    exp.el.setAttribute('aria-expanded', 'false');
    exp.el.classList.add('has-menu');
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

  /** 좁은 화면의 보기 설정 메뉴: 넓은 화면 도구 막대에만 있는 단추(고른 부품 보기, 투영, 그리기 모드, 격자·뷰 큐브·좌표축, PNG) */
  private moreItems(): MenuItem[] {
    const H = this.host;
    return [
      { label: '고른 부품 보기', disabled: !H.hasSelection, run: () => H.fitSelection() },
      { label: '원근 투영', checked: H.projection === 'perspective', sep: true, run: () => H.setProjection('perspective') },
      { label: '평행 투영', checked: H.projection === 'orthographic', run: () => H.setProjection('orthographic') },
      ...RENDER_MODES.map(([m, label], i): MenuItem => ({ label, checked: H.renderMode === m, sep: i === 0, run: () => H.setRenderMode(m) })),
      ...this.displayItems(),
      { label: '격자', checked: H.gridOn, toggle: true, sep: true, run: () => H.toggleGrid() },
      { label: '뷰 큐브', checked: H.cubeOn, toggle: true, run: () => H.toggleCube() },
      { label: '좌표축', checked: H.axesOn, toggle: true, run: () => H.toggleAxes() },
      { label: 'PNG 저장', sep: true, run: () => H.savePng() },
      // 내보내기 메뉴는 같은 단추(보기 설정) 자리에 다시 연다
      { label: '내보내기…', run: () => openMenu(this.moreBtn!, H.exportItems(), '내보내기') },
    ];
  }

  /** 그리기 선택(그리기 모드 메뉴·보기 설정 메뉴): 숨은 모서리 점선(숨은선 모드에서만), 외곽선, 부품 색 구분, 분해 보기 */
  private displayItems(): MenuItem[] {
    const H = this.host;
    return [
      { label: '숨은 모서리 점선', checked: H.hiddenEdges, toggle: true, sep: true, disabled: H.renderMode !== 'hiddenLine', run: () => H.toggleHiddenEdges() },
      // 선 모드(와이어프레임·숨은선)는 1화소 외곽선을 늘 그린다(모서리 없는 매끈한 면이 사라지지 않게) — 켜진 채 잠근다
      { label: '외곽선 강조', checked: H.profiles || isLineMode(H.renderMode), toggle: true, disabled: isLineMode(H.renderMode), run: () => H.toggleProfiles() },
      { label: '부품 색 구분', checked: H.partColors, toggle: true, sep: true, run: () => H.togglePartColors() },
      { label: '분해 보기', checked: H.explodeOpen, toggle: true, run: () => H.toggleExplode() },
    ];
  }

  private add(ic: IconName, label: string, title: string, run: () => void, refresh: () => void = () => {}, cls = ''): Tool {
    const el = iconButton(ic, label, { title, cls: `tool ${cls}`.trim() });
    el.addEventListener('click', run);
    const t = { el, refresh };
    this.tools.push(t);
    this.el.append(el);
    return t;
  }

  private toggle(ic: IconName, label: string, title: string, on: () => boolean, run: () => void, cls = ''): Tool {
    const t = this.add(ic, label, title, run, () => {
      const v = on();
      t.el.setAttribute('aria-pressed', String(v));
      t.el.classList.toggle('on', v);
    }, cls);
    return t;
  }

  private sep(cls = ''): void {
    this.el.append(h('span', { class: `tool-sep ${cls}`.trim(), 'aria-hidden': 'true' }));
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
