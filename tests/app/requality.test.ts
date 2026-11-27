/**
 * 177차 표시 설정 「곡면 품질」을 다시 삼각화하는 동안 또 바꾸면(닫힌 고르기 칸 ↓ 두 번·마우스로 빨리 두 번) setDisplay가 부른 retessellate는
 * load가 돌고 있어(this.loading) 그냥 돌려보내 새 값이 버려졌다 — 해석 요청이 이미 나갔으면 설정·고르기 칸은 새 품질인데 연 문서는 앞 품질로 남았다.
 * 이제 load가 해석에 쓴 품질을 this.source.quality에 남기고, retessellate는 끝난 뒤 그 값이 지금 설정과 다르면 한 번 더 한다(끝날 때마다 지금 값 하나와 견줌).
 * app.ts 원문 setDisplay·retessellate 몸통을 잘라 가짜 this·가짜 load로 돌린다(앱 load 꼴 — 부르면 곧 loading, 해석을 보낼 때 그때 품질을 쓰고,
 * 끝나면 loading을 풀고 성공이면 새 문서·source. 취소·다른 파일 열기는 false).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Q = 'normal' | 'fine' | 'finest';
const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
const setBody = /\n {2}setDisplay\(next: Partial<DisplaySettings>\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
const retBody = /\n {2}async retessellate\(\): Promise<boolean> \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
const loadText = /\n {2}private async load\(\n[\s\S]*?\n {2}\}\n/.exec(app)?.[0] ?? '';

interface Run {
  /** 해석에 쓴 품질(해석 요청 전이면 null) */
  quality: Q | null;
  parse(): void;
  finish(ok: boolean): void;
}
interface Self {
  display: { unit: string; decimals: number; quality: Q };
  loading: { name: string } | null;
  doc: { n: number } | null;
  source: { name: string; read: () => Promise<ArrayBuffer>; input: string; quality: Q } | null;
  runs: Run[];
  refreshFmt(): void;
  setDisplay(next: { quality?: Q }): void;
  retessellate(): Promise<boolean>;
  load(name: string, read: () => Promise<ArrayBuffer>, input: string, attempt: unknown, carry: unknown): Promise<boolean>;
}

function fakeApp(start: Q): Self {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (body: string) => (this: Self) => Promise<boolean>;
  const setDisplay = new Function('writeDisplaySettings', 'safeLocalStorage', `return function (next) {\n${setBody}\n};`)(() => {}, () => null) as Self['setDisplay'];
  const retessellate = new AsyncFunction(retBody!);
  const self: Self = {
    display: { unit: 'file', decimals: 3, quality: start },
    loading: null,
    doc: { n: 0 },
    source: { name: 'a.stp', read: async () => new ArrayBuffer(0), input: 'local', quality: start },
    runs: [],
    refreshFmt() {},
    setDisplay,
    retessellate,
    load(name, read, input) {
      self.loading = { name };
      return new Promise<boolean>((resolve) => {
        const run: Run = {
          quality: null,
          parse() {
            run.quality = self.display.quality;
          },
          finish(ok) {
            if (run.quality === null) run.parse();
            self.loading = null;
            if (ok) {
              self.doc = { n: self.doc ? self.doc.n + 1 : 1 };
              self.source = { name, read, input, quality: run.quality! };
            }
            resolve(ok);
          },
        };
        self.runs.push(run);
      });
    },
  };
  return self;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('177차: 다시 삼각화하는 동안 바꾼 곡면 품질(retessellate)', () => {
  it('해석 요청이 나간 뒤 품질을 또 바꾸면 끝난 뒤 새 품질로 한 번 더 다시 삼각화한다(그 뒤 설정과 연 문서의 품질이 같음)', async () => {
    const a = fakeApp('normal');
    a.setDisplay({ quality: 'fine' });
    expect(a.runs).toHaveLength(1);
    a.runs[0].parse();
    // 돌고 있는 동안 바꾼 값 — 그때 부른 retessellate는 loading이라 돌려보낸다(지금처럼)
    a.setDisplay({ quality: 'finest' });
    expect(a.runs).toHaveLength(1);
    a.runs[0].finish(true);
    await tick();
    expect(a.runs.map((r) => r.quality)).toEqual(['fine', null]);
    a.runs[1].finish(true);
    await tick();
    expect(a.runs.map((r) => r.quality)).toEqual(['fine', 'finest']);
    expect([a.source?.quality, a.display.quality, a.loading]).toEqual(['finest', 'finest', null]);
  });

  it('도는 동안 두 번 바꿔도 끝난 뒤 마지막 값으로 한 번만 더 하고, 다시 쓴 품질로 돌아오면 더 하지 않는다', async () => {
    const b = fakeApp('normal');
    b.setDisplay({ quality: 'fine' });
    b.runs[0].parse();
    b.setDisplay({ quality: 'finest' });
    b.setDisplay({ quality: 'normal' });
    expect(b.runs).toHaveLength(1);
    b.runs[0].finish(true);
    await tick();
    b.runs[1]?.finish(true);
    await tick();
    expect(b.runs.map((r) => r.quality)).toEqual(['fine', 'normal']);
    expect(b.source?.quality).toBe('normal');

    const c = fakeApp('normal');
    c.setDisplay({ quality: 'fine' });
    c.runs[0].parse();
    c.setDisplay({ quality: 'finest' });
    c.setDisplay({ quality: 'fine' });
    c.runs[0].finish(true);
    await tick();
    expect(c.runs.map((r) => r.quality)).toEqual(['fine']);
  });

  it('해석 요청 전(다시 읽는 중)에 바꾼 값은 그 해석이 쓰므로 같은 품질로 또 하지 않는다', async () => {
    const d = fakeApp('normal');
    d.setDisplay({ quality: 'fine' });
    d.setDisplay({ quality: 'finest' });
    d.runs[0].finish(true);
    await tick();
    expect(d.runs.map((r) => r.quality)).toEqual(['finest']);
  });

  it('취소했거나 문서를 닫으면(load가 false) 도는 동안 바꾼 값이 있어도 다시 하지 않는다', async () => {
    const e = fakeApp('normal');
    e.display.quality = 'fine';
    const p = e.retessellate();
    e.runs[0].parse();
    e.setDisplay({ quality: 'finest' });
    // 취소(Esc·취소 버튼 — load는 false, 문서는 앞 것 그대로)
    e.runs[0].finish(false);
    expect(await p).toBe(false);
    await tick();
    expect([e.runs.length, e.doc]).toEqual([1, { n: 0 }]);

    const f = fakeApp('normal');
    f.setDisplay({ quality: 'fine' });
    f.runs[0].parse();
    f.setDisplay({ quality: 'finest' });
    f.doc = null;
    f.source = null;
    f.runs[0].finish(false);
    await tick();
    expect(await f.retessellate()).toBe(false);
    expect(f.runs).toHaveLength(1);
  });

  it('앱 load(원문)는 해석 요청 바로 앞에서 받은 품질로 해석하고, 다 열면 그 품질을 source에 남긴다(가짜 load가 따르는 꼴)', () => {
    expect(loadText).toMatch(/const quality = this\.display\.quality;\n\s*const res = await this\.client\.parse\(/);
    expect(loadText).toContain('QUALITY_OPTIONS[quality],');
    expect(loadText).toContain('this.source = { name, read, input, quality };');
    expect(loadText.match(/this\.display\.quality/g)).toHaveLength(1);
  });
});
