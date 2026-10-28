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
import { errorText } from '../../core/api/error-text';
import {
  AddPersonItem,
  AddPersonOptions,
  AddPersonResult,
  FieldService,
} from './services/field.service';

export const ADD_PERSON_RELATIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Brother or sister' },
  { value: 'other', label: 'Other' },
];

/** Age in whole years on today's date in India, from a YYYY-MM-DD birth date; null when it is not a real date. */
export function ageOnToday(dob: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime()) || !born.toISOString().startsWith(dob)) return null;
  const today = new Date(now.getTime() + 330 * 60_000);
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age--;
  return age < 0 ? null : age;
}

/**
 * Adds another person to this visit at the door: the person (a saved family member of the customer, or a new one with
 * the customer's agreement), their tests, and a new booking with its own bill, paid in cash or UPI at collection.
 */
@Component({
  selector: 'app-add-person-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-person-modal.component.html',
})
export class AddPersonModalComponent implements OnChanges {
  private readonly fieldService = inject(FieldService);

  @Input() orderId: string | null = null;
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  /** A booking was created: the parent reloads its visits so the new one shows up. */
  @Output() readonly added = new EventEmitter<AddPersonResult>();

  readonly relations = ADD_PERSON_RELATIONS;
  readonly options = signal<AddPersonOptions | null>(null);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly result = signal<AddPersonResult | null>(null);

  readonly mode = signal<'existing' | 'new'>('new');
  readonly patientId = signal<string>('');
  readonly name = signal('');
  readonly relation = signal('other');
  readonly dateOfBirth = signal('');
  readonly gender = signal('');
  readonly shareConsent = signal(false);
  readonly guardianConfirmed = signal(false);

  readonly query = signal('');
  readonly items = signal<AddPersonItem[]>([]);
  readonly selected = signal<AddPersonItem[]>([]);

  private generation = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['orderId']) && this.visible && this.orderId) {
      this.reset();
      void this.load('');
    }
    if (changes['visible'] && !this.visible) {
      this.generation++;
      this.clearTimer();
    }
  }

  private clearTimer(): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }

  private reset(): void {
    this.generation++;
    this.clearTimer();
    this.options.set(null);
    this.errorMessage.set('');
    this.result.set(null);
    this.mode.set('new');
    this.patientId.set('');
    this.name.set('');
    this.relation.set('other');
    this.dateOfBirth.set('');
    this.gender.set('');
    this.shareConsent.set(false);
    this.guardianConfirmed.set(false);
    this.query.set('');
    this.items.set([]);
    this.selected.set([]);
  }

  async load(q: string): Promise<void> {
    const orderId = this.orderId;
    if (!orderId) return;
    const generation = ++this.generation;
    this.isLoading.set(true);
    try {
      const res = await this.fieldService.getAddPersonOptions(orderId, q);
      if (generation !== this.generation) return;
      this.options.set(res);
      this.items.set(res.items);
      if (!res.open)
        this.errorMessage.set(
          'The sample for this booking was already collected, so no one can be added.',
        );
      else if (res.people_left === 0)
        this.errorMessage.set('No more people can be added to this visit.');
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Could not load the options'));
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.clearTimer();
    this.searchTimer = setTimeout(() => void this.load(value.trim()), 300);
  }

  readonly ageYears = () => ageOnToday(this.dateOfBirth());
  readonly isMinor = () => {
    const age = this.ageYears();
    return age !== null && age < 18;
  };

  readonly totalPaise = () => this.selected().reduce((sum, item) => sum + item.price_paise, 0);

  isSelected(item: AddPersonItem): boolean {
    return this.selected().some((s) => s.id === item.id);
  }

  toggle(item: AddPersonItem): void {
    this.selected.set(
      this.isSelected(item)
        ? this.selected().filter((s) => s.id !== item.id)
        : [...this.selected(), item],
    );
  }

  /** The test cannot be booked for the person chosen (the server decides; this only greys it out when it is clear). */
  notForPerson(item: AddPersonItem): string | null {
    const gender =
      this.mode() === 'new'
        ? this.gender()
        : this.options()?.people.find((p) => p.id === this.patientId())?.gender;
    const dob =
      this.mode() === 'new'
        ? this.dateOfBirth()
        : this.options()?.people.find((p) => p.id === this.patientId())?.date_of_birth;
    if ((item.gender === 'female' || item.gender === 'male') && gender && gender !== item.gender) {
      return item.gender === 'female' ? 'Women only' : 'Men only';
    }
    const age = dob ? ageOnToday(dob) : null;
    if (age !== null && item.min_age_years !== null && age < item.min_age_years)
      return `From age ${item.min_age_years}`;
    if (age !== null && item.max_age_years !== null && age > item.max_age_years)
      return `Up to age ${item.max_age_years}`;
    return null;
  }

  readonly personReady = () => {
    if (this.mode() === 'existing') return this.patientId() !== '';
    const age = this.ageYears();
    return (
      this.name().trim().length > 0 &&
      age !== null &&
      this.gender() !== '' &&
      this.shareConsent() &&
      (!this.isMinor() || this.guardianConfirmed())
    );
  };

  readonly canSubmit = () =>
    !this.isSubmitting() &&
    !!this.options()?.open &&
    (this.options()?.people_left ?? 0) > 0 &&
    this.personReady() &&
    this.selected().length > 0;

  async submit(): Promise<void> {
    const orderId = this.orderId;
    if (!orderId || !this.canSubmit()) return;
    const generation = this.generation;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const person =
        this.mode() === 'existing'
          ? ({ kind: 'existing', patient_id: this.patientId() } as const)
          : ({
              kind: 'new',
              details: {
                name: this.name().trim(),
                relation: this.relation(),
                date_of_birth: this.dateOfBirth(),
                gender: this.gender(),
                share_consent: this.shareConsent(),
                ...(this.isMinor() ? { guardian_confirmed: this.guardianConfirmed() } : {}),
              },
            } as const);
      const res = await this.fieldService.addPerson(orderId, {
        person,
        item_ids: this.selected().map((s) => s.id),
      });
      if (generation !== this.generation) return;
      this.result.set(res);
      this.added.emit(res);
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Could not add this person'));
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }

  /** After a booking was made: the form again for one more person. */
  addAnother(): void {
    if (!this.orderId) return;
    this.reset();
    void this.load('');
  }

  close(): void {
    this.generation++;
    this.clearTimer();
    this.visibleChange.emit(false);
  }

  formatRupees(paise: number): string {
    return (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  }
}
