/**
 * 훑기 일꾼(vite-node로 돈다): 표준 입력으로 `{"path","quality"}` JSON을 한 줄씩 받아 앱 해석 워커와 같은 길
 * (`parseStepFile` — 압축 풀기 → STEP 가리기 → stepToScene)로 열고, 결과 한 줄(JSON)을 표준 출력에 쓴다.
 * 해시·사본 수·경로는 운전(sweep.mjs)이 붙인다.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { headSchemas, sceneHasGeometry, type ParseOptions } from '../../src/app/protocol';
import { sniffContainer } from '../../src/archive';
import { parseStepFile } from '../../src/app/job';
import { errorCode, failReasons, sceneClass, schemaLabel, warningCode, type SweepClass } from './classify';
import { qualityOptions } from './quality';
import { massPropsStats, sceneQuality, type MassPropsStats, type SceneQuality } from './metrics';

export interface WorkerRecord {
  quality: string;
  class: SweepClass;
  /** 압축: plain·gzip·zip·zip+gzip 등 */
  container: string;
  /** FILE_SCHEMA 이름(첫 낱말) */
  schemas: string[];
  /** 판(AP203·AP214·AP242 등) */
  ap: string;
  ms: number;
  parseMs?: number;
  meshMs?: number;
  meshes?: number;
  lines?: number;
  points?: number;
  triangles?: number;
  faces?: number;
  failedFaces?: number;
  instances?: number;
  /** 경고 코드(같은 코드는 한 번) */
  warnings?: string[];
  /** 실패 면 이유 → 면 수 */
  failReasons?: Record<string, number>;
  /** 품질 지표 */
  q?: SceneQuality;
  /** 닫힌 입체의 질량 속성(곡면 적분) 지표 */
  mp?: MassPropsStats;
  /** 오류 코드와 글(앞 300자) */
  error?: string;
  message?: string;
}

function schemaNames(list: readonly string[]): string[] {
  return list.map((s) => /^[A-Za-z0-9_]+/.exec(s.trim())?.[0]?.toUpperCase() ?? '').filter(Boolean);
}

export async function sweepOne(path: string, quality: string, options: ParseOptions): Promise<WorkerRecord> {
  const t0 = performance.now();
  let raw: Uint8Array | undefined;
  try {
    raw = new Uint8Array(readFileSync(path));
    const res = await parseStepFile(basename(path), raw, () => {}, options);
    const s = res.scene;
    const meta = s.meta as { schema?: string[]; stats: { parseMs: number; meshMs: number; triangles: number; faces: number; failedFaces: number; instances: number } };
    const warnings = s.warnings ?? [];
    const schemas = schemaNames(meta.schema ?? []);
    const codes = [...new Set(warnings.map(warningCode))];
    const rec: WorkerRecord = {
      quality,
      class: sceneClass(sceneHasGeometry(s), meta.stats.failedFaces, warnings.length),
      container: res.source?.containers.join('+') || 'plain',
      schemas,
      ap: schemaLabel(schemas),
      ms: Math.round(res.ms),
      parseMs: Math.round(meta.stats.parseMs),
      meshMs: Math.round(meta.stats.meshMs),
      meshes: s.meshes.length,
      lines: s.lines?.length ?? 0,
      points: s.points?.length ?? 0,
      triangles: meta.stats.triangles,
      faces: meta.stats.faces,
      failedFaces: meta.stats.failedFaces,
      instances: meta.stats.instances,
      warnings: codes,
      q: sceneQuality(s),
      mp: massPropsStats(s),
    };
    const why = failReasons(warnings);
    if (Object.keys(why).length) rec.failReasons = why;
    return rec;
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    const { code, rejected } = errorCode(message);
    const head = raw?.subarray(0, 64 * 1024);
    const kind = head ? sniffContainer(head) : 'unknown';
    const schemas = head && kind === 'step' ? schemaNames(headSchemas(head)) : [];
    return {
      quality,
      class: rejected ? 'rejected' : 'error',
      container: kind === 'gzip' || kind === 'zip' ? kind : 'plain',
      schemas,
      ap: schemaLabel(schemas),
      ms: Math.round(performance.now() - t0),
      error: code,
      message: message.slice(0, 300),
    };
  }
}

// vite-node로 직접 돌 때만 표준 입력을 읽는다(시험은 sweepOne만 부른다)
if (process.env.OPENCAD_SWEEP_WORKER === '1') {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const req = JSON.parse(line) as { path: string; quality: string };
    const rec = await sweepOne(req.path, req.quality, qualityOptions(req.quality));
    process.stdout.write(JSON.stringify(rec) + '\n');
  }
}
