import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sample, SampleStage, SamplesService } from './samples.service';
import { errorText } from '../../core/api/error-text';

/** Today's date in India (YYYY-MM-DD), whatever time zone the browser is in. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export const SAMPLE_STAGE_OPTIONS: ReadonlyArray<{ value: SampleStage; label: string }> = [
  { value: 'all', label: 'All samples' },
  { value: 'with_collector', label: 'With phlebotomist' },
  { value: 'handed_over', label: 'Handed over, waiting for lab' },
  { value: 'received', label: 'Received at lab' },
  { value: 'rejected', label: 'Rejected' },
];

/** Every sample from the moment the phlebotomist scans it, and where it is now. */
@Component({
  selector: 'app-samples-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './samples-list.component.html',
})
export class SamplesListComponent implements OnInit {
  private readonly samplesService = inject(SamplesService);

  /** The barcode (or tube code) of the row the lab staff member wants to open for receipt. */
  @Output() readonly openSample = new EventEmitter<string>();

  readonly stageOptions = SAMPLE_STAGE_OPTIONS;
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly samples = signal<Sample[]>([]);
  readonly stage = signal<SampleStage>('all');
  readonly date = signal<string>(todayInIndia());
  readonly nextCursor = signal<string | null>(null);

  private generation = 0;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.samplesService.getSamples({
        stage: this.stage(),
        date: this.date() || undefined,
        limit: 100,
      });
      if (generation !== this.generation) return;
      this.samples.set(res.samples);
      this.nextCursor.set(res.next_cursor);
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.samples.set([]);
      this.nextCursor.set(null);
      this.errorMessage.set(errorText(err, 'Failed to load samples'));
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.isLoading()) return;
    const generation = ++this.generation;
    this.isLoading.set(true);
    try {
      const res = await this.samplesService.getSamples({
        stage: this.stage(),
        date: this.date() || undefined,
        limit: 100,
        cursor,
      });
      if (generation !== this.generation) return;
      this.samples.set([...this.samples(), ...res.samples]);
      this.nextCursor.set(res.next_cursor);
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Failed to load more samples'));
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }

  setStage(stage: SampleStage): void {
    this.stage.set(stage);
    void this.load();
  }

  setDate(date: string): void {
    this.date.set(date);
    void this.load();
  }

  /** The code on the bottle once linked, else the generated code. */
  codeOf(sample: Sample): string {
    return sample.bottle_barcode ?? sample.tube_code;
  }

  statusLabel(sample: Sample): string {
    switch (sample.status) {
      case 'scanned_at_collection':
        return 'With phlebotomist';
      case 'handed_over':
        return 'Handed over, waiting for lab';
      case 'received':
        return 'Received at lab';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Not collected';
    }
  }

  statusClass(sample: Sample): string {
    switch (sample.status) {
      case 'received':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'handed_over':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  formatTime(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
