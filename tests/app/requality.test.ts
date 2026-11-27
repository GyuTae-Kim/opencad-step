/**
 * 177차 표시 설정 「곡면 품질」을 다시 삼각화하는 동안 또 바꾸면(닫힌 고르기 칸 ↓ 두 번·마우스로 빨리 두 번) setDisplay가 부른 retessellate는
 * load가 돌고 있어(this.loading) 그냥 돌려보내 새 값이 버려졌다 — 해석 요청이 이미 나갔으면 설정·고르기 칸은 새 품질인데 연 문서는 앞 품질로 남았다.
 * 이제 load가 해석에 쓴 품질을 this.source.quality에 남기고, retessellate는 끝난 뒤 그 값이 지금 설정과 다르면 한 번 더 한다(끝날 때마다 지금 값 하나와 견줌).
 * app.ts 원문 setDisplay·retessellate 몸통을 잘라 가짜 this·가짜 load로 돌린다(앱 load 꼴 — 부르면 곧 loading, 해석을 보낼 때 그때 품질을 쓰고,
 * 끝나면 loading을 풀고 성공이면 새 문서·source. 취소·다른 파일 열기는 false).
 * 178차: 파일을 처음 여는(또는 다른 파일을 여는) 중에 해석 요청 뒤 품질을 바꿔도 같았다 — 여는 길에는 끝난 뒤 견줄 자리가 없어 그 문서가 앞 품질로 열렸다.
 * 이제 품질을 견주는 곳은 retessellate 앞머리 하나이고, 여는 길 다섯과 다시 삼각화가 모두 지나는 load 끝(finally의 같은 차례 가지)이 다 열었으면 retessellate를 부른다.
 * 가짜 load는 앱 loadSeq 꼴의 차례를 두고(지난 차례의 끝은 false — 아무것도 바꾸지 않음), 원문 load finally가 retessellate를 부르면 그 끝에서 따라 부른다(177차 원문에는 없어 그 꼴 그대로).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Q = 'normal' | 'fine' | 'finest';
const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
const setBody = /\n {2}setDisplay\(next: Partial<DisplaySettings>\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
const retBody = /\n {2}async retessellate\(\): Promise<boolean> \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
const loadText = /\n {2}private async load\(\n[\s\S]*?\n {2}\}\n/.exec(app)?.[0] ?? '';
// 178차: 원문 load의 끝(finally — 같은 차례면 여는 중을 푼 뒤)이 다 열었으면 retessellate를 부르는지
const loadEnds = /\} finally \{\n\s*if \(seq === this\.loadSeq\) \{\n\s*this\.abort = null;\n\s*this\.setLoading\(null\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(done\) void this\.retessellate\(\);\n\s*\}\n\s*\}\n {2}\}\n$/.test(loadText);
const read = async () => new ArrayBuffer(0);

interface Run {
  /** 연 파일 이름 */
  name: string;
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
  /** 여는 차례(앱 loadSeq 꼴) */
  seq: number;
  runs: Run[];
  refreshFmt(): void;
  setDisplay(next: { quality?: Q }): void;
  retessellate(): Promise<boolean>;
  load(name: string, read: () => Promise<ArrayBuffer>, input: string, attempt: unknown, carry: unknown): Promise<boolean>;
}

/** opened가 false면 연 문서 없음(처음 여는 길) */
function fakeApp(start: Q, opened = true): Self {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (body: string) => (this: Self) => Promise<boolean>;
  const setDisplay = new Function('writeDisplaySettings', 'safeLocalStorage', `return function (next) {\n${setBody}\n};`)(() => {}, () => null) as Self['setDisplay'];
  const retessellate = new AsyncFunction(retBody!);
  const self: Self = {
    display: { unit: 'file', decimals: 3, quality: start },
    loading: null,
    doc: opened ? { n: 0 } : null,
    source: opened ? { name: 'a.stp', read, input: 'local', quality: start } : null,
    seq: 0,
    runs: [],
    refreshFmt() {},
    setDisplay,
    retessellate,
    load(name, read, input) {
      self.loading = { name };
      const seq = ++self.seq;
      return new Promise<boolean>((resolve) => {
        const run: Run = {
          name,
          quality: null,
          parse() {
            run.quality = self.display.quality;
          },
          finish(ok) {
            // 다른 파일을 연 뒤의 끝(지난 차례)은 false — 문서·source·여는 중을 바꾸지 않는다
            if (seq !== self.seq) return resolve(false);
            if (run.quality === null) run.parse();
            self.loading = null;
            if (ok) {
              self.doc = { n: self.doc ? self.doc.n + 1 : 1 };
              self.source = { name, read, input, quality: run.quality! };
              // 원문 load의 finally(178차): 다 열었으면 retessellate — 그 일이 시작된 뒤 load가 돌아온다
              if (loadEnds) void self.retessellate();
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

describe('178차: 파일을 여는 동안 바꾼 곡면 품질(load 끝 — 여는 길과 다시 삼각화가 함께 씀)', () => {
  it('여는 중 해석 요청 뒤에 품질을 바꾸면 다 연 뒤 새 품질로 한 번 다시 삼각화한다(연 문서 없음·다른 문서를 둔 채 둘 다)', async () => {
    for (const opened of [false, true]) {
      const a = fakeApp('normal', opened);
      const p = a.load('b.stp', read, 'local', null, null);
      a.runs[0].parse();
      // 그때 부른 retessellate는 연 문서가 없거나(!d) 여는 중이라(loading) 돌려보낸다(지금처럼)
      a.setDisplay({ quality: 'fine' });
      expect(a.runs).toHaveLength(1);
      a.runs[0].finish(true);
      expect(await p).toBe(true);
      await tick();
      expect(a.runs.map((r) => [r.name, r.quality])).toEqual([['b.stp', 'normal'], ['b.stp', null]]);
      a.runs[1].finish(true);
      await tick();
      expect(a.runs.map((r) => r.quality)).toEqual(['normal', 'fine']);
      expect([a.source?.name, a.source?.quality, a.display.quality, a.loading]).toEqual(['b.stp', 'fine', 'fine', null]);
    }
  });

  it('여는 중 두 번 바꿔도 다 연 뒤 마지막 값으로 한 번이고, 쓴 품질로 돌아오거나 해석 요청 전에 바꿨으면 더 하지 않는다', async () => {
    const b = fakeApp('normal', false);
    void b.load('b.stp', read, 'local', null, null);
    b.runs[0].parse();
    b.setDisplay({ quality: 'fine' });
    b.setDisplay({ quality: 'finest' });
    expect(b.runs).toHaveLength(1);
    b.runs[0].finish(true);
    await tick();
    b.runs[1]?.finish(true);
    await tick();
    expect(b.runs.map((r) => r.quality)).toEqual(['normal', 'finest']);
    expect(b.source?.quality).toBe('finest');

    const c = fakeApp('normal', false);
    void c.load('b.stp', read, 'local', null, null);
    c.runs[0].parse();
    c.setDisplay({ quality: 'fine' });
    c.setDisplay({ quality: 'normal' });
    c.runs[0].finish(true);
    await tick();
    expect(c.runs.map((r) => r.quality)).toEqual(['normal']);

    const d = fakeApp('normal', false);
    void d.load('b.stp', read, 'local', null, null);
    d.setDisplay({ quality: 'fine' });
    d.runs[0].finish(true);
    await tick();
    expect(d.runs.map((r) => r.quality)).toEqual(['fine']);
  });

  it('여는 중에 바꾼 값이 있어도 취소·실패·다른 파일 열기면 그 파일을 다시 하지 않는다(다른 파일은 해석 때 새 값을 써서 더 하지 않음)', async () => {
    const e = fakeApp('normal', false);
    const p = e.load('b.stp', read, 'local', null, null);
    e.runs[0].parse();
    e.setDisplay({ quality: 'fine' });
    // 취소(Esc·취소 버튼)·해석 실패 — load는 false
    e.runs[0].finish(false);
    expect(await p).toBe(false);
    await tick();
    expect([e.runs.length, e.doc, e.source, e.loading]).toEqual([1, null, null, null]);

    const f = fakeApp('normal');
    const pb = f.load('b.stp', read, 'local', null, null);
    f.runs[0].parse();
    f.setDisplay({ quality: 'fine' });
    const pc = f.load('c.stp', read, 'local', null, null);
    // 앞 파일의 끝은 지난 차례 — false, 아무것도 바꾸지 않는다
    f.runs[0].finish(true);
    expect(await pb).toBe(false);
    f.runs[1].finish(true);
    expect(await pc).toBe(true);
    await tick();
    expect(f.runs.map((r) => [r.name, r.quality])).toEqual([['b.stp', 'normal'], ['c.stp', 'fine']]);
    expect([f.source?.name, f.source?.quality, f.loading]).toEqual(['c.stp', 'fine', null]);
  });

  it('앱 원문: load 끝(finally의 같은 차례 가지)이 다 열었을 때만 retessellate를 부르고, 품질을 견주는 곳은 retessellate 앞머리 하나다', () => {
    expect(loadEnds).toBe(true);
    expect(loadText).toMatch(/attempt\.success\(\);\n\s*done = true;\n\s*return true;/);
    expect(loadText.match(/done = true;/g)).toHaveLength(1);
    expect(retBody).toMatch(/if \(!src \|\| !d \|\| this\.loading \|\| src\.quality === this\.display\.quality\) return false;\n\s*return this\.load\(src\.name, src\.read, src\.input, \{ success\(\) \{\}, error\(\) \{\} \}, d\);$/);
    // 여는 길(openFile·openSample·openUrl)과 다시 삼각화는 load 하나를 부르고, 부르는 자리에 견주기를 따로 두지 않는다
    expect(app.match(/this\.load\(/g)).toHaveLength(4);
    expect(app.match(/\.quality [!=]== this\.display\.quality/g)).toHaveLength(1);
    expect(app.match(/void this\.retessellate\(\);/g)).toHaveLength(2);
  });
});
