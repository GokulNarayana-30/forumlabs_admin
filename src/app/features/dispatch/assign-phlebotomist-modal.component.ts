import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DispatchService, DispatchVisit, DispatchPhlebotomistRosterItem } from './dispatch.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-assign-phlebotomist-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-phlebotomist-modal.component.html',
})
export class AssignPhlebotomistModalComponent implements OnChanges, OnDestroy {
  private readonly dispatchService = inject(DispatchService);

  @Input() visit: DispatchVisit | null = null;
  @Input() targetDate = '';
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly assigned = new EventEmitter<void>();

  readonly phlebotomists = signal<DispatchPhlebotomistRosterItem[]>([]);
  readonly selectedPhleboMemberId = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['visible'] || changes['targetDate'] || changes['visit']) {
      this.generation++;
      this.phlebotomists.set([]);
      this.isSubmitting.set(false);
      this.isLoading.set(false);
      this.selectedPhleboMemberId.set('');
      if (this.visible) {
        this.errorMessage.set('');
        this.selectedPhleboMemberId.set(this.visit?.assignee?.member_id || '');
        await this.loadRoster();
      }
    }
  }

  async loadRoster(): Promise<void> {
    const generation = this.generation;
    this.phlebotomists.set([]);
    this.isLoading.set(true);
    try {
      const res = await this.dispatchService.getPhlebotomistsRoster(this.targetDate);
      if (generation === this.generation) this.phlebotomists.set(res.phlebotomists);
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Failed to load phlebotomist roster'));
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }

  getSelectedPhlebotomist(): DispatchPhlebotomistRosterItem | undefined {
    const selectedId = this.selectedPhleboMemberId();
    return this.phlebotomists().find((p) => p.member.member_id === selectedId);
  }

  close(): void {
    this.generation++;
    this.phlebotomists.set([]);
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async onSubmit(): Promise<void> {
    if (!this.visible || this.isLoading() || this.isSubmitting()) return;
    const generation = this.generation;
    const selectedId = this.selectedPhleboMemberId();
    if (!selectedId) {
      this.errorMessage.set('Please select a phlebotomist.');
      return;
    }

    if (!this.visit) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.dispatchService.assignPhlebotomist(this.visit.order_id, selectedId);

      if (generation !== this.generation) return;
      if (res.kind === 'event_not_allowed') {
        // Refused assignment: keep dialog open, emit no success, reload authoritative assignment
        this.errorMessage.set(res.reason || 'Assignment not allowed for this visit.');
        await this.reloadAssignment(generation);
        return;
      }

      this.assigned.emit();
      this.close();
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.errorMessage.set(errorText(err, 'Failed to assign phlebotomist'));
      await this.reloadAssignment(generation);
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }
  private async reloadAssignment(generation: number): Promise<void> {
    const orderId = this.visit?.order_id;
    const date = this.targetDate;
    this.visit = null;
    this.selectedPhleboMemberId.set('');
    this.phlebotomists.set([]);
    try {
      let cursor: string | undefined;
      let fresh: DispatchVisit | undefined;
      do {
        const res = await this.dispatchService.getVisits({ date, limit: 100, cursor });
        if (generation !== this.generation) return;
        fresh = res.visits.find((v) => v.order_id === orderId);
        cursor = res.next_cursor ?? undefined;
      } while (!fresh && cursor);
      const roster = await this.dispatchService.getPhlebotomistsRoster(date);
      if (generation !== this.generation) return;
      this.visit = fresh ?? null;
      this.phlebotomists.set(roster.phlebotomists);
      if (
        fresh?.assignee &&
        !roster.phlebotomists.some((p) => p.member.member_id === fresh.assignee!.member_id)
      ) {
        this.phlebotomists.update((rows) => [
          ...rows,
          { member: fresh!.assignee!, is_available: false, active_workload: 0 },
        ]);
      }
      this.selectedPhleboMemberId.set(fresh?.assignee?.member_id ?? '');
    } catch {
      // Keep the refusal visible and leave stale actions cleared when reload fails.
    }
  }
}
