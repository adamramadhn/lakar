// Dialog Export code (spec-kode-5-export-ui): kode dihasilkan @lakar/codegen di viewer; target/opsi mengubah daftar file
// dengan file aktif dipertahankan, Copy file menyalin isi file aktif, Download .zip mengunduh, Escape menutup.
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeExportDialog } from './CodeExportDialog';
import { renderUi } from './test/dom';
import { BOARD, makeDoc } from './test/fixtures';

const fileNames = () =>
  within(screen.getByLabelText('Files'))
    .queryAllByRole('button')
    .map((b) => b.querySelector('.code-file-name')!.textContent);
/** Nama file aktif di tab pratinjau. */
const activeFile = () => document.querySelector('.code-tab .mono')?.textContent;

async function open() {
  const onClose = vi.fn();
  const view = renderUi(<CodeExportDialog doc={makeDoc(3)} nodeId={BOARD} onClose={onClose} />);
  await waitFor(() => expect(activeFile()).toMatch(/\.tsx$/));
  return { ...view, onClose };
}

describe('CodeExportDialog', () => {
  it('membuka dengan React + Tailwind + TypeScript: daftar file, pratinjau, dan header node · rev', async () => {
    await open();
    expect(screen.getByRole('dialog', { name: 'Export code' })).toBeInTheDocument();
    expect(screen.getByText(/^Hero · .* · rev 3$/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'React + Tailwind' })).toHaveAttribute('aria-checked', 'true');
    expect(fileNames().some((n) => n?.endsWith('.tsx'))).toBe(true);
    expect(screen.getByLabelText(`Code of ${activeFile()}`).querySelectorAll('.code-line').length).toBeGreaterThan(0);
  });

  it('TypeScript off: file aktif .tsx berganti .jsx (tetap aktif); React + CSS menambah file .css', async () => {
    const { user } = await open();
    const tsx = activeFile()!;
    await user.click(screen.getByRole('checkbox', { name: /TypeScript/ }));
    await waitFor(() => expect(activeFile()).toBe(tsx.replace(/\.tsx$/, '.jsx')));
    expect(fileNames()).toEqual(['Hero.jsx', 'tokens.css', 'theme.css']);

    // React + CSS: berkas CSS komponen menggantikan theme.css Tailwind; file aktif tetap komponennya.
    await user.click(screen.getByRole('radio', { name: 'React + CSS' }));
    await waitFor(() => expect(fileNames()).not.toContain('theme.css'));
    expect(fileNames().some((n) => /^Hero.*\.css$/.test(n ?? ''))).toBe(true);
    expect(activeFile()).toBe('Hero.jsx');
  });

  it('Copy file menyalin isi file aktif; Download .zip memberi catatan nama zip', async () => {
    const { user } = await open();
    // Tombol footer (teks) berganti "Copied"; clipboard tiruan user-event berisi kode file aktif.
    await user.click(within(document.querySelector('.code-footer')!).getByRole('button', { name: 'Copy file' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('export');
    const preview = [...screen.getByLabelText(`Code of ${activeFile()}`).querySelectorAll('.code-line code')].map((c) => c.textContent).join('\n');
    expect(copied.trimEnd()).toBe(preview.trimEnd());

    // Unduhan = klik <a download> (jsdom tidak bernavigasi; nama berkas dicatat).
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    await user.click(screen.getByRole('button', { name: 'Download .zip' }));
    expect(downloads).toEqual(['Hero-react-tailwind.zip']);
    expect(screen.getByText('Download started: Hero-react-tailwind.zip')).toBeInTheDocument();
  });

  it('Escape dan tombol Close menutup dialog', async () => {
    const { user, onClose } = await open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
