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

/** The barcode printed on the lab's bottle: 6 to 32 letters, digits or . _ - (never starting with FLT). Null when unusable. */
export function normalizeBottleBarcode(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.replace(/\s+/g, '').toUpperCase();
  if (cleaned.startsWith('FLT')) return null;
  return /^[A-Z0-9][A-Z0-9._-]{5,31}$/.test(cleaned) ? cleaned : null;
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
  private detectorFormats: string[] = [];

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
        if (generation === this.generation) {
          // The lab's bottles may carry any common barcode type, so read every format the phone supports.
          this.detectorFormats = formats;
          this.hasBarcodeDetector.set(formats.length > 0);
        }
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

  selectTubeForBarcode(tube: StaffTube): void {
    this.activeTubeForBarcode.set(tube);
  }

  /** The tube a bottle scan belongs to: the one picked in the list, else the first still waiting for a bottle. */
  private pendingTarget(): StaffTube | null {
    const active = this.activeTubeForBarcode();
    const waiting = (t: StaffTube) => t.status === 'generated';
    return active && waiting(active) ? active : (this.tubes().find(waiting) ?? null);
  }

  async onManualSubmit(): Promise<void> {
    await this.handleScannedValue(this.manualCodeInput());
  }

  /**
   * One value from the camera or the keyboard. A code we generated scans that tube as before; any other usable
   * barcode is the bottle's own and is linked to the tube for the patient being collected.
   */
  private async handleScannedValue(raw: string): Promise<void> {
    this.errorMessage.set('');
    this.successMessage.set('');
    const generated = normalizeInputTubeCode(raw);
    const matchedTube = generated ? this.tubes().find((t) => t.tube_code === generated) : undefined;
    if (matchedTube) {
      if (matchedTube.status !== 'generated') {
        this.successMessage.set(`Tube ${matchedTube.tube_code} is already scanned.`);
        this.manualCodeInput.set('');
        return;
      }
      await this.scanTube(matchedTube.tube_code);
      return;
    }

    // Something that looks like one of our own codes but is not in this visit is never taken for a bottle barcode.
    if (raw.trim().toUpperCase().startsWith('FLT')) {
      this.errorMessage.set(
        generated
          ? `Tube ${generated} does not belong to this order.`
          : 'Invalid tube code format. Expected FLT-XXXX-XXXX.',
      );
      return;
    }

    const barcode = normalizeBottleBarcode(raw);
    if (!barcode) {
      this.errorMessage.set(
        'That is not a usable bottle barcode. Scan the barcode on the bottle, or type its 6 to 32 letters and digits.',
      );
      return;
    }
    const linked = this.tubes().find((t) => t.bottle_barcode === barcode);
    if (linked) {
      this.successMessage.set(`Bottle ${barcode} is already scanned for this visit.`);
      this.manualCodeInput.set('');
      return;
    }
    const target = this.pendingTarget();
    if (!target) {
      this.errorMessage.set('Every tube for this visit already has a bottle.');
      return;
    }
    await this.scanTube(target.tube_code, barcode);
  }

  async scanTube(tubeCode: string, barcode?: string): Promise<void> {
    if (!this.visible || this.isScanning() || !this.tubes().some((t) => t.tube_code === tubeCode))
      return;
    const generation = this.generation;
    this.isScanning.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.fieldService.scanTubeCollection(tubeCode, barcode);
      if (generation !== this.generation) return;
      // The bottle's barcode replaces the generated code, so match the tube by its id.
      const updated = this.tubes().map((t) => (t.id === res.tube.id ? res.tube : t));
      this.tubes.set(updated);
      this.activeTubeForBarcode.set(updated.find((t) => t.status === 'generated') ?? res.tube);
      this.tubesUpdated.emit();
      const who = [res.tube.patient_label, res.tube.test_name].filter(Boolean).join(' · ');
      this.successMessage.set(
        barcode
          ? `Bottle ${res.tube.bottle_barcode ?? barcode} linked${who ? ` to ${who}` : ''}.`
          : `Tube ${res.tube.tube_code} scanned and confirmed.`,
      );
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
    const detector = new (window as any).BarcodeDetector({ formats: this.detectorFormats });

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
            const raw = String(barcodes[0].rawValue ?? '');
            if (raw && !this.isScanning()) {
              this.stopCamera();
              await this.handleScannedValue(raw);
              return;
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
