/**
 * 패널 본문 가운데 문서가 있어야 그리는 몫(223차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖. panel.ts에서 옮김):
 * 레이어 탭 본문(layersView — renderLayers), 제품 탭의 간섭 검사 묶음(interferenceView — interferenceSection), 아래 띠 줄(footView — renderFoot와
 * 고른 면·모서리·개체 측정 줄). 앱은 뷰어를 만들 때(app.ts ensureViewer — 조각을 받은 뒤) 나무 조각과 함께 패널에 넣고(`panel.kit`) 그다음에 문서를 보이므로
 * 패널이 이 모듈을 부를 때 조각은 늘 와 있다(받기 실패는 ensureViewer가 알리고 문서를 보이지 않는다 — 「받는 중」 길이 없다, 222차 속성 탭 꼴).
 * 코드는 panel.ts의 것을 글자 그대로 옮겼다(`this.host` → host). 고른 것이 바뀔 때 쌍 버튼 강조만 고치는 길(onSelection)은 패널에 남아 같은 markPair를 쓴다
 */
import { h, icon } from './dom';
import { fileSpan, isolateText } from './ftext';
import type { Fmt } from './display';
import { bodyTitle, productAt, type ProductNode, type StepDoc } from './doc';
import { isFullCircle, type EdgePick } from './edges';
import { faceKindLabel, type FacePick } from './faces';
import { fmtCount } from './format';
import { edgeSummary, edgeTitle, entityHint, faceSummary, lineValue, panelMeasureHint } from './measure';
import { interferenceLabel, markPair, pmiTypeLabel, type PanelHost } from './panel';
import { snapPair } from './snap';
import { nodeLabel } from './tree';
import { NO_LAYER } from './visibility';

/** 패널 묶음(panel.ts와 같은 꼴 — 제목 h3) */
const section = (title: string | (Node | string)[], ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, ...(typeof title === 'string' ? [title] : title)), ...children.filter((c): c is HTMLElement => !!c));

/**
 * 표 줄의 보이기 확인 칸을 라벨로 감싼다: 손가락 기기에서 라벨이 44×44 누르는 자리가 된다(styles.css `.cb-hit`).
 * 이름은 옆의 이름 단추(강조)가 따로 누르므로 라벨에 넣지 않고, 칸의 이름은 칸의 aria-label 그대로
 */
const cbHit = (cb: HTMLInputElement): HTMLElement => h('label', { class: 'cb-hit' }, cb);

/**
 * 제품 탭의 간섭 검사 묶음(panel.ts — 탭을 그릴 때와 진행·결과가 바뀔 때 갈아 끼운다).
 * fresh: 워커 알림으로 묶음을 갈아 끼울 때(onInterference). 그때 새로 붙는 오류 줄은 role=alert로 화면 읽기 프로그램이 읽게 한다(143차 — 전에는 role·aria-live 없는 새 줄이라
 * 「검사 중…」 뒤 아무것도 듣지 못했다. 쌍 수는 앱 알림 상자가 알린다). 탭을 다시 그릴 때(나무 펼치기·거르기·보이기)는 같은 오류를 다시 읽히지 않게 role 없이.
 * 패널이 닫혀 있으면 거짓(156차 — 오류는 알림 상자가 알리고, 다시 열 때 숨었던 줄이 한 번 더 읽히지 않게)
 */
export function interferenceView(d: StepDoc, host: PanelHost, fresh = false): HTMLElement {
  const st = d.interference!;
  const kids: HTMLElement[] = [];
  const clear = h('button', { type: 'button', class: 'btn small' }, st.running ? '멈추기' : '결과 지우기');
  clear.addEventListener('click', () => host.clearInterference());
  const count = st.total ? ` ${fmtCount(st.done)} / ${fmtCount(st.total)}` : '';
  if (st.running && !st.result) kids.push(h('p', { class: 'hint' }, h('span', {}, '검사 중…'), count));
  else if (st.error) kids.push(h('p', { class: 'hint', role: fresh && 'alert' }, h('span', {}, '검사하지 못했습니다:'), ` ${st.error}`));
  if (st.result) {
    const r = st.result;
    const f = host.fmt;
    const inside = r.pairs.filter((p) => p.inside).length;
    kids.push(
      h('p', { class: 'hint' }, h('span', {}, '범위가 겹친 쌍'), ` ${fmtCount(r.tested)} · `, h('span', {}, '간섭'), ` ${fmtCount(r.pairs.length)}`, ...(inside ? [' · ', h('span', {}, `안에 듦 ${fmtCount(inside)}`)] : []), ` · ${fmtCount(r.ms)} ms`),
    );
    // 쌍을 찾은 뒤 워커가 겹친 부피를 구하는 동안(쌍 목록은 먼저 보인다)
    if (st.running) kids.push(h('p', { class: 'hint' }, h('span', {}, '겹친 부피 계산 중…'), count));
    const LIMIT = 200;
    // 151차: 쌍 줄을 목록(role=list·listitem)으로 — 화면 읽기 프로그램이 쌍 수·차례를 읽는다(SKP 156차 꼴, ul·li가 아니라 스타일시트가 들지 않음).
    // 겹친 부피 줄이 없는 쌍은 이름 줄이 곧 항목, 있으면 두 줄을 한 항목 칸에 담는다(묶음은 블록이고 두 줄 선택자는 클래스뿐이라 모양 그대로)
    const items: HTMLElement[] = [];
    for (const p of r.pairs.slice(0, LIMIT)) {
      const label = interferenceLabel(d, p);
      const b = h('button', { type: 'button', class: 'link-btn', 'data-pair': label, title: p.inside ? '누르면 안쪽 부품을 강조하고 그것으로 맞춰 봅니다' : '누르면 교차하는 삼각형을 강조하고 두 부품으로 맞춰 봅니다' }, h('span', { translate: 'no' }, label));
      markPair(b, d.items?.label);
      b.addEventListener('click', () => host.showInterference(p));
      // 안에 든 쌍: 겉면이 만나지 않아 교차 삼각형 수 대신 "안에 듦"(앞이 안쪽 부품)
      const chip = p.inside ? h('span', { class: 'chip dim-chip', title: '앞 부품이 뒤 부품 안에 통째로 들었습니다(겉면은 만나지 않음)' }, '안에 듦') : h('span', { class: 'chip dim-chip', title: '교차하는 삼각형 쌍 수' }, fmtCount(p.count));
      const row = h('div', { class: `prop-row${p.volume === undefined ? '' : ' has-vol'}`, role: p.volume === undefined && 'listitem' }, b, chip);
      // 겹친 부피(두 그물이 닫힌 입체일 때 — 광선 표본 어림): 이름 아래 줄에, 어림 오차는 부피에 견준 몫을 유효 숫자 두 자리쯤으로(전체 값은 title)
      if (p.volume !== undefined) {
        const rel = p.volume && p.volumeErr ? (100 * p.volumeErr) / p.volume : 0;
        const text = `≈ ${f.vol(p.volume)}${rel > 0 ? ` ±${f.num(rel, Math.min(6, Math.max(1, 1 - Math.floor(Math.log10(rel)))))}%` : ''}`;
        items.push(h('div', { role: 'listitem' }, row, h('div', { class: 'vol-line', title: `겹친 부피 ≈ ${f.vol(p.volume)} ± ${f.vol(p.volumeErr ?? 0)}` }, h('span', {}, '겹친 부피'), ' ', h('span', { class: 'vol-val' }, text))));
      } else items.push(row);
    }
    if (items.length) kids.push(h('div', { role: 'list' }, ...items));
    // 140차: 자른 목록 밑에 남은 쌍 수(머리 줄의 「간섭」은 온 수 — 전에는 알리지 않았다)
    if (r.pairs.length > LIMIT) kids.push(h('p', { class: 'hint' }, `그 밖 ${fmtCount(r.pairs.length - LIMIT)}쌍은 목록에 넣지 않았습니다.`));
    if (inside) kids.push(h('p', { class: 'hint' }, '안에 든 부품은 바깥 부품에 가려 보이지 않을 수 있습니다 — X-ray 그리기나 나머지 흐리게로 보십시오.'));
    if (r.volumes?.done)
      kids.push(h('p', { class: 'hint' }, '겹친 부피(≈)는 화면 메시를 광선으로 훑은 어림값이고, ±는 어림 오차입니다.'));
    if (r.volumes?.left) kids.push(h('p', { class: 'hint' }, `시간 한도로 ${fmtCount(r.volumes.left)}쌍은 겹친 부피를 구하지 못했습니다.`));
    if (st.stopped) kids.push(h('p', { class: 'hint' }, '겹친 부피 계산을 멈췄습니다.'));
    if (!r.pairs.length) kids.push(h('p', { class: 'hint' }, '간섭을 찾지 못했습니다. 맞닿은 면·모서리는 간섭으로 치지 않습니다(닫히지 않은 면 모형은 안에 들었는지 보지 않습니다).'));
  }
  return section('간섭 검사', ...kids, h('div', { class: 'tree-tools' }, clear));
}

/** 레이어 탭 본문(패널이 본문에 붙인다) */
export function layersView(d: StepDoc, host: PanelHost): HTMLElement {
  const v = d.vis;
  const tools = h('div', { class: 'tree-tools' });
  const mk = (label: string, title: string, run: () => void) => {
    const b = h('button', { type: 'button', class: 'btn small', title }, label);
    b.addEventListener('click', run);
    tools.append(b);
  };
  mk('모두 켜기', '레이어를 모두 켭니다', () => host.setAllLayersVisible(true));
  mk('모두 끄기', '레이어를 모두 끕니다', () => host.setAllLayersVisible(false));
  const inLayer = new Set<string>();
  for (const l of d.layers) for (const id of l.itemIds) inLayer.add(id);
  const loose: string[] = [];
  for (const m of d.scene.meshes) if (!inLayer.has(m.id)) loose.push(m.id);
  for (const l of d.scene.lines) if (!inLayer.has(l.id)) loose.push(l.id);
  for (const p of d.scene.points ?? []) if (!inLayer.has(p.id)) loose.push(p.id);
  const tbody = h('tbody');
  // 파일 레이어의 이름·설명은 파일 글(번역하지 않음·방향 가둠·길이 한도 — ftext.ts). "(레이어 없음)"·그 설명은 화면 글
  const addRow = (idx: number, name: string, title: string, ids: string[], fileHidden: boolean, data = true) => {
    const on = v.layerOn(idx);
    const nm = data ? isolateText(name) : name;
    const cb = h('input', { type: 'checkbox', 'aria-label': `${nm} 레이어 보이기` });
    cb.checked = on;
    cb.addEventListener('change', () => host.setLayerVisible(idx, cb.checked));
    const label = `레이어 ${nm}`;
    const selected = d.items?.label === label;
    const tip = data ? isolateText(title) : title;
    // 182차(WCAG 4.1.2): 누르면 강조·다시 누르면 푸는 토글이라 강조(.sel)를 aria-pressed로도(전에는 화면 읽기에 강조가 드러나지 않았다 — PMI 이름 단추와 같은 꼴)
    const nameBtn = h('button', { type: 'button', class: `link-btn${selected ? ' sel' : ''}`, 'aria-pressed': String(selected), title: `${tip}${tip ? ' · ' : ''}누르면 이 레이어의 형상을 강조합니다(두 번 누르면 맞춰 보기)` }, data ? fileSpan(name) : h('span', {}, name));
    nameBtn.addEventListener('click', (ev) => {
      if (ev.detail === 2) host.selectItems(ids, label, true);
      else if (ev.detail <= 1) host.selectItems(selected ? null : ids, label);
    });
    tbody.append(
      h(
        'tr',
        { class: on ? '' : 'off' },
        h('td', {}, h('span', { class: 'check' }, cbHit(cb), nameBtn, fileHidden ? h('span', { class: 'chip dim-chip', title: '파일이 숨긴 레이어(INVISIBILITY)' }, '숨김') : null)),
        h('td', { class: 'num' }, fmtCount(ids.length)),
      ),
    );
  };
  d.layers.forEach((l, i) => addRow(i, l.name, l.description, l.itemIds, !l.visible));
  if (loose.length) addRow(NO_LAYER, '(레이어 없음)', '어느 레이어에도 들지 않은 형상', loose, false, false);
  return section(
    `레이어 ${fmtCount(d.layers.length)}개`,
    tools,
    h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '레이어'), h('th', { class: 'num' }, '항목'))), tbody),
    h('p', { class: 'hint' }, 'PRESENTATION_LAYER_ASSIGNMENT로 묶은 형상입니다. 파일이 숨긴 레이어는 처음에 꺼져 있습니다.'),
  );
}

/** 아래 띠 줄(고른 것·측정 결과 — 패널이 띠에 붙이고, 줄이 없으면 띠를 숨긴다) */
export function footView(d: StepDoc, host: PanelHost): HTMLElement[] {
  const lines: HTMLElement[] = [];
  const fm = host.fmt;
  const u = fm.unit;
  const p = d.pick;
  const fitBtn = (): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'btn small foot-fit', title: '고른 것으로 맞춰 보기' });
    b.append(icon('focus', 14), h('span', {}, '고른 부품 보기'));
    b.addEventListener('click', () => host.fitSelection());
    return b;
  };
  if (p) {
    const node = d.selKey ? productAt(d.products, d.selKey) : null;
    // 윤곽선(모서리) 고르기의 id는 그물 id
    const item = p.kind === 'mesh' || p.kind === 'edge' ? d.scene.meshes.find((m) => m.id === p.id) : p.kind === 'line' ? d.scene.lines.find((l) => l.id === p.id) : d.scene.points?.find((x) => x.id === p.id);
    const pm = d.pmi.presentations.find((x) => x.id === p.id);
    const what = pm ? '고른 PMI ' : '고른 것 ';
    // 이름·자리 이름은 파일 글(ftext.ts), PMI 종류는 화면 글
    const name = pm ? [pm.name ? fileSpan(pm.name) : h('span', {}, pmiTypeLabel(pm.type)), h('span', { class: 'dim' }, ' · ', h('span', {}, pmiTypeLabel(pm.type)))] : node ? nodeNames(node) : [item ? h('span', {}, bodyTitle(d.products, d.scene, p.id, isolateText)) : fileSpan(p.id)];
    lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, what), ...name), fitBtn()));
    // 점·법선 조각을 따로 번역되게 나눈다
    const at = `${p.section ? '단면(자른 면) 위 점' : p.kind === 'edge' ? '모서리 위 점' : '점'} ${fm.pt(p.point)} ${u}`.trim();
    lines.push(h('div', { class: 'dim' }, h('span', {}, at), ...(p.normal ? [' · ', h('span', {}, `법선 ${fm.dir(p.normal)}`)] : [])));
    if (d.face) lines.push(...faceLines(d.face, fm));
    else if (d.edge) lines.push(...edgeLines(d.edge, fm));
  } else if (d.selKey) {
    const node = productAt(d.products, d.selKey);
    if (node) lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 제품 '), ...nodeNames(node)), fitBtn()));
  } else if (d.items) {
    // 묶음 이름표의 파일 글(레이어·PMI·간섭 쌍 이름)은 FSI…PDI로 갇혀 번역층이 틀 그대로 끼운다(ftext.ts) — 길이 한도는 이름표를 만들 때
    // 211차: 이름표는 앱 글 칸(i18n.ts uiTranslate — 「PMI {0}」 틀이 의미 PMI 종류도 옮김)
    lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 것 '), h('span', { 'data-i18n-ui': '' }, d.items.label), h('span', { class: 'dim' }, ` · ${fmtCount(d.items.ids.length)}개`)), fitBtn()));
  } else if (d.body) {
    lines.push(h('div', { class: 'foot-sel' }, h('span', {}, h('b', {}, '고른 바디 '), h('span', {}, bodyTitle(d.products, d.scene, d.body, isolateText))), fitBtn()));
  }
  if (host.measuring && host.measureKind === 'entities') lines.push(...entityLines(d, fm, host.touch));
  else if (d.measure) {
    const m = d.measure;
    lines.push(h('div', {}, h('b', {}, '거리 '), fm.len(m.distance), h('span', { class: 'dim' }, ` · dx ${fm.lenNum(m.dx)} · dy ${fm.lenNum(m.dy)} · dz ${fm.lenNum(m.dz)}`)));
    const sp = snapPair(m);
    if (sp) lines.push(h('div', { class: 'dim' }, h('span', {}, sp[0]), ' → ', h('span', {}, sp[1])));
  } else if (host.measuring) lines.push(h('div', { class: 'dim' }, panelMeasureHint(host.touch)));
  return lines;
}

/** 나무 마디 이름(파일 글)과 다르면 " · 자리 이름"(파일 글) 조각. 이름·제품 번호가 모두 없으면 "(이름 없음)"은 화면 글 */
function nodeNames(n: ProductNode): HTMLElement[] {
  const l = nodeLabel(n);
  const name = n.name || n.productId ? fileSpan(l.name) : h('span', {}, l.name);
  return l.instance ? [name, h('span', { class: 'dim' }, ' · ', fileSpan(l.instance))] : [name];
}

/** 개체 측정 줄: 누른 개체(A·B — 이름과 주요 치수)와 결과(이름표 값), 아직이면 안내 */
function entityLines(d: StepDoc, f: Fmt, touch: boolean): HTMLElement[] {
  const { picks, result } = d.ent;
  const out: HTMLElement[] = [];
  picks.forEach((p, i) => {
    const main = p.face ? faceSummary(p.face, f).main : p.edge && p.what === 'edge' ? edgeSummary(p.edge, f).main : null;
    out.push(h('div', { class: 'foot-face' }, h('b', {}, i ? 'B ' : 'A '), h('span', {}, p.title), main ? h('span', { class: 'dim' }, ` ${main}`) : null));
  });
  if (result) for (const l of result.lines) out.push(h('div', {}, h('b', {}, l.label), ` ${lineValue(l, f)}`));
  else out.push(h('div', { class: 'dim' }, entityHint(picks.length, touch)));
  return out;
}

/** 고른 모서리 정보 줄: 종류·STEP 번호, 길이(곡선 적분)·지름·반지름·중심·축·호 각, 두 끝점 */
function edgeLines(ep: EdgePick, f: Fmt): HTMLElement[] {
  const out: HTMLElement[] = [h('div', { class: 'foot-face' }, h('b', {}, '고른 모서리 '), edgeTitle(ep), h('span', { class: 'dim' }, ` · #${ep.stepId} · 선분 ${fmtCount(ep.segCount)}`))];
  const geo: string[] = [`길이 ${f.len(ep.length)}`];
  if (ep.radius !== undefined) {
    if (ep.kind === 'circle') geo.push(`반지름 ${f.len(ep.radius)}`, `지름 ${f.len(ep.radius * 2)}`);
    else geo.push(`긴 반지름 ${f.len(ep.radius)}`);
  }
  if (ep.minorRadius !== undefined) geo.push(`짧은 반지름 ${f.len(ep.minorRadius)}`);
  if (ep.kind === 'circle' && !isFullCircle(ep) && ep.sweepDeg !== undefined) geo.push(`호 각 ${f.deg(ep.sweepDeg)}`);
  if (ep.center) geo.push(`중심 ${f.pt(ep.center)}`);
  if (ep.axis) geo.push(`축 ${f.dir(ep.axis)}`);
  out.push(h('div', { class: 'dim' }, ...geo.flatMap((g, i) => (i ? [' · ', h('span', {}, g)] : [h('span', {}, g)]))));
  if (!isFullCircle(ep)) out.push(h('div', { class: 'dim' }, h('span', {}, `시작 ${f.pt(ep.ends[0])}`), ' · ', h('span', {}, `끝 ${f.pt(ep.ends[1])}`)));
  return out;
}

/** 고른 면 정보 줄 */
function faceLines(fp: FacePick, f: Fmt): HTMLElement[] {
  const out: HTMLElement[] = [h('div', { class: 'foot-face' }, h('b', {}, '고른 면 '), faceKindLabel(fp.kind), h('span', { class: 'dim' }, ` · #${fp.stepId} · 삼각형 ${fmtCount(fp.triangles)}`))];
  const geo: string[] = [];
  if (fp.radius !== undefined) geo.push(`${fp.kind === 'torus' ? '큰 반지름' : '반지름'} ${f.len(fp.radius)}`);
  if (fp.minorRadius !== undefined) geo.push(`작은 반지름 ${f.len(fp.minorRadius)}`);
  if (fp.halfAngleDeg !== undefined) geo.push(`반각 ${f.deg(fp.halfAngleDeg)}`);
  if (fp.radius !== undefined && (fp.kind === 'cylinder' || fp.kind === 'sphere')) geo.push(`지름 ${f.len(fp.radius * 2)}`);
  if (fp.normal) geo.push(`법선 ${f.dir(fp.normal)}`);
  if (fp.axis) geo.push(`축 ${f.dir(fp.axis)}`);
  if (fp.origin && fp.kind !== 'plane') geo.push(`${fp.kind === 'sphere' || fp.kind === 'torus' ? '중심' : '축 위 점'} ${f.pt(fp.origin)}`);
  // 조각마다 따로 번역되게(반지름 …·지름 …·축 …) 글 마디를 나눈다
  if (geo.length) out.push(h('div', { class: 'dim' }, ...geo.flatMap((g, i) => (i ? [' · ', h('span', {}, g)] : [h('span', {}, g)]))));
  const approx = fp.exact ? '' : '≈ ';
  out.push(h('div', { class: 'dim', title: fp.exact ? null : '화면용 삼각형으로 잰 근삿값입니다(B-스플라인 등).' }, `넓이 ${approx}${f.area(fp.area)} · 둘레 ${approx}${f.len(fp.perimeter)}`));
  return out;
}
