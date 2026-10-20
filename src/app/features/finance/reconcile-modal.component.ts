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
import { CashCloseService, CashDay, paiseToRupees } from './cash-close.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-reconcile-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reconcile-modal.component.html',
})
export class ReconcileModalComponent implements OnChanges {
  private readonly cashCloseService = inject(CashCloseService);

  @Input() visible = false;
  @Input() day: CashDay | null = null;
  @Input() todayIst = '';
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly reconciled = new EventEmitter<void>();

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.errorMessage.set('');
    }
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  get isPastDay(): boolean {
    if (!this.day || !this.todayIst) return false;
    return this.day.date < this.todayIst;
  }

  formatPaise(paise: number): string {
    return paiseToRupees(paise);
  }

  async submitReconcile(): Promise<void> {
    if (!this.day) return;

    if (!this.isPastDay) {
      this.errorMessage.set(
        'A collection day can only be reconciled after the day has ended in IST.',
      );
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.cashCloseService.reconcile(this.day.recorder.member_id, this.day.date);

      if (res.kind === 'cash_close_not_allowed') {
        if (res.reason === 'ledger_changed') {
          this.errorMessage.set(
            'The ledger was modified after handover was recorded. A new handover must be recorded before reconciling.',
          );
        } else if (res.reason === 'day_not_ended') {
          this.errorMessage.set('The day has not ended yet.');
        } else if (res.reason === 'already_reconciled') {
          this.errorMessage.set('This day has already been reconciled.');
        } else {
          this.errorMessage.set(`Reconciliation not allowed: ${res.reason}`);
        }
        return;
      }

      this.reconciled.emit();
      this.closeModal();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to reconcile day'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
