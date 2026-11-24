// Mode `lakar --file` (spec-collab-cloud story 2): FileClient = LakarTransport untuk FileTransport daemon —
// server MCP yang sama berjalan di atas satu `.lakar.json` tanpa lakard.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '@lakar/schema';
import { FileClient } from './file-client.js';
import { createLakarMcpServer } from './index.js';

/** Katalog ikon palsu (canonical lolos; tanpa file data lucide). */
const fakeIcons = {
  versions: { lucide: '0.test' },
  canonical: (_lib: string, icon: string) => ({ icon, version: '0.test' }),
  search: () => [] as { lib: string; icon: string }[],
  glyph: () => undefined,
};

/** Dokumen kosong valid (sama dengan `createDocument()` di @lakar/core): satu halaman, rev 0. */
const emptyDoc = () => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'Ddocdocd',
  rev: 0,
  tokens: {},
  pages: [{ id: 'Ppagepag', name: 'Page 1', children: [] }],
});

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-fileclient-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function fixture(slug = 'desain'): Promise<string> {
  const dir = await mkdtemp(join(root, 'fc-'));
  const file = join(dir, `${slug}.lakar.json`);
  await writeFile(file, JSON.stringify(emptyDoc()), 'utf8');
  return file;
}

const client = (file: string) => new FileClient(file, { icons: fakeIcons });

/** Server MCP di atas FileClient + klien in-memory (pola index.test.ts). */
async function mcpClient(file: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createLakarMcpServer(client(file)).connect(st);
  const c = new Client({ name: 'test', version: '0' });
  await c.connect(ct);
  return c;
}

const textOf = (r: { content?: unknown }) => ((r.content as { type: string; text?: string }[] | undefined)?.map((c) => c.text ?? '').join('\n') ?? '');

describe('FileClient: konstruktor', () => {
  it('file hilang → error start yang jelas', () => {
    expect(() => client(join(root, 'tidakada.lakar.json'))).toThrow(/tidak bisa membaca/);
  });
  it('file bukan .lakar.json → error start', async () => {
    const dir = await mkdtemp(join(root, 'fc-suffix-'));
    const f = join(dir, 'doc.json');
    await writeFile(f, '{}');
    expect(() => client(f)).toThrow(/\.lakar\.json/);
  });
  it('JSON rusak → error start', async () => {
    const dir = await mkdtemp(join(root, 'fc-bad-'));
    const f = join(dir, 'rusak.lakar.json');
    await writeFile(f, '{bukan json');
    expect(() => client(f)).toThrow(/bukan JSON valid/);
  });
});

describe('FileClient: LakarTransport', () => {
  it('status() menandai transport file', async () => {
    const file = await fixture('status');
    const r = await client(file).status<{ transport: string; slug: string; file: string }>();
    expect(r.ok && r.data.transport).toBe('file');
    expect(r.ok && r.data.slug).toBe('status');
    expect(r.ok && r.data.file).toBe(file);
  });

  it('call(): open_doc + execute menulis file; list_boards membaca', async () => {
    const file = await fixture('eksek');
    const c = client(file);
    const open = await c.call<{ slug: string; rev: number }>('/docs/open', {});
    expect(open.ok && open.data).toMatchObject({ slug: 'eksek', rev: 0 });
    const ex = await c.call<{ rev: number; created: { id: string }[] }>('/execute', {
      code: `add(null,{type:'board',name:'Hero',x:0,y:0,width:390,height:844,screen:'mobile'})`,
      description: 'tambah board hero uji',
    });
    expect(ex.ok && ex.data.rev).toBe(1);
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as { rev: number; pages: { children: { name: string }[] }[] };
    expect(onDisk.rev).toBe(1);
    expect(onDisk.pages[0]!.children[0]!.name).toBe('Hero');
    const boards = await c.call<{ boards: { name: string }[] }>('/boards', {});
    expect(boards.ok && boards.data.boards.map((b) => b.name)).toEqual(['Hero']);
  });

  it('setAgent menyalurkan nama agen ke penulis komentar', async () => {
    const file = await fixture('agen');
    const c = client(file);
    c.setAgent(() => ({ name: 'Claude Code', version: '2.1.0' }));
    const r = await c.call<{ thread: { messages: { author: { name: string; kind: string } }[] } }>('/comments/create', { text: 'geser tombol', x: 1, y: 2 });
    expect(r.ok && r.data.thread.messages[0]!.author).toEqual({ kind: 'agent', name: 'Claude Code' });
  });
});

describe('lakar --file: server MCP di atas FileClient', () => {
  it('execute + list_boards + undo lewat tool MCP; screenshot → NOT_SUPPORTED', async () => {
    const file = await fixture('mcp-doc');
    const c = await mcpClient(file);
    try {
      const tools = (await c.listTools()).tools.map((t) => t.name);
      expect(tools).toContain('execute');
      const ex = await c.callTool({ name: 'execute', arguments: { code: `add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'})`, description: 'board lewat mcp uji' } });
      expect(ex.isError).not.toBe(true);
      const boards = await c.callTool({ name: 'list_boards', arguments: {} });
      expect(boards.isError).not.toBe(true);
      expect(textOf(boards)).toContain('B');
      const undo = await c.callTool({ name: 'undo', arguments: {} });
      expect(undo.isError).not.toBe(true);
      const shot = await c.callTool({ name: 'screenshot', arguments: {} });
      expect(shot.isError).toBe(true);
      expect(textOf(shot)).toMatch(/NOT_SUPPORTED/);
    } finally {
      await c.close();
    }
  });
});
