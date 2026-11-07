/**
 * 패널 정보 탭 본문(59차 — 뷰어 조각 viewerkit.ts에 든다, 첫 화면 JS 밖. panel.ts renderInfo에서 옮김 — 정보 탭은 문서가 있어야 그린다):
 * 문서(파일·크기·압축·형식·읽은 시간·범위·삼각형), 파일 머리(FILE_NAME·만든 때·작성자·조직 … — 파일 글), 단위, 통계, 경고.
 * 파일 글 값(파일·압축 항목 이름·파일 머리)은 번역하지 않고 방향을 가두며 길이 한도(ftext.ts)
 */
import type { Fmt } from './display';
import { h } from './dom';
import { sceneCounts, schemaSummary, unitLabel, type StepDoc } from './doc';
import { formatBytes, formatMs, fmtCount } from './format';
import { fileSpan, isolateText } from './ftext';
import { warningNodes } from './warnparts';

const row = (k: string, v: string, title?: string): HTMLElement =>
  h('div', { class: 'prop-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v', title: title ?? v }, v));

/** 값이 파일 글인 줄. 값 앞에 화면 글(압축 종류)이 붙으면 lead */
const fileRow = (k: string, v: string, lead = ''): HTMLElement =>
  h('div', { class: 'prop-row' }, h('span', { class: 'k' }, k), lead ? h('span', { class: 'v', title: `${lead}${isolateText(v)}` }, lead, fileSpan(v)) : fileSpan(v, 'v', v));

const section = (title: string, ...children: (HTMLElement | null)[]): HTMLElement =>
  h('section', { class: 'prop-group' }, h('h3', {}, title), ...children.filter((c): c is HTMLElement => !!c));

/** 정보 탭 묶음들(패널 본문에 차례로 붙인다) */
export function infoView(d: StepDoc, f: Fmt): HTMLElement[] {
  const out: HTMLElement[] = [];
  const s = d.scene;
  const info = d.info;
  const u = unitLabel(s.units);
  const c = sceneCounts(s);
  const b = s.bounds;
  const docRows: HTMLElement[] = [
    fileRow('파일', d.name),
    row('크기', `${formatBytes(d.size)} (${fmtCount(d.size)} 바이트)`),
    row('형식', `STEP ${schemaSummary(info.schema)}`.trim()),
    row('읽은 시간', formatMs(d.openMs)),
  ];
  if (d.source) {
    const kinds = d.source.containers.map((k) => (k === 'zip' ? 'ZIP' : 'gzip')).join(' → ');
    docRows.splice(2, 0, d.source.entry ? fileRow('압축', d.source.entry, `${kinds} · `) : row('압축', kinds), row('푼 크기', `${formatBytes(d.source.size)} (압축 ${formatBytes(d.source.packedSize)})`));
  }
  if (b) {
    docRows.push(row('범위 크기', `${f.lenNum(b.max[0] - b.min[0])} × ${f.lenNum(b.max[1] - b.min[1])} × ${f.lenNum(b.max[2] - b.min[2])} ${f.unit}`.trim()));
    docRows.push(row('최소', f.pt(b.min)), row('최대', f.pt(b.max)));
  }
  docRows.push(row('삼각형', fmtCount(c.triangles), '놓인 자리를 모두 센 삼각형 수'));
  out.push(section('문서', ...docRows));

  const hd = info.header;
  if (hd) {
    const join = (a: string[]) => a.filter(Boolean).join(', ');
    // 파일 머리 값은 모두 파일 글(번역하지 않음·방향 가둠·길이 한도)
    const r: (HTMLElement | null)[] = [
      hd.name ? fileRow('FILE_NAME', hd.name) : null,
      hd.timeStamp ? fileRow('만든 때', hd.timeStamp) : null,
      join(hd.author) ? fileRow('작성자', join(hd.author)) : null,
      join(hd.organization) ? fileRow('조직', join(hd.organization)) : null,
      hd.preprocessorVersion ? fileRow('전처리기', hd.preprocessorVersion) : null,
      hd.originatingSystem ? fileRow('만든 프로그램', hd.originatingSystem) : null,
      hd.authorization ? fileRow('승인', hd.authorization) : null,
      join(hd.description) ? fileRow('FILE_DESCRIPTION', join(hd.description)) : null,
      hd.implementationLevel ? fileRow('구현 수준', hd.implementationLevel) : null,
      hd.schemas.length ? fileRow('FILE_SCHEMA', hd.schemas.join(', ')) : null,
    ];
    if (r.some(Boolean)) out.push(section('파일 머리', ...r));
  }

  out.push(section('단위', row('장면 단위', u || '모름'), row('파일 길이 단위', info.lengthUnit || '모름'), row('표시 단위', f.unit || '—'), row('소수 자리', String(f.decimals))));

  const st = info.stats;
  const statRows: HTMLElement[] = [];
  if (st) {
    statRows.push(row('솔리드', fmtCount(st.solids)), row('면', fmtCount(st.faces)));
    statRows.push(row('삼각화 못 한 면', fmtCount(st.failedFaces)));
    statRows.push(row('고유 삼각형', fmtCount(st.triangles), '같은 형상을 여러 번 놓아도 한 번만 센 삼각형 수'), row('인스턴스', fmtCount(st.instances)));
  }
  const pmiIds = new Set(d.pmi.presentations.map((p) => p.id));
  const curveSets = s.lines.filter((l) => !pmiIds.has(l.id)).length + (s.points?.length ?? 0);
  if (curveSets) statRows.push(row('선 형상 묶음', fmtCount(curveSets), '와이어프레임·곡선 형상(선·점 묶음)'));
  if (d.layers.length) statRows.push(row('레이어', fmtCount(d.layers.length)));
  if (d.pmi.presentations.length || d.pmi.semantic.length) statRows.push(row('PMI', `표현 ${fmtCount(d.pmi.presentations.length)} · 의미 ${fmtCount(d.pmi.semantic.length)}`));
  if (info.entityCount !== null) statRows.push(row('엔티티', fmtCount(info.entityCount)));
  if (st) statRows.push(row('구조 읽기', formatMs(st.parseMs)), row('삼각화', formatMs(st.meshMs)), row('해석 전체', formatMs(st.totalMs)));
  if (statRows.length) out.push(section('통계', ...statRows));

  const warns = s.warnings ?? [];
  if (warns.length) {
    const LIMIT = 300;
    out.push(
      section(
        `경고 ${fmtCount(warns.length)}개`,
        h('ul', { class: 'warn-list' }, ...warns.slice(0, LIMIT).map((w) => h('li', {}, ...warningNodes(w)))),
        warns.length > LIMIT ? h('p', { class: 'hint' }, `처음 ${LIMIT}개만 보입니다.`) : null,
      ),
    );
  } else out.push(section('경고', h('p', { class: 'hint' }, '해석기 경고가 없습니다.')));
  return out;
}
