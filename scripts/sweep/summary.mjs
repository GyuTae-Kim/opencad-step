/**
 * 훑기 기록(records.jsonl 줄들) → 요약(summary.json). 순수 함수 — 경로는 요약에 넣지 않는다(해시 앞 12자만).
 */

/** 분류(기록의 class) — 요약에는 0개도 늘 넣어 모양을 같게 둔다 */
export const CLASSES = ['ok', 'warning', 'partial', 'empty', 'rejected', 'error', 'timeout', 'crash'];
/** 예외로 치는 분류 */
export const EXCEPTION_CLASSES = new Set(['error', 'timeout', 'crash']);
/** 접힌 삼각형 파일 수를 셀 때 쓰는 개수 비율 기준(5차 훑기와 같은 0.1%) */
export const FOLDED_FILE_RATIO = 0.001;

/** 정렬된 값의 백분위(가장 가까운 순위) */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function count(map, key, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

function sortedObject(map) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}

const round = (x, d = 6) => Math.round(x * 10 ** d) / 10 ** d;

/** 품질 하나의 기록들 → 요약 */
export function summarizeQuality(records) {
  const classes = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const containers = {};
  const versions = {};
  const extensions = {};
  const errors = {};
  const warnings = {};
  const failReasons = {};
  const q = {
    triangles: 0,
    faces: 0,
    failedFaces: 0,
    failedFaceFiles: 0,
    closedShells: 0,
    solids: 0,
    openShells: 0,
    openShellFiles: 0,
    windingSolids: 0,
    windingFiles: 0,
    windingEdges: 0,
    negativeVolumeSolids: 0,
    negativeVolumeFiles: 0,
    foldedFiles: 0,
    foldedAnyFiles: 0,
    foldedTriangles: 0,
    foldedMaxRatio: 0,
    foldedMaxAreaRatio: 0,
    areaMismatchFaces: 0,
    areaMismatchFiles: 0,
    nonFiniteFiles: 0,
    emptyFiles: 0,
    exceptions: 0,
  };
  /** 닫힌 입체의 질량 속성(metrics.ts massPropsStats) 합 — 옛 결과에는 없다 */
  const mp = { files: 0, solids: 0, exact: 0, approx: 0, triangles: 0, timeout: 0, maxRelBound: 0, maxRelChange: 0 };
  const times = [];
  /** 연 뒤 질량 속성 적분 시간(일꾼이 따로 잰 것 — 옛 결과에는 없다) */
  const propsTimes = [];
  for (const r of records) {
    count(classes, r.class);
    count(containers, r.container ?? 'plain');
    count(versions, r.ap ?? 'none');
    if (r.ext) count(extensions, r.ext);
    if (r.error) count(errors, r.error);
    for (const w of r.warnings ?? []) count(warnings, w);
    for (const [k, v] of Object.entries(r.failReasons ?? {})) count(failReasons, k, v);
    if (Number.isFinite(r.ms)) times.push(r.ms);
    if (Number.isFinite(r.propsMs)) propsTimes.push(r.propsMs);
    if (r.mp) {
      mp.files++;
      for (const k of ['solids', 'exact', 'approx', 'triangles', 'timeout']) mp[k] += r.mp[k] ?? 0;
      mp.maxRelBound = Math.max(mp.maxRelBound, r.mp.maxRelBound ?? 0);
      mp.maxRelChange = Math.max(mp.maxRelChange, r.mp.maxRelChange ?? 0);
    }
    if (r.class === 'empty') q.emptyFiles++;
    if (EXCEPTION_CLASSES.has(r.class)) q.exceptions++;
    q.triangles += r.triangles ?? 0;
    q.faces += r.faces ?? 0;
    q.failedFaces += r.failedFaces ?? 0;
    if (r.failedFaces) q.failedFaceFiles++;
    const m = r.q;
    if (!m) continue;
    q.closedShells += m.closedShells;
    q.solids += m.solids;
    q.openShells += m.openShells;
    if (m.openShells) q.openShellFiles++;
    q.windingSolids += m.windingSolids;
    q.windingEdges += m.windingEdges;
    if (m.windingSolids) q.windingFiles++;
    q.negativeVolumeSolids += m.negativeVolumeSolids;
    if (m.negativeVolumeSolids) q.negativeVolumeFiles++;
    q.foldedTriangles += m.foldedTriangles;
    if (m.foldedMaxRatio > FOLDED_FILE_RATIO) q.foldedFiles++;
    if (m.foldedTriangles) q.foldedAnyFiles++;
    q.foldedMaxRatio = Math.max(q.foldedMaxRatio, m.foldedMaxRatio);
    q.foldedMaxAreaRatio = Math.max(q.foldedMaxAreaRatio, m.foldedMaxAreaRatio);
    q.areaMismatchFaces += m.areaMismatchFaces;
    if (m.areaMismatchFaces) q.areaMismatchFiles++;
    if (m.nonFinite) q.nonFiniteFiles++;
  }
  q.foldedMaxRatio = round(q.foldedMaxRatio);
  q.foldedMaxAreaRatio = round(q.foldedMaxAreaRatio);
  times.sort((a, b) => a - b);
  propsTimes.sort((a, b) => a - b);
  const slowest = [...records]
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
    .map((r) => ({ hash: String(r.hash ?? '').slice(0, 12), ms: r.ms, ...(Number.isFinite(r.propsMs) ? { propsMs: r.propsMs } : {}), size: r.size ?? null, triangles: r.triangles ?? null, class: r.class }));
  return {
    files: records.length,
    classes,
    versions: sortedObject(versions),
    containers: sortedObject(containers),
    extensions: sortedObject(extensions),
    errors: sortedObject(errors),
    warnings: sortedObject(warnings),
    failReasons: sortedObject(failReasons),
    time: {
      totalMs: times.reduce((a, b) => a + b, 0),
      p50: percentile(times, 50),
      p90: percentile(times, 90),
      p99: percentile(times, 99),
      max: times.length ? times[times.length - 1] : 0,
    },
    ...(propsTimes.length
      ? {
          propsTime: {
            files: propsTimes.length,
            totalMs: propsTimes.reduce((a, b) => a + b, 0),
            p50: percentile(propsTimes, 50),
            p90: percentile(propsTimes, 90),
            p99: percentile(propsTimes, 99),
            max: propsTimes[propsTimes.length - 1],
          },
        }
      : {}),
    quality: q,
    ...(mp.files ? { massProps: { ...mp, maxRelBound: round(mp.maxRelBound), maxRelChange: round(mp.maxRelChange) } } : {}),
    slowest,
  };
}

/** 기록 전체 → summary.json 본문(품질마다 따로). info는 도구·입력 정보(경로 없이) */
export function summarize(records, info = {}) {
  const qualities = info.qualities ?? [...new Set(records.map((r) => r.quality))];
  const byQuality = {};
  for (const name of qualities) byQuality[name] = summarizeQuality(records.filter((r) => r.quality === name));
  return { ...info, qualities, byQuality, done: true };
}

/** 사람이 읽는 짧은 요약(표준 출력용) */
export function formatSummary(summary) {
  const lines = [];
  // 품질 순서는 qualities 배열로(숫자 이름 '10'은 객체 열쇠 순서에서 앞으로 간다)
  for (const name of summary.qualities ?? Object.keys(summary.byQuality)) {
    const s = summary.byQuality[name];
    const q = s.quality;
    const cls = Object.entries(s.classes)
      .filter(([, n]) => n)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    lines.push(`[${name}] 파일 ${s.files}개 — ${cls || '없음'}`);
    lines.push(`  판: ${Object.entries(s.versions).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'} / 압축: ${Object.entries(s.containers).map(([k, n]) => `${k} ${n}`).join(', ') || '없음'}`);
    lines.push(`  예외 ${q.exceptions}, 실패 면 ${q.failedFaces}(파일 ${q.failedFaceFiles}), 형상 없음 ${q.emptyFiles}, 삼각형 합 ${q.triangles}`);
    lines.push(`  닫힌 껍질 ${q.closedShells}, 닫힌 입체 ${q.solids}, 입체가 못 된 닫힌 껍질 ${q.openShells}(파일 ${q.openShellFiles})`);
    lines.push(`  감기가 어긋난 입체 ${q.windingSolids}(파일 ${q.windingFiles}, 모서리 ${q.windingEdges}), 부피가 음수인 입체 ${q.negativeVolumeSolids}(파일 ${q.negativeVolumeFiles})`);
    lines.push(
      `  접힌 삼각형: 0.1% 넘는 파일 ${q.foldedFiles}(하나라도 ${q.foldedAnyFiles}), 최대 개수 비율 ${(q.foldedMaxRatio * 100).toFixed(2)}%, 최대 넓이 비율 ${(q.foldedMaxAreaRatio * 100).toFixed(3)}%`,
    );
    lines.push(`  넓이가 다른 면 ${q.areaMismatchFaces}(파일 ${q.areaMismatchFiles}), 유한하지 않은 좌표 파일 ${q.nonFiniteFiles}`);
    const mp = s.massProps;
    if (mp)
      lines.push(
        `  질량 속성(닫힌 입체 ${mp.solids}): 곡면 적분 정확 ${mp.exact}, 근삿값 섞임 ${mp.approx}(최대 ±${(mp.maxRelBound * 100).toPrecision(2)}%), 삼각형으로 ${mp.triangles}, 시간 한도 ${mp.timeout}, 삼각형 부피와 최대 차 ${(mp.maxRelChange * 100).toPrecision(2)}%`,
      );
    lines.push(`  시간 합 ${(s.time.totalMs / 1000).toFixed(1)}s, p50 ${s.time.p50}ms, p90 ${s.time.p90}ms, p99 ${s.time.p99}ms, 최대 ${s.time.max}ms`);
    const pt = s.propsTime;
    if (pt) lines.push(`  연 뒤 질량 속성 적분(파일 ${pt.files}): 합 ${(pt.totalMs / 1000).toFixed(1)}s, p50 ${pt.p50}ms, p90 ${pt.p90}ms, p99 ${pt.p99}ms, 최대 ${pt.max}ms`);
    const errs = Object.entries(s.errors);
    if (errs.length) lines.push(`  오류 코드: ${errs.map(([k, n]) => `${k} ${n}`).join(', ')}`);
    const warns = Object.entries(s.warnings);
    if (warns.length) lines.push(`  경고 코드: ${warns.slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
  return lines.join('\n');
}
