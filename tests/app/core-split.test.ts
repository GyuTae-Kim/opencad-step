/**
 * 3D 뷰어 코어를 문서를 열 때 나눠 받기(app/core.ts): 앱 입구(src/app/main.ts)에서 정적 가져오기로 닿는 모듈은
 * 코어 입구(opencad-viewer3d)와 무거운 모듈(viewer·renderer 등)을 값으로 가져오지 않는다. 값은 작은 코어 모듈만, 입구는 core.ts가 import()로 받는
 * viewerkit.ts 조각(코어 입구와 뷰어를 만든 뒤에만 쓰는 정밀 조준 aim.ts·개체 측정 entpick.ts를 묶는다)으로만.
 * 이 규칙이 깨지면 번들러가 코어 전체를 첫 화면 JS에 다시 넣는다.
 *
 * 앱 입구에서 닿는 그래프만 훑는다 — 해석기 입구(src/index.ts)와 워커는 다른 묶음이라 코어 모듈을 값으로 가져와도 된다.
 * tsconfig의 verbatimModuleSyntax 때문에 `import { type A } from '…'`도 빈 가져오기(`import '…'`)로 남으므로 값 가져오기로 센다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEW_KEYS as CORE_VIEW_KEYS } from 'opencad-viewer3d';
import { VIEW_KEYS } from '../../src/app/keys';

const ROOT = join(__dirname, '../..');
const ENTRY = join(ROOT, 'src/app/main.ts');
const CORE_SRC = join(ROOT, 'node_modules/opencad-viewer3d/src');
/**
 * 첫 화면에서 바로 가져와도 되는 코어 모듈(작고 무거운 코어 모듈을 끌어오지 않는다).
 * 개체 측정의 최소 거리(bvh·closest)는 코어 조각에만 든다(27차 — 개체 측정 entpick.ts를 viewerkit.ts로 옮겼다).
 * 방향 범위(extent)는 코어 0.31.0부터 bounds가 다시 내보내 그래프에 닿을 뿐이고, 첫 화면이 쓰지 않아 번들에는 들지 않는다(36차 — 첫 화면 JS gzip 81,009 → 81,003 B)
 */
const SMALL = new Set(['camera', 'pointer', 'viewcube', 'types', 'math', 'bounds', 'ranges', 'extent']);

/** 글에서 값 가져오기(정적 import·export … from·빈 import) 대상과 동적 import() 대상 */
function importsOf(text: string): { values: string[]; dynamic: string[] } {
  const values: string[] = [];
  for (const m of text.matchAll(/^[ \t]*(import|export)\s+(type\s+)?[^;]*?\s+from\s+['"]([^'"]+)['"]/gm)) if (!m[2]) values.push(m[3]!);
  for (const m of text.matchAll(/^[ \t]*import\s+['"]([^'"]+)['"]/gm)) values.push(m[1]!);
  // 타입 자리(typeof import(…))는 받지 않는다
  const dynamic = [...text.matchAll(/(?<!typeof )\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]!);
  return { values, dynamic };
}

/** 가져오기 대상 → 파일(훑지 않는 것은 null: 다른 꾸러미·CSS·JSON) */
function resolveSpec(from: string, spec: string): string | null {
  if (spec === 'opencad-viewer3d') return join(CORE_SRC, 'index.ts');
  if (spec.startsWith('opencad-viewer3d/')) return join(CORE_SRC, `${spec.slice('opencad-viewer3d/'.length)}.ts`);
  if (!spec.startsWith('.')) return null;
  if (/\.(css|json)$/.test(spec)) return null;
  const base = resolve(dirname(from), spec);
  for (const p of [base, `${base}.ts`, join(base, 'index.ts')]) if (existsSync(p) && /\.(ts|mjs|js)$/.test(p)) return p;
  throw new Error(`가져오기를 찾지 못했다: ${relative(ROOT, from)} → ${spec}`);
}

/** 앱 입구에서 정적 가져오기로 닿는 파일들과 그 안의 동적 import() */
function staticGraph(entry: string): { files: Set<string>; dynamic: { file: string; spec: string }[] } {
  const files = new Set<string>();
  const dynamic: { file: string; spec: string }[] = [];
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    const { values, dynamic: dyn } = importsOf(readFileSync(f, 'utf8'));
    for (const spec of dyn) dynamic.push({ file: f, spec });
    for (const spec of values) {
      const p = resolveSpec(f, spec);
      if (p && !files.has(p)) todo.push(p);
    }
  }
  return { files, dynamic };
}

describe('코어 나눠 받기', () => {
  it('가져오기 훑기: type 가져오기는 빼고, type만 든 중괄호는 빈 가져오기로 센다', () => {
    const t = `import type { A } from 'opencad-viewer3d';\nimport { type B } from 'opencad-viewer3d/viewer';\nimport {\n  c,\n  d,\n} from './x';\nimport './s.css';\nexport { e } from './y';\nexport type { F } from './z';\ntype G = typeof import('opencad-viewer3d');\nconst h = () => import('./w');`;
    const r = importsOf(t);
    expect(r.values.sort()).toEqual(['./s.css', './x', './y', 'opencad-viewer3d/viewer'].sort());
    expect(r.dynamic).toEqual(['./w']);
  });

  it('앱 입구에서 닿는 코어 모듈은 작은 것만, 코어 입구는 core.ts의 import() 하나(viewerkit.ts 조각)로만', () => {
    const { files, dynamic } = staticGraph(ENTRY);
    const core = [...files].filter((f) => f.startsWith(CORE_SRC)).map((f) => relative(CORE_SRC, f).replace(/\.ts$/, ''));
    expect(core.filter((m) => !SMALL.has(m))).toEqual([]);
    // 시험이 헛돌지 않게: 앱 화면 모듈과 작은 코어 모듈에 실제로 닿았다
    expect(files.has(join(ROOT, 'src/app/app.ts'))).toBe(true);
    expect(core).toContain('camera');
    // 코어 입구는 viewerkit.ts가 값으로 다시 내보내고, 그 조각은 core.ts의 import()로만 받는다(앱 입구에서 정적으로 닿지 않는다)
    const coreDyn = dynamic.filter((d) => d.spec === 'opencad-viewer3d' || d.spec.startsWith('opencad-viewer3d/'));
    expect(coreDyn).toEqual([]);
    expect(dynamic.filter((d) => d.spec === './viewerkit').map((d) => relative(ROOT, d.file))).toEqual(['src/app/core.ts']);
    const kit = join(ROOT, 'src/app/viewerkit.ts');
    expect(files.has(kit)).toBe(false);
    expect(importsOf(readFileSync(kit, 'utf8')).values.sort()).toEqual(['./aim', './entpick', './gpucontext', './trackdir', 'opencad-viewer3d']);
    // 정밀 조준(aim.ts — 뷰어를 만들 때 단다)과 그래픽 문맥 잃음·되찾음 안내(gpucontext.ts — 코어 0.25.0)도 그 조각에만(첫 화면 JS 밖)
    expect(files.has(join(ROOT, 'src/app/aim.ts'))).toBe(false);
    expect(files.has(join(ROOT, 'src/app/gpucontext.ts'))).toBe(false);
    // 끌어온 점 나란함·수직의 기준 선분 거르기(trackdir.ts — 코어 0.28.0 trackDirs { edge }, 측정 붙잡기 계산)도 그 조각에만
    expect(files.has(join(ROOT, 'src/app/trackdir.ts'))).toBe(false);
    // 개체 측정(entpick.ts·entmeasure.ts와 최소 거리용 코어 bvh·closest — 뷰어의 누르기로만 쓴다)도 그 조각에만.
    // 측정 띠·패널이 바로 쓰는 값 줄 글(lineValue)은 첫 화면의 measure.ts에 있다
    for (const m of ['src/app/entpick.ts', 'src/app/entmeasure.ts', 'node_modules/opencad-viewer3d/src/bvh.ts', 'node_modules/opencad-viewer3d/src/closest.ts'])
      expect(files.has(join(ROOT, m)), m).toBe(false);
    expect(dynamic.some((d) => d.spec.endsWith('entpick') || d.spec.endsWith('entmeasure'))).toBe(false);
    // 보기 링크의 고른 것 낱말(selink.ts)과 STL·OBJ·CSV 내보내기(export.ts), 분해 방식 단추·계획(explodebar.ts — explode.ts를 품음)도
    // 문서를 연 뒤 import()로만 받는다(첫 화면 JS 밖)
    expect(files.has(join(ROOT, 'src/app/explode.ts'))).toBe(false);
    // 분해 손질(35차 — 끌어 옮긴 덧이동·되돌리기·링크 꼴 explodetweak.ts, 끌기 손짓 explodedrag.ts)도 분해 조각에만, 그 조각은 코어 조각과 모듈을 나눠 쓰지 않는다
    // 손질 도구(explodetool.ts — 끌기·되돌리기·링크·최근 문서에 남기기)와 손질 파일 꼴(explodefile.ts — 38차 내보내기·불러오기)도
    for (const m of ['src/app/explodetweak.ts', 'src/app/explodedrag.ts', 'src/app/explodetool.ts', 'src/app/explodefile.ts']) expect(files.has(join(ROOT, m)), m).toBe(false);
    expect(dynamic.some((d) => /explode(tweak|drag|tool|file)$/.test(d.spec))).toBe(false);
    expect(importsOf(readFileSync(join(ROOT, 'src/app/explodedrag.ts'), 'utf8')).values).toEqual([]);
    for (const m of ['selink', 'export', 'explodebar']) {
      expect(files.has(join(ROOT, `src/app/${m}.ts`)), m).toBe(false);
      expect(new Set(dynamic.filter((d) => d.spec === `./${m}`).map((d) => relative(ROOT, d.file))), m).toEqual(new Set(['src/app/app.ts']));
    }
    // 측정 곡선 접선 잠금(tangent.ts)도 첫 화면 밖: core.ts의 import()로만(뷰어를 만들 때 받는다)
    expect(files.has(join(ROOT, 'src/app/tangent.ts'))).toBe(false);
    expect(dynamic.filter((d) => d.spec === './tangent').map((d) => relative(ROOT, d.file))).toEqual(['src/app/core.ts']);
    // 축이 곡면을 뚫는 점(facesnap.ts — 접선 조각)과 곡면 정의 되살리기·곡면 계산(facesurf.ts·surfaces.ts — 접선 조각이 import()로 받는 곡면 조각)도 첫 화면 밖
    // 거리 글상자가 앱 화면 요소를 비켜 그리기(labelavoid.ts — 접선 조각)도 첫 화면 밖
    // 개체 측정 최소 거리를 곡면·곡선 정의로 다듬기(exactdist.ts — 40차, 접선 조각)도 첫 화면 밖
    for (const m of ['src/app/facesnap.ts', 'src/facesurf.ts', 'src/app/labelavoid.ts', 'src/app/exactdist.ts']) expect(files.has(join(ROOT, m)), m).toBe(false);
    expect(readFileSync(join(ROOT, 'src/app/tangent.ts'), 'utf8')).toMatch(/export \{ exactParts, exactPicked \} from '\.\/exactdist'/);
    expect(dynamic.some((d) => d.spec.endsWith('facesurf'))).toBe(false);
    expect(readFileSync(join(ROOT, 'src/app/tangent.ts'), 'utf8')).toMatch(/=> import\('\.\.\/facesurf'\)/);
  });

  it('앱의 숫자 키 표는 코어 VIEW_KEYS 그 객체(작은 camera 모듈 — 코어 0.10.0)', () => {
    expect(VIEW_KEYS).toBe(CORE_VIEW_KEYS);
  });

  it('곡선 접선 잠금 조각을 한 번만 받는다', async () => {
    const { loadCurveTangents } = await import('../../src/app/core');
    const a = loadCurveTangents();
    expect(loadCurveTangents()).toBe(a);
    expect(typeof (await a).TangentLock).toBe('function');
  });

  it('코어 입구를 한 번만 받고 같은 모듈을 준다', async () => {
    const { loadViewerCore } = await import('../../src/app/core');
    const a = loadViewerCore();
    expect(loadViewerCore()).toBe(a);
    const m = await a;
    expect(typeof m.Viewer3d).toBe('function');
    // 앱이 바로 가져온 작은 모듈과 코어가 같은 객체를 쓴다(뷰 이름 번역이 코어 그림에도 닿게)
    const { VIEW_LABELS } = await import('opencad-viewer3d/camera');
    expect(m.VIEW_LABELS).toBe(VIEW_LABELS);
    // 같은 조각의 정밀 조준(뷰어를 만들 때 캔버스에 단다)
    expect(m.TouchAim).toBe((await import('../../src/app/aim')).TouchAim);
    // 같은 조각의 그래픽 문맥 잃음·되찾음 안내(뷰어를 만들 때 단다)
    expect(m.watchGraphicsContext).toBe((await import('../../src/app/gpucontext')).watchGraphicsContext);
    // 같은 조각의 끌어온 점 기준 선분 거르기(뷰어를 만들 때 쥐어 측정 붙잡기 선택에 넘긴다)
    expect(m.straightEdgeFilter).toBe((await import('../../src/app/trackdir')).straightEdgeFilter);
    // 같은 조각의 개체 측정 계산(앱은 뷰어를 만들기 전에 이 모듈을 쥔다)
    const ent = await import('../../src/app/entpick');
    for (const k of ['measurePicked', 'pickedAnnotations', 'pickedClosest', 'pickedFace', 'pickedEdge', 'pickedPoint', 'pickedSection', 'armSize'] as const) expect(m[k], k).toBe(ent[k]);
  });
});
