import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiClientError } from '../../core/api/api-client.service';
import { StaffStateService } from '../../core/state/staff-state.service';
import { DeskToolsComponent } from './desk-tools.component';
import { TicketsService, SupportCsatSummaryDto } from './services/tickets.service';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DeskToolsComponent (15-12 Task 2)', () => {
  let fixture: ComponentFixture<DeskToolsComponent>;
  let component: DeskToolsComponent;
  let svc: any;
  let roles: ReturnType<typeof signal<string[]>>;

  const settings = {
    first_reply_minutes: 240,
    resolution_minutes: 2880,
    weekdays: [1, 2, 3, 4, 5, 6],
    opens_minute: 540,
    closes_minute: 1080,
    updated_at: '2026-10-20T04:00:00Z',
  };

  const create = async (roleList: string[]) => {
    roles.set(roleList);
    fixture = TestBed.createComponent(DeskToolsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    svc = {
      listTopics: vi
        .fn()
        .mockResolvedValue([
          { code: 'report_query', label: 'Report question', helper: '', needs_booking: false },
        ]),
      listAssignees: vi
        .fn()
        .mockResolvedValue([{ user_id: 'agent-1', display_name: 'Priya (Support)' }]),
      searchPatients: vi.fn().mockResolvedValue([
        {
          patient_id: '00000000-0000-4000-8000-000000000001',
          patient_code: 'FL-P-104928',
          name_masked: 'Aa*** Sh****',
          phone_masked: '+91 ******1234',
          relation: 'self',
          booking_count: 2,
        },
      ]),
      patientAccountId: vi.fn().mockResolvedValue(ACCOUNT),
      createStaffTicket: vi.fn().mockResolvedValue({ id: 't-9', reference: 'TK-2026-000009' }),
      updateAssignee: vi.fn().mockResolvedValue({ id: 't-9' }),
      listCannedReplies: vi
        .fn()
        .mockResolvedValue([
          { id: 'cr-1', title: 'Delay', body: 'Sorry for the delay.', active: true },
        ]),
      createCannedReply: vi.fn().mockResolvedValue({ id: 'cr-2' }),
      updateCannedReply: vi.fn().mockResolvedValue({ id: 'cr-1' }),
      getSettings: vi.fn().mockResolvedValue(settings),
      updateSettings: vi.fn().mockResolvedValue({ ...settings, first_reply_minutes: 120 }),
      getCsat: vi.fn().mockResolvedValue({ from: '2026-09-25', to: '2026-10-24', buckets: [] }),
    };
    roles = signal<string[]>(['support']);
    await TestBed.configureTestingModule({
      imports: [DeskToolsComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: svc },
        { provide: StaffStateService, useValue: { roles } },
      ],
    }).compileComponents();
  });

  describe('phone and walk-in intake', () => {
    beforeEach(async () => create(['support']));

    it('WR-11 keeps the latest patient when selection responses arrive in reverse order', async () => {
      component.searchQuery.set('FL-P-104928');
      await component.searchPatients();
      const first = svc.searchPatients.mock.results[0];
      // Use the same masked result shape for a second patient.
      const rows = await first.value;
      component.results.set([
        rows[0],
        { ...rows[0], patient_id: 'patient-B', patient_code: 'FL-P-104929' },
      ]);
      let resolveA!: (id: string) => void;
      let resolveB!: (id: string) => void;
      svc.patientAccountId.mockImplementation(
        (id: string) =>
          new Promise<string>((resolve) => {
            if (id === 'patient-B') resolveB = resolve;
            else resolveA = resolve;
          }),
      );
      const a = component.selectPatient(rows[0].patient_id);
      const b = component.selectPatient('patient-B');
      resolveB('account-B');
      await b;
      resolveA('account-A');
      await a;
      expect(component.selected()?.account_user_id).toBe('account-B');
    });

    it('WR-11 refuses intake while selection is loading and a new search cancels the selection', async () => {
      component.searchQuery.set('FL-P-104928');
      await component.searchPatients();
      let finish!: (id: string) => void;
      svc.patientAccountId.mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      );
      const selection = component.selectPatient('00000000-0000-4000-8000-000000000001');
      await component.submitIntake();
      expect(svc.createStaffTicket).not.toHaveBeenCalled();
      await component.searchPatients();
      finish(ACCOUNT);
      await selection;
      expect(component.selected()).toBeNull();
    });

    it('files the ticket under the account of the patient the agent explicitly selected', async () => {
      component.searchType.set('patient_id');
      component.searchQuery.set('FL-P-104928');
      await component.searchPatients();
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent!;
      expect(text).toContain('Aa*** Sh****');
      expect(svc.patientAccountId).not.toHaveBeenCalled();

      await component.selectPatient('00000000-0000-4000-8000-000000000001');
      expect(svc.patientAccountId).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');

      component.intake.set({
        channel: 'walk_in',
        category: 'report_query',
        description: 'Visited the desk about report timing',
        priority: 'urgent',
        assignee_user_id: 'agent-1',
      });
      await component.submitIntake();
      expect(svc.createStaffTicket).toHaveBeenCalledWith({
        user_id: ACCOUNT,
        category: 'report_query',
        description: 'Visited the desk about report timing',
        channel: 'walk_in',
        priority: 'urgent',
      });
      expect(svc.updateAssignee).toHaveBeenCalledWith('t-9', 'agent-1');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('TK-2026-000009');
    });

    it('with no patient selected the ticket names no account, even if a phone was searched', async () => {
      component.searchType.set('phone');
      component.searchQuery.set('9876543210');
      await component.searchPatients();
      component.intake.set({
        channel: 'phone',
        category: 'report_query',
        description: 'Caller would not confirm identity',
        priority: 'normal',
        assignee_user_id: '',
      });
      await component.submitIntake();
      const body = svc.createStaffTicket.mock.calls[0][0];
      expect(body.user_id).toBeNull();
      expect(JSON.stringify(body)).not.toContain('9876543210');
      expect(svc.updateAssignee).not.toHaveBeenCalled();
    });

    it('maps a 422 to the named field and blocks a duplicate submit', async () => {
      let fail!: (e: unknown) => void;
      svc.createStaffTicket.mockReturnValueOnce(new Promise((_, r) => (fail = r)));
      component.intake.set({
        channel: 'phone',
        category: 'report_query',
        description: 'x',
        priority: 'normal',
        assignee_user_id: '',
      });
      const first = component.submitIntake();
      await component.submitIntake();
      expect(svc.createStaffTicket).toHaveBeenCalledTimes(1);
      fail(
        new ApiClientError(422, 'validation_failed', 'Invalid', {
          fields: [{ path: 'description' }],
        }),
      );
      await first;
      expect(component.fieldErrors()['description']).toBeTruthy();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-field-error="description"]'),
      ).not.toBeNull();
    });
  });

  describe('canned replies', () => {
    beforeEach(async () => create(['support']));

    it('creates, edits and retires macros, reloading the server list after each change', async () => {
      expect(svc.listCannedReplies).toHaveBeenCalledWith(undefined);
      component.macroDraft.set({ title: 'Collected', body: 'Your sample was collected.' });
      await component.saveMacro();
      expect(svc.createCannedReply).toHaveBeenCalledWith({
        title: 'Collected',
        body: 'Your sample was collected.',
      });
      await component.setMacroActive('cr-1', false);
      expect(svc.updateCannedReply).toHaveBeenCalledWith('cr-1', { active: false });
      await component.editMacro('cr-1', { title: 'Delay', body: 'We are sorry for the delay.' });
      expect(svc.updateCannedReply).toHaveBeenCalledWith('cr-1', {
        title: 'Delay',
        body: 'We are sorry for the delay.',
      });
      expect(svc.listCannedReplies).toHaveBeenCalledTimes(4);
    });

    it('a failed change leaves the last confirmed list on screen', async () => {
      svc.updateCannedReply.mockRejectedValueOnce(new Error('offline'));
      await component.setMacroActive('cr-1', false);
      expect(component.macros()[0].active).toBe(true);
      expect(component.macroError()).not.toBe('');
    });
  });

  describe('SLA settings', () => {
    it('support sees the policy but has no way to save it', async () => {
      await create(['support']);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('09:00');
      expect(el.textContent).toContain('18:00');
      expect(el.querySelector('[data-settings-save]')).toBeNull();
      await component.saveSettings();
      expect(svc.updateSettings).not.toHaveBeenCalled();
    });

    it('super_admin saves the policy and shows the server copy', async () => {
      await create(['super_admin']);
      component.settingsDraft.set({ ...settings, first_reply_minutes: 120 });
      await component.saveSettings();
      expect(svc.updateSettings).toHaveBeenCalledWith({
        first_reply_minutes: 120,
        resolution_minutes: 2880,
        weekdays: [1, 2, 3, 4, 5, 6],
        opens_minute: 540,
        closes_minute: 1080,
      });
      expect(component.settings()!.first_reply_minutes).toBe(120);
    });

    it('a refused save maps the field and keeps the confirmed policy', async () => {
      await create(['super_admin']);
      svc.updateSettings.mockRejectedValueOnce(
        new ApiClientError(422, 'validation_failed', 'Invalid', {
          fields: [{ path: 'weekdays.0' }],
        }),
      );
      component.settingsDraft.set({ ...settings, weekdays: [9] });
      await component.saveSettings();
      expect(component.settings()!.weekdays).toEqual([1, 2, 3, 4, 5, 6]);
      expect(component.fieldErrors()['weekdays']).toBeTruthy();
    });
  });

  describe('CSAT report', () => {
    const summary: SupportCsatSummaryDto = {
      from: '2026-10-01',
      to: '2026-10-24',
      buckets: [
        {
          agent_user_id: 'agent-1',
          category: 'report_query',
          count: 6,
          sum: 25,
          histogram: { '1': 0, '2': 1, '3': 0, '4': 2, '5': 3 },
        },
        {
          agent_user_id: null,
          category: 'sample_delay',
          count: 2,
          sum: 3,
          histogram: { '1': 1, '2': 1, '3': 0, '4': 0, '5': 0 },
        },
      ],
    };

    beforeEach(async () => create(['support']));

    it('shows each agent and category with the average and the five-star histogram', async () => {
      svc.getCsat.mockResolvedValueOnce(summary);
      component.csatFrom.set('2026-10-01');
      component.csatTo.set('2026-10-24');
      await component.loadCsat();
      fixture.detectChanges();
      expect(svc.getCsat).toHaveBeenLastCalledWith('2026-10-01', '2026-10-24');
      const rows = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('[data-csat-row]'),
      );
      expect(rows).toHaveLength(2);
      // 25 / 6 = 4.1666... and 3 / 2 = 1.5, both to one decimal.
      expect(rows[0].textContent).toContain('Priya (Support)');
      expect(rows[0].textContent).toContain('4.2');
      expect(
        Array.from(rows[0].querySelectorAll('[data-star]')).map((c) => c.textContent!.trim()),
      ).toEqual(['0', '1', '0', '2', '3']);
      expect(rows[1].textContent).toContain('Unassigned');
      expect(rows[1].textContent).toContain('1.5');
      expect(rows[0].textContent).not.toContain('agent-1');
    });

    it('an older report response or a failure never replaces the last confirmed report', async () => {
      svc.getCsat.mockResolvedValueOnce(summary);
      await component.loadCsat();
      let finishOld!: (v: unknown) => void;
      svc.getCsat.mockReturnValueOnce(new Promise((r) => (finishOld = r)));
      const old = component.loadCsat();
      svc.getCsat.mockRejectedValueOnce(new Error('offline'));
      await component.loadCsat();
      finishOld({ from: '2026-01-01', to: '2026-01-02', buckets: [] });
      await old;
      expect(component.csat()).toEqual(summary);
      expect(component.csatError()).not.toBe('');
    });
  });
});
