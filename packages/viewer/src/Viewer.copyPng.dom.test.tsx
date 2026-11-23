// Copy as PNG (story 8.7, desain 11 layar gj8lD/BD9N7): item context menu tepat di bawah Duplicate dengan shortcut
// Ctrl+Shift+C menyalin satu node terpilih sebagai PNG 2x lewat POST /viewer/docs/:slug/export ({boardId, scale,
// nodeId?}) ke navigator.clipboard (ClipboardItem image/png). Toast "Copied as PNG" / "Couldn't copy as PNG" + Try
// again. Item nonaktif untuk seleksi jamak, alamat komposit (isi instance), dan saat pratinjau versi.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import { dom, fail, renderUi } from './test/dom';
import { BOARD, CARD, makeDoc, SLUG, type Extra } from './test/fixtures';
import { Viewer } from './Viewer';

const PNG = new Uint8Array([137, 80, 78, 71]);

/** `ClipboardItem` belum ada di jsdom: mencatat map mime → blob yang diberikan konstruktor. */
class FakeClipboardItem {
  constructor(readonly data: Record<string, Blob>) {}
  get types() {
    return Object.keys(this.data);
  }
}

/** Stub `navigator.clipboard.write` + `ClipboardItem` (jsdom tidak punya); mengembalikan mock `write`. */
function clipboard() {
  const write = vi.fn(async (_items: FakeClipboardItem[]) => {});
  const prev = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { write } });
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  onTestFinished(() => {
    if (prev) Object.defineProperty(window.navigator, 'clipboard', prev);
    else delete (window.navigator as { clipboard?: unknown }).clipboard;
  });
  return write;
}

function daemon(doc: LakarDocument = makeDoc(1)) {
  const d = dom().daemon;
  d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc }));
  d.on('GET', `/viewer/docs/${SLUG}/history`, () => ({ entries: [] }));
  d.on(
    'POST',
    `/viewer/docs/${SLUG}/export`,
    () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'content-disposition': 'attachment; filename="demo-card@2x.png"' } }),
  );
  return d;
}

const layer = (id: string) => document.querySelector<HTMLElement>(`[data-layer="${id}"]`);
const live = () => document.querySelector<HTMLElement>(`[data-live-board="${BOARD}"]`)!;
const mounted = (id: string) => waitFor(() => expect(live().shadowRoot?.querySelector(`[data-lakar-id="${id}"]`) ?? null).not.toBeNull());
const exports_ = (d: ReturnType<typeof daemon>) => d.find('POST', `/viewer/docs/${SLUG}/export`);

async function openViewer(doc?: LakarDocument) {
  const d = daemon(doc);
  const view = renderUi(<Viewer slug={SLUG} />);
  await waitFor(() => expect(layer(BOARD)).not.toBeNull());
  return { ...view, daemon: d };
}

/** Klik kanan baris Layers `id` → menu aksi terbuka. */
async function openMenu(id: string) {
  fireEvent.contextMenu(layer(id)!);
  return await screen.findByRole('menu', { name: 'Layer actions' });
}

/** Dokumen dengan master Chip + satu instance; isi instance beralamat komposit `Inst0001/Rect0001`. */
function instanceDoc(): LakarDocument {
  return {
    schemaVersion: 8,
    id: 'Doc00001',
    rev: 1,
    tokens: {},
    pages: [
      {
        id: 'Page0001',
        name: 'Page',
        children: [
          {
            type: 'board',
            id: BOARD,
            name: 'Hero',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            screen: 'landing',
            children: [
              {
                type: 'frame',
                id: 'Mast0001',
                name: 'Chip',
                position: 'absolute',
                x: 20,
                y: 20,
                width: 100,
                height: 40,
                layout: 'none',
                component: { props: [], slots: [] },
                children: [{ type: 'rect', id: 'Rect0001', name: 'Body', position: 'absolute', x: 0, y: 0, width: 40, height: 20, fills: [{ type: 'solid', color: '#0E7490' }] }],
              },
              { type: 'instance', id: 'Inst0001', name: 'Chip', componentId: 'Mast0001', position: 'absolute', x: 200, y: 20 },
            ],
          },
        ],
      },
    ],
  } as unknown as LakarDocument;
}

describe('Viewer — Copy as PNG', () => {
  it('item tepat di bawah Duplicate dengan Ctrl+Shift+C: klik → export {boardId, scale:2, nodeId}, clipboard image/png, toast sukses', async () => {
    const v = await openViewer();
    const write = clipboard();
    await mounted(CARD);
    await v.user.click(layer(CARD)!);
    const menu = await openMenu(CARD);
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((b) => b.textContent ?? '');
    const at = labels.findIndex((l) => l.includes('Duplicate'));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(labels[at + 1]).toContain('Copy as PNG');
    const item = within(menu).getByRole('menuitem', { name: 'Copy as PNG' });
    expect(item).toBeEnabled();
    expect(within(item).getByText('Ctrl+Shift+C')).toBeInTheDocument();

    await v.user.click(item);
    await waitFor(() => expect(exports_(v.daemon)).toHaveLength(1));
    expect(exports_(v.daemon)[0]!.body).toEqual({ boardId: BOARD, scale: 2, nodeId: CARD });
    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0]![0] as unknown as FakeClipboardItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.types).toEqual(['image/png']);
    expect(items[0]!.data['image/png']!.size).toBe(4);
    expect(await screen.findByText('Copied as PNG')).toBeInTheDocument();
  });

  it('board terpilih: body tanpa nodeId (perilaku lama), PNG board 2x', async () => {
    const v = await openViewer();
    const write = clipboard();
    await mounted(CARD);
    const menu = await openMenu(BOARD);
    const item = within(menu).getByRole('menuitem', { name: 'Copy as PNG' });
    expect(item).toBeEnabled();
    await v.user.click(item);
    await waitFor(() => expect(exports_(v.daemon)).toHaveLength(1));
    expect(exports_(v.daemon)[0]!.body).toEqual({ boardId: BOARD, scale: 2 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Copied as PNG')).toBeInTheDocument();
  });

  it('shortcut Ctrl+Shift+C pada satu node terpilih sama dengan klik item', async () => {
    const v = await openViewer();
    const write = clipboard();
    await mounted(CARD);
    await v.user.click(layer(CARD)!);
    fireEvent.keyDown(document.body, { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(exports_(v.daemon)).toHaveLength(1));
    expect(exports_(v.daemon)[0]!.body).toEqual({ boardId: BOARD, scale: 2, nodeId: CARD });
    expect(write).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Copied as PNG')).toBeInTheDocument();
  });

  it('seleksi lebih dari satu node: item nonaktif dan shortcut diam', async () => {
    const SECOND: Extra = { id: 'Card0002', name: 'Card 2', x: 180, y: 20, width: 120, height: 80 };
    const v = await openViewer(makeDoc(1, [SECOND]));
    await mounted('Card0002');
    await v.user.click(layer(CARD)!);
    fireEvent.click(layer('Card0002')!, { shiftKey: true });
    const menu = await openMenu(CARD);
    expect(within(menu).getByRole('menuitem', { name: 'Copy as PNG' })).toBeDisabled();
    // Menu ditutup dulu; shortcut tidak mengirim permintaan apa pun.
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Layer actions' })).toBeNull());
    fireEvent.keyDown(document.body, { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(exports_(v.daemon)).toHaveLength(0);
  });

  it('alamat komposit (isi instance): item nonaktif', async () => {
    const v = await openViewer(instanceDoc());
    // Buka instance di Layers supaya baris isinya (alamat `Inst0001/Rect0001`) tampil.
    const inst = layer('Inst0001');
    expect(inst).not.toBeNull();
    fireEvent.click(inst!.querySelector('.chevron')!);
    await waitFor(() => expect(layer('Inst0001/Rect0001')).not.toBeNull());
    const menu = await openMenu('Inst0001/Rect0001');
    expect(within(menu).getByRole('menuitem', { name: 'Copy as PNG' })).toBeDisabled();
    expect(exports_(v.daemon)).toHaveLength(0);
  });

  it('ekspor gagal → toast "Couldn\'t copy as PNG" + Try again mengulang langkah yang sama', async () => {
    const v = await openViewer();
    let broken = true;
    v.daemon.on('POST', `/viewer/docs/${SLUG}/export`, () => {
      if (broken) throw fail('RENDER_FAILED', 503, 'render gagal');
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const write = clipboard();
    await mounted(CARD);
    await v.user.click(layer(CARD)!);
    const menu = await openMenu(CARD);
    await v.user.click(within(menu).getByRole('menuitem', { name: 'Copy as PNG' }));
    expect(await screen.findByText("Couldn't copy as PNG: render gagal")).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();

    broken = false;
    await v.user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(exports_(v.daemon)).toHaveLength(2));
    expect(write).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Copied as PNG')).toBeInTheDocument();
  });

  it('penulisan clipboard ditolak → toast error yang sama', async () => {
    const v = await openViewer();
    const write = clipboard();
    write.mockRejectedValueOnce(new Error('denied'));
    await mounted(CARD);
    await v.user.click(layer(CARD)!);
    const menu = await openMenu(CARD);
    await v.user.click(within(menu).getByRole('menuitem', { name: 'Copy as PNG' }));
    expect(await screen.findByText('Couldn\'t copy as PNG: denied')).toBeInTheDocument();
  });

  it('pratinjau versi: item nonaktif seperti aksi edit lain', async () => {
    const d = dom().daemon;
    d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: makeDoc(2) }));
    // Dua entri: rev 2 = current, rev 1 (bersnapshot) bisa dipratinjau.
    d.on('GET', `/viewer/docs/${SLUG}/history`, () => ({
      entries: [
        { rev: 2, description: 'Add card', opsSummary: '', opCount: 1, at: new Date().toISOString(), session: 's1', snapshot: true },
        { rev: 1, description: 'Seed', opsSummary: '', opCount: 1, at: new Date().toISOString(), session: 's1', snapshot: true },
      ],
    }));
    d.on('GET', `/viewer/docs/${SLUG}/revs/1`, () => ({ doc: makeDoc(1) }));
    const v = renderUi(<Viewer slug={SLUG} />);
    await waitFor(() => expect(layer(BOARD)).not.toBeNull());
    await v.user.click(screen.getByRole('tab', { name: 'History' }));
    await v.user.click(await screen.findByTitle('Preview this version'));
    await waitFor(() => expect(screen.getAllByText(/Previewing/).length).toBeGreaterThan(0));
    const menu = await openMenu(CARD);
    expect(within(menu).getByRole('menuitem', { name: 'Copy as PNG' })).toBeDisabled();
    expect(exports_(d)).toHaveLength(0);
  });
});
