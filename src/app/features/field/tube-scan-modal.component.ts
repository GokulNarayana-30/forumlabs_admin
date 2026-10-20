/*
 * Portions of the Code 128 pattern table below are adapted from the ZXing project:
 * https://github.com/zxing/zxing/blob/zxing-3.5.3/core/src/main/java/com/google/zxing/oned/Code128Reader.java
 *
 * Copyright 2008 ZXing authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 */

import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldService, FieldVisit, StaffTube } from './services/field.service';
import { errorText } from '../../core/api/error-text';

export const CODE128_PATTERNS: readonly (readonly number[])[] = [
  [2, 1, 2, 2, 2, 2], // 0
  [2, 2, 2, 1, 2, 2],
  [2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2], // 5
  [1, 2, 2, 2, 1, 3],
  [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2],
  [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2], // 10
  [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2],
  [1, 2, 2, 1, 3, 2],
  [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2], // 15
  [1, 2, 3, 1, 2, 2],
  [1, 2, 3, 2, 2, 1],
  [2, 2, 3, 2, 1, 1],
  [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], // 20
  [2, 1, 3, 2, 1, 2],
  [2, 2, 3, 1, 1, 2],
  [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2], // 25
  [3, 2, 1, 2, 2, 1],
  [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2],
  [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3], // 30
  [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1],
  [1, 1, 1, 3, 2, 3],
  [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1], // 35
  [1, 1, 2, 3, 1, 3],
  [1, 3, 2, 1, 1, 3],
  [1, 3, 2, 3, 1, 1],
  [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], // 40
  [2, 3, 1, 3, 1, 1],
  [1, 1, 2, 1, 3, 3],
  [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3], // 45
  [1, 1, 3, 3, 2, 1],
  [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1],
  [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1], // 50
  [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1],
  [2, 1, 3, 1, 3, 1],
  [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1], // 55
  [3, 3, 1, 1, 2, 1],
  [3, 1, 2, 1, 1, 3],
  [3, 1, 2, 3, 1, 1],
  [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], // 60
  [2, 2, 1, 4, 1, 1],
  [4, 3, 1, 1, 1, 1],
  [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4], // 65
  [1, 2, 1, 4, 2, 1],
  [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1],
  [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2], // 70
  [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1],
  [1, 4, 2, 1, 1, 2],
  [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1], // 75
  [2, 2, 1, 1, 1, 4],
  [4, 1, 3, 1, 1, 1],
  [2, 4, 1, 1, 1, 2],
  [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], // 80
  [1, 2, 1, 1, 4, 2],
  [1, 2, 1, 2, 4, 1],
  [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1], // 85
  [4, 1, 1, 2, 1, 2],
  [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1],
  [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1], // 90
  [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3],
  [1, 1, 1, 3, 4, 1],
  [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3], // 95
  [1, 1, 4, 3, 1, 1],
  [4, 1, 1, 1, 1, 3],
  [4, 1, 1, 3, 1, 1],
  [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], // 100
  [3, 1, 1, 1, 4, 1],
  [4, 1, 1, 1, 3, 1],
  [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4], // 104 (Start B)
  [2, 1, 1, 2, 3, 2], // 105 (Start C)
  [2, 3, 3, 1, 1, 1, 2], // 106 (Stop)
];

export interface BarcodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarcodeSvgData {
  totalWidth: number;
  height: number;
  bars: BarcodeRect[];
}

export function encodeCode128B(text: string): BarcodeSvgData {
  const START_B = 104;
  const STOP = 106;
  const QUIET_ZONE = 10;
  const BAR_HEIGHT = 60;

  const symbolValues: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    symbolValues.push(code);
    checksum += code * (i + 1);
  }

  const checksumSymbol = checksum % 103;
  symbolValues.push(checksumSymbol);
  symbolValues.push(STOP);

  const bars: BarcodeRect[] = [];
  let currentX = QUIET_ZONE;

  for (const sym of symbolValues) {
    const pattern = CODE128_PATTERNS[sym];
    if (!pattern) continue;

    for (let pIdx = 0; pIdx < pattern.length; pIdx++) {
      const width = pattern[pIdx]!;
      if (pIdx % 2 === 0) {
        // Bar
        bars.push({
          x: currentX,
          y: 0,
          width,
          height: BAR_HEIGHT,
        });
      }
      currentX += width;
    }
  }

  const totalWidth = currentX + QUIET_ZONE;
  return {
    totalWidth,
    height: BAR_HEIGHT,
    bars,
  };
}

export function normalizeInputTubeCode(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  let cleaned = input.trim().toUpperCase();
  if (cleaned.startsWith('FLT')) {
    cleaned = cleaned.slice(3);
  }
  cleaned = cleaned.replace(/[\s\-_]/g, '');
  cleaned = cleaned.replace(/[IL]/g, '1').replace(/O/g, '0');

  if (cleaned.length !== 8) {
    return null;
  }

  return `FLT-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

@Component({
  selector: 'app-tube-scan-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tube-scan-modal.component.html',
})
export class TubeScanModalComponent implements OnChanges, OnDestroy {
  private readonly fieldService = inject(FieldService);

  @Input() visit: FieldVisit | null = null;
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly tubesUpdated = new EventEmitter<void>();

  @ViewChild('scannerVideo') videoRef?: ElementRef<HTMLVideoElement>;

  readonly tubes = signal<StaffTube[]>([]);
  readonly isGenerating = signal<boolean>(false);
  readonly isScanning = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');
  readonly manualCodeInput = signal<string>('');
  readonly cameraActive = signal<boolean>(false);
  readonly hasBarcodeDetector = signal<boolean>(false);
  readonly activeTubeForBarcode = signal<StaffTube | null>(null);

  private generation = 0;

  private cameraGeneration = 0;
  private cameraStartTimer: ReturnType<typeof setTimeout> | null = null;
  private mediaStream: MediaStream | null = null;
  private scanAnimationId: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visit'] || changes['visible']) {
      this.invalidateVisit();
      if (this.visible && this.visit) {
        this.tubes.set(this.visit.tubes || []);
        this.activeTubeForBarcode.set(this.tubes()[0] ?? null);
        void this.detectNativeScannerSupport();
      }
    }
  }

  private invalidateVisit(): void {
    this.generation++;
    this.stopCamera();
    this.tubes.set([]);
    this.activeTubeForBarcode.set(null);
    this.isGenerating.set(false);
    this.isScanning.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.manualCodeInput.set('');
  }

  ngOnDestroy(): void {
    this.invalidateVisit();
  }

  close(): void {
    this.invalidateVisit();
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async detectNativeScannerSupport(): Promise<void> {
    const generation = this.generation;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const formats: string[] = await (window as any).BarcodeDetector.getSupportedFormats();
        if (generation === this.generation)
          this.hasBarcodeDetector.set(formats.includes('code_128'));
      } catch {
        if (generation === this.generation) this.hasBarcodeDetector.set(false);
      }
    } else {
      this.hasBarcodeDetector.set(false);
    }
  }

  async generateTubes(): Promise<void> {
    if (!this.visible || !this.visit || this.isGenerating()) return;
    const generation = this.generation;
    this.isGenerating.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.fieldService.generateTubes(this.visit.order_id);
      if (generation !== this.generation) return;
      this.tubes.set(res.tubes);
      if (res.tubes.length > 0) {
        this.activeTubeForBarcode.set(res.tubes[0]!);
      }
      this.tubesUpdated.emit();
      this.successMessage.set(`${res.tubes.length} tube(s) generated successfully.`);
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Failed to generate tubes'));
    } finally {
      if (generation === this.generation) this.isGenerating.set(false);
    }
  }

  getBarcodeSvg(code: string): BarcodeSvgData {
    return encodeCode128B(code);
  }

  selectTubeForBarcode(tube: StaffTube): void {
    this.activeTubeForBarcode.set(tube);
  }

  printBarcode(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  async onManualSubmit(): Promise<void> {
    const raw = this.manualCodeInput();
    const normalized = normalizeInputTubeCode(raw);
    if (!normalized) {
      this.errorMessage.set('Invalid tube code format. Expected FLT-XXXX-XXXX or 8 characters.');
      return;
    }

    const matchedTube = this.tubes().find((t) => t.tube_code === normalized);
    if (!matchedTube) {
      this.errorMessage.set(`Tube ${normalized} does not belong to this order.`);
      return;
    }

    if (matchedTube.status === 'scanned_at_collection') {
      this.successMessage.set(`Tube ${normalized} is already scanned.`);
      this.manualCodeInput.set('');
      return;
    }

    await this.scanTube(matchedTube.tube_code);
  }

  async scanTube(tubeCode: string): Promise<void> {
    if (!this.visible || this.isScanning() || !this.tubes().some((t) => t.tube_code === tubeCode))
      return;
    const generation = this.generation;
    this.isScanning.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.fieldService.scanTubeCollection(tubeCode);
      if (generation !== this.generation) return;
      const updated = this.tubes().map((t) => (t.tube_code === tubeCode ? res.tube : t));
      this.tubes.set(updated);
      this.tubesUpdated.emit();
      this.successMessage.set(`Tube ${tubeCode} scanned and confirmed.`);
      this.manualCodeInput.set('');
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Failed to record tube scan'));
    } finally {
      if (generation === this.generation) this.isScanning.set(false);
    }
  }

  async startCamera(): Promise<void> {
    if (!this.visible) return;
    this.stopCamera();
    const generation = this.cameraGeneration;
    if (!navigator?.mediaDevices?.getUserMedia) {
      this.errorMessage.set(
        'Camera access not supported on this browser. Please type the tube code.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (generation !== this.cameraGeneration || !this.visible) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.mediaStream = stream;
      this.cameraActive.set(true);

      this.cameraStartTimer = setTimeout(() => {
        if (generation !== this.cameraGeneration || !this.visible) return;
        if (this.videoRef?.nativeElement && this.mediaStream) {
          this.videoRef.nativeElement.srcObject = this.mediaStream;
          void this.videoRef.nativeElement.play().catch(() => {
            if (generation !== this.cameraGeneration) return;
            this.stopCamera();
            this.errorMessage.set('Camera unavailable. Please type the tube code.');
          });
          this.beginBarcodeScanningLoop();
        }
      }, 50);
    } catch {
      if (generation !== this.cameraGeneration) return;
      this.cameraActive.set(false);
      this.errorMessage.set(
        'Camera permission denied or camera unavailable. Please type the tube code.',
      );
    }
  }

  stopCamera(): void {
    this.cameraGeneration++;
    if (this.cameraStartTimer !== null) {
      clearTimeout(this.cameraStartTimer);
      this.cameraStartTimer = null;
    }
    if (this.videoRef?.nativeElement) this.videoRef.nativeElement.srcObject = null;
    if (this.scanAnimationId !== null) {
      cancelAnimationFrame(this.scanAnimationId);
      this.scanAnimationId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.cameraActive.set(false);
  }

  private beginBarcodeScanningLoop(): void {
    if (!this.hasBarcodeDetector() || !(window as any).BarcodeDetector) return;

    const generation = this.cameraGeneration;
    const detector = new (window as any).BarcodeDetector({ formats: ['code_128'] });

    const scanFrame = async () => {
      if (
        generation !== this.cameraGeneration ||
        !this.visible ||
        !this.cameraActive() ||
        !this.videoRef?.nativeElement
      )
        return;
      const video = this.videoRef.nativeElement;

      if (video.readyState >= 2) {
        try {
          const barcodes = await detector.detect(video);
          if (generation !== this.cameraGeneration || !this.visible) return;
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            const normalized = normalizeInputTubeCode(raw);
            if (normalized) {
              const matchedTube = this.tubes().find((t) => t.tube_code === normalized);
              if (matchedTube && matchedTube.status !== 'scanned_at_collection') {
                this.stopCamera();
                await this.scanTube(matchedTube.tube_code);
                return;
              }
            }
          }
        } catch {
          // Frame read error, continue next frame
        }
      }

      if (generation === this.cameraGeneration && this.cameraActive()) {
        this.scanAnimationId = requestAnimationFrame(scanFrame);
      }
    };

    this.scanAnimationId = requestAnimationFrame(scanFrame);
  }
}
