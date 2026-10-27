import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StaffStateService } from '../../core/state/staff-state.service';
import { ApiClientError } from '../../core/api/api-client.service';
import { errorText } from '../../core/api/error-text';
import { assigneeLabelFor } from './assignee-label';
import {
  TicketsService,
  CannedReplyDto,
  PatientSearchKind,
  PatientSearchRowDto,
  StaffTicketAssigneeDto,
  SupportCsatBucketDto,
  SupportCsatSummaryDto,
  SupportSettingsDto,
  TicketTopicDto,
} from './services/tickets.service';

export interface IntakeForm {
  channel: 'phone' | 'walk_in';
  category: string;
  description: string;
  priority: 'normal' | 'urgent';
  assignee_user_id: string;
}

interface SelectedPatient {
  patient_id: string;
  patient_code: string;
  name_masked: string;
  account_user_id: string;
}

const EMPTY_INTAKE: IntakeForm = {
  channel: 'phone',
  category: '',
  description: '',
  priority: 'normal',
  assignee_user_id: '',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The field names a 422 lists (`weekdays.0` belongs to `weekdays`). */
function fieldErrorsOf(err: unknown): Record<string, string> | null {
  if (!(err instanceof ApiClientError) || err.status !== 422) return null;
  const fields = (err.details?.['fields'] ?? []) as { path?: string }[];
  const out: Record<string, string> = {};
  for (const f of fields) {
    const name = String(f.path ?? '').split('.')[0];
    if (name) out[name] = 'Please check this field.';
  }
  return out;
}

/**
 * Support desk tools (15-12): phone and walk-in intake, canned replies, the SLA policy (editable by
 * super_admin only) and the CSAT report by agent and category. Every value shown is the server's
 * last confirmed copy; a failed or out-of-date response never replaces it. Patients are found by a
 * masked search and only an explicit selection (the audited detail read) links a ticket to an
 * account; a typed phone number is never turned into an account link.
 */
@Component({
  selector: 'app-desk-tools',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold text-surface-900">Desk tools</h1>
          <p class="text-sm text-surface-500">
            Phone and walk-in tickets, canned replies, SLA policy and CSAT. Times are in IST.
          </p>
        </div>
        <a routerLink="/tickets" class="text-xs font-semibold text-primary-600 hover:underline"
          >Back to tickets</a
        >
      </div>

      <!-- Intake -->
      <section
        class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-4"
        aria-labelledby="intake-title"
      >
        <h2 id="intake-title" class="text-sm font-bold text-surface-800">
          New phone or walk-in ticket
        </h2>

        <div class="space-y-2">
          <p class="text-xs text-surface-600">
            Find the patient (optional). Results are masked; selecting one opens their record and is
            logged.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="search-type">Search by</label>
            <select
              id="search-type"
              [value]="searchType()"
              (change)="searchType.set($any($event.target).value)"
              class="text-xs border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            >
              @for (t of searchKinds; track t.value) {
                <option [value]="t.value">{{ t.label }}</option>
              }
            </select>
            <label class="sr-only" for="search-q">Search term</label>
            <input
              id="search-q"
              [value]="searchQuery()"
              (input)="searchQuery.set($any($event.target).value)"
              class="text-xs border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            />
            <button
              type="button"
              (click)="searchPatients()"
              [disabled]="searching() || !searchQuery().trim()"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-300 text-surface-700 disabled:opacity-50"
            >
              Search
            </button>
          </div>
          @if (searchError()) {
            <p role="alert" class="text-xs text-surface-800">{{ searchError() }}</p>
          }
          @for (r of results(); track r.patient_id) {
            <div class="flex items-center gap-3 text-xs text-surface-700">
              <span class="font-mono">{{ r.patient_code }}</span>
              <span>{{ r.name_masked }}</span>
              <span class="text-surface-500">{{ r.phone_masked }}</span>
              <button
                type="button"
                (click)="selectPatient(r.patient_id)"
                class="font-semibold text-primary-600 hover:underline"
                [attr.aria-label]="'Select patient ' + r.patient_code"
              >
                Select
              </button>
            </div>
          }
          @if (selected(); as p) {
            <p class="text-xs text-surface-800">
              Linked to: <span class="font-mono">{{ p.patient_code }}</span> {{ p.name_masked }}
              <button
                type="button"
                (click)="clearPatient()"
                class="ml-2 font-semibold text-surface-600 hover:underline"
              >
                Clear
              </button>
            </p>
          }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label class="space-y-1">
            <span class="block text-surface-600">Channel</span>
            <select
              [value]="intake().channel"
              (change)="patchIntake({ channel: $any($event.target).value })"
              class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            >
              <option value="phone">Phone</option>
              <option value="walk_in">Walk-in</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="block text-surface-600">Topic</span>
            <select
              [value]="intake().category"
              (change)="patchIntake({ category: $any($event.target).value })"
              class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            >
              <option value="">Choose a topic</option>
              @for (t of topics(); track t.code) {
                <option [value]="t.code">{{ t.label }}</option>
              }
            </select>
            @if (fieldErrors()['category']) {
              <span data-field-error="category" class="block text-surface-800">{{
                fieldErrors()['category']
              }}</span>
            }
          </label>
          <label class="space-y-1">
            <span class="block text-surface-600">Priority</span>
            <select
              [value]="intake().priority"
              (change)="patchIntake({ priority: $any($event.target).value })"
              class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="block text-surface-600">Assign to</span>
            <select
              [value]="intake().assignee_user_id"
              (change)="patchIntake({ assignee_user_id: $any($event.target).value })"
              class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            >
              <option value="">Unassigned</option>
              @for (a of assignees(); track a.user_id) {
                <option [value]="a.user_id">{{ a.display_name }}</option>
              }
            </select>
          </label>
          <label class="space-y-1 sm:col-span-2">
            <span class="block text-surface-600"
              >What the customer needs (up to 500 characters)</span
            >
            <textarea
              rows="3"
              maxlength="500"
              [value]="intake().description"
              (input)="patchIntake({ description: $any($event.target).value })"
              class="w-full border border-surface-300 rounded-lg p-2 bg-surface-0 resize-none"
            ></textarea>
            @if (fieldErrors()['description']) {
              <span data-field-error="description" class="block text-surface-800">{{
                fieldErrors()['description']
              }}</span>
            }
          </label>
        </div>
        @if (intakeError()) {
          <p role="alert" class="text-xs text-surface-800">{{ intakeError() }}</p>
        }
        @if (created(); as c) {
          <p class="text-xs text-surface-800">
            Created
            <a [routerLink]="['/tickets', c.id]" class="font-mono font-semibold text-primary-600">{{
              c.reference
            }}</a>
          </p>
        }
        <button
          type="button"
          (click)="submitIntake()"
          [disabled]="submitting() || selecting()"
          class="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 text-surface-0 disabled:opacity-50"
        >
          Create ticket
        </button>
      </section>

      <!-- Canned replies -->
      <section
        class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-3"
        aria-labelledby="macros-title"
      >
        <h2 id="macros-title" class="text-sm font-bold text-surface-800">Canned replies</h2>
        @if (macroError()) {
          <p role="alert" class="text-xs text-surface-800">{{ macroError() }}</p>
        }
        @if (macros().length === 0) {
          <p class="text-xs text-surface-500">No canned replies yet.</p>
        }
        @for (m of macros(); track m.id) {
          <div
            class="flex items-start justify-between gap-3 text-xs border-b border-surface-100 pb-2"
          >
            <div>
              <p class="font-semibold text-surface-800">
                {{ m.title }}
                @if (!m.active) {
                  <span class="text-surface-500">(retired)</span>
                }
              </p>
              <p class="text-surface-600 whitespace-pre-wrap">{{ m.body }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button
                type="button"
                (click)="startEdit(m)"
                class="font-semibold text-primary-600 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                (click)="setMacroActive(m.id, !m.active)"
                class="font-semibold text-surface-600 hover:underline"
              >
                {{ m.active ? 'Retire' : 'Reactivate' }}
              </button>
            </div>
          </div>
        }
        <div class="grid grid-cols-1 gap-2 text-xs">
          <label class="space-y-1">
            <span class="block text-surface-600">{{
              editingId() ? 'Edit title' : 'New title'
            }}</span>
            <input
              maxlength="80"
              [value]="macroDraft().title"
              (input)="
                macroDraft.set({ title: $any($event.target).value, body: macroDraft().body })
              "
              class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
            />
          </label>
          <label class="space-y-1">
            <span class="block text-surface-600">Text (plain text, up to 500 characters)</span>
            <textarea
              rows="2"
              maxlength="500"
              [value]="macroDraft().body"
              (input)="
                macroDraft.set({ title: macroDraft().title, body: $any($event.target).value })
              "
              class="w-full border border-surface-300 rounded-lg p-2 bg-surface-0 resize-none"
            ></textarea>
          </label>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="saveMacro()"
              [disabled]="savingMacro()"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-surface-0 disabled:opacity-50"
            >
              {{ editingId() ? 'Save changes' : 'Add canned reply' }}
            </button>
            @if (editingId()) {
              <button
                type="button"
                (click)="cancelEdit()"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-300"
              >
                Cancel
              </button>
            }
          </div>
        </div>
      </section>

      <!-- SLA policy -->
      <section
        class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-3"
        aria-labelledby="sla-title"
      >
        <h2 id="sla-title" class="text-sm font-bold text-surface-800">SLA policy</h2>
        @if (settings(); as s) {
          <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <dt class="text-surface-500">First reply</dt>
              <dd class="font-medium">{{ s.first_reply_minutes }} business minutes</dd>
            </div>
            <div>
              <dt class="text-surface-500">Resolution</dt>
              <dd class="font-medium">{{ s.resolution_minutes }} business minutes</dd>
            </div>
            <div>
              <dt class="text-surface-500">Days</dt>
              <dd class="font-medium">{{ dayNames(s.weekdays) }}</dd>
            </div>
            <div>
              <dt class="text-surface-500">Hours (IST)</dt>
              <dd class="font-medium">{{ clock(s.opens_minute) }}–{{ clock(s.closes_minute) }}</dd>
            </div>
          </dl>
        } @else if (settingsError()) {
          <p role="alert" class="text-xs text-surface-800">{{ settingsError() }}</p>
        } @else {
          <p class="text-xs text-surface-500">Loading policy…</p>
        }
        @if (canEditPolicy() && settingsDraft(); as d) {
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <label class="space-y-1">
              <span class="block text-surface-600">First reply (min)</span>
              <input
                type="number"
                [value]="d.first_reply_minutes"
                (input)="patchDraft({ first_reply_minutes: +$any($event.target).value })"
                class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
              />
            </label>
            <label class="space-y-1">
              <span class="block text-surface-600">Resolution (min)</span>
              <input
                type="number"
                [value]="d.resolution_minutes"
                (input)="patchDraft({ resolution_minutes: +$any($event.target).value })"
                class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
              />
            </label>
            <label class="space-y-1">
              <span class="block text-surface-600">Days (0=Sun … 6=Sat)</span>
              <input
                [value]="d.weekdays.join(',')"
                (input)="patchDraft({ weekdays: parseDays($any($event.target).value) })"
                class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
              />
              @if (fieldErrors()['weekdays']) {
                <span data-field-error="weekdays" class="block text-surface-800">{{
                  fieldErrors()['weekdays']
                }}</span>
              }
            </label>
            <label class="space-y-1">
              <span class="block text-surface-600">Opens (min from 00:00)</span>
              <input
                type="number"
                [value]="d.opens_minute"
                (input)="patchDraft({ opens_minute: +$any($event.target).value })"
                class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
              />
            </label>
            <label class="space-y-1">
              <span class="block text-surface-600">Closes (min from 00:00)</span>
              <input
                type="number"
                [value]="d.closes_minute"
                (input)="patchDraft({ closes_minute: +$any($event.target).value })"
                class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
              />
            </label>
          </div>
          <button
            type="button"
            data-settings-save
            (click)="saveSettings()"
            [disabled]="savingSettings()"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-surface-0 disabled:opacity-50"
          >
            Save policy
          </button>
        }
      </section>

      <!-- CSAT -->
      <section
        class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-3"
        aria-labelledby="csat-title"
      >
        <h2 id="csat-title" class="text-sm font-bold text-surface-800">Customer satisfaction</h2>
        <div class="flex flex-wrap items-end gap-2 text-xs">
          <label class="space-y-1">
            <span class="block text-surface-600">From (IST date)</span>
            <input
              type="date"
              [value]="csatFrom()"
              (input)="csatFrom.set($any($event.target).value)"
              class="border border-surface-300 rounded-lg px-2 py-1.5"
            />
          </label>
          <label class="space-y-1">
            <span class="block text-surface-600">To (IST date)</span>
            <input
              type="date"
              [value]="csatTo()"
              (input)="csatTo.set($any($event.target).value)"
              class="border border-surface-300 rounded-lg px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            (click)="loadCsat()"
            class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-300"
          >
            Show
          </button>
        </div>
        @if (csatError()) {
          <p role="alert" class="text-xs text-surface-800">{{ csatError() }}</p>
        }
        @if (csat(); as report) {
          <p class="text-xs text-surface-500">{{ report.from }} to {{ report.to }}</p>
          @if (report.buckets.length === 0) {
            <p class="text-xs text-surface-500">No ratings in this period.</p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="text-surface-600">
                  <tr>
                    <th scope="col" class="py-2 pr-3">Agent</th>
                    <th scope="col" class="py-2 pr-3">Topic</th>
                    <th scope="col" class="py-2 pr-3">Ratings</th>
                    <th scope="col" class="py-2 pr-3">Average</th>
                    @for (star of stars; track star) {
                      <th scope="col" class="py-2 pr-3">{{ star }}★</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (b of report.buckets; track $index) {
                    <tr data-csat-row class="border-t border-surface-100">
                      <td class="py-2 pr-3">{{ agentName(b.agent_user_id) }}</td>
                      <td class="py-2 pr-3">{{ topicLabel(b.category) }}</td>
                      <td class="py-2 pr-3">{{ b.count }}</td>
                      <td class="py-2 pr-3 font-semibold">{{ average(b) }}</td>
                      @for (star of stars; track star) {
                        <td data-star class="py-2 pr-3">{{ b.histogram[star] }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>
    </div>
  `,
})
export class DeskToolsComponent implements OnInit, OnDestroy {
  private readonly ticketsService = inject(TicketsService);
  private readonly staffState = inject(StaffStateService);

  readonly roles = this.staffState.roles;
  readonly canEditPolicy = computed(() => this.roles().includes('super_admin'));

  readonly searchKinds: { value: PatientSearchKind; label: string }[] = [
    { value: 'patient_id', label: 'Patient ID' },
    { value: 'phone', label: 'Phone' },
    { value: 'booking_ref', label: 'Booking ref' },
    { value: 'ticket_ref', label: 'Ticket ref' },
    { value: 'reg_no', label: 'Report reg. no.' },
    { value: 'name', label: 'Name' },
  ];
  readonly stars = ['1', '2', '3', '4', '5'] as const;

  readonly topics = signal<TicketTopicDto[]>([]);
  readonly assignees = signal<StaffTicketAssigneeDto[]>([]);
  readonly assigneesLoaded = signal(false);

  readonly searchType = signal<PatientSearchKind>('patient_id');
  readonly searchQuery = signal('');
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly results = signal<PatientSearchRowDto[]>([]);
  readonly selected = signal<SelectedPatient | null>(null);
  readonly selecting = signal(false);

  readonly intake = signal<IntakeForm>({ ...EMPTY_INTAKE });
  readonly submitting = signal(false);
  readonly intakeError = signal('');
  readonly created = signal<{ id: string; reference: string } | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  readonly macros = signal<CannedReplyDto[]>([]);
  readonly macroDraft = signal({ title: '', body: '' });
  readonly editingId = signal<string | null>(null);
  readonly savingMacro = signal(false);
  readonly macroError = signal('');

  readonly settings = signal<SupportSettingsDto | null>(null);
  readonly settingsDraft = signal<SupportSettingsDto | null>(null);
  readonly settingsError = signal('');
  readonly savingSettings = signal(false);

  readonly csat = signal<SupportCsatSummaryDto | null>(null);
  readonly csatFrom = signal('');
  readonly csatTo = signal('');
  readonly csatError = signal('');

  private isDestroyed = false;
  private csatGeneration = 0;
  private searchGeneration = 0;
  private selectionGeneration = 0;

  ngOnInit(): void {
    void this.loadReference();
    void this.loadMacros();
    void this.loadSettings();
    void this.loadCsat();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.results.set([]);
    this.clearPatient();
  }

  private async loadReference(): Promise<void> {
    try {
      const topics = await this.ticketsService.listTopics();
      if (!this.isDestroyed) this.topics.set(topics);
    } catch {
      // The topic list is public and cached by the API; the form shows no choices until it loads.
    }
    try {
      const people = await this.ticketsService.listAssignees();
      if (!this.isDestroyed) {
        this.assignees.set(people);
        this.assigneesLoaded.set(true);
      }
    } catch {
      // Agents then show as 'Assigned', never as a user id.
    }
  }

  patchIntake(change: Partial<IntakeForm>): void {
    this.intake.update((form) => ({ ...form, ...change }));
  }

  async searchPatients(): Promise<void> {
    this.clearPatient();
    const q = this.searchQuery().trim();
    if (!q) return;
    const generation = ++this.searchGeneration;
    this.searching.set(true);
    this.searchError.set('');
    try {
      const rows = await this.ticketsService.searchPatients(q, this.searchType());
      if (!this.isDestroyed && generation === this.searchGeneration) this.results.set(rows);
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.searchGeneration) {
        this.searchError.set(errorText(err, 'Search failed. Please try again.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.searchGeneration) this.searching.set(false);
    }
  }

  clearPatient(): void {
    ++this.selectionGeneration;
    this.selecting.set(false);
    this.selected.set(null);
  }

  /** The explicit choice: reads the audited patient record for the owning account id. */
  async selectPatient(patientId: string): Promise<void> {
    const generation = ++this.selectionGeneration;
    const row = this.results().find((r) => r.patient_id === patientId);
    if (!row) {
      this.selecting.set(false);
      return;
    }
    this.selecting.set(true);
    try {
      const accountUserId = await this.ticketsService.patientAccountId(patientId);
      if (this.isDestroyed || generation !== this.selectionGeneration) return;
      this.selected.set({
        patient_id: row.patient_id,
        patient_code: row.patient_code,
        name_masked: row.name_masked,
        account_user_id: accountUserId,
      });
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.selectionGeneration)
        this.searchError.set(errorText(err, 'Could not open that patient.'));
    } finally {
      if (!this.isDestroyed && generation === this.selectionGeneration) this.selecting.set(false);
    }
  }

  async submitIntake(): Promise<void> {
    if (this.submitting() || this.selecting()) return;
    const form = this.intake();
    this.submitting.set(true);
    this.intakeError.set('');
    this.fieldErrors.set({});
    this.created.set(null);
    try {
      const ticket = await this.ticketsService.createStaffTicket({
        user_id: this.selected()?.account_user_id ?? null,
        category: form.category,
        description: form.description,
        channel: form.channel,
        priority: form.priority,
      });
      if (this.isDestroyed) return;
      this.created.set({ id: ticket.id, reference: ticket.reference });
      this.intake.set({ ...EMPTY_INTAKE });
      this.clearPatient();
      this.results.set([]);
      if (form.assignee_user_id) {
        try {
          await this.ticketsService.updateAssignee(ticket.id, form.assignee_user_id);
        } catch (err: unknown) {
          if (!this.isDestroyed) {
            this.intakeError.set(errorText(err, 'The ticket was created but not assigned.'));
          }
        }
      }
    } catch (err: unknown) {
      if (this.isDestroyed) return;
      const fields = fieldErrorsOf(err);
      if (fields) this.fieldErrors.set(fields);
      this.intakeError.set(errorText(err, 'Could not create the ticket.'));
    } finally {
      if (!this.isDestroyed) this.submitting.set(false);
    }
  }

  async loadMacros(): Promise<void> {
    try {
      const list = await this.ticketsService.listCannedReplies(undefined);
      if (!this.isDestroyed) this.macros.set(list);
    } catch (err: unknown) {
      if (!this.isDestroyed) this.macroError.set(errorText(err, 'Could not load canned replies.'));
    }
  }

  startEdit(macro: CannedReplyDto): void {
    this.editingId.set(macro.id);
    this.macroDraft.set({ title: macro.title, body: macro.body });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.macroDraft.set({ title: '', body: '' });
  }

  async saveMacro(): Promise<void> {
    const draft = this.macroDraft();
    const id = this.editingId();
    if (id) {
      await this.editMacro(id, draft);
      return;
    }
    await this.mutateMacros(() => this.ticketsService.createCannedReply(draft));
  }

  async editMacro(id: string, body: { title: string; body: string }): Promise<void> {
    await this.mutateMacros(() => this.ticketsService.updateCannedReply(id, body));
  }

  async setMacroActive(id: string, active: boolean): Promise<void> {
    await this.mutateMacros(() => this.ticketsService.updateCannedReply(id, { active }), false);
  }

  /** Runs one change, then reloads the server list; a failure leaves the confirmed list as is. */
  private async mutateMacros(change: () => Promise<unknown>, clearDraft = true): Promise<void> {
    if (this.savingMacro()) return;
    this.savingMacro.set(true);
    this.macroError.set('');
    try {
      await change();
      if (this.isDestroyed) return;
      if (clearDraft) this.cancelEdit();
      await this.loadMacros();
    } catch (err: unknown) {
      if (!this.isDestroyed)
        this.macroError.set(errorText(err, 'Could not save the canned reply.'));
    } finally {
      if (!this.isDestroyed) this.savingMacro.set(false);
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const s = await this.ticketsService.getSettings();
      if (this.isDestroyed) return;
      this.settings.set(s);
      this.settingsDraft.set({ ...s });
    } catch (err: unknown) {
      if (!this.isDestroyed) this.settingsError.set(errorText(err, 'Could not load the policy.'));
    }
  }

  patchDraft(change: Partial<SupportSettingsDto>): void {
    this.settingsDraft.update((d) => (d ? { ...d, ...change } : d));
  }

  parseDays(text: string): number[] {
    return text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map(Number);
  }

  /** super_admin only; the API refuses anyone else as well. */
  async saveSettings(): Promise<void> {
    const draft = this.settingsDraft();
    if (!this.canEditPolicy() || !draft || this.savingSettings()) return;
    this.savingSettings.set(true);
    this.settingsError.set('');
    this.fieldErrors.set({});
    try {
      const saved = await this.ticketsService.updateSettings({
        first_reply_minutes: draft.first_reply_minutes,
        resolution_minutes: draft.resolution_minutes,
        weekdays: draft.weekdays,
        opens_minute: draft.opens_minute,
        closes_minute: draft.closes_minute,
      });
      if (this.isDestroyed) return;
      this.settings.set(saved);
      this.settingsDraft.set({ ...saved });
    } catch (err: unknown) {
      if (this.isDestroyed) return;
      const fields = fieldErrorsOf(err);
      if (fields) this.fieldErrors.set(fields);
      this.settingsError.set(errorText(err, 'Could not save the policy.'));
    } finally {
      if (!this.isDestroyed) this.savingSettings.set(false);
    }
  }

  async loadCsat(): Promise<void> {
    const generation = ++this.csatGeneration;
    this.csatError.set('');
    try {
      const report = await this.ticketsService.getCsat(this.csatFrom(), this.csatTo());
      if (!this.isDestroyed && generation === this.csatGeneration) this.csat.set(report);
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.csatGeneration) {
        const fields = fieldErrorsOf(err);
        this.csatError.set(
          fields
            ? 'Choose a valid IST date range of up to a year.'
            : errorText(err, 'Could not load CSAT.'),
        );
      }
    }
  }

  agentName(userId: string | null): string {
    return assigneeLabelFor(userId, this.assignees(), this.assigneesLoaded());
  }

  topicLabel(code: string): string {
    return this.topics().find((t) => t.code === code)?.label ?? code;
  }

  /** The bucket's mean rating to one decimal (sum and count come from the server). */
  average(bucket: SupportCsatBucketDto): string {
    return bucket.count > 0 ? (bucket.sum / bucket.count).toFixed(1) : '—';
  }

  dayNames(days: number[]): string {
    return days.map((d) => WEEKDAYS[d] ?? String(d)).join(', ');
  }

  clock(minute: number): string {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
