#!/usr/bin/env node
/**
 * 두 훑기 결과 비교: 같은 내용(sha256)·같은 품질끼리 짝지어 분류가 바뀐 파일, 지표가 바뀐 파일, 새 예외를 보인다.
 *
 *   npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--paths] [--json] [--fail-on-change]
 *
 * 출력은 해시 앞 12자만 쓴다(그대로 PR에 붙여도 경로가 나가지 않게). --paths는 로컬 경로를 함께 보인다.
 * --fail-on-change면 바뀐 것이 하나라도 있을 때 1로 끝난다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCEPTION_CLASSES, summarizeQuality } from './summary.mjs';

/** 짝 하나에서 비교하는 값(이름 → 기록에서 꺼내기). 한쪽에 없는 값(오류 기록, 옛 도구 결과)은 비교하지 않는다 */
export const METRICS = {
  failedFaces: (r) => r.failedFaces,
  windingSolids: (r) => r.q?.windingSolids,
  windingEdges: (r) => r.q?.windingEdges,
  negativeVolumeSolids: (r) => r.q?.negativeVolumeSolids,
  openShells: (r) => r.q?.openShells,
  foldedTriangles: (r) => r.q?.foldedTriangles,
  foldedMaxRatio: (r) => r.q?.foldedMaxRatio,
  areaMismatchFaces: (r) => r.q?.areaMismatchFaces,
  nonFinite: (r) => r.q?.nonFinite,
  solids: (r) => r.q?.solids,
  triangles: (r) => r.triangles,
};
/** 순위를 매길 때 무게(분류·예외 다음) */
const WEIGHT = { failedFaces: 50, windingSolids: 40, negativeVolumeSolids: 40, openShells: 30, nonFinite: 30, solids: 20, windingEdges: 10, foldedMaxRatio: 10, foldedTriangles: 5, areaMismatchFaces: 5, triangles: 1 };
/** 요약에서 전·후를 나란히 보일 값 */
const SUMMARY_KEYS = [
  'exceptions',
  'emptyFiles',
  'failedFaces',
  'windingFiles',
  'windingSolids',
  'negativeVolumeSolids',
  'foldedFiles',
  'foldedMaxRatio',
  'foldedMaxAreaRatio',
  'openShells',
  'areaMismatchFaces',
  'nonFiniteFiles',
  'triangles',
];

const keyOf = (r) => `${r.hash}\t${r.quality}`;

export function readRun(dir) {
  const p = join(dir, 'records.jsonl');
  if (!existsSync(p)) throw new Error(`records.jsonl이 없습니다: ${p}`);
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l));
}

/** 전·후 기록 → 비교 결과(순수) */
export function compareRecords(before, after, { top = 20 } = {}) {
  const B = new Map(before.map((r) => [keyOf(r), r]));
  const A = new Map(after.map((r) => [keyOf(r), r]));
  const qualities = [...new Set([...after, ...before].map((r) => r.quality))];
  const out = { qualities: {}, changed: false };
  for (const quality of qualities) {
    const pairs = [];
    let onlyBefore = 0;
    let onlyAfter = 0;
    for (const [k, b] of B) if (b.quality === quality && !A.has(k)) onlyBefore++;
    for (const [k, a] of A) {
      if (a.quality !== quality) continue;
      const b = B.get(k);
      if (b) pairs.push([b, a]);
      else onlyAfter++;
    }
    const classChanges = {};
    const newExceptions = [];
    const changes = [];
    for (const [b, a] of pairs) {
      const diff = {};
      let score = 0;
      if (b.class !== a.class) {
        const t = `${b.class}→${a.class}`;
        classChanges[t] = (classChanges[t] ?? 0) + 1;
        diff.class = [b.class, a.class];
        score += 1000;
      }
      if (EXCEPTION_CLASSES.has(a.class) && (!EXCEPTION_CLASSES.has(b.class) || b.error !== a.error)) {
        newExceptions.push({ hash: a.hash, path: a.path, error: a.error, message: a.message });
        score += 900;
      }
      if ((b.error ?? null) !== (a.error ?? null)) diff.error = [b.error ?? null, a.error ?? null];
      for (const [name, get] of Object.entries(METRICS)) {
        const x = get(b);
        const y = get(a);
        if (x === undefined || y === undefined || x === y) continue;
        diff[name] = [x, y];
        score += WEIGHT[name] * (name === 'triangles' ? Math.min(1, Math.abs(y - x) / Math.max(1, x)) : 1);
      }
      const wb = new Set(b.warnings ?? []);
      const wa = new Set(a.warnings ?? []);
      const added = [...wa].filter((w) => !wb.has(w));
      const removed = [...wb].filter((w) => !wa.has(w));
      if (added.length || removed.length) {
        diff.warnings = { added, removed };
        score += 5;
      }
      if (Object.keys(diff).length) changes.push({ hash: a.hash, path: a.path, score, diff });
    }
    changes.sort((x, y) => y.score - x.score || (x.hash < y.hash ? -1 : 1));
    const sb = summarizeQuality(before.filter((r) => r.quality === quality)).quality;
    const sa = summarizeQuality(after.filter((r) => r.quality === quality)).quality;
    const summary = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, [sb[k], sa[k]]]));
    const classChanged = Object.values(classChanges).reduce((a, b) => a + b, 0);
    out.qualities[quality] = {
      pairs: pairs.length,
      onlyBefore,
      onlyAfter,
      classChanged,
      classChanges,
      newExceptions,
      metricChanged: changes.length,
      top: changes.slice(0, top),
      summary,
    };
    if (classChanged || newExceptions.length || changes.length) out.changed = true;
  }
  return out;
}

function fmtValue(v) {
  return typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(4)) : v;
}

/** 사람이 읽는 비교 글 */
export function formatCompare(res, { paths = false } = {}) {
  const lines = [];
  for (const [quality, q] of Object.entries(res.qualities)) {
    lines.push(`[${quality}] 짝 ${q.pairs}개(전에만 ${q.onlyBefore}, 후에만 ${q.onlyAfter})`);
    const cc = Object.entries(q.classChanges)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    lines.push(`  분류가 바뀐 파일 ${q.classChanged}개${cc ? ` (${cc})` : ''}`);
    lines.push(`  새 예외 ${q.newExceptions.length}개`);
    for (const e of q.newExceptions.slice(0, 10)) lines.push(`    ${e.hash.slice(0, 12)} ${e.error}: ${e.message ?? ''}${paths && e.path ? `  ${e.path}` : ''}`);
    lines.push(`  지표가 바뀐 파일 ${q.metricChanged}개${q.metricChanged > q.top.length ? ` (위 ${q.top.length}개)` : ''}`);
    for (const c of q.top) {
      const parts = Object.entries(c.diff).map(([k, v]) =>
        k === 'warnings' ? `경고 ${[...v.added.map((w) => `+${w}`), ...v.removed.map((w) => `-${w}`)].join(' ')}` : `${k} ${fmtValue(v[0])}→${fmtValue(v[1])}`,
      );
      lines.push(`    ${c.hash.slice(0, 12)} ${parts.join(', ')}${paths && c.path ? `  ${c.path}` : ''}`);
    }
    lines.push('  요약(전→후):');
    for (const [k, [x, y]] of Object.entries(q.summary)) lines.push(`    ${k} ${fmtValue(x)}→${fmtValue(y)}${x === y ? '' : ' *'}`);
  }
  lines.push(res.changed ? '바뀐 것이 있습니다.' : '바뀐 것이 없습니다.');
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const dirs = [];
  let top = 20;
  let paths = false;
  let json = false;
  let failOnChange = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--top') top = Number(argv[++i]);
    else if (a === '--paths') paths = true;
    else if (a === '--json') json = true;
    else if (a === '--fail-on-change') failOnChange = true;
    else if (a.startsWith('--')) {
      process.stderr.write(`모르는 인자: ${a}\n`);
      return 2;
    } else dirs.push(a);
  }
  if (dirs.length !== 2 || !(top >= 0)) {
    process.stderr.write('쓰는 법: npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--paths] [--json] [--fail-on-change]\n');
    return 2;
  }
  const res = compareRecords(readRun(resolve(dirs[0])), readRun(resolve(dirs[1])), { top });
  if (!paths) {
    for (const q of Object.values(res.qualities)) {
      for (const c of q.top) delete c.path;
      for (const e of q.newExceptions) delete e.path;
    }
  }
  process.stdout.write(json ? JSON.stringify(res, null, 2) + '\n' : formatCompare(res, { paths }) + '\n');
  return failOnChange && res.changed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
