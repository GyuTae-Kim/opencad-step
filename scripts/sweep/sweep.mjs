#!/usr/bin/env node
/**
 * 실제 STEP 파일 훑기: 로컬 표본 폴더의 STEP을 앱 해석 워커와 같은 길로 모두 열어 분류·품질 지표를 모은다.
 *
 *   npm run sweep -- [--dirs <폴더1>:<폴더2>] [--list <목록 파일>] [--out .runtime/sweep/<이름>] [--quality normal,fine,finest | 20,10,5]
 *                    [--jobs N] [--limit N] [--timeout 초] [--resume | --force] [--keep]
 *
 * 표본 폴더는 --dirs(또는 --list — 한 줄에 경로 하나, 탭이 있으면 마지막 칸)나 환경 변수 OPENCAD_SWEEP_DIRS(쌍점으로 구분).
 * 아무것도 없으면 쓰는 법만 찍고 0으로 끝난다(CI에서 돌지 않는다).
 * 결과: <out>/records.jsonl(파일 × 품질마다 한 줄, 열쇠는 내용 sha256 — 경로는 이 로컬 결과에만), <out>/summary.json(경로 없음, done: true).
 */
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupe, extensionOf, keepOpenable, walkDirs } from './files.mjs';
import { formatSummary, summarize } from './summary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export const USAGE = `실제 STEP 파일 훑기 — 앱 해석 워커와 같은 길로 로컬 표본을 모두 열어 분류·품질 지표를 모읍니다.

  npm run sweep -- --dirs <폴더1>:<폴더2> [--out .runtime/sweep/<이름>] [--quality normal] [--jobs N] [--limit N]

  --dirs a:b        표본 폴더(재귀, 쌍점으로 구분). 없으면 환경 변수 OPENCAD_SWEEP_DIRS
  --list <파일>     표본 파일 목록(한 줄에 경로 하나, 탭이 있으면 마지막 칸) — --dirs와 함께 써도 됩니다
  --out <폴더>      결과 폴더(기본 .runtime/sweep/<날짜-시각>) — records.jsonl, summary.json
  --quality q1,q2   곡면 품질: 앱 이름 normal·fine·finest 또는 각도 숫자(20·10·5 — 최대 각만 바꿈). 기본 normal
  --jobs N          일꾼 수(기본 CPU 수 - 2, 1~6)
  --limit N         내용이 다른 파일 N개만(해시 순 — 고르게 섞인 표본)
  --timeout 초      파일 하나 시간 한도(기본 120)
  --resume          결과 폴더에 있는 기록은 건너뛰고 이어서
  --force           결과 폴더의 기록을 지우고 새로
  --keep            비교 기준으로 남길 결과(records.jsonl.keep 표시)

비교: npm run sweep:compare -- <전 결과 폴더> <후 결과 폴더> [--top N] [--fail-on-change]
`;

export function parseArgs(argv, env = process.env) {
  const o = { dirs: [], list: null, out: null, qualities: ['normal'], jobs: null, limit: null, timeout: 120, resume: false, force: false, keep: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} 다음에 값이 필요합니다`);
      return v;
    };
    if (a === '--dirs') o.dirs.push(...val().split(':').filter(Boolean));
    else if (a === '--list') o.list = val();
    else if (a === '--out') o.out = val();
    else if (a === '--quality') o.qualities = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--jobs') o.jobs = Number(val());
    else if (a === '--limit') o.limit = Number(val());
    else if (a === '--timeout') o.timeout = Number(val());
    else if (a === '--resume') o.resume = true;
    else if (a === '--force') o.force = true;
    else if (a === '--keep') o.keep = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (!o.dirs.length && !o.list && env.OPENCAD_SWEEP_DIRS) o.dirs = env.OPENCAD_SWEEP_DIRS.split(':').filter(Boolean);
  for (const q of o.qualities) if (!/^(normal|fine|finest)$/.test(q) && !(/^\d+(\.\d+)?$/.test(q) && Number(q) > 0 && Number(q) <= 90)) throw new Error(`모르는 곡면 품질: ${q}`);
  if (o.jobs !== null && !(Number.isInteger(o.jobs) && o.jobs >= 1)) throw new Error('--jobs는 1 이상의 정수');
  if (o.limit !== null && !(Number.isInteger(o.limit) && o.limit >= 1)) throw new Error('--limit은 1 이상의 정수');
  if (!(o.timeout > 0)) throw new Error('--timeout은 양수(초)');
  if (o.resume && o.force) throw new Error('--resume과 --force는 함께 쓸 수 없습니다');
  return o;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function appInfo() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const info = { name: pkg.name, version: pkg.version };
  try {
    info.commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    info.dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts/sweep'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
  } catch {
    /* git이 없으면 판만 */
  }
  return info;
}

function readRecords(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l));
}

const viteNode = () => {
  const req = createRequire(join(root, 'package.json'));
  const pkgPath = req.resolve('vite-node/package.json');
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin['vite-node'];
  return resolve(dirname(pkgPath), bin);
};

/** 일꾼 하나로 차례를 돌린다. 시간 한도를 넘기거나 일꾼이 죽으면 그 파일을 적고 새 일꾼으로 잇는다 */
function runLane(queue, { timeoutMs, onRecord, health }) {
  const cli = viteNode();
  const startWorker = () =>
    new Promise((done) => {
      const child = spawn(process.execPath, [cli, join(here, 'worker.ts')], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OPENCAD_SWEEP_WORKER: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=4096`.trim() },
      });
      let buf = '';
      let errTail = '';
      let cur = null;
      let timer = null;
      let finished = false;
      let produced = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        done();
      };
      const next = () => {
        if (timer) clearTimeout(timer);
        cur = queue.shift() ?? null;
        if (!cur) {
          child.stdin.end();
          return;
        }
        const task = cur;
        timer = setTimeout(() => {
          if (cur !== task) return;
          onRecord(task, { quality: task.quality, class: 'timeout', container: 'plain', schemas: [], ap: 'none', ms: timeoutMs, error: 'timeout', message: `시간 한도 ${timeoutMs / 1000}초를 넘김` });
          cur = null;
          child.kill('SIGKILL');
        }, timeoutMs);
        child.stdin.write(JSON.stringify({ path: task.path, quality: task.quality }) + '\n');
      };
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.startsWith('{') || !cur) continue;
          const task = cur;
          cur = null;
          produced++;
          health.startFailures = 0;
          onRecord(task, JSON.parse(line));
          next();
        }
      });
      child.stderr.on('data', (d) => {
        errTail = (errTail + d).slice(-4000);
      });
      child.stdin.on('error', () => {});
      child.on('exit', (code, signal) => {
        if (cur) {
          const tail = errTail.trim().split('\n').slice(-3).join(' | ').slice(-300);
          if (!produced && ++health.startFailures >= 3) {
            // 일꾼이 첫 파일도 못 끝내고 거듭 죽는다 — 파일 탓이 아니라 일꾼을 못 띄우는 것이니 멈춘다
            health.fatal ??= `일꾼을 띄우지 못합니다(${signal ?? code}): ${tail}`;
            queue.length = 0;
          } else onRecord(cur, { quality: cur.quality, class: 'crash', container: 'plain', schemas: [], ap: 'none', ms: 0, error: 'worker-exit', message: `일꾼이 끝남(${signal ?? code}): ${tail}` });
          cur = null;
        }
        finish();
      });
      next();
    });
  return (async () => {
    while (queue.length) await startWorker();
  })();
}

export async function main(argv = process.argv.slice(2)) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  if (o.help || (!o.dirs.length && !o.list)) {
    process.stdout.write(USAGE);
    if (!o.help) process.stdout.write('\n표본 폴더가 없어 훑지 않습니다(--dirs 또는 OPENCAD_SWEEP_DIRS).\n');
    return 0;
  }
  const out = resolve(o.out ?? join('.runtime', 'sweep', stamp()));
  const recordsPath = join(out, 'records.jsonl');
  const summaryPath = join(out, 'summary.json');
  mkdirSync(out, { recursive: true });
  if (existsSync(recordsPath) && !o.resume) {
    if (!o.force) {
      process.stderr.write(`이미 결과가 있습니다: ${recordsPath}\n이어서 하려면 --resume, 새로 하려면 --force를 주십시오.\n`);
      return 2;
    }
    rmSync(recordsPath);
    rmSync(summaryPath, { force: true });
  }
  const startedAt = new Date();
  const t0 = performance.now();

  // 1. 고르기와 중복 빼기
  let paths = await walkDirs(o.dirs);
  if (o.list) {
    const listed = readFileSync(o.list, 'utf8')
      .split('\n')
      .map((l) => (l.split('\t').pop() ?? '').trim())
      .filter(Boolean)
      .filter((p) => existsSync(p));
    paths = [...new Set([...paths, ...listed])].sort();
  }
  const found = paths.length;
  paths = await keepOpenable(paths);
  const { files: unique, unreadable } = await dedupe(paths);
  const files = o.limit ? unique.slice(0, o.limit) : unique;
  const byExtension = {};
  for (const p of paths) byExtension[extensionOf(p)] = (byExtension[extensionOf(p)] ?? 0) + 1;
  process.stderr.write(`이름이 맞는 파일 ${found}개, STEP ${paths.length}개, 내용이 다른 것 ${unique.length}개${o.limit ? ` 가운데 ${files.length}개` : ''}\n`);

  // 2. 할 일(파일 × 품질) — 이어 하기면 끝난 것은 뺀다
  const done = new Set(readRecords(recordsPath).map((r) => `${r.hash}\t${r.quality}`));
  const queue = [];
  for (const f of files) for (const q of o.qualities) if (!done.has(`${f.hash}\t${q}`)) queue.push({ ...f, quality: q });
  const total = queue.length;
  const jobs = Math.max(1, Math.min(o.jobs ?? Math.min(6, availableParallelism() - 2), total || 1));
  process.stderr.write(`할 일 ${total}개(품질 ${o.qualities.join('·')}), 일꾼 ${jobs}, 결과 ${out}\n`);
  let finished = 0;
  const onRecord = (task, rec) => {
    const line = { hash: task.hash, path: task.path, size: task.size, copies: task.copies, ext: extensionOf(task.path), ...rec };
    appendFileSync(recordsPath, JSON.stringify(line) + '\n');
    finished++;
    if (finished % 100 === 0 || finished === total) process.stderr.write(`${finished}/${total} 끝 (${((performance.now() - t0) / 1000).toFixed(0)}s)\n`);
  };
  const health = { startFailures: 0, fatal: null };
  await Promise.all(Array.from({ length: jobs }, () => runLane(queue, { timeoutMs: o.timeout * 1000, onRecord, health })));
  if (health.fatal) {
    process.stderr.write(`${health.fatal}\n끝난 기록은 ${recordsPath}에 남았습니다(--resume으로 이어서).\n`);
    return 1;
  }

  // 3. 기록 정리(해시·품질 순)와 요약
  const order = new Map(o.qualities.map((q, i) => [q, i]));
  const keep = new Set(files.map((f) => f.hash));
  const records = readRecords(recordsPath)
    .filter((r) => keep.has(r.hash) && order.has(r.quality))
    .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : order.get(a.quality) - order.get(b.quality)));
  writeFileSync(recordsPath, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  if (o.keep) writeFileSync(`${recordsPath}.keep`, '비교 기준 결과 — 지우지 않음\n');
  const summary = summarize(records, {
    tool: 'opencad-step sweep 1',
    app: appInfo(),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    input: { dirs: o.dirs.length, list: !!o.list, found, step: paths.length, unique: unique.length, duplicates: paths.length - unique.length - unreadable, unreadable, swept: files.length, byExtension },
    qualities: o.qualities,
    jobs,
    timeoutSeconds: o.timeout,
  });
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(`${formatSummary(summary)}\n결과: ${recordsPath}\n요약: ${summaryPath}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
