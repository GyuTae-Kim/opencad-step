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
import { VIEW_KEYS as CORE_VIEW_KEYS, VIEW_LABELS as CORE_VIEW_LABELS } from 'opencad-viewer3d';
import { VIEW_KEYS, VIEW_LABELS } from '../../src/app/keys';

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
    expect(core).toContain('bounds');
    // 63차: 코어 camera 모듈은 첫 화면에서 가져오지 않는다 — 뷰어 조각과 함께 쓰는 모듈은 번들러가 통째로(카메라 계산 모두) 첫 화면 JS에 두었다.
    // 표준 뷰 이름·숫자 키 표는 keys.ts가 같은 값을 들고(아래 시험), 면 기준 보기 계산(viewhelp.ts)·저장된 보기 각(dirToAngles)은 뷰어 조각에서
    expect(core).not.toContain('camera');
    expect(files.has(join(ROOT, 'src/app/viewhelp.ts'))).toBe(false);
    // 코어 입구는 viewerkit.ts가 값으로 다시 내보내고, 그 조각은 core.ts의 import()로만 받는다(앱 입구에서 정적으로 닿지 않는다)
    const coreDyn = dynamic.filter((d) => d.spec === 'opencad-viewer3d' || d.spec.startsWith('opencad-viewer3d/'));
    expect(coreDyn).toEqual([]);
    expect(dynamic.filter((d) => d.spec === './viewerkit').map((d) => relative(ROOT, d.file))).toEqual(['src/app/core.ts']);
    const kit = join(ROOT, 'src/app/viewerkit.ts');
    expect(files.has(kit)).toBe(false);
    expect(importsOf(readFileSync(kit, 'utf8')).values.sort()).toEqual(['./aim', './ctxmenu', './entpick', './gpucontext', './imagedlg', './infoview', './keynav', './keysnap', './opennotice', './physics', './pmiview', './trackdir', './treeview', './upload', './viewhelp', 'opencad-viewer3d', 'opencad-viewer3d/camera', 'opencad-viewer3d/viewcube']);
    // 뷰 큐브 면 글(코어 viewcube — 0.44.0 손가락 큐브로 커짐)은 61차부터 이 조각에서 받아 앱이 바꾼다(첫 화면 번역층은 가져오지 않는다)
    expect(core).not.toContain('viewcube');
    const appText = readFileSync(join(ROOT, 'src/app/app.ts'), 'utf8');
    expect(appText).toMatch(/this\.cube \?\?= \{ faces: core\.CUBE_FACES, ko: core\.CUBE_FACES\.map\(\(f\) => f\.label\) \};\n\s*this\.relabelCube\(\);/);
    expect(appText).toMatch(/addEventListener\('languagechange', \(\) => \{\n\s*this\.relabelCube\(\);/);
    // 큰 장면 나눠 올리기·연 뒤 알림(58차 — upload.ts·opennotice.ts, 문서를 뷰어에 올릴 때만 쓴다)과 패널 정보 탭 본문(59차 — infoview.ts)도 그 조각에만
    for (const m of ['src/app/upload.ts', 'src/app/opennotice.ts', 'src/app/infoview.ts']) expect(files.has(join(ROOT, m)), m).toBe(false);
    // 카메라 옮기기·움직임 줄이기는 61차부터 코어(0.48.0 animate 'auto'·0.49.0 flyTo — 뷰어 조각의 코어 입구)가 맡는다(55~60차 motion.ts는 뺐다)
    expect(files.has(join(ROOT, 'src/app/motion.ts'))).toBe(false);
    // PMI 탭 본문(54차 — pmiview.ts, 표현·의미 PMI 표의 가상 목록)도 그 조각에만: 패널은 타입만 가져온다
    expect(files.has(join(ROOT, 'src/app/pmiview.ts'))).toBe(false);
    expect(dynamic.some((d) => d.spec.endsWith('pmiview'))).toBe(false);
    // 키보드 길잡이(53차 — keynav.ts, 패널 탭·라디오·도구 막대 화살표와 띠를 닫을 때 초점)와 물리 속성 계산(physics.ts — 속성 탭, 53차에 옮김)도 그 조각에만
    // 62차: 키보드로 3D 붙잡기·고르기(keysnap.ts — 뷰어를 만들 때 단다)와 큰 그림 저장 대화 상자 본문(imagedlg.ts — 앱 입구에서 옮김)도
    for (const m of ['src/app/keynav.ts', 'src/app/physics.ts', 'src/app/keysnap.ts', 'src/app/imagedlg.ts']) expect(files.has(join(ROOT, m)), m).toBe(false);
    expect(dynamic.some((d) => ['keynav', 'physics', 'keysnap', 'imagedlg'].some((n) => d.spec.endsWith(n)))).toBe(false);
    // 작업 메뉴 항목·불투명도 메뉴(52차 — ctxmenu.ts, 작업 메뉴는 뷰어가 있어야 열린다)도 그 조각에만.
    // 64차: 3D 보기 화면 점의 작업 메뉴(contextAt — app.ts에서 옮김)와 겹친 것 고르기 목록(picklist.ts)도
    expect(files.has(join(ROOT, 'src/app/ctxmenu.ts'))).toBe(false);
    expect(files.has(join(ROOT, 'src/app/picklist.ts'))).toBe(false);
    expect(dynamic.some((d) => d.spec.endsWith('picklist') || d.spec.endsWith('ctxmenu'))).toBe(false);
    // 나무 조각(49차 — 제품 나무·부품별 보이기 표의 가상 목록)도 그 조각에만: 패널은 타입만 가져오고 앱이 뷰어를 만들 때 넣는다
    expect(files.has(join(ROOT, 'src/app/treeview.ts'))).toBe(false);
    expect(dynamic.some((d) => d.spec.endsWith('treeview'))).toBe(false);
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
    expect(readFileSync(join(ROOT, 'src/app/tangent.ts'), 'utf8')).toMatch(/export \{ entRefine \} from '\.\/exactdist'/);
    expect(dynamic.some((d) => d.spec.endsWith('facesurf'))).toBe(false);
    expect(readFileSync(join(ROOT, 'src/app/tangent.ts'), 'utf8')).toMatch(/=> import\('\.\.\/facesurf'\)/);
  });

  it('앱의 숫자 키 표·뷰 이름 표는 코어 VIEW_KEYS·VIEW_LABELS와 같은 값(63차 — 첫 화면이 코어 camera 모듈을 가져오지 않으려고 앱에 같은 표를 둔다)', () => {
    expect(VIEW_KEYS).toEqual(CORE_VIEW_KEYS);
    expect(Object.keys(VIEW_KEYS)).toEqual(Object.keys(CORE_VIEW_KEYS));
    // 앱 표는 화면 언어로 고쳐질 수 있으니(i18n.ts) 원문은 코어 표와 견준다 — 코어 표는 앱이 고치지 않는다
    expect(Object.keys(VIEW_LABELS).sort()).toEqual(Object.keys(CORE_VIEW_LABELS).sort());
    expect(readFileSync(join(ROOT, 'src/app/keys.ts'), 'utf8')).toContain(
      Object.entries(CORE_VIEW_LABELS)
        .map(([k, v]) => `  ${k}: '${v}',`)
        .join('\n'),
    );
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
    // 조각의 코어 입구와 작은 camera 모듈은 같은 객체를 내보낸다(63차: 저장된 보기 각 dirToAngles도 이 조각에서 — 첫 화면은 camera 모듈을 가져오지 않는다)
    const cam = await import('opencad-viewer3d/camera');
    expect(m.VIEW_LABELS).toBe(cam.VIEW_LABELS);
    expect(m.dirToAngles).toBe(cam.dirToAngles);
    // 같은 조각의 면 기준 보기·자르기 계산(63차 — viewhelp.ts를 첫 화면 JS에서 옮김)
    const vh = await import('../../src/app/viewhelp');
    for (const k of ['cameraBack', 'cameraLooking', 'faceBox', 'faceSectionPlane', 'faceViewDir', 'movedFace'] as const) expect(m[k], k).toBe(vh[k]);
    // 같은 조각의 정밀 조준(뷰어를 만들 때 캔버스에 단다)
    expect(m.TouchAim).toBe((await import('../../src/app/aim')).TouchAim);
    // 같은 조각의 그래픽 문맥 잃음·되찾음 안내(뷰어를 만들 때 단다)
    expect(m.watchGraphicsContext).toBe((await import('../../src/app/gpucontext')).watchGraphicsContext);
    // 같은 조각의 끌어온 점 기준 선분 거르기(뷰어를 만들 때 쥐어 측정 붙잡기 선택에 넘긴다)
    expect(m.straightEdgeFilter).toBe((await import('../../src/app/trackdir')).straightEdgeFilter);
    // 같은 조각의 개체 측정 계산(앱은 뷰어를 만들기 전에 이 모듈을 쥔다)
    const ent = await import('../../src/app/entpick');
    for (const k of ['measurePicked', 'pickedAnnotations', 'pickedClosest', 'pickedFace', 'pickedEdge', 'pickedPoint', 'pickedSection', 'armSize'] as const) expect(m[k], k).toBe(ent[k]);
    // 같은 조각의 나무 조각(앱이 뷰어를 만들 때 패널에 넣는다)
    const tv = await import('../../src/app/treeview');
    expect(m.treeView).toBe(tv.treeView);
    expect(m.groupGrid).toBe(tv.groupGrid);
    expect(m.pmiView).toBe((await import('../../src/app/pmiview')).pmiView);
    // 같은 조각의 키보드 길잡이와 물리 속성 계산(앱이 뷰어를 만들 때 달고 패널에 넣는다)
    expect(m.installKeyNav).toBe((await import('../../src/app/keynav')).installKeyNav);
    // 같은 조각의 작업 메뉴(64차 — 3D 보기 화면 점의 메뉴와 겹친 것 고르기 목록)
    const ctx = await import('../../src/app/ctxmenu');
    expect(m.contextAt).toBe(ctx.contextAt);
    expect(m.contextItems).toBe(ctx.contextItems);
    const phys = await import('../../src/app/physics');
    for (const k of ['accuracyText', 'inertiaText', 'MATERIALS', 'massText', 'meshNodes', 'physProps'] as const) expect(m[k], k).toBe(phys[k]);
  });
});
