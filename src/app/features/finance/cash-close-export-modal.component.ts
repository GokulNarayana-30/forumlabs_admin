import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CashCloseService } from './cash-close.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-cash-close-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-close-export-modal.component.html',
})
export class CashCloseExportModalComponent implements OnChanges {
  private readonly cashCloseService = inject(CashCloseService);

  @Input() visible = false;
  @Input() defaultDate = '';
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  readonly exportDate = signal<string>('');
  readonly exportFormat = signal<'csv' | 'json'>('csv');
  readonly isExporting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.errorMessage.set('');
      this.exportDate.set(this.defaultDate);
      this.exportFormat.set('csv');
    }
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async submitExport(): Promise<void> {
    const date = this.exportDate().trim();
    if (!date) {
      this.errorMessage.set('Please select a valid date for export.');
      return;
    }

    this.isExporting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.cashCloseService.exportData({
        date,
        format: this.exportFormat(),
      });

      // Trigger browser file download
      const mimeType = res.format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
      const blob = new Blob([res.content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = res.filename;
      anchor.click();
      window.URL.revokeObjectURL(url);

      this.closeModal();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to export cash close data'));
    } finally {
      this.isExporting.set(false);
    }
  }
}
