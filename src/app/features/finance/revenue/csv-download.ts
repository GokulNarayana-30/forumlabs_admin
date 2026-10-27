import { InjectionToken } from '@angular/core';

export interface DownloadFile {
  filename: string;
  content: string;
}

export interface CsvDownloadDependencies {
  createBlob?: (parts: BlobPart[], options?: BlobPropertyBag) => Blob;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  createAnchor?: () => HTMLAnchorElement;
}

export function downloadTextFile(file: DownloadFile, deps: CsvDownloadDependencies = {}): void {
  const createBlob = deps.createBlob ?? ((parts, opts) => new Blob(parts, opts));
  const createObjectUrl = deps.createObjectUrl ?? ((blob) => window.URL.createObjectURL(blob));
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url) => window.URL.revokeObjectURL(url));
  const createAnchor = deps.createAnchor ?? (() => document.createElement('a'));

  const blob = createBlob([file.content], { type: 'text/csv;charset=utf-8' });
  const url = createObjectUrl(blob);
  try {
    const anchor = createAnchor();
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
  } finally {
    revokeObjectUrl(url);
  }
}

export const CSV_DOWNLOADER = new InjectionToken<(file: DownloadFile) => void>('CSV_DOWNLOADER', {
  providedIn: 'root',
  factory: () => downloadTextFile,
});
