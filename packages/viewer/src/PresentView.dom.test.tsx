// Mode Present (spec-prototype-mode): delegasi trigger `tap`/`press`/`hover`/`drag` pada stage, diuji lewat DOM
// dengan board yang benar-benar di-mount oleh @lakar/render ke shadow root (fixture tanpa teks/ikon → deps kosong).
// tap=click, press=pointerdown, hover=pointerover sekali per masuk (reset saat pointerout), drag=pointerdown +
// geser > 8px (klik sesudah drag tidak ikut memicu tap).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type Interaction, type LakarDocument } from '@lakar/schema';
import { PresentView } from './PresentView';
import { dom, renderUi } from './test/dom';
import { SLUG } from './test/fixtures';

const A = 'BoardA01';
const B = 'BoardB01';

const inter = (id: string, trigger: Interaction['trigger'], action: Interaction['action']): Interaction => ({ id, trigger, action });
const NAV_B = { kind: 'navigate', boardId: B } as const;
const LINK = { kind: 'openLink', url: 'https://lakar.example/x' } as const;

const node = (id: string, interactions: Interaction[], x = 10): Record<string, unknown> => ({
  type: 'frame',
  id,
  name: id,
  x,
  y: 10,
  width: 50,
  height: 50,
  position: 'absolute',
  fills: [{ type: 'solid', color: '#0E7490' }],
  interactions,
  children: [],
});

function makeDoc(): LakarDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
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
            id: A,
            name: 'Screen A',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            screen: 'landing',
            children: [
              node('TapNode1', [inter('IntTap01', 'tap', NAV_B)], 10),
              node('PressNd1', [inter('IntPress', 'press', NAV_B)], 70),
              node('HoverNd1', [inter('IntHover', 'hover', LINK)], 130),
              node('DragNd01', [inter('IntDrag1', 'drag', NAV_B)], 190),
              node('LnkDrag1', [inter('IntDrLk1', 'drag', LINK), inter('IntDrLk2', 'tap', LINK)], 250),
            ],
          },
          { type: 'board', id: B, name: 'Screen B', x: 600, y: 0, width: 400, height: 300, screen: 'landing', children: [] },
        ],
      },
    ],
  } as unknown as LakarDocument;
}

const host = () => document.querySelector<HTMLElement>('.present-host')!;
/** Elemen node `id` di dalam shadow root board yang sedang di-mount. */
const el = async (id: string) => waitFor(() => expect(host().shadowRoot?.querySelector(`[data-lakar-id="${id}"]`) ?? null).not.toBeNull()).then(() => host().shadowRoot!.querySelector<HTMLElement>(`[data-lakar-id="${id}"]`)!);
const onBoard = (name: string) => waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());

async function present() {
  dom().daemon.on('GET', '/viewer/docs/demo', () => ({ doc: makeDoc() }));
  const open = vi.fn();
  vi.stubGlobal('open', open);
  renderUi(<PresentView slug={SLUG} onExit={() => {}} />);
  await onBoard('Screen A');
  return { open };
}

describe('PresentView — trigger interaksi', () => {
  it('tap: click pada node menavigasi ke board target', async () => {
    await present();
    fireEvent.click(await el('TapNode1'));
    await onBoard('Screen B');
  });

  it('press: pointerdown langsung menavigasi tanpa menunggu click', async () => {
    await present();
    fireEvent.pointerDown(await el('PressNd1'));
    await onBoard('Screen B');
  });

  it('hover: pointerover memicu aksi sekali per masuk; pointerout lalu masuk lagi memicu ulang', async () => {
    const { open } = await present();
    const h = await el('HoverNd1');
    fireEvent.pointerOver(h);
    fireEvent.pointerOver(h);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    fireEvent.pointerOut(h);
    fireEvent.pointerOver(h);
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenCalledWith('https://lakar.example/x', '_blank', 'noopener');
  });

  it('drag: geser di bawah ambang tidak memicu; melewati ambang menavigasi', async () => {
    await present();
    const d = await el('DragNd01');
    fireEvent.pointerDown(d, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(d, { clientX: 104, clientY: 102 });
    expect(screen.getByText('Screen A')).toBeInTheDocument();
    fireEvent.pointerMove(d, { clientX: 112, clientY: 104 });
    await onBoard('Screen B');
  });

  it('drag diikuti pointerup+click tidak ikut memicu interaksi tap pada node yang sama', async () => {
    const { open } = await present();
    // Node tetap ter-mount (drag → openLink): click gestur ini harus tertelan, bukan memicu tap.
    const d = await el('LnkDrag1');
    fireEvent.pointerDown(d, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(d, { clientX: 120, clientY: 104 });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    fireEvent.pointerUp(d);
    fireEvent.click(d);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
