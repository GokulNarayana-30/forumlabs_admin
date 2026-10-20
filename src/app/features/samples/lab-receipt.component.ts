import { Component, ElementRef, OnInit, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SamplesService, Tube } from './samples.service';
import { SampleRejectModalComponent } from './sample-reject-modal.component';
import { OverdueSamplesComponent } from './overdue-samples.component';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-lab-receipt',
  standalone: true,
  imports: [CommonModule, FormsModule, SampleRejectModalComponent, OverdueSamplesComponent],
  templateUrl: './lab-receipt.component.html',
})
export class LabReceiptComponent implements OnInit, OnDestroy {
  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }

  private readonly samplesService = inject(SamplesService);

  @ViewChild('barcodeInput') barcodeInputRef!: ElementRef<HTMLInputElement>;

  readonly activeTab = signal<'scan' | 'overdue'>('scan');

  // Scanning & lookup state
  readonly tubeCodeInput = signal<string>('');
  readonly isLookingUp = signal<boolean>(false);
  readonly currentTube = signal<Tube | null>(null);
  readonly scanErrorMessage = signal<string>('');
  readonly successMessage = signal<string>('');
  readonly orderTransitionNote = signal<string>('');

  // Receipt submission state
  readonly receiptReason = signal<string>('Specimen received in lab intact');
  readonly isSubmittingReceipt = signal<boolean>(false);
  readonly receiptErrorMessage = signal<string>('');

  // Reject modal state
  readonly isRejectModalVisible = signal<boolean>(false);

  ngOnInit(): void {
    // Focus will be managed after view init
  }

  setTab(tab: 'scan' | 'overdue'): void {
    this.activeTab.set(tab);
    if (tab === 'scan') {
      setTimeout(() => this.focusInput(), 100);
    }
  }

  focusInput(): void {
    if (this.barcodeInputRef?.nativeElement) {
      this.barcodeInputRef.nativeElement.focus();
      this.barcodeInputRef.nativeElement.select();
    }
  }

  async onSearchOrScan(): Promise<void> {
    const rawCode = this.tubeCodeInput().trim();
    if (!rawCode) return;

    const generation = ++this.generation;
    this.currentTube.set(null);
    this.isRejectModalVisible.set(false);
    this.isSubmittingReceipt.set(false);
    this.isLookingUp.set(true);
    this.scanErrorMessage.set('');
    this.receiptErrorMessage.set('');
    this.successMessage.set('');
    this.orderTransitionNote.set('');

    try {
      const res = await this.samplesService.getTubeByCode(rawCode);
      if (generation !== this.generation) return;
      this.currentTube.set(res.tube);
      this.receiptReason.set('Specimen received in lab intact');
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      // Clear current tube so stale tube details are not displayed
      this.currentTube.set(null);
      this.scanErrorMessage.set(errorText(err, 'Specimen tube not found'));
    } finally {
      if (generation === this.generation) this.isLookingUp.set(false);
    }
  }

  async onReceiveTube(): Promise<void> {
    const tube = this.currentTube();
    if (
      !tube ||
      this.isLookingUp() ||
      this.isSubmittingReceipt() ||
      tube.status === 'received' ||
      tube.status === 'rejected'
    )
      return;
    const generation = this.generation;

    const reason = this.receiptReason().trim();
    // Blank receipt reason disables submit and sends nothing
    if (!reason || reason.length > 300) {
      this.receiptErrorMessage.set('Receipt reason is required (1-300 characters).');
      return;
    }

    this.isSubmittingReceipt.set(true);
    this.receiptErrorMessage.set('');
    this.scanErrorMessage.set('');

    try {
      const res = await this.samplesService.receiveTube(tube.tube_code, { reason });
      if (generation !== this.generation) return;
      this.currentTube.set(res.tube);
      this.successMessage.set(`Tube ${res.tube.tube_code} successfully received at lab.`);

      // Check if order transitioned or tube is fully received
      if (res.tube.status === 'received') {
        this.orderTransitionNote.set(
          `Specimen status updated to 'received'. When all current tubes for booking ${res.tube.booking_ref} are received, the order transitions to 'received_by_lab'.`,
        );
      }

      // Reset input for rapid sequential scanner input
      this.tubeCodeInput.set('');
      setTimeout(() => this.focusInput(), 100);
    } catch (err: unknown) {
      if (generation === this.generation)
        this.receiptErrorMessage.set(errorText(err, 'Failed to record tube receipt'));
    } finally {
      if (generation === this.generation) this.isSubmittingReceipt.set(false);
    }
  }

  openRejectModal(): void {
    if (!this.currentTube() || this.isLookingUp() || this.isSubmittingReceipt()) return;
    this.isRejectModalVisible.set(true);
  }

  async onRejectionCompleted(): Promise<void> {
    const generation = this.generation;
    const tube = this.currentTube();
    if (!tube) return;

    this.successMessage.set(
      `Specimen ${tube.tube_code} rejected. Order status set to 'recollection_required'.`,
    );
    this.orderTransitionNote.set('');

    // Reload tube to show updated status
    try {
      const res = await this.samplesService.getTubeByCode(tube.tube_code);
      if (generation !== this.generation) return;
      this.currentTube.set(res.tube);
    } catch {
      // Tube state already acknowledged
    }
  }

  onSelectOverdueTube(tubeCode: string): void {
    this.activeTab.set('scan');
    this.tubeCodeInput.set(tubeCode);
    this.onSearchOrScan();
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Not recorded';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }
}
