import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SamplesService, Tube } from './samples.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-overdue-samples',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './overdue-samples.component.html',
})
export class OverdueSamplesComponent implements OnInit {
  private readonly samplesService = inject(SamplesService);

  @Output() readonly selectTubeForReceipt = new EventEmitter<string>();

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly tubes = signal<Tube[]>([]);
  readonly filterDate = signal<string>('');

  async ngOnInit(): Promise<void> {
    await this.loadOverdueTubes();
  }

  async loadOverdueTubes(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.samplesService.getOverdueTubes({
        date: this.filterDate().trim() || undefined,
        limit: 50,
      });
      this.tubes.set(res.tubes);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to load overdue samples'));
    } finally {
      this.isLoading.set(false);
    }
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Not recorded';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  handleSelect(tubeCode: string): void {
    this.selectTubeForReceipt.emit(tubeCode);
  }
}
