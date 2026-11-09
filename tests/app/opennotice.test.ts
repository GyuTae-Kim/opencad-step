// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkScene, type Mesh3d, type Scene3d, type SceneIssue } from 'opencad-viewer3d';
import { TRUNCATED_WARNING } from '../../src/messages';
import { openNotice, sceneIssueLines } from '../../src/app/opennotice';
import { MAX_PLACEMENTS } from '../../src/scene';
import { jsdomViewer } from './jsdomview';

const CAP = `조립 자리가 ${MAX_PLACEMENTS}개를 넘어 나머지는 놓지 않았다(같은 하위 조립을 층마다 거듭 쓴 파일일 수 있음)`;

describe('연 뒤 알림(58차)', () => {
  it('끊긴 파일 > 조립 자리 상한 > 그 밖의 경고 수, 경고가 없으면 없음', () => {
    expect(openNotice([])).toBeNull();
    expect(openNotice(['다른 경고', '또 다른 경고'])).toEqual({ text: '해석기 경고 2개 — 패널의 "정보" 탭에서 볼 수 있습니다.', ms: 3500 });
    expect(openNotice([TRUNCATED_WARNING, CAP])!.ms).toBe(6000);
    // 상한에 닿으면 경고 수 대신 앞부분만 보인다고(해석기 경고 글의 수를 천 단위로)
    expect(openNotice(['다른 경고', CAP])).toEqual({ text: '조립 자리가 250,000개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).', ms: 8000 });
  });

  it('번역 사전의 틀로 옮겨진다(수는 그대로)', async () => {
    const { translate } = await import('../../site/i18n.mjs');
    const text = openNotice([CAP])!.text;
    expect(translate(text, 'en')).toBe('More than 250,000 assembly placements — only the first part is shown. The file may reuse the same subassembly at every level (see the "Info" tab of the panel).');
    for (const lang of ['de', 'ja', 'zh-CN'] as const) expect(translate(text, lang)).toContain('250,000');
  });
});

/** 깨진 값이 든 장면(코어 0.50.0 퍼징 꼴 — 해석기를 지나지 않은 값): 정점 NaN·1e38, 없는 정점 색인, 놓을 자리 NaN, 색 NaN, 같은 id */
function brokenScene(): Scene3d {
  const tri = (id: string, p: number[], extra: Partial<Mesh3d> = {}): Mesh3d => ({ id, positions: new Float32Array(p), indices: new Uint32Array([0, 1, 2]), color: [0.6, 0.6, 0.6, 1], ...extra });
  return {
    name: 'broken',
    units: 'mm',
    meshes: [
      tri('ok', [0, 0, 0, 1, 0, 0, 0, 1, 0]),
      tri('nan', [0, 0, 0, NaN, 0, 0, 0, 1, 0]),
      tri('far', [0, 0, 0, 1e38, 0, 0, 0, 1, 0]),
      { ...tri('idx', [0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2, 0, 1, 7]) },
      tri('place', [0, 0, 0, 1, 0, 0, 0, 1, 0], { origin: [NaN, 0, 0] }),
      tri('color', [0, 0, 0, 1, 0, 0, 0, 1, 0], { color: [NaN, 0, 0, 1] }),
      tri('ok', [2, 0, 0, 3, 0, 0, 2, 1, 0]),
    ],
    lines: [],
  };
}

describe('코어가 빼거나 고쳐 그린 장면 입력의 경고 글(61차 — 코어 0.50.0 onSceneIssues)', () => {
  it('종류마다 한 줄: 놓을 자리·좌표·색인·기본값·같은 id(형상 수와 정점·삼각형 수), 멀쩡하면 없음', () => {
    const { issues } = checkScene(brokenScene());
    expect(issues.length).toBeGreaterThan(0);
    expect(sceneIssueLines(issues)).toEqual([
      '3D 보기가 놓을 자리를 알 수 없어 뺀 형상 1개',
      '3D 보기가 좌표가 잘못된 정점 2개를 쓰는 도형을 그리지 않았다(형상 2개)',
      '3D 보기가 없는 정점을 가리키는 삼각형 1개를 그리지 않았다(형상 1개)',
      '3D 보기가 잘못된 색·굵기·법선 같은 값을 기본값으로 그린 형상 1개',
      '3D 보기에서 id가 겹친 형상 1개는 고르기가 한 항목만 본다',
    ]);
    expect(sceneIssueLines([])).toEqual([]);
    const bounds: SceneIssue = { code: 'bounds', action: 'fixed', kind: 'scene', count: 1 };
    expect(sceneIssueLines([bounds])).toEqual(['3D 보기가 장면 범위를 형상에서 다시 셌다(파일의 범위가 잘못됨)']);
  });

  it('네 언어 사전의 틀로 옮겨진다(수는 그대로)', async () => {
    const { translate } = await import('../../site/i18n.mjs');
    const lines = [...sceneIssueLines(checkScene(brokenScene()).issues), sceneIssueLines([{ code: 'bounds', action: 'fixed', kind: 'scene', count: 1 }])[0]!];
    for (const lang of ['en', 'de', 'ja', 'zh-CN'] as const)
      for (const l of lines) {
        const t = translate(l, lang);
        expect(t, `${lang}: ${l}`).not.toMatch(/[가-힣]/);
        for (const n of l.match(/\d+/g)!.filter((x) => x !== '3')) expect(t).toContain(n);
      }
  });

  it('실제 코어(가짜 WebGL): setScene이 끝나기 전에 알림이 와서 앱은 그 문서의 경고 목록 끝에 더한다', () => {
    const { viewer, restore } = jsdomViewer();
    try {
      const scene = { ...brokenScene(), warnings: ['해석기 경고'] };
      const off = viewer.onSceneIssues((list) => {
        const lines = sceneIssueLines(list);
        if (lines.length) scene.warnings = [...scene.warnings, ...lines];
      });
      viewer.setScene(scene);
      off();
      expect(scene.warnings[0]).toBe('해석기 경고');
      expect(scene.warnings).toHaveLength(6);
      expect(viewer.sceneIssues.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/const offIssues = v\.onSceneIssues\(/);
    expect(app).toMatch(/offIssues\(\);/);
  });
});
