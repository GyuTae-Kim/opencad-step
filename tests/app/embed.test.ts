/**
 * 다른 웹페이지에 넣은 화면(iframe): 부모 페이지가 넘긴 파일을 공용 도구(opencad-site-kit/embed/app)의 acceptEmbeddedFiles가 받아 앱 열기에 건넨다.
 * 받는 확장자(EMBED_ACCEPT)는 앱 정보 file_handlers와 같고, 앱은 열기를 마친 뒤 부모에게 알리며 최근 문서에는 남기지 않는다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptEmbeddedFiles, type EmbedWindow } from 'opencad-site-kit/embed/app';
import { EMBED_ACCEPT } from '../../src/app/files';

/** 가짜 iframe 창: 부모에게 보낸 글을 모으고, send로 부모가 보낸 글을 흉내 낸다 */
function frame() {
  const sent: { message: Record<string, unknown>; origin: string }[] = [];
  const listeners: ((event: MessageEvent) => void)[] = [];
  const attrs = new Map<string, string>();
  const parent = { postMessage: (message: unknown, origin: string) => void sent.push({ message: message as Record<string, unknown>, origin }) };
  const w: EmbedWindow = {
    self: {},
    top: {},
    parent,
    addEventListener: (_type, listener) => void listeners.push(listener),
    document: { documentElement: { setAttribute: (name, value) => void attrs.set(name, value) } },
  };
  const send = (data: unknown) => listeners.forEach((l) => l({ source: parent, origin: 'https://host.example', data } as unknown as MessageEvent));
  return { w, sent, attrs, send };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('넣은 화면에서 파일 받기', () => {
  it('받는 확장자는 앱 정보 file_handlers와 같다', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '../../public/manifest.webmanifest'), 'utf8')) as { file_handlers: { accept: Record<string, string[]> }[] };
    const handled = new Set(manifest.file_handlers.flatMap((f) => Object.values(f.accept).flat()));
    expect(new Set(EMBED_ACCEPT)).toEqual(handled);
    expect(EMBED_ACCEPT.every((e) => e === e.toLowerCase() && e.startsWith('.'))).toBe(true);
  });

  it('부모가 넘긴 STEP·압축 STEP을 열기에 건네고, 열기를 마친 뒤 done을 보낸다', async () => {
    const { w, sent, attrs, send } = frame();
    const opened: string[] = [];
    let finish!: () => void;
    const open = (files: File[]) => {
      opened.push(...files.map((f) => f.name));
      return new Promise<boolean>((resolve) => (finish = () => resolve(true)));
    };
    expect(acceptEmbeddedFiles(open, { accept: EMBED_ACCEPT }, w)).toBe(true);
    expect(attrs.has('data-embedded')).toBe(true);
    expect(sent[0]).toEqual({ message: { type: 'opencad:ready', protocol: 1, accept: [...EMBED_ACCEPT] }, origin: '*' });

    send({ type: 'opencad:open', protocol: 1, id: 'a', files: [{ name: 'Bracket.STP.gz', data: new ArrayBuffer(4) }] });
    expect(opened).toEqual(['Bracket.STP.gz']);
    await settle();
    expect(sent.some((s) => s.message.type === 'opencad:done')).toBe(false);
    finish();
    await settle();
    expect(sent.at(-1)).toEqual({ message: { protocol: 1, type: 'opencad:done', id: 'a' }, origin: 'https://host.example' });
  });

  it('STEP-XML 같은 다른 형식은 열기에 건네지 않고 unsupported', () => {
    const { w, sent, send } = frame();
    const opened: string[] = [];
    acceptEmbeddedFiles((files) => opened.push(...files.map((f) => f.name)), { accept: EMBED_ACCEPT }, w);
    send({ type: 'opencad:open', protocol: 1, id: 'b', files: [{ name: 'part.stpx', data: new ArrayBuffer(4) }] });
    expect(opened).toEqual([]);
    expect(sent.at(-1)?.message).toEqual({ protocol: 1, type: 'opencad:error', id: 'b', code: 'unsupported' });
  });

  it('앱은 시작할 때 넣은 화면 받기를 켜고 최근 문서에 남기지 않으며, 넣은 화면에서는 방문 통계 메뉴를 뺀다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/acceptEmbeddedFiles\(\(files\) => this\.openFile\(files\[0\]!, false\), \{ accept: EMBED_ACCEPT \}\);/);
    expect(app).toMatch(/\.\.\.\(isFramed\(\) \? \[\] : \[\{ label: '방문 통계 설정', run: showAnalyticsSettings \}\]\)/);
  });
});
