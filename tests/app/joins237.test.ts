// @vitest-environment jsdom
/**
 * 237차(WCAG 3.1.2 — 재발 막기, 235차 남은 일 「상태 막대 코드 조각 「: 」」): 코드가 화면 글 조각을 반각 문장부호로 이어 붙이는 자리의 감사 표(아래 JOINS — README 개발 절 237차 문단).
 * 번역층(site-kit translate·src/app/i18n.ts)은 한국어가 든 글만 옮긴다. 이은 글 하나가 통째 열쇠·틀에 맞으면 문장부호도 그 값의 꼴(사전 안 — 235차가 묶음마다 맞춤)이고,
 * 따로 넣은 글 조각(DOM 조각·join·push·삼항 조각)·템플릿 리터럴의 한글 없는 자리·` · `로 갈라 옮긴 글의 사이 글자는 코드가 쓴 꼴 그대로(사전 밖)다.
 * (가) 원문 셈: src의 .ts를 말 조각(문자열·템플릿 리터럴 — 주석·정규식 글 뺌)으로 읽어 이어 붙이는 자리를 파일·꼴·글자마다 세어 표와 같은지(새 자리가 생기면 표에 판정과 함께
 *     적어야 통과 — 236차 DRAGS 꼴). 코드 쌍점 조각(piece·join `': '`)은 0이다(중국어 쌍점은 모든 묶음에서 「：」 — 235차). 쉼표·괄호 조각은 고르지 않은 해석기 경고 까닭 목록(warnparts.ts)뿐.
 * (나) 고친 자리: 상태 막대의 이름 없는 PMI·고른 묶음은 있는 틀 「고른 PMI: {0}」·「고른 것: {0}」 하나로(새 열쇠 0 — 상태 막대는 앱 글 칸(211차)이라 잡은 종류·이름표도 옮김).
 *     다섯 언어에서 글이 그 틀 값 꼴이고 막대 말풍선(통째 글)과 같으며, 한국어 글은 조각을 이은 글과 바이트까지 같다(app.ts 원문을 잘라 돌림 — filecells209·latecells229 꼴).
 * (다) 사전 값만 고친 것(일본어): 사전 안 틀 ` · ` 둘(PMI 표 이름 버튼 말풍선 「{0}・＃{1}{2}・…」·아래 띠 「・{0}個」 — 사전 다수 ` · `), 「距離{0}」 둘(같은 측정의
 *     3D 보기 위 글 「距離 …」과 상태 막대가 갈림 — 이름 + 빈칸 + 값 32 : 2), 가상 커서 도움말 「…をTabで…」(키 이름 앞뒤 빈칸 15 : 1).
 * src의 모든 .ts를 소스 글로 읽는다(ci-guard 12번 — 화면 글을 이어 붙이는 줄을 바꾸면 이 시험도). 상태 막대 조각은 app.ts selectionText·updateStatus 고른 것 칸 줄을 자른다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, translate } from '../../site/i18n.mjs';
import { productAt } from '../../src/app/doc';
import { Fmt } from '../../src/app/display';
import { h } from '../../src/app/dom';
import { isolateText } from '../../src/app/ftext';
import { installLocalization } from '../../src/app/i18n';
import { measureLabelLines } from '../../src/app/measure';
import { pmiTypeLabel } from '../../src/app/pmiview';

const ROOT = join(__dirname, '../..');
const SRC_DIR = join(ROOT, 'src');
const tsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []))
    .sort();
/** src의 .ts(src 기준 경로 — 'app/app.ts') */
const SRC: [file: string, text: string][] = tsFiles(SRC_DIR).map((p) => [relative(SRC_DIR, p), readFileSync(p, 'utf8')]);

// ───────────────────────── (가) 원문 셈: 말 조각 읽기 ─────────────────────────

/** 문자열·템플릿 리터럴 하나(parts — 템플릿은 자리 값 사이 글 조각들, 문자열은 하나) */
type Lit = { at: number; end: number; parts: string[]; tmpl: boolean };
const REGEX_WORD = /(?:^|[^\w$])(?:return|typeof|case|in|of|void|delete|throw|else|do|yield|await|new)$/;

/** 원문을 말 조각으로 읽는다: 주석·정규식 글은 건너뛰고, 템플릿 리터럴 자리 값(`${…}`) 안의 문자열·템플릿도 따로 모은다 */
function literals(src: string): Lit[] {
  const out: Lit[] = [];
  const n = src.length;
  const regexAt = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j]!)) j--;
    const before = src.slice(Math.max(0, j - 7), j + 1);
    const c = before.slice(-1);
    // TS 아님 단언 뒤 나눗셈(`d.density! / 1000` — propsview.ts)은 정규식이 아니다
    if (c === '!' && /[\w$)\]]/.test(before.slice(-2, -1))) return false;
    return c === '' || '(,=:[!&|?{};+-*%<>~^}'.includes(c) || REGEX_WORD.test(before);
  };
  const skipRegex = (i: number): number => {
    let j = i + 1;
    let cls = false;
    for (; j < n; j++) {
      const c = src[j]!;
      if (c === '\\') j++;
      else if (c === '\n') return i + 1;
      else if (cls) cls = c !== ']';
      else if (c === '[') cls = true;
      else if (c === '/') break;
    }
    j++;
    while (j < n && /[a-z]/i.test(src[j]!)) j++;
    return j;
  };
  const template = (i: number): number => {
    const lit: Lit = { at: i, end: n, parts: [], tmpl: true };
    out.push(lit);
    let cur = '';
    let j = i + 1;
    while (j < n) {
      const c = src[j]!;
      if (c === '\\') {
        cur += src.slice(j, j + 2);
        j += 2;
      } else if (c === '`') {
        lit.parts.push(cur);
        lit.end = j + 1;
        return j + 1;
      } else if (c === '$' && src[j + 1] === '{') {
        lit.parts.push(cur);
        cur = '';
        j = code(j + 2, true);
      } else {
        cur += c;
        j++;
      }
    }
    lit.parts.push(cur);
    return n;
  };
  const code = (from: number, interp: boolean): number => {
    let i = from;
    let depth = 0;
    while (i < n) {
      const c = src[i]!;
      const d = src[i + 1];
      if (c === '/' && d === '/') {
        const e = src.indexOf('\n', i);
        i = e < 0 ? n : e;
      } else if (c === '/' && d === '*') {
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? n : e + 2;
      } else if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
        out.push({ at: i, end: j + 1, parts: [src.slice(i + 1, j)], tmpl: false });
        i = j + 1;
      } else if (c === '`') i = template(i);
      else if (c === '/' && regexAt(i)) i = skipRegex(i);
      else {
        if (interp && c === '{') depth++;
        else if (interp && c === '}') {
          if (!depth) return i + 1;
          depth--;
        }
        i++;
      }
    }
    return i;
  };
  code(0, false);
  return out;
}

/** 이어 붙이는 글자(빈칸까지 — 화면 글 사이에 쓰는 꼴). 「)」는 따로 넣는 조각만(템플릿 조각 끝의 「)」는 STEP 글·틀 끝이 많아 셈 밖) */
const GLYPHS = [': ', ', ', ' · ', ' → ', ' / ', ' — ', ' | ', ' › ', ' ('];
const PIECES = [...GLYPHS, ')'];
/** 비교·가르기 인자로 쓰는 부름(이어 붙이지 않음) */
const NOT_JOIN = /(?:split|includes|startsWith|endsWith|indexOf|lastIndexOf|replace|replaceAll|match|matchAll|test|search|has|get|delete|localeCompare)$/;

/**
 * 한 파일의 이어 붙이는 자리: piece(글자 하나뿐인 문자열을 배열·호출 인자·삼항 조각으로 — DOM 글 조각이면 번역층이 옮기지 않는다), join(그 글자로 잇기),
 * tmpl(자리 값이 있는 템플릿 리터럴의 한글 없는 조각이 그 글자로 시작하거나 끝남 — 한글이 든 조각은 통째 원문이라 사전 열쇠·틀이 꼴을 정함)
 */
function joinsOf(src: string): string[] {
  const out: string[] = [];
  for (const lit of literals(src)) {
    if (lit.parts.length === 1) {
      const s = lit.parts[0]!;
      if (!PIECES.includes(s)) continue;
      const before = src.slice(0, lit.at).trimEnd();
      const after = src.slice(lit.end).trimStart();
      const c = before.slice(-1);
      if (c === '(') {
        const name = /([\w$]+)\s*\($/.exec(before)?.[1] ?? '';
        if (name === 'join') {
          if (after[0] === ')') out.push(`join '${s}'`);
        } else if (!NOT_JOIN.test(name) && /^[,)]/.test(after)) out.push(`piece '${s}'`);
      } else if ((c === '[' || c === ',') && /^[,\])]/.test(after)) out.push(`piece '${s}'`);
      else if (c === '?' && !before.endsWith('??') && after[0] === ':') out.push(`piece '${s}'`);
      continue;
    }
    for (const q of lit.parts) {
      if (/[가-힣]/.test(q)) continue;
      const g = GLYPHS.find((x) => q.startsWith(x)) ?? GLYPHS.find((x) => q.endsWith(x));
      if (g) out.push(`tmpl '${g}'`);
    }
  }
  return out;
}

function joinCounts(files: [string, string][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [f, t] of files) for (const j of joinsOf(t)) out[`${f} ${j}`] = (out[`${f} ${j}`] ?? 0) + 1;
  return out;
}

/**
 * 감사 표(.runtime/r237 표 — README 개발 절 237차 문단): 파일·꼴·글자 → 자리 수. 판정 — 둠(사전 밖이지만 그 글자가 zh·ja 묶음 다수 꼴: ` · `는 ja·zh 사전 다수,
 * 화살표는 전각 꼴이 없는 언어 없는 글자), 뺌(파일 이름·주소·코드 이름·숫자·CSS·파일 글·화면 밖), 사전 안(이은 글이 열쇠·틀에 맞음), 고르지 않음(갈리지만 틀로 옮길 길이 작지 않음).
 * 237차에 고친 것: app.ts 상태 막대 piece `': '` 둘(이름 없는 PMI·고른 묶음 — 중국어 화면에서 같은 칸·말풍선의 「：」과 갈림) → 있는 틀 하나로(아래 (나)).
 */
const JOINS: Record<string, number> = {
  // 뺌: ZIP 안 파일 이름 목록(열기 오류 알림·ZIP 안내의 자리 값)과 그 끝 「, … +N」
  "archive.ts join ', '": 2,
  "archive.ts tmpl ', '": 1,
  // 뺌: PMI 값 글(공차 | 데이텀 — 파일 자료)
  "pmi.ts join ' | '": 1,
  // 뺌: STEP 속성 값 목록(파일 글)
  "props.ts join ', '": 2,
  // 고르지 않음(해석기 경고 까닭 목록을 잇는 자리 — warnparts.ts가 다시 가른다), 뺌(나무 이름 「이름 / 항목 이름」)
  "scene.ts join ', '": 1,
  "scene.ts tmpl ' / '": 1,
  // 뺌: CSS transform
  "app/aim.ts tmpl ', '": 1,
  // 둠: 상태 막대 고른 것 칸 · 자세히 · 측정 짝 · 잠금 안내(셋)와 측정 띠 면 정보 줄(하나)
  "app/app.ts piece ' · '": 4,
  // 둠: 스냅 짝 화살표(상태 막대·측정 띠)
  "app/app.ts piece ' → '": 2,
  // 뺌: 휴대폰 미디어 조건(CSS)
  "app/app.ts tmpl ', '": 1,
  // 둠: 최근 문서 「크기 · 때」, 뺌: 고른 것 「이름 · 자리 이름」(파일 이름 사이)
  "app/app.ts tmpl ' · '": 2,
  // 뺌: 받기 진행 「크기 / 크기」(숫자)
  "app/app.ts tmpl ' / '": 1,
  // 뺌: STEP 스키마 이름(코드 이름 — 상태 막대 칸·말풍선 「FILE_SCHEMA: …」), 나무 이름 「이름 / 항목」 둘. 둠: 「이름 · 선 형상 N」·상태 막대 시간 말풍선
  "app/doc.ts join ', '": 2,
  "app/doc.ts tmpl ' / '": 2,
  "app/doc.ts tmpl ' · '": 2,
  "app/doc.ts tmpl ': '": 1,
  // 둠: 측정 띠 개체 측정 값 「이름 값 · 」
  "app/entpick.ts tmpl ' · '": 1,
  // 뺌: 개발 추적 글(화면 밖)
  "app/exactbound.ts tmpl ': '": 2,
  // 뺌: 분해 손질 JSON 파일 글
  "app/explodefile.ts tmpl ': '": 1,
  // 뺌: CSS transform
  "app/explodetool.ts tmpl ', '": 1,
  // 뺌: 측정 기록 CSV 파일 글
  "app/export.ts tmpl ' ('": 2,
  // 뺌: 압축 꼴 「ZIP → gzip」(코드 이름)·파일 머리 값(파일 글), 사전 안: 크기 「{0} ({1} 바이트)」(zh·ja 「（」), 둠: 압축 칸 「ZIP · 항목 이름」
  "app/infoview.ts join ' → '": 1,
  "app/infoview.ts join ', '": 2,
  "app/infoview.ts tmpl ' ('": 1,
  "app/infoview.ts tmpl ' · '": 1,
  // 사전 안: 말풍선 「전체 보기 (F)」·「격리 풀기 (I)」(통째 열쇠 — 키 글 「 (…)」 227·228차 꼴)
  "app/keys.ts tmpl ' ('": 1,
  // 둠: 키보드 도움말 키 칸
  "app/keysnap.ts join ' · '": 3,
  "app/keysnap.ts tmpl ' · '": 1,
  // 둠: 측정 결과 축 길이 「dx … · dy … · dz …」
  "app/measure.ts tmpl ' · '": 2,
  // 둠: 패널 아래 띠·간섭 요약·레이어 이름 버튼 말풍선(사전 안 틀 셋 — 「 · #번호 · 선분 N」·「 · #번호 · 삼각형 N」·「 · N개」, 아래 (다) ` · ` 꼴), 스냅 짝 화살표. 뺌: 간섭 검사 진행 「N / M」
  "app/panelview.ts piece ' · '": 8,
  "app/panelview.ts piece ' → '": 1,
  "app/panelview.ts tmpl ' · '": 8,
  "app/panelview.ts tmpl ' / '": 1,
  // 뺌: 조립 경로 「›」·「이름 · 자리 이름」·밀도 「값 (파일 밀도 글)」(파일 글 칸)
  "app/partinfo.ts join ' › '": 1,
  "app/partinfo.ts tmpl ' · '": 1,
  "app/partinfo.ts tmpl ' ('": 1,
  // 둠: 겹친 것 고르기 목록 「#번호 · 이름」·「이름 · 자리 이름」
  "app/picklist.ts tmpl ' · '": 3,
  // 사전 안: PMI 표 이름 버튼 말풍선 둘(틀 「{0} · #{1}{2} · 누르면 강조(…)」 — 아래 (다)), 둠: 의미 PMI 칸 말풍선 「형식 이름 · #번호」·저장된 보기 말풍선
  "app/pmiview.ts tmpl ' · '": 4,
  // 둠: 물리 속성 관성 값·대화 상자 제목 「물리 속성 · 이름표」·닫힌/열린 수·재질 · 밀도
  "app/propsview.ts join ' · '": 2,
  "app/propsview.ts piece ' · '": 1,
  "app/propsview.ts tmpl ' · '": 2,
  // 뺌: CSS transform
  "app/sectionbar.ts tmpl ', '": 1,
  // 둠: 스냅 이름 「잠근 X축 · 모서리 위」·「… · 잠금」
  "app/snap.ts tmpl ' · '": 3,
  // 둠: 표준 뷰 말풍선 키 목록(틀 「표준 뷰 ({0})」의 자리 값)
  "app/toolbar.ts join ' · '": 1,
  // 둠: 스냅 이름 · 만남 자리
  "app/trackdir.ts tmpl ' · '": 1,
  // 둠: 나무 줄 말풍선 줄·「이름 · 바디 N」, 뺌: 나무 이름 · 자리 이름·「몸체 이름 / 항목 이름」(파일 이름 사이)
  "app/treeview.ts join ' · '": 1,
  "app/treeview.ts piece ' · '": 1,
  "app/treeview.ts tmpl ' / '": 1,
  "app/treeview.ts tmpl ' · '": 2,
  // 고르지 않음: 해석기 경고 까닭 목록 「… (까닭 2, 까닭 1)」 — 중국어·일본어 화면에서 반각 괄호·쉼표(사전은 「（」·zh 「，」·ja 「、」)지만 까닭 수·종류가 바뀌어
  // 한글 든 틀 하나로 못 옮긴다(한글 없는 목록 틀 「{0}, {1}」은 모든 쉼표 글을 잡는 짧은 앞머리 — ci-guard 9번 기호 열쇠와 같은 위험; README 남은 일 237차 줄)
  "app/warnparts.ts piece ' ('": 1,
  "app/warnparts.ts piece ', '": 1,
  "app/warnparts.ts piece ')'": 1,
};

describe('237차: 코드가 이어 붙이는 문장부호 자리(원문 셈)', () => {
  it('src의 이어 붙이는 자리가 감사 표와 같다 — 92자리(piece 20·join 19·tmpl 53), 새 자리는 판정과 함께 표에', () => {
    const got = joinCounts(SRC);
    expect(got).toEqual(JOINS);
    const sum = (kind: string) => Object.entries(got).filter(([k]) => k.includes(` ${kind} '`)).reduce((a, [, v]) => a + v, 0);
    expect([sum('piece'), sum('join'), sum('tmpl')]).toEqual([20, 19, 53]);
  });

  it('코드 쌍점 조각은 0이고(중국어 쌍점은 모든 묶음 「：」), 쉼표·괄호 조각은 고르지 않은 해석기 경고 까닭 목록뿐', () => {
    const got = Object.keys(joinCounts(SRC));
    expect(got.filter((k) => / (piece|join) ': '$/.test(k))).toEqual([]);
    expect(got.filter((k) => / piece '(, | \(|\))'$/.test(k))).toEqual(["app/warnparts.ts piece ' ('", "app/warnparts.ts piece ', '", "app/warnparts.ts piece ')'"]);
  });

  it('셈이 헛돌지 않는다: 조각 쌍점·템플릿 쌍점·join은 잡고, 가르기 인자·주석·객체 열쇠·한글 든 원문·정규식 글은 셈 밖', () => {
    expect(joinsOf("t.replaceChildren(...[h('span', {}, '고른 것'), ': ', h('span', {}, x)]);")).toEqual(["piece ': '"]);
    expect(joinsOf('const s = `${tr(a)}: ${b}`;')).toEqual(["tmpl ': '"]);
    expect(joinsOf("a.join(', '); a.split(', '); x.includes(' · ');")).toEqual(["join ', '"]);
    expect(joinsOf("// [a, ': ', b]\n/* [a, ' · ', b] */ const o = { ': ': 1 }; const t = `고른 것: ${x}`;")).toEqual([]);
    expect(joinsOf("const r = /'/g; const p = [x, ' · ', y]; const q = c ? ' — ' : '';")).toEqual(["piece ' · '", "piece ' — '"]);
    // 아님 단언 뒤 나눗셈을 정규식으로 읽으면 뒤 글이 어긋난다(고치기 전 셈에서 propsview.ts 조각 하나를 놓침)
    expect(joinsOf("const a = `${f.num(d.x! / 1000, 3)} g/cm³`; const p = [x, ' · ', y];")).toEqual(["piece ' · '"]);
  });
});

// ───────────────────────── (나) 고친 자리: 상태 막대 ─────────────────────────

const APP = readFileSync(join(SRC_DIR, 'app/app.ts'), 'utf8');
const cut = (re: RegExp): string => {
  const m = re.exec(APP)?.[1];
  if (!m) throw new Error(`app.ts에서 찾지 못함: ${re}`);
  return m;
};
const SEL_TEXT = cut(/\n {2}private selectionText\(d: StepDoc\): \(Node \| string\)\[\] \{\n([\s\S]*?)\n {2}\}\n/).replace(/(\w)!\./g, '$1.');
const STATUS_MAKE = cut(/\n\s*(this\.statusSel = h\('div', [^\n]*\);)\n/);
const STATUS_FILL = cut(/\n(\s*this\.statusSel\.replaceChildren\(\n[\s\S]*?\n\s*\);)\n/);
const STATUS_TITLE = cut(/\n\s*(this\.statusSel\.title = this\.statusSel\.textContent \?\? '';)\n/);

/** 상태 막대 고른 것 칸(앱이 만드는 칸 — data-i18n-ui·selectionText 조각·막대 말풍선) */
function status(d: object): HTMLElement {
  const self = { fmt: new Fmt('mm'), entMeasuring: false, measuring: false, ent: { pmiTypeLabel }, selectionName: () => '' };
  const sel = new Function('d', 'h', 'productAt', 'isolateText', SEL_TEXT).call(self, d, h, productAt, isolateText) as (Node | string)[];
  const bar: { statusSel?: HTMLElement } = {};
  new Function('h', STATUS_MAKE).call(bar, h);
  new Function('sel', 'detail', 'sp', 'lock', 'h', STATUS_FILL).call(bar, sel, [], null, null, h);
  new Function(STATUS_TITLE).call(bar);
  return bar.statusSel!;
}
const fill = (t: string, ...v: string[]): string => t.replace(/\{(\d+)\}/g, (_, i: string) => v[Number(i)] ?? '');

const PMI_KIND = 'ANNOTATION_CURVE_OCCURRENCE';
/** 고른 묶음 이름표(여러 개 고르기·이름 없는 PMI 묶음·레이어 — 이름은 FSI로 갇힘) */
const GROUPS = ['부품 2개', 'PMI 곡선 주석', `레이어 ${isolateText('L1')}`];
const doc = (o: object) => ({ measure: null, selKey: null, products: [], pick: null, pmi: { presentations: [] }, items: null, body: null, ...o });

describe('237차: 상태 막대 이름 없는 PMI·고른 묶음은 있는 틀 하나로(다섯 언어)', () => {
  it.each(['ko', 'en', 'ja', 'zh-CN', 'de'])('%s: 글은 틀 값 꼴이고 막대 말풍선과 같다(한국어 글은 그대로)', async (code) => {
    const cells = [
      status(doc({ pick: { id: 'p1', kind: 'line', point: [0, 0, 0] }, pmi: { presentations: [{ id: 'p1', name: '', type: PMI_KIND }] } })),
      ...GROUPS.map((label) => status(doc({ items: { ids: ['a', 'b'], label } }))),
    ];
    const root = h('div', {}, ...cells);
    document.body.append(root);
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(root);
    try {
      const kind = pmiTypeLabel(PMI_KIND);
      expect(kind).toBe('곡선 주석');
      const want =
        code === 'ko'
          ? [`고른 PMI: ${kind}`, ...GROUPS.map((g) => `고른 것: ${g}`)]
          : [fill(catalogs[code]!['고른 PMI: {0}']!, catalogs[code]![kind]!), ...GROUPS.map((g) => fill(catalogs[code]!['고른 것: {0}']!, translate(g, code)))];
      expect(cells.map((c) => c.textContent)).toEqual(want);
      // 막대 말풍선(번역 전 글 통째 — 211차)과 같은 꼴: 전에는 중국어 글만 조각 사이 반각 「: 」, 말풍선은 틀 값 「：」
      expect(cells.map((c) => c.title)).toEqual(want);
      if (code === 'zh-CN') for (const t of want) expect(t).toMatch(/：/);
      if (code !== 'ko') for (const t of want) expect(t).not.toMatch(/[가-힣]/);
    } finally {
      dispose();
      root.remove();
    }
  });
});

// ───────────────────────── (다) 사전 값만 고친 것(일본어) ─────────────────────────

describe('237차: 사전 안 틀·남은 일 둘의 일본어 꼴', () => {
  it('` · `가 든 틀의 일본어·중국어 값은 반각 ` · `(사전 다수) — PMI 표 이름 버튼 말풍선·아래 띠 「 · N개」, 일본어 「＃」 없음', () => {
    // 둔 것: 작성자 이름(값은 영문 이름 하나), 일본어 `· 무늬 {0}/{1}`·`· 법선 {0}`(앱이 그리지 않는 코어 개발 화면 글·쓰는 곳 없음 — 이번 감사는 src 이어 붙임)
    const KNOWN: Record<string, string[]> = { ja: ['김규태 · Sean Kim', '· 무늬 {0}/{1}', '· 법선 {0}'], 'zh-CN': ['김규태 · Sean Kim'] };
    for (const code of ['ja', 'zh-CN']) {
      const bad = Object.entries(catalogs[code]!)
        .filter(([k]) => (k.includes(' · ') || k.startsWith('· ')) && !KNOWN[code]!.includes(k))
        .filter(([, v]) => !(v.includes(' · ') || v.startsWith('· ')))
        .map(([k]) => k);
      expect(bad, code).toEqual([]);
      for (const k of KNOWN[code]!) expect(catalogs[code]![k], `${code} ${k}`).toBeTruthy();
    }
    expect(Object.entries(catalogs.ja!).filter(([, v]) => v.includes('＃')).map(([k]) => k)).toEqual([]);
    expect(catalogs.ja!['{0} · #{1}{2} · 누르면 강조(두 번 누르면 맞춰 보기)']).toBe('{0} · #{1}{2} · 押すと強調表示（ダブルクリックで合わせて表示）');
    expect(catalogs.ja!['· {0}개']).toBe('· {0}個');
  });

  it('같은 측정 거리는 상태 막대 틀(「거리 {0} {1}」)과 3D 보기 위 글(「거리」 + 빈칸 + 길이)이 네 언어에서 같다 — 일본어 「距離 …」', () => {
    const fm = new Fmt('mm');
    const m = { distance: 12.3456, dx: 1, dy: 2, dz: 3 };
    for (const code of ['en', 'ja', 'zh-CN', 'de']) {
      const bar = translate(`거리 ${fm.len(m.distance)}`.trim(), code);
      expect(bar, code).toBe(measureLabelLines(m, fm, (k) => translate(k, code))[0]);
    }
    expect([catalogs.ja!['거리 {0} {1}'], catalogs.ja!['거리 {0}{1}']]).toEqual(['距離 {0} {1}', '距離 {0}{1}']);
  });

  it('일본어 값의 키 이름(Tab·Enter·Esc·Shift·Alt/⌥·Ctrl/⌘+…)은 가나·한자와 빈칸으로 떨어진다(사전 15 : 1 — 가상 커서 도움말 「…を Tab で…」)', () => {
    const kana = '[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}ー]';
    const glued = new RegExp(`${kana}(?:Tab|Enter|Esc|Shift|Alt|Ctrl|Home|End|F7)|(?:Tab|Enter|Esc|Shift|Alt/⌥|⌥|Ctrl|Home|End|F7|\\+[A-Z])${kana}`, 'u');
    expect(Object.entries(catalogs.ja!).filter(([, v]) => glued.test(v)).map(([k]) => k)).toEqual([]);
    expect(catalogs.ja!['3D 보기를 Tab으로 고른 뒤 화살표를 누르면 가상 커서가 켜집니다. 마우스처럼 측정 점에 스냅하고 면·모서리를 고르며, 바뀔 때마다 화면 읽기 프로그램에 알립니다.']).toMatch(
      /^3Dビューを Tab で選んでから/,
    );
  });
});
