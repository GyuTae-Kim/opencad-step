/**
 * 패널 속성 탭 본문(222차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖. panel.ts renderProps·physSection에서 옮김 — 속성 탭은 문서가 있어야 그린다):
 * 고른 부품의 부품 속성 줄(partinfo.ts — 이 모듈만 가져와 함께 뷰어 조각에)과 물리 속성 묶음(physics.ts — 53차부터 뷰어 조각: 부피·겉넓이·질량·무게중심·
 * 관성 모멘트·정확도·외형 크기, 재질 고르기·밀도 직접 입력). 앱은 뷰어를 만들 때(app.ts ensureViewer — 조각을 받은 뒤) 패널에 넣고 그다음에 문서를 보이므로
 * 패널이 이 모듈을 부를 때 조각은 늘 와 있다(받기 실패는 ensureViewer가 알리고 문서를 보이지 않는다).
 * 질량 속성 적분 진행(워커)에 따라 물리 속성 묶음만 고칠지 다시 그릴지의 판정(refresh)도 여기에 — 패널은 돌려받은 새 묶음을 제자리에 갈아 끼운다(초점 돌려주기는 panel.ts swap)
 */
import { h } from './dom';
import { fileSpan, isolateText } from './ftext';
import type { PanelHost } from './panel';
import { sceneMm } from './display';
import { selectRow } from './dialog';
import { bodyTitle, hasBodies, instanceCounts, meshById, productCountKey, productKeyOf, propsPendingFor, selectedBody, subtreeMeshIds, type StepDoc } from './doc';
import { fmtCount } from './format';
import { nodePath, partRows, type PropRow } from './partinfo';
import { accuracyText, inertiaText, MATERIALS, massText, meshNodes, physProps } from './physics';

/** 속성 탭의 물리 속성 묶음(질량 속성 적분 진행에 따라 그것만 고친다 — panel.ts onProps) */
export interface PhysView {
  /** 본문에 붙인 묶음 */
  readonly el: HTMLElement;
  /**
   * 질량 속성 적분 진행이 바뀜(워커): 계산 중이던 고른 것이 그대로 계산 중이면 끝낸 입체 수 글만 고치고 null,
   * 값이 다 왔거나 멈췄으면 다시 그린 새 묶음(패널이 갈아 끼운다 — 재질 고르기 칸 등 나머지는 그대로), 바뀐 것이 없으면 null
   */
  refresh(): PhysView | null;
}

/**
 * 속성 줄(파일 글은 번역하지 않는다 — 59차: 방향 가둠·길이 한도도). 167차: 이름 dt·값 dd — 묶음마다 줄들을 dl 하나에 넣어 화면 읽기가 이름과 값을
 * 짝으로 읽는다(WCAG 1.3.1, H40 — 전에는 span 둘이라 짝 없는 두 글). 줄 칸 div.prop-row·클래스는 그대로(dl 안 div 묶음은 HTML이 허용)
 */
const propRow = (r: PropRow): HTMLElement =>
  h('div', { class: 'prop-row' }, r.kData ? fileSpan(r.k, 'k', undefined, 'dt') : h('dt', { class: 'k' }, r.k), r.vData ? fileSpan(r.v, 'v', r.v, 'dd') : h('dd', { class: 'v', title: r.v }, r.v));

/** 패널 묶음(panel.ts와 같은 꼴 — 제목 h3) */
const section = (title: string | (Node | string)[], ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, ...(typeof title === 'string' ? [title] : title)), ...children.filter((c): c is HTMLElement => !!c));

/** 속성을 보일 나무 마디 열쇠: 나무에서 고른 마디, 아니면 3D에서 고른 그물(나무에서 고른 몸체)의 마디 */
function propsKey(d: StepDoc): string | null {
  if (d.selKey) return d.selKey;
  const id = d.pick?.id ?? (d.items ? null : d.body);
  return id ? productKeyOf(d.products, id) : null;
}

/** 속성 탭 본문: 본문에 차례로 붙일 묶음들과 그 안의 물리 속성 묶음(선 형상 몸체 안내면 null) */
export function propsView(d: StepDoc, host: PanelHost): { els: HTMLElement[]; phys: PhysView | null } {
  const els: HTMLElement[] = [];
  const key = propsKey(d);
  const path = key ? nodePath(d.products, key) : [];
  const node = path[path.length - 1];
  if (!node && !d.items) els.push(section('속성', h('p', { class: 'hint' }, '부품을 고르면(3D에서 누르거나 모델 트리에서) 그 부품의 속성을 보입니다. Ctrl·⌘·Shift를 누른 채 누르거나 "여러 개 고르기"를 켜면 여러 개를 고릅니다.')));
  else if (!node) els.push(section('속성', h('p', { class: 'hint' }, '여러 개를 골랐습니다 — 아래 물리 속성은 고른 것의 합입니다.')));
  else {
    const count = instanceCounts(d.info).get(productCountKey(node.name, node.productId)) ?? 1;
    els.push(section('부품 속성', h('dl', {}, ...partRows(path, host.fmt, count, isolateText).map(propRow))));
  }
  // 몸체 단위로 고른 몸체(나무 마디 대신 그물 하나): 부품 속성은 그 부품, 물리 속성은 그 몸체만. 선 형상 몸체는 물리 속성이 없다
  const pid = selectedBody(d);
  const all = node ? subtreeMeshIds(node) : null;
  const body = pid && all && all.length > 1 && all.includes(pid) ? meshById(d.scene, pid) : undefined;
  let phys: PhysView | null = null;
  if (body) phys = physSection(d, host, [body.id], bodyTitle(d.products, d.scene, body.id, isolateText));
  else if (pid && node?.lineIds?.includes(pid) && hasBodies(node))
    els.push(section('물리 속성', h('p', { class: 'hint' }, '선 형상에는 부피·질량이 없습니다 — 부품 줄을 고르면 부품의 물리 속성을 봅니다.')));
  else phys = physSection(d, host, all ?? (d.items ? d.items.ids : null), d.items && !node ? d.items.label : undefined);
  if (phys) els.push(phys.el);
  return { els, phys };
}

/** 물리 속성 묶음: 고른 부품(없으면 모형 전체)의 부피·겉넓이·질량·무게중심·외형 크기와 재질 고르기 */
function physSection(d: StepDoc, host: PanelHost, ids: string[] | null, multi?: string): PhysView {
  const f = host.fmt;
  const owner = meshNodes(d.products);
  const sel = ids ? new Set(ids) : null;
  // 질량 속성(곡면 적분)을 워커가 아직 구하는 중인 입체가 있으면 부피·질량·무게중심·관성은 "계산 중"
  const missing = propsPendingFor(d, sel);
  const waiting = missing && d.props.state === 'running';
  const pp = physProps(d.scene.meshes, sel, {
    faces: d.faces,
    sceneMm: sceneMm(d.scene.units),
    densityOf: (id) => owner.get(id)?.props?.density,
    picked: d.density,
  });
  const u = f.unit ? ` ${f.unit}` : '';
  const rows: HTMLElement[] = [];
  // 이름 dt·값 dd(167차 — 줄들은 묶음의 dl 하나에, propRow와 같은 꼴). 209차: 앱 말풍선(title)이 있는 값 칸은 번역하는 칸(값은 숫자·단위라 번역층이 바꾸지 않는다 —
  // translate=no면 사전에 있는 말풍선도 한국어로 남았다)
  const r = (k: string, v: string, title?: string) => rows.push(h('div', { class: 'prop-row' }, h('dt', { class: 'k' }, k), h('dd', { class: 'v', title: title ?? v, translate: title ? null : 'no' }, v)));
  // 계산 중인 값(번역되는 글이라 값 칸을 번역층에 맡긴다)
  const busy = (k: string) => rows.push(h('div', { class: 'prop-row pending' }, h('dt', { class: 'k' }, k), h('dd', { class: 'v' }, '계산 중…')));
  // 부피·질량·관성: B-rep 곡면 적분이 정확하면 그대로, 아니면 ≈(정확도 줄에 어림 오차)
  const ax = pp.exact ? '' : '≈ ';
  if (pp.closed) {
    if (waiting) busy('부피');
    else r('부피', `${ax}${f.vol(pp.volume)}`);
  }
  r('겉넓이', `${pp.areaExact ? '' : '≈ '}${f.area(pp.area)}`);
  if (pp.mass !== null) {
    if (waiting) busy('질량');
    else r('질량', `${ax}${massText(pp.mass, (v, dg) => f.num(v, dg))}`);
  }
  if (pp.centroid) {
    if (waiting) busy('무게중심');
    else r('무게중심', `${f.pt(pp.centroid)}${u}`);
  }
  // 관성 모멘트(무게중심 기준, 질량을 알 때만): 주 관성 모멘트 셋과 장면 축 대각 성분
  const it = waiting ? null : pp.inertia;
  if (waiting && pp.inertia) busy('주 관성 모멘트');
  if (it) {
    const t = (v: number) => inertiaText(v, (x, dg) => f.num(x, dg));
    r('주 관성 모멘트', `${ax}${it.principal.map(t).join(' · ')}`, `I1 · I2 · I3 (무게중심 기준, 작은 것부터)`);
    r('관성 Ixx · Iyy · Izz', `${ax}${it.tensor.slice(0, 3).map(t).join(' · ')}`);
  }
  // 정확도(번역되는 글이라 값 칸을 번역층에 맡긴다). 계산 중이면 끝낸 입체 수
  if (pp.closed) {
    const acc = waiting
      ? { text: `곡면 적분 계산 중(입체 ${fmtCount(d.props.done)}/${fmtCount(d.props.total)})`, title: '문서를 연 뒤 닫힌 입체의 부피·모멘트를 B-rep 곡면과 모서리 곡선에서 따로 적분하고 있습니다.' }
      : accuracyText(pp, (v, dg) => f.num(v, dg));
    rows.push(h('div', { class: `prop-row${waiting ? ' pending acc' : ''}` }, h('dt', { class: 'k' }, '정확도'), h('dd', { class: 'v', title: acc.title }, acc.text)));
  }
  const b = pp.bounds;
  if (b) r('외형 크기', `≈ ${f.lenNum(b.max[0] - b.min[0])} × ${f.lenNum(b.max[1] - b.min[1])} × ${f.lenNum(b.max[2] - b.min[2])}${u}`);
  r('닫힌 입체 · 열린 메시', `${fmtCount(pp.closed)} · ${fmtCount(pp.open)}`);
  const notes: (HTMLElement | null)[] = [];
  if (!pp.closed) notes.push(h('p', { class: 'hint' }, '닫힌 입체가 없어 부피·질량·무게중심을 구하지 못했습니다(열린 면·얇은 판).'));
  else if (pp.open) notes.push(h('p', { class: 'hint' }, '열린 메시(닫히지 않은 면)는 부피·질량에서 뺐습니다.'));
  if (pp.closed && pp.mass === null) notes.push(h('p', { class: 'hint' }, '파일에 밀도가 없습니다 — 아래에서 재질을 고르면 질량과 관성 모멘트를 보입니다.'));
  else if (pp.noDensity) notes.push(h('p', { class: 'hint' }, '밀도를 모르는 입체가 있어 질량에서 뺐습니다 — 재질을 고르면 함께 더합니다.'));
  if (pp.timedOut) notes.push(h('p', { class: 'hint' }, '파일이 커서 시간 한도를 넘은 입체는 곡면 적분 대신 화면용 삼각형으로 구했습니다.'));
  if (missing && d.props.state === 'stopped') notes.push(h('p', { class: 'hint' }, '다른 파일을 여느라 곡면 적분을 멈췄습니다 — 적분하지 못한 입체는 화면용 삼각형으로 잰 근삿값입니다. 이 파일을 다시 열면 다시 구합니다.'));
  // 재질 고르기(파일에 밀도가 없는 부품에 쓴다)
  const opts: [string, string][] = [['', '고르지 않음'], ...MATERIALS.map(([name, rho]): [string, string] => [String(rho), `${name} · ${f.num(rho / 1000, 2)} g/cm³`])];
  const cur = d.density === null ? '' : MATERIALS.some(([, rho]) => rho === d.density) ? String(d.density) : 'custom';
  if (cur === 'custom') opts.push(['custom', `${f.num(d.density! / 1000, 3)} g/cm³`]);
  const pick = selectRow('재질(밀도가 없는 부품)', opts, cur, (v) => {
    if (v !== 'custom') host.setDensity(v ? Number(v) : null);
  });
  // 밀도 직접 넣기(g/cm³)
  const inp = h('input', { type: 'number', class: 'dlg-input', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': '밀도 직접 입력(g/cm³)', placeholder: 'g/cm³' }) as HTMLInputElement;
  const shown = d.density === null ? '' : String(Number((d.density / 1000).toPrecision(6)));
  inp.value = shown;
  // 빈 칸은 밀도 지우기. 155차: 0·음수·읽지 못한 글(브라우저가 빈 글로 돌리고 badInput)은 전처럼 골라 둔 밀도를 말없이 지우지 않고 칸을 되돌려 알림 칸에 까닭(분해 거리 칸 꼴)
  inp.addEventListener('change', () => {
    const s = inp.value.replace(',', '.');
    const g = Number(s);
    if (inp.validity.badInput || (s && !(Number.isFinite(g) && g > 0))) {
      inp.value = shown;
      host.toast?.('밀도를 바꾸지 않았습니다 — 0보다 큰 수를 쳐 넣으십시오(g/cm³).', 'warn', 5000);
    } else host.setDensity(s ? g * 1000 : null);
  });
  const custom = h('label', { class: 'dlg-row' }, h('span', { class: 'dlg-label' }, '밀도 직접 입력(g/cm³)'), inp);
  const el = section(
    // 몸체 이름·묶음 이름표 안의 파일 글은 FSI…PDI로 갇혀(ftext.ts) 번역층이 그대로 둔다 — 화면 글("몸체 2"·"부품 3개")만 옮긴다
    multi ? [h('span', {}, '물리 속성'), ' · ', h('span', { 'data-i18n-ui': '' }, multi)] : ids ? '물리 속성' : '모형 전체 물리 속성',
    h('dl', {}, ...rows),
    ...notes,
    pick,
    custom,
    h(
      'p',
      { class: 'hint' },
      '부피·질량·무게중심·관성 모멘트는 B-rep 곡면과 모서리 곡선을 적분해 구합니다. 평면·원기둥·원뿔·구·원환과 회전·밀기·B-스플라인 곡면으로 된 입체는 정확합니다. 모서리 곡선이 곡면에서 조금 떨어져 있거나, 가중치가 있는 B-스플라인 곡면이나 적분하지 않는 곡면(오프셋 곡면 등)이 섞이면 그만큼 어림 오차를 ±로 보입니다. 외형 크기는 화면용 삼각형으로 잰 값(≈)입니다. 겉넓이는 B-rep 면 넓이의 합이며 근삿값이 섞이면 ≈를 붙입니다.',
    ),
  );
  return {
    el,
    refresh: () => {
      const still = propsPendingFor(d, sel) && d.props.state === 'running';
      if (still && waiting) {
        const v = el.querySelector('.prop-row.pending.acc .v');
        if (v) v.textContent = `곡면 적분 계산 중(입체 ${fmtCount(d.props.done)}/${fmtCount(d.props.total)})`;
        return null;
      }
      // 계산 중이 끝났거나(값이 왔거나 멈춤) 새로 계산 중이 되었을 때만 다시 그린다
      return still || waiting ? physSection(d, host, ids, multi) : null;
    },
  };
}
