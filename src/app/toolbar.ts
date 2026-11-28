/**
 * 보기 도구 막대: 전체 보기·고른 부품 보기·표준 뷰·투영·그리기 모드(외곽선·부품 색 구분·분해 보기 포함)·단면·격자·뷰 큐브·좌표축·고르기(단위·여러 개)·측정·내보내기·패널.
 * 넓은 화면은 아이콘 + 글, 920px 이하는 아이콘만(styles.css).
 * 좁은 화면(760px 미만, 휴대폰)은 보기·측정 단추(전체 보기·표준 뷰·보기 설정·단면·고르기·측정·패널)만 한 줄에 두고,
 * 나머지(wide-only)는 "보기 설정" 메뉴(narrow-only)로 모은다.
 */
import type { Projection, RenderMode, SectionAxis, ViewName, Viewer3d } from 'opencad-viewer3d';
import { h, iconButton } from './dom';
import type { PickUnit } from './doc';
import type { IconName } from './icons';
import { VIEW_KEYS, VIEW_LABELS, viewKeyOf } from 'opencad-viewer3d/viewkeys';
import { markKeys, outsideKeys, VIEW_MENU } from './keys';
import { openMenu, type MenuItem } from './menu';

export const SECTION_AXES: [SectionAxis | null, string][] = [
  [null, '끔'],
  ['x', 'X 단면(YZ 평면)'],
  ['y', 'Y 단면(ZX 평면)'],
  ['z', 'Z 단면(XY 평면)'],
];

/** 고르기 단위 메뉴: 단위, 메뉴 이름, 단추 이름 */
export const PICK_UNITS: [PickUnit, string, string][] = [
  ['part', '부품', '부품 고르기'],
  ['body', '바디', '바디 고르기'],
  ['face', '면·모서리', '면 고르기'],
];
const PICK_ICONS: Record<PickUnit, IconName> = { part: 'pick', body: 'body', face: 'face' };

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

/**
 * 좌표축 버튼(141차 — 도구 막대 "좌표축"·보기 설정 → 좌표축, 말풍선 「좌표축 보이기」): 왼쪽 아래 좌표축 표시(코어 setAxesVisible)와 함께 격자의 장면 안
 * X·Y축선(좌표축 글자와 같은 축 색)도 켜고 끈다 — 코어 0.113.0 setAxesStyle hidden(코어 앱 할 일 「좌표축 단추에서 둘을 함께 부른다」). 끄면 격자를 켠 채로도 축선 대신
 * 그 자리 격자선이고, 켜면 모양 없음(처음 뷰어와 같은 그림 — 같은 값이면 코어가 아무것도 하지 않음). 격자 버튼·새 장면에도 남는다(왼쪽 아래 표시처럼 뷰어가 든다)
 */
export function showAxes(v: Pick<Viewer3d, 'setAxesVisible' | 'setAxesStyle'>, on: boolean): void {
  v.setAxesVisible(on);
  v.setAxesStyle({ hidden: !on });
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
  /** 고르기 단위(부품·몸체·면 — 면은 면 고르기 모드) */
  readonly pickUnit: PickUnit;
  /** 여러 개 고르기(누를 때마다 더하고 빼기) */
  readonly multiPick: boolean;
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
  /** 주변 가림(62차 — 코어 0.49.0, 기본 끔) */
  readonly ambientOcclusion: boolean;
  /** 분해 막대가 열려 있는지 */
  readonly explodeOpen: boolean;
  /** 220차: 172차 설정 「3D 보기 밖에서도 한 글자 단축키」(없으면 켬 — 끄면 이 막대·메뉴 값에서 한 글자 키를 뺀다) */
  readonly lettersOutside?: boolean;
  fit(): void;
  /** 고른 부품으로 맞춰 보기 */
  fitSelection(): void;
  setView(v: ViewName): void;
  /** 홈 뷰로, 지금 보기를 홈으로 */
  goHome(): void;
  setHome(): void;
  /** 키보드로 3D 보기 다루기 도움말(62차 — 가상 커서 키 표, 뷰어가 있을 때만) */
  showKeyHelp?(): void;
  setProjection(p: Projection): void;
  setRenderMode(m: RenderMode): void;
  toggleHiddenEdges(): void;
  toggleProfiles(): void;
  togglePartColors(): void;
  toggleAmbientOcclusion(): void;
  toggleExplode(): void;
  toggleGrid(): void;
  toggleCube(): void;
  toggleAxes(): void;
  toggleMeasure(): void;
  setPickUnit(u: PickUnit): void;
  toggleMultiPick(): void;
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

  constructor(private readonly host: ToolbarHost) {
    // role=toolbar가 nav의 navigation을 덮어 랜드마크가 아니다 — 제목 막대 header(banner)가 이 id를 aria-owns로 품는다(175차, app.ts)
    this.el = h('nav', { class: 'toolbar', role: 'toolbar', 'aria-label': '보기 도구', id: 'view-tools' });
    const H = host;

    // 219차(WCAG 4.1.2): 말풍선이 말하는 키 가운데 이 버튼과 같은 일을 하는 앱 키를 단축키로 알린다(218차 캔버스 값과 같은 꼴 — F는 코어 handleKey의 fit, 격자 F7은 keys.ts grid).
    // 표준 뷰(1~7 — 메뉴 항목의 일)·측정(Esc — 지우기)·고르기(누르기 수정 키)는 같은 일이 아니라 달지 않는다.
    // 220차: 172차 설정을 끄면 F는 3D 보기 안에서만 들어 값에서 뺀다(다시 그릴 때마다 — 앱이 설정을 바꾸면 다시 그린다). 221차: 말풍선도 「(F)」 없이
    const fit = this.add('fit', '전체 보기', '전체 보기 (F)', () => H.fit(), () => markKeys(fit.el, 'F', H.lettersOutside !== false, '전체 보기'));
    const focus = this.add('focus', '고른 부품 보기', '고른 부품으로 맞춰 보기 (모델 트리에서 마디를 두 번 눌러도 됩니다)', () => H.fitSelection(), () => {
      focus.el.disabled = !H.hasDoc || !H.hasSelection;
    }, 'wide-only');
    const keyHelp = Object.entries(VIEW_KEYS)
      .map(([k, v]) => `${k} ${VIEW_LABELS[v]}`)
      .join(' · ');
    // 221차: 말풍선의 뷰 키 1~7도 172차 설정을 끄면 뺀다(메뉴 키 글·값과 같이 — 그동안 3D 보기 밖에서는 듣지 않음)
    const views = this.add('views', '표준 뷰', `표준 뷰 (${keyHelp})`, () =>
      openMenu(
        views.el,
        [
          // 220차: 키 글이 보이는 항목에 같은 일을 하는 앱 키(Home → goHome, 1~7 → 코어 setView — 끄면 한 글자 키는 뺌)
          { label: '홈 뷰', hint: 'Home', keys: 'Home', run: () => H.goHome() },
          ...VIEW_MENU.map((v, i): MenuItem => {
            const k = viewKeyOf(v);
            return { label: VIEW_LABELS[v], hint: k, keys: k && outsideKeys(k, H.lettersOutside !== false), sep: i === 0, run: () => H.setView(v) };
          }),
          { label: '지금 보기를 홈 뷰로', sep: true, run: () => H.setHome() },
          ...(H.showKeyHelp ? [{ label: '키보드로 3D 보기 다루기', run: () => H.showKeyHelp!() }] : []),
        ],
        '표준 뷰',
      ),
      () => views.el.setAttribute('title', H.lettersOutside !== false ? `표준 뷰 (${keyHelp})` : '표준 뷰'),
    );
    views.el.setAttribute('aria-haspopup', 'menu');
    views.el.setAttribute('aria-expanded', 'false');
    views.el.classList.add('has-menu');
    const more = this.add('sliders', '보기 설정', '보기 설정', () => openMenu(more.el, this.moreItems(more.el), '보기 설정'), undefined, 'narrow-only');
    more.el.setAttribute('aria-haspopup', 'menu');
    more.el.setAttribute('aria-expanded', 'false');
    more.el.classList.add('has-menu');
    this.sep();

    const proj = this.add('perspective', '원근', '원근 / 평행 투영 바꾸기', () => H.setProjection(H.projection === 'perspective' ? 'orthographic' : 'perspective'), () => {
      const persp = H.projection === 'perspective';
      setLabel(proj.el, persp ? '원근' : '평행', persp ? 'perspective' : 'ortho');
      proj.el.title = persp ? '지금 원근 투영 — 눌러서 평행 투영으로' : '지금 평행 투영 — 눌러서 원근 투영으로';
    }, 'wide-only');
    const mode = this.add('shade', '음영 + 모서리', '그리기 모드: 음영 · 음영+모서리 · 와이어프레임 · X-ray · 숨은선 제거 · 단색, 외곽선·부품 색 구분·분해 보기', () => this.modeMenu(mode.el),
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

    this.toggle('grid', '격자', '바닥 격자 (F7)', () => H.gridOn, () => H.toggleGrid(), 'wide-only').el.setAttribute('aria-keyshortcuts', 'F7');
    this.toggle('cube', '뷰 큐브', '뷰 큐브 보이기', () => H.cubeOn, () => H.toggleCube(), 'wide-only');
    this.toggle('axes', '좌표축', '좌표축 보이기', () => H.axesOn, () => H.toggleAxes(), 'wide-only');
    this.sep();
    // 고르기 단위(부품·몸체·면·모서리)와 여러 개 고르기 — 면·모서리는 예전 "면 고르기" 단추와 같다
    const pick = this.add(
      'pick',
      '부품 고르기',
      '고르기 단위: 부품 · 바디(한 부품 안의 입체 하나) · 면·모서리(종류·넓이·지름·길이 — Alt/⌥ + 누르기로도), 여러 개 고르기(Ctrl·⌘·Shift + 누르기로도)',
      () =>
        openMenu(
          pick.el,
          [
            ...PICK_UNITS.map(([u, label]): MenuItem => ({ label, ...(u === 'face' ? { hint: 'Alt' } : {}), checked: H.pickUnit === u, run: () => H.setPickUnit(u) })),
            { label: '여러 개 고르기', checked: H.multiPick, toggle: true, sep: true, disabled: H.pickUnit === 'face', run: () => H.toggleMultiPick() },
          ],
          '고르기',
        ),
      () => {
        const u = H.pickUnit;
        setLabel(pick.el, PICK_UNITS.find(([x]) => x === u)![2], PICK_ICONS[u]);
        pick.el.classList.toggle('on', u !== 'part' || H.multiPick);
      },
    );
    pick.el.setAttribute('aria-haspopup', 'menu');
    pick.el.setAttribute('aria-expanded', 'false');
    pick.el.classList.add('has-menu');
    this.toggle('measure', '측정', '두 점 거리·dx·dy·dz 재기 — 축·모서리와 나란한 방향에 붙고 Shift·화살표로 방향 잠금 (Esc = 지우기)', () => H.measuring, () => H.toggleMeasure());
    const exp = this.add('image', '내보내기', '내보내기: PNG 그림(크게·투명 배경) · STL·OBJ(보이는 것·고른 것) · 측정 기록·PMI 표 CSV 복사 · 보기 링크 복사', () => openMenu(exp.el, H.exportItems(), '내보내기'), undefined, 'wide-only');
    exp.el.setAttribute('aria-haspopup', 'menu');
    exp.el.setAttribute('aria-expanded', 'false');
    exp.el.classList.add('has-menu');
    this.sep();
    // 200차(WCAG 4.1.2): 열고 닫는 패널(panel.ts aside — id는 187차)을 조절 대상으로 가리킨다. 상태는 183차 결정대로 눌림만(펼침은 두지 않음)
    this.toggle('panel', '패널', '제품·정보 패널 열기/닫기', () => H.panelOpen, () => H.togglePanel()).el.setAttribute('aria-controls', 'panel');
    this.refresh();
  }

  /** 상태(켜짐·글·쓸 수 있음) 다시 그리기 */
  refresh(): void {
    for (const t of this.tools) {
      t.el.disabled = !this.host.hasDoc;
      t.refresh();
    }
  }

  /**
   * 좁은 화면의 보기 설정 메뉴: 넓은 화면 도구 막대에만 있는 단추(고른 부품 보기, 투영, 그리기 모드, 격자·뷰 큐브·좌표축, PNG·내보내기)를 막대와 같은 차례로.
   * 그리기 모드(여섯 모드와 외곽선·부품 색 구분·분해 보기 — 넓은 화면 그리기 모드 단추의 메뉴와 같은 열 항목)는 "그리기 모드…"를 고르면 같은 단추 자리에
   * 다시 연다(51차 — 내보내기…와 같은 꼴). 전에는 열여덟 항목을 한 메뉴에 펴서 손가락 기기(44px 줄)에서는 375×812에서도 화면보다 길어 아래 항목은
   * 메뉴 안에서 굴려야 닿았다(Apple HIG 메뉴: 너무 길면 나누거나 하위 메뉴로 줄인다). 이제 아홉 항목이라 320×568에서도 다 보인다
   */
  private moreItems(at: HTMLElement): MenuItem[] {
    const H = this.host;
    return [
      { label: '고른 부품 보기', disabled: !H.hasSelection, run: () => H.fitSelection() },
      { label: '원근 투영', checked: H.projection === 'perspective', sep: true, run: () => H.setProjection('perspective') },
      { label: '평행 투영', checked: H.projection === 'orthographic', run: () => H.setProjection('orthographic') },
      { label: '그리기 모드…', sep: true, run: () => this.modeMenu(at) },
      { label: '격자', checked: H.gridOn, toggle: true, sep: true, run: () => H.toggleGrid() },
      { label: '뷰 큐브', checked: H.cubeOn, toggle: true, run: () => H.toggleCube() },
      { label: '좌표축', checked: H.axesOn, toggle: true, run: () => H.toggleAxes() },
      { label: 'PNG 저장', sep: true, run: () => H.savePng() },
      // 내보내기 메뉴도 같은 단추(보기 설정) 자리에 다시 연다
      { label: '내보내기…', run: () => openMenu(at, H.exportItems(), '내보내기') },
    ];
  }

  /**
   * 그리기 모드 메뉴(넓은 화면 그리기 모드 단추, 좁은 화면 보기 설정 메뉴의 "그리기 모드…"): 여섯 모드, 숨은 모서리 점선(숨은선 모드에서만),
   * 외곽선, 주변 가림(62차 — 음영 계열 모드에서만 그린다), 부품 색 구분, 분해 보기
   */
  private modeMenu(at: HTMLElement): void {
    const H = this.host;
    const noAo = isLineMode(H.renderMode) || H.renderMode === 'xray';
    openMenu(at, [
      ...RENDER_MODES.map(([m, label]): MenuItem => ({ label, checked: H.renderMode === m, run: () => H.setRenderMode(m) })),
      { label: '숨은 모서리 점선', checked: H.hiddenEdges, toggle: true, sep: true, disabled: H.renderMode !== 'hiddenLine', run: () => H.toggleHiddenEdges() },
      // 선 모드(와이어프레임·숨은선)는 1화소 외곽선을 늘 그린다(모서리 없는 매끈한 면이 사라지지 않게) — 켜진 채 잠근다
      { label: '외곽선 강조', checked: H.profiles || isLineMode(H.renderMode), toggle: true, disabled: isLineMode(H.renderMode), run: () => H.toggleProfiles() },
      // 코어는 와이어프레임·X-ray·숨은선에서 가림을 그리지 않는다 — 그 모드에서는 끈 채 잠근다(켜 둔 값은 음영으로 돌아오면 그대로)
      { label: '주변 가림', checked: H.ambientOcclusion && !noAo, toggle: true, disabled: noAo, run: () => H.toggleAmbientOcclusion() },
      { label: '부품 색 구분', checked: H.partColors, toggle: true, sep: true, run: () => H.togglePartColors() },
      { label: '분해 보기', checked: H.explodeOpen, toggle: true, run: () => H.toggleExplode() },
    ], '그리기 모드');
  }

  private add(ic: IconName, label: string, title: string, run: () => void, refresh: () => void = () => {}, cls = ''): Tool {
    const el = iconButton(ic, label, { title, cls: `tool ${cls}`.trim() });
    // 패널을 닫으면 초점을 돌려줄 단추를 찾는 이름(keynav.ts — 53차)
    el.dataset.tool = ic;
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
