import { describe, it, expect, vi } from 'vitest';
import { downloadTextFile, DownloadFile } from './csv-download';

describe('downloadTextFile', () => {
  it('creates a Blob with unchanged content (including BOM), sets anchor attributes, clicks once and revokes URL', () => {
    const mockFile: DownloadFile = {
      filename: 'revenue_2026-10-25.csv',
      content: '\uFEFFDate,Revenue\n2026-10-25,1000',
    };

    let passedParts: any[] = [];
    let passedOptions: any;
    const fakeBlob = { size: 100 } as Blob;
    const createBlob = vi.fn((parts: any[], opts: any) => {
      passedParts = parts;
      passedOptions = opts;
      return fakeBlob;
    });

    const createObjectUrl = vi.fn().mockReturnValue('blob:http://localhost/fake-url');
    const revokeObjectUrl = vi.fn();
    const fakeAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const createAnchor = vi.fn().mockReturnValue(fakeAnchor);

    downloadTextFile(mockFile, {
      createBlob,
      createObjectUrl,
      revokeObjectUrl,
      createAnchor,
    });

    expect(createBlob).toHaveBeenCalledTimes(1);
    expect(passedParts[0]).toBe(mockFile.content);
    // Check byte order mark preserved
    expect((passedParts[0] as string).charCodeAt(0)).toBe(0xfeff);
    expect(passedOptions).toEqual({ type: 'text/csv;charset=utf-8' });

    expect(createObjectUrl).toHaveBeenCalledWith(fakeBlob);
    expect(createAnchor).toHaveBeenCalledTimes(1);
    expect(fakeAnchor.href).toBe('blob:http://localhost/fake-url');
    expect(fakeAnchor.download).toBe('revenue_2026-10-25.csv');
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:http://localhost/fake-url');
  });

  it('revokes the object URL even if anchor click throws', () => {
    const mockFile: DownloadFile = {
      filename: 'test.csv',
      content: 'col1,col2',
    };

    const revokeObjectUrl = vi.fn();
    const fakeAnchor = {
      href: '',
      download: '',
      click: vi.fn().mockImplementation(() => {
        throw new Error('Click failed');
      }),
    } as unknown as HTMLAnchorElement;

    expect(() =>
      downloadTextFile(mockFile, {
        createBlob: vi.fn().mockReturnValue({} as Blob),
        createObjectUrl: vi.fn().mockReturnValue('blob:test'),
        revokeObjectUrl,
        createAnchor: vi.fn().mockReturnValue(fakeAnchor),
      }),
    ).toThrow('Click failed');

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });
});
