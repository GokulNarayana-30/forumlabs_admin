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
import { CashCloseService, CashDay, rupeesToPaise, paiseToRupees } from './cash-close.service';
import { isUncertainError } from './refunds.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-handover-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './handover-modal.component.html',
})
export class HandoverModalComponent implements OnChanges {
  private readonly cashCloseService = inject(CashCloseService);

  @Input() visible = false;
  @Input() day: CashDay | null = null;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<void>();

  readonly cashRupeesInput = signal<string>('');
  readonly upiRupeesInput = signal<string>('');
  readonly noteInput = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly pending = signal(false);
  private readonly unresolved = new Map<
    string,
    {
      id: string;
      body: { cash_handed_over_paise: number; upi_confirmed_paise: number; note: string | null };
    }
  >();
  private key(): string {
    return `${this.day?.recorder.member_id}:${this.day?.date}`;
  }
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (this.visible && (changes['visible'] || changes['day'])) {
      this.resetValues();
    }
  }

  resetValues(): void {
    this.errorMessage.set('');
    const action = this.unresolved.get(this.key());
    this.pending.set(!!action);
    if (action) {
      this.cashRupeesInput.set(paiseToRupees(action.body.cash_handed_over_paise));
      this.upiRupeesInput.set(paiseToRupees(action.body.upi_confirmed_paise));
      this.noteInput.set(action.body.note ?? '');
      return;
    }
    if (this.day) {
      const entry = this.day.latest_entry;
      if (entry) {
        this.cashRupeesInput.set(paiseToRupees(entry.cash_handed_over_paise));
        this.upiRupeesInput.set(paiseToRupees(entry.upi_confirmed_paise));
        this.noteInput.set(entry.note || '');
      } else {
        // Pre-fill expected amounts as convenient starting point
        this.cashRupeesInput.set(paiseToRupees(this.day.cash_expected_paise));
        this.upiRupeesInput.set(paiseToRupees(this.day.upi_expected_paise));
        this.noteInput.set('');
      }
    } else {
      this.cashRupeesInput.set('');
      this.upiRupeesInput.set('');
      this.noteInput.set('');
    }
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  get parsedCashPaise(): number {
    try {
      return rupeesToPaise(this.cashRupeesInput());
    } catch {
      return 0;
    }
  }

  get parsedUpiPaise(): number {
    try {
      return rupeesToPaise(this.upiRupeesInput());
    } catch {
      return 0;
    }
  }

  get cashDifferencePaise(): number {
    if (!this.day) return 0;
    return this.parsedCashPaise - this.day.cash_expected_paise;
  }

  get upiDifferencePaise(): number {
    if (!this.day) return 0;
    return this.parsedUpiPaise - this.day.upi_expected_paise;
  }

  get hasDifference(): boolean {
    return this.cashDifferencePaise !== 0 || this.upiDifferencePaise !== 0;
  }

  formatPaise(paise: number): string {
    return paiseToRupees(paise);
  }

  async submitHandover(): Promise<void> {
    if (!this.day || this.isSubmitting()) return;
    if (this.unresolved.has(this.key())) {
      await this.sendHandover();
      return;
    }

    let cashPaise: number;
    let upiPaise: number;

    try {
      cashPaise = rupeesToPaise(this.cashRupeesInput());
    } catch (err: any) {
      this.errorMessage.set(`Invalid Cash Amount: ${err.message}`);
      return;
    }

    try {
      upiPaise = rupeesToPaise(this.upiRupeesInput());
    } catch (err: any) {
      this.errorMessage.set(`Invalid UPI Amount: ${err.message}`);
      return;
    }

    const cashDiff = cashPaise - this.day.cash_expected_paise;
    const upiDiff = upiPaise - this.day.upi_expected_paise;
    const note = this.noteInput().trim();

    if ((cashDiff !== 0 || upiDiff !== 0) && (!note || note.length > 300)) {
      this.errorMessage.set(
        'A mandatory explanation note (1-300 characters) is required whenever entered amounts differ from ledger expectations.',
      );
      return;
    }

    this.unresolved.set(this.key(), {
      id: crypto.randomUUID(),
      body: {
        cash_handed_over_paise: cashPaise,
        upi_confirmed_paise: upiPaise,
        note: note || null,
      },
    });
    await this.sendHandover();
  }

  private async sendHandover(): Promise<void> {
    const day = this.day;
    const key = this.key();
    const action = this.unresolved.get(key);
    if (!day || !action) return;
    this.pending.set(true);
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.cashCloseService.recordHandover(
        day.recorder.member_id,
        day.date,
        { ...action.body },
        action.id,
      );
      this.unresolved.delete(key);
      if (key !== this.key()) return;
      this.pending.set(false);
      if (res.kind === 'cash_close_not_allowed') {
        this.errorMessage.set(`Handover not allowed: ${res.reason}`);
        return;
      }
      this.saved.emit();
      this.closeModal();
    } catch (err: unknown) {
      if (!isUncertainError(err)) this.unresolved.delete(key);
      if (key === this.key()) {
        this.pending.set(this.unresolved.has(key));
        this.errorMessage.set(errorText(err, 'Failed to record cash handover'));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
