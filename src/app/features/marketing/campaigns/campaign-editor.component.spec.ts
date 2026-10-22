import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { CampaignEditorComponent } from './campaign-editor.component';
import { StaffStateService } from '../../../core/state/staff-state.service';
import { marketingErrorMessage } from '../marketing-errors';
import {
  CampaignsService,
  CampaignItem,
  CampaignPolicyDto,
  CreateCampaignDto,
  TestSendLogItem,
  TestDeviceItem,
} from './campaigns.service';

/**
 * The service fake behaves like the server where it matters: every save of a changed campaign bumps
 * its revision, an own-device test is recorded against the revision it ran on, and the shapes are the
 * real response shapes (estimated_count, test_sends with revision, items).
 */
describe('CampaignEditorComponent', () => {
  let component: CampaignEditorComponent;
  let fixture: ComponentFixture<CampaignEditorComponent>;
  let router: Router;

  let server: CampaignItem;
  let tests: TestSendLogItem[];
  let svc: {
    getCampaign: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
    estimateAudience: ReturnType<typeof vi.fn>;
    getPreview: ReturnType<typeof vi.fn>;
    testSend: ReturnType<typeof vi.fn>;
    scheduleCampaign: ReturnType<typeof vi.fn>;
    getPolicy: ReturnType<typeof vi.fn>;
    getTestDevices: ReturnType<typeof vi.fn>;
  };

  const policy: CampaignPolicyDto = {
    approval_threshold: 5000,
    allowed_image_hosts: ['cdn.forumhospital.com'],
  };

  const baseCampaign = (extra: Partial<CampaignItem> = {}): CampaignItem => ({
    id: 'cmp-1',
    name: 'Diabetic Screening Push',
    title: 'Check Your HbA1c Levels',
    body: 'Complete home health screening at 20% discount today.',
    imageUrl: null,
    linkKind: 'home',
    linkTargetId: null,
    status: 'draft',
    audience: { all_consented: true },
    sendAt: null,
    respectQuietHours: true,
    onQuietHours: 'defer',
    revision: 1,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...extra,
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => el().querySelector(`[data-testid="${id}"]`);
  /** The tests set plain form fields directly (the app does it through events, which mark the view). */
  const refresh = () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  async function create(
    opts: {
      id?: string;
      policyFails?: boolean;
      policy?: CampaignPolicyDto;
      testDevices?: TestDeviceItem[];
    } = {},
  ): Promise<void> {
    tests = [];
    server = baseCampaign();

    svc = {
      getCampaign: vi.fn(() => of({ ...server, test_sends: [...tests] })),
      createCampaign: vi.fn((dto: CreateCampaignDto) => {
        server = baseCampaign({
          ...dto,
          imageUrl: dto.imageUrl ?? null,
          audience: dto.audience ?? {},
        } as Partial<CampaignItem>);
        return of(server);
      }),
      updateCampaign: vi.fn((_id: string, dto: CreateCampaignDto) => {
        server = { ...server, ...(dto as Partial<CampaignItem>), revision: server.revision + 1 };
        return of(server);
      }),
      estimateAudience: vi.fn(() => of({ estimated_count: 3200, estimatedCount: 3200 })),
      getPreview: vi.fn(() =>
        of({
          android: { title: server.title, body: server.body, image_url: null, link: {} },
          ios: { title: server.title, body: server.body, image_url: null, link: {} },
          title_char_count: server.title.length,
          body_char_count: server.body.length,
          truncation_warnings: [
            'Title exceeds 50 characters and may be truncated on some iOS lock screens',
          ],
        }),
      ),
      testSend: vi.fn((_id: string, data: { deviceIds: string[]; requestId: string }) => {
        if (!tests.some((t) => t.requestId === data.requestId && t.revision === server.revision)) {
          tests.push({
            requestId: data.requestId,
            count: data.deviceIds.length,
            revision: server.revision,
            sentAt: '2026-06-01T10:05:00.000Z',
          });
        }
        return of({ success: true, count: data.deviceIds.length, test_sends: [...tests] });
      }),
      scheduleCampaign: vi.fn(() => of({ ...server, status: 'scheduled' as const })),
      getPolicy: vi.fn(() =>
        opts.policyFails
          ? throwError(() => new ApiClientError(503, 'service_unavailable', 'down'))
          : of(opts.policy ?? policy),
      ),
      getTestDevices: vi.fn(() =>
        of({
          devices: opts.testDevices ?? [
            {
              id: 'dev-001',
              platform: 'android',
              app_version: '2.1.0',
              last_seen_at: '2026-06-01T00:00:00.000Z',
            },
          ],
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [CampaignEditorComponent],
      providers: [
        provideRouter([]),
        { provide: CampaignsService, useValue: svc },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'id' ? (opts.id ?? null) : null) },
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CampaignEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Fills a valid new-campaign form. */
  function fill(): void {
    component.form.name = 'Diabetic Screening Push';
    component.form.title = 'Check Your HbA1c Levels';
    component.form.body = 'Complete home health screening at 20% discount today.';
    component.onFormChange();
  }

  /** Saves, selects the device and runs a test send; returns once the confirmation is in place. */
  function testSendNow(): void {
    component.toggleDeviceSelection('dev-001');
    component.runTestSend();
  }

  describe('saving before id-dependent steps', () => {
    it('creates the draft first, then estimates, and reads the real estimate shape', async () => {
      await create();
      fill();
      component.estimateAudience();
      fixture.detectChanges();

      expect(svc.createCampaign).toHaveBeenCalledTimes(1);
      expect(component.campaignId).toBe('cmp-1');
      expect(svc.estimateAudience).toHaveBeenCalledWith('cmp-1');
      expect(q('estimate-count')?.textContent).toContain('3,200');
      expect(q('estimate-within-threshold')).toBeTruthy();
      expect(q('estimate-needs-approval')).toBeNull();
    });

    it('an estimate above the policy threshold says approval will be needed (and 5,000 itself does not)', async () => {
      await create();
      fill();
      svc.estimateAudience.mockReturnValue(of({ estimated_count: 6000 }));
      component.estimateAudience();
      fixture.detectChanges();
      expect(q('estimate-count')?.textContent).toContain('6,000');
      expect(q('estimate-needs-approval')?.textContent).toContain('5,000');

      svc.estimateAudience.mockReturnValue(of({ estimated_count: 5000 }));
      component.onFormChange();
      component.estimateAudience();
      fixture.detectChanges();
      expect(q('estimate-needs-approval')).toBeNull();
      expect(q('estimate-within-threshold')).toBeTruthy();
    });

    it('a failed save stops the estimate spinner and shows the API text', async () => {
      await create();
      fill();
      svc.createCampaign.mockReturnValue(
        throwError(() => new ApiClientError(422, 'unprocessable', 'Invalid marketing copy')),
      );
      component.estimateAudience();
      expect(component.estimating()).toBe(false);
      expect(component.errorMessage()).toBe('Invalid marketing copy');
      expect(svc.estimateAudience).not.toHaveBeenCalled();
    });
  });

  describe('test confirmation is bound to the saved revision (C-08, C-12)', () => {
    it('a test send confirms the revision it ran on', async () => {
      await create();
      fill();
      testSendNow();
      expect(component.savedRevision()).toBe(1);
      expect(component.testSendSuccess()).toBe(true);
    });

    it('Save Draft after an edit raises the revision and withdraws the confirmation, so scheduling is refused', async () => {
      await create();
      fill();
      testSendNow();
      expect(component.testSendSuccess()).toBe(true);

      component.form.title = 'A new title';
      component.onFormChange();
      expect(component.testSendSuccess()).toBe(false);
      component.saveDraft();
      expect(component.savedRevision()).toBe(2);
      expect(component.testSendSuccess()).toBe(false);

      component.scheduleOrSend();
      expect(svc.scheduleCampaign).not.toHaveBeenCalled();
    });

    it('estimating a form that has not changed does not save again, so the confirmation survives', async () => {
      await create();
      fill();
      testSendNow();
      const updates = svc.updateCampaign.mock.calls.length;

      component.estimateAudience();
      expect(svc.updateCampaign.mock.calls.length).toBe(updates);
      expect(component.savedRevision()).toBe(1);
      expect(component.testSendSuccess()).toBe(true);
    });

    it('Save Draft on an unchanged saved form sends nothing and keeps the revision', async () => {
      await create();
      fill();
      component.saveDraft();
      component.saveDraft();
      expect(svc.createCampaign).toHaveBeenCalledTimes(1);
      expect(svc.updateCampaign).not.toHaveBeenCalled();
      expect(component.savedRevision()).toBe(1);
    });

    it('a retry after a lost response reuses the request id and does not touch the revision', async () => {
      await create();
      fill();
      svc.testSend.mockReturnValueOnce(
        throwError(() => new ApiClientError(0, 'network', 'Network error')) as Observable<never>,
      );
      testSendNow();
      expect(component.testSendSuccess()).toBe(false);
      const firstRequestId = svc.testSend.mock.calls[0][1].requestId as string;
      const saves = svc.createCampaign.mock.calls.length + svc.updateCampaign.mock.calls.length;

      component.runTestSend();

      expect(svc.createCampaign.mock.calls.length + svc.updateCampaign.mock.calls.length).toBe(
        saves,
      );
      expect(svc.testSend.mock.calls[1][1].requestId).toBe(firstRequestId);
      expect(component.testSendSuccess()).toBe(true);
    });

    it('is not confirmed when the server did not record the attempt for this revision', async () => {
      await create();
      fill();
      svc.testSend.mockReturnValue(of({ success: true, count: 1, test_sends: [] }));
      testSendNow();
      expect(component.testSendSuccess()).toBe(false);
      expect(component.errorMessage()).toContain('not recorded');
    });

    it('opening a saved campaign restores the confirmation only when its current revision was tested', async () => {
      await create({ id: 'cmp-1' });
      expect(component.testSendSuccess()).toBe(false);

      tests = [{ requestId: 'r', count: 1, revision: 1, sentAt: '2026-06-01T10:05:00.000Z' }];
      component.loadCampaign('cmp-1');
      expect(component.testSendSuccess()).toBe(true);

      server = { ...server, revision: 2 };
      component.loadCampaign('cmp-1');
      expect(component.testSendSuccess()).toBe(false);
    });
  });

  describe('audience inputs are never silently widened (C-06, C-07)', () => {
    it('a malformed pincode blocks the save and is named, instead of being dropped', async () => {
      await create();
      fill();
      component.form.audience.pincodesText = '56001';
      component.onFormChange();
      component.saveDraft();
      expect(svc.createCampaign).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('56001');
      fixture.detectChanges();
      expect(q('audience-problem')?.textContent).toContain('56001');
    });

    it('valid pincodes are sent once each; a mix of valid and invalid still blocks', async () => {
      await create();
      fill();
      component.form.audience.pincodesText = '560001, 560002 560001';
      component.saveDraft();
      expect(svc.createCampaign.mock.calls[0][0].audience.pincodes).toEqual(['560001', '560002']);

      component.form.audience.pincodesText = '560001, 12';
      component.onFormChange();
      component.saveDraft();
      expect(svc.updateCampaign).not.toHaveBeenCalled();
    });

    it('an invalid patient-ID list blocks the save and leaves no stale IDs in the payload', async () => {
      await create();
      fill();
      component.parsePatientIdsCsv('FL-P-000101\nFL-P-000102');
      expect(component.form.audience.patient_ids).toEqual(['FL-P-000101', 'FL-P-000102']);

      component.parsePatientIdsCsv('FL-P-000101\nCANARY-INVALID-ID');
      expect(component.csvError()).toBeTruthy();
      expect(component.csvError()).not.toContain('CANARY');
      expect(component.form.audience.patient_ids).toEqual([]);
      component.saveDraft();
      expect(svc.createCampaign).not.toHaveBeenCalled();
    });

    it('parses patient IDs, removes duplicates and keeps the list in sync with the text', async () => {
      await create();
      component.parsePatientIdsCsv('FL-P-000101\nFL-P-000102\nFL-P-000101\nFL-P-000103');
      expect(component.form.audience.patient_ids).toEqual([
        'FL-P-000101',
        'FL-P-000102',
        'FL-P-000103',
      ]);
      expect(component.csvError()).toBeNull();
      component.parsePatientIdsCsv('');
      expect(component.form.audience.patient_ids).toEqual([]);
    });

    it.each([
      [{ never_booked: true }, 'yes'],
      [{ never_booked: false }, 'no'],
      [{}, 'any'],
    ])('never_booked %j round-trips through load and save (%s)', async (audience, state) => {
      await create({ id: 'cmp-1' });
      server = baseCampaign({ audience: { all_consented: true, ...audience } });
      component.loadCampaign('cmp-1');
      expect(component.form.audience.never_booked).toBe(state);

      component.form.title = 'Edited copy';
      component.onFormChange();
      component.saveDraft();
      const sent = svc.updateCampaign.mock.calls[0][1].audience;
      if ('never_booked' in audience) expect(sent.never_booked).toBe(audience.never_booked);
      else expect('never_booked' in sent).toBe(false);
    });

    it('has_upcoming_booking false is kept as an explicit restriction', async () => {
      await create({ id: 'cmp-1' });
      server = baseCampaign({ audience: { all_consented: true, has_upcoming_booking: false } });
      component.loadCampaign('cmp-1');
      component.onFormChange();
      component.saveDraft();
      expect(svc.updateCampaign.mock.calls[0][1].audience.has_upcoming_booking).toBe(false);
    });

    it('zones can be added, edited and removed, and are validated', async () => {
      await create();
      fill();
      component.addZone();
      fixture.detectChanges();
      expect(el().querySelectorAll('[data-testid="zone-row"]').length).toBe(1);

      component.saveDraft();
      expect(component.errorMessage()).toContain('Zone 1 needs a name');

      component.form.audience.zones[0] = { id: 'South', pincodesText: '560001, 99' };
      component.saveDraft();
      expect(component.errorMessage()).toContain('invalid pincode');

      component.form.audience.zones[0] = { id: 'South', pincodesText: '560001, 560002' };
      component.saveDraft();
      expect(svc.createCampaign.mock.calls[0][0].audience.zones).toEqual([
        { id: 'South', pincodes: ['560001', '560002'] },
      ]);

      component.removeZone(0);
      expect(component.form.audience.zones).toEqual([]);
    });

    it('refuses contradictory booking day counts', async () => {
      await create();
      fill();
      component.form.audience.last_booking_before_days = 60;
      component.form.audience.last_booking_within_days = 30;
      component.saveDraft();
      expect(svc.createCampaign).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('fewer days');
    });
  });

  describe('scheduling (C-09)', () => {
    const confirmed = async () => {
      await create();
      fill();
      testSendNow();
    };

    it('"Schedule Later" with a missing date or time cannot be sent, and no request is made', async () => {
      await confirmed();
      component.form.sendOption = 'later';
      component.form.sendAtDate = '2999-01-01';
      component.form.sendAtTime = '';
      fixture.detectChanges();
      expect(component.scheduleProblem()).toContain('both a date and a time');
      expect(q('schedule-problem')).toBeTruthy();
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).not.toHaveBeenCalled();

      component.form.sendAtDate = '';
      component.form.sendAtTime = '10:00';
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).not.toHaveBeenCalled();
    });

    it('a time in the past is refused', async () => {
      await confirmed();
      component.form.sendOption = 'later';
      component.form.sendAtDate = '2020-01-01';
      component.form.sendAtTime = '10:00';
      expect(component.scheduleProblem()).toContain('future');
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).not.toHaveBeenCalled();
    });

    it('a complete future IST time is sent as that exact instant', async () => {
      await confirmed();
      component.form.sendOption = 'later';
      component.form.sendAtDate = '2999-01-01';
      component.form.sendAtTime = '10:00';
      expect(component.scheduleProblem()).toBeNull();
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).toHaveBeenCalledWith('cmp-1', {
        sendAt: '2999-01-01T04:30:00.000Z',
      });
    });

    it('"Send Now" sends no time at all', async () => {
      await confirmed();
      component.form.sendOption = 'now';
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).toHaveBeenCalledWith('cmp-1', {});
    });

    it('"Send Now" lands on the list with a queued notice; an approval-needed result says so', async () => {
      await confirmed();
      component.form.sendOption = 'now';
      component.scheduleOrSend();
      expect(router.navigate).toHaveBeenCalledWith(['/marketing/campaigns'], {
        state: { notice: expect.stringContaining('Sending starts within about a minute') },
      });

      svc.scheduleCampaign.mockReturnValue(of({ status: 'pending_approval' }));
      component.scheduleOrSend();
      expect(router.navigate).toHaveBeenLastCalledWith(['/marketing/campaigns'], {
        state: { notice: expect.stringContaining('Super Admin must approve') },
      });
    });

    it('scheduling is refused until the current revision was tested', async () => {
      await create();
      fill();
      component.saveDraft();
      component.scheduleOrSend();
      expect(svc.scheduleCampaign).not.toHaveBeenCalled();
    });
  });

  describe('image URL (C-11)', () => {
    it('a URL typed after the first render is checked at once: http, credentials and other hosts are refused', async () => {
      await create();
      refresh();

      component.form.imageUrl = 'http://cdn.forumhospital.com/a.png';
      refresh();
      expect(q('image-problem')?.textContent).toContain('HTTPS');

      component.form.imageUrl = 'https://user:pw@cdn.forumhospital.com/a.png';
      refresh();
      expect(q('image-problem')?.textContent).toContain('username');

      component.form.imageUrl = 'https://example.test/a.png';
      refresh();
      expect(q('image-problem')?.textContent).toContain('not in the allowed hosts');
      expect(el().querySelector('img')).toBeNull();
    });

    it('an allowed https URL previews and saves; a refused one blocks the save', async () => {
      await create();
      fill();
      component.form.imageUrl = 'https://img.cdn.forumhospital.com/a.png';
      fixture.detectChanges();
      expect(q('image-problem')).toBeNull();
      expect(q('preview-android')?.querySelector('img')).toBeTruthy();

      component.form.imageUrl = 'http://evil.test/a.png';
      component.saveDraft();
      expect(svc.createCampaign).not.toHaveBeenCalled();
    });

    it('when the policy could not be loaded the image is not used and the failure is shown with a retry', async () => {
      await create({ policyFails: true });
      component.form.imageUrl = 'https://cdn.forumhospital.com/a.png';
      fixture.detectChanges();
      expect(q('policy-error')?.textContent).toContain('temporarily unavailable');
      expect(component.imageProblem()).toBeTruthy();
      expect(q('preview-android')?.querySelector('img')).toBeNull();
    });
  });

  describe('previews and policy', () => {
    it('renders both notification previews', async () => {
      await create();
      component.form.title = 'Check Your HbA1c Levels';
      fixture.detectChanges();
      expect(q('preview-android')?.textContent).toContain('Check Your HbA1c Levels');
      expect(q('preview-ios')?.textContent).toContain('Check Your HbA1c Levels');
    });

    it('the server preview shows character counts and the truncation warning of the saved revision', async () => {
      await create();
      fill();
      component.loadServerPreview();
      fixture.detectChanges();
      expect(svc.createCampaign).toHaveBeenCalled();
      expect(q('server-preview')?.textContent).toContain('23 characters');
      expect(q('truncation-warning')?.textContent).toContain('truncated');
    });

    it('an edit clears a shown server preview and estimate', async () => {
      await create();
      fill();
      component.loadServerPreview();
      component.onFormChange();
      expect(component.serverPreview()).toBeNull();
    });

    it('shows the configured approval threshold and the 10:00 to 20:00 IST rule, not invented quiet hours', async () => {
      await create();
      expect(el().textContent).toContain('5,000');
      expect(el().textContent).toContain('between 10:00 and 20:00 IST');

      svc.getPolicy.mockReturnValue(of({ ...policy, approval_threshold: 3000 }));
      component.loadPolicy();
      fixture.detectChanges();
      expect(el().textContent).toContain('3,000');
    });

    it("lists the staff member's own test devices with platform and app version", async () => {
      await create();
      fixture.detectChanges();
      expect(el().textContent).toContain('android 2.1.0');
    });
  });

  describe('push state and device hint (Plan 16.1-07 Task 1)', () => {
    it('push_connected true shows configured line', async () => {
      await create({ policy: { ...policy, push_connected: true } });
      fixture.detectChanges();
      expect(el().textContent).toContain(
        'Push is configured: test sends go to your registered devices.',
      );
    });

    it('push_connected false shows not connected line and disables test-send and schedule', async () => {
      await create({ policy: { ...policy, push_connected: false } });
      fill();
      fixture.detectChanges();
      expect(el().textContent).toContain(
        'Push is not connected yet: test send and scheduling are unavailable.',
      );

      // Test send button is disabled
      const testSendBtn = q('test-send-button')?.querySelector('button');
      expect(testSendBtn?.disabled).toBe(true);

      // Schedule button is disabled
      const scheduleBtn = q('schedule-button')?.querySelector('button');
      expect(scheduleBtn?.disabled).toBe(true);

      // Component method pushStateMessage returns the reason
      expect(component.pushStateMessage()).toBe(
        'Push is not connected yet: test send and scheduling are unavailable.',
      );
    });

    it('push_connected undefined (old API) shows no extra push state line', async () => {
      await create({ policy: { ...policy, push_connected: undefined } });
      fixture.detectChanges();
      expect(el().textContent).not.toContain('Push is configured');
      expect(el().textContent).not.toContain('Push is not connected yet');
      expect(q('push-state-message')).toBeNull();
    });

    it('empty test devices shows registration hint', async () => {
      await create({ testDevices: [] });
      fixture.detectChanges();
      expect(el().textContent).toContain(
        'Open the app signed in as yourself and allow notifications to register a device.',
      );
    });
  });

  describe('sending without a test send', () => {
    it('unlocks Send Now for a super admin; other roles stay locked until a test send succeeds', async () => {
      await create({ policy: { ...policy, push_connected: true } });
      fill();
      fixture.detectChanges();
      const scheduleBtn = () => q('schedule-button')?.querySelector('button');
      expect(scheduleBtn()?.disabled).toBe(true);
      expect(el().textContent).toContain('Complete test send above to unlock scheduling.');

      vi.spyOn(TestBed.inject(StaffStateService), 'hasRole').mockReturnValue(true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(scheduleBtn()?.disabled).toBe(false);
      expect(el().textContent).not.toContain('Complete test send above to unlock scheduling.');
    });
  });

  describe('Send Now on a form that was never saved', () => {
    it('saves the draft first, then queues it (it used to do nothing, silently)', async () => {
      await create();
      fill();
      vi.spyOn(TestBed.inject(StaffStateService), 'hasRole').mockReturnValue(true);
      expect(component.campaignId).toBeNull();
      component.form.sendOption = 'now';

      component.scheduleOrSend();

      expect(svc.createCampaign).toHaveBeenCalledTimes(1);
      expect(svc.scheduleCampaign).toHaveBeenCalledTimes(1);
      expect(svc.scheduleCampaign.mock.calls[0][0]).toBe(component.campaignId);
      expect(router.navigate).toHaveBeenCalledWith(['/marketing/campaigns'], expect.anything());
    });

    it('a failed save is shown next to the button and the button is usable again', async () => {
      await create();
      fill();
      vi.spyOn(TestBed.inject(StaffStateService), 'hasRole').mockReturnValue(true);
      svc.createCampaign.mockReturnValue(
        throwError(() => new ApiClientError(422, 'unprocessable', 'Title is too long')),
      );
      component.scheduleOrSend();
      fixture.detectChanges();

      expect(svc.scheduleCampaign).not.toHaveBeenCalled();
      expect(component.scheduling()).toBe(false);
      expect(el().querySelector('[data-testid="schedule-error"]')?.textContent).toContain(
        'Title is too long',
      );
    });
  });

  describe('marketingErrorMessage', () => {
    it('503 with push down returns synchronized push not connected error', () => {
      const err = new ApiClientError(503, 'service_unavailable', 'down', { push: 'down' });
      expect(marketingErrorMessage(err, 'fallback')).toBe(
        'Push is not connected yet: test send and scheduling are unavailable.',
      );
    });
  });
});
