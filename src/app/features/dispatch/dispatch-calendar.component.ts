import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DispatchService, DispatchVisit, DispatchPhlebotomistRosterItem } from './dispatch.service';
import { AssignPhlebotomistModalComponent } from './assign-phlebotomist-modal.component';
import { errorText } from '../../core/api/error-text';

export function getIstTodayString(date: Date = new Date()): string {
  const istOffsetMs = 19_800_000; // 5.5 hours in ms (+05:30)
  const istDate = new Date(date.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SlotWindowGroup {
  windowLabel: string;
  visits: DispatchVisit[];
}

@Component({
  selector: 'app-dispatch-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AssignPhlebotomistModalComponent],
  templateUrl: './dispatch-calendar.component.html',
})
export class DispatchCalendarComponent implements OnInit, OnDestroy {
  private readonly dispatchService = inject(DispatchService);

  readonly selectedDate = signal<string>(getIstTodayString());
  readonly selectedArea = signal<string>('');
  readonly selectedStatus = signal<string>('');

  readonly visits = signal<DispatchVisit[]>([]);
  readonly phlebotomists = signal<DispatchPhlebotomistRosterItem[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  readonly assignModalVisible = signal<boolean>(false);
  readonly assigningVisit = signal<DispatchVisit | null>(null);

  /** Generation counter to ignore stale/out-of-order responses after date changes. */
  private loadGeneration = 0;

  ngOnDestroy(): void {
    this.loadGeneration++;
  }

  readonly pendingAvailability = signal<Set<string>>(new Set());

  ngOnInit(): void {
    void this.loadData();
  }

  async onDateChange(newDate: string): Promise<void> {
    if (newDate) {
      this.selectedDate.set(newDate);
      await this.loadData();
    }
  }

  async previousDay(): Promise<void> {
    this.selectedDate.set(shiftDate(this.selectedDate(), -1));
    await this.loadData();
  }

  async nextDay(): Promise<void> {
    this.selectedDate.set(shiftDate(this.selectedDate(), 1));
    await this.loadData();
  }

  async onFilterChange(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    const currentGen = ++this.loadGeneration;
    this.visits.set([]);
    this.phlebotomists.set([]);
    this.assigningVisit.set(null);
    this.assignModalVisible.set(false);
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [visitsRes, rosterRes] = await Promise.all([
        this.dispatchService.getVisits({
          date: this.selectedDate(),
          area: this.selectedArea() || undefined,
          status: this.selectedStatus() || undefined,
        }),
        this.dispatchService.getPhlebotomistsRoster(this.selectedDate()),
      ]);

      // Discard older response if date selection changed while loading
      if (currentGen !== this.loadGeneration) {
        return;
      }

      this.visits.set(visitsRes.visits);
      this.phlebotomists.set(rosterRes.phlebotomists);
    } catch (err: unknown) {
      if (currentGen !== this.loadGeneration) {
        return;
      }
      this.errorMessage.set(errorText(err, 'Failed to load dispatch calendar data'));
    } finally {
      if (currentGen === this.loadGeneration) {
        this.isLoading.set(false);
      }
    }
  }

  getGroupedVisits(): SlotWindowGroup[] {
    const map = new Map<string, DispatchVisit[]>();
    for (const v of this.visits()) {
      const start = new Date(v.slot_starts_at);
      const end = new Date(v.slot_ends_at);
      // Format as IST hours
      const formatTime = (d: Date) => {
        const istOffsetMs = 19_800_000;
        const ist = new Date(d.getTime() + istOffsetMs);
        return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
      };
      const label = `${formatTime(start)} - ${formatTime(end)}`;
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)!.push(v);
    }

    const groups: SlotWindowGroup[] = [];
    for (const [windowLabel, items] of map.entries()) {
      groups.push({ windowLabel, visits: items });
    }
    return groups;
  }

  async toggleAvailability(phlebo: DispatchPhlebotomistRosterItem, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const date = this.selectedDate();
    const id = phlebo.member.member_id;
    const key = `${date}:${id}`;
    if (this.pendingAvailability().has(key)) {
      checkbox.checked = phlebo.is_available;
      return;
    }
    const generation = this.loadGeneration;
    const previousValue = phlebo.is_available;
    const newValue = checkbox.checked;
    this.pendingAvailability.update((keys) => new Set([...keys, key]));
    try {
      const result = await this.dispatchService.setAvailability(id, date, newValue);
      if (generation !== this.loadGeneration) return;
      phlebo.is_available = result.is_available;
      checkbox.checked = result.is_available;
    } catch (err: unknown) {
      if (generation !== this.loadGeneration) return;
      phlebo.is_available = previousValue;
      checkbox.checked = previousValue;
      this.errorMessage.set(errorText(err, 'Failed to update phlebotomist availability'));
    } finally {
      this.pendingAvailability.update((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
  }

  openAssignModal(visit: DispatchVisit): void {
    this.assigningVisit.set(visit);
    this.assignModalVisible.set(true);
  }

  async onAssigned(): Promise<void> {
    await this.loadData();
  }
}
