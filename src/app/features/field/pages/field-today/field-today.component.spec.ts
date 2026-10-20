import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { FieldTodayComponent } from './field-today.component';
import {
  FieldService,
  FieldVisit,
  FieldVisitsResult,
  StaffTube,
} from '../../services/field.service';
import { routes } from '../../field.routes';
import { ApiClientError } from '../../../../core/api/api-client.service';
import { encodeCode128B, normalizeInputTubeCode } from '../../tube-scan-modal.component';

describe('FieldTodayComponent', () => {
  let fixture: ComponentFixture<FieldTodayComponent>;
  let component: FieldTodayComponent;
  let mockFieldService: {
    getTodayVisits: ReturnType<typeof vi.fn>;
    acceptVisit: ReturnType<typeof vi.fn>;
    recordEvent: ReturnType<typeof vi.fn>;
    generateTubes: ReturnType<typeof vi.fn>;
    scanTubeCollection: ReturnType<typeof vi.fn>;
    getFieldSummary: ReturnType<typeof vi.fn>;
    handoverTubes: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const mockTubes: StaffTube[] = [
    {
      id: 'tube-1',
      tube_code: 'FLT-1111-2222',
      order_id: 'order-1',
      attempt: 1,
      patient_row_id: 'p-1',
      test_ordinal: 0,
      status: 'scanned_at_collection',
      created_at: '2026-10-20T07:15:00Z',
    },
  ];

  const mockVisits: FieldVisit[] = [
    {
      order_id: 'order-1',
      booking_ref: 'BK-1001',
      status: 'phlebotomist_assigned',
      payment_status: 'pending',
      total_paise: 89900,
      slot_starts_at: '2026-10-20T07:00:00Z',
      slot_ends_at: '2026-10-20T08:00:00Z',
      address: {
        house: '12',
        street: 'MG Road',
        area: 'Indiranagar',
        pincode: '560038',
        landmark: 'Near Metro',
        access_notes: 'Gate code 1234',
      },
      patients: [
        {
          patient_row_id: 'p-1',
          patient_code: 'PT-01',
          first_name: 'Sunita',
          relation: 'Self',
        },
      ],
      tests: [
        {
          position: 0,
          item_name: 'Complete Blood Count',
          patient_row_id: 'p-1',
        },
      ],
      attempt: 1,
      accepted_at: '2026-10-20T06:30:00Z',
      tubes: mockTubes,
    },
    {
      order_id: 'order-2',
      booking_ref: 'BK-1002',
      status: 'phlebotomist_assigned',
      payment_status: 'pending',
      total_paise: 49900,
      slot_starts_at: '2026-10-20T08:30:00Z',
      slot_ends_at: '2026-10-20T09:30:00Z',
      address: {
        house: '45',
        street: '100ft Road',
        area: 'Koramangala',
        pincode: '560034',
        landmark: null,
        access_notes: null,
      },
      patients: [
        {
          patient_row_id: 'p-2',
          patient_code: 'PT-02',
          first_name: 'Ravi',
          relation: 'Father',
        },
      ],
      tests: [
        {
          position: 0,
          item_name: 'Fasting Blood Sugar',
          patient_row_id: 'p-2',
        },
      ],
      attempt: 1,
      accepted_at: null, // Not yet accepted
      tubes: [],
    },
  ];

  beforeEach(async () => {
    mockFieldService = {
      getTodayVisits: vi.fn().mockResolvedValue({
        kind: 'field_visits',
        date: '2026-10-20',
        total_count: 2,
        visits: mockVisits,
      } as FieldVisitsResult),
      acceptVisit: vi.fn().mockResolvedValue({
        kind: 'visit_accepted',
        order_id: 'order-2',
        attempt: 1,
        assignment_event_id: 'ev-2',
        accepted_at: '2026-10-20T08:00:00Z',
      }),
      recordEvent: vi.fn().mockResolvedValue({ kind: 'event_recorded', status: 'on_the_way' }),
      generateTubes: vi.fn(),
      scanTubeCollection: vi.fn(),
      getFieldSummary: vi.fn().mockResolvedValue({
        kind: 'field_summary',
        date: '2026-10-20',
        assigned_count: 2,
        accepted_count: 1,
        cash_collected_paise: 0,
        upi_collected_paise: 0,
        pending_handover_count: 1,
        pending_tube_codes: ['FLT-1111-2222'],
      }),
      handoverTubes: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FieldTodayComponent],
      providers: [provideRouter(routes), { provide: FieldService, useValue: mockFieldService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(FieldTodayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and renders today assigned visits with sanitized details', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockFieldService.getTodayVisits).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('BK-1001');
    expect(el.textContent).toContain('BK-1002');
    // Amount due
    expect(el.querySelector('[data-testid="amount-due"]')?.textContent).toContain(
      'Collect ₹899.00',
    );
    // Sanitized patient info: first name, relation, patient code, test label
    expect(el.textContent).toContain('Sunita');
    expect(el.textContent).toContain('(Self)');
    expect(el.textContent).toContain('PT-01');
    expect(el.textContent).toContain('Complete Blood Count');
    expect(el.textContent).toContain('12, MG Road');
    expect(el.textContent).toContain('Indiranagar');
    expect(el.textContent).toContain('560038');

    // Strict privacy verification: NO phone number, NO full name, NO DOB
    expect(el.textContent).not.toContain('DOB');
    expect(el.textContent).not.toContain('date_of_birth');
    expect(el.textContent).not.toContain('+91');
    expect(el.textContent).not.toContain('Sunita Rao');
  });

  it('displays prominent Accept Visit button for unaccepted visits and accepts cleanly', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const acceptBtn = fixture.nativeElement.querySelector(
      '[data-testid="accept-visit-btn"]',
    ) as HTMLButtonElement;
    expect(acceptBtn).not.toBeNull();
    expect(acceptBtn.textContent).toContain('Accept Visit');

    acceptBtn.click();
    await fixture.whenStable();

    expect(mockFieldService.acceptVisit).toHaveBeenCalledWith('order-2');
    expect(component.successMessage()).toContain('BK-1002 accepted');
    // Local state accepted_at updated
    const v2 = component.visits().find((v) => v.order_id === 'order-2');
    expect(v2?.accepted_at).toBe('2026-10-20T08:00:00Z');
  });

  it('generates Google Maps query link from frozen address', () => {
    const mapsLink = component.getMapsLink(mockVisits[0].address);
    expect(mapsLink).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(mapsLink).toContain('MG%20Road');
    expect(mapsLink).toContain('560038');
  });

  it('renders empty state when no visits are assigned', async () => {
    mockFieldService.getTodayVisits.mockResolvedValue({
      kind: 'field_visits',
      date: '2026-10-20',
      total_count: 0,
      visits: [],
    });
    await component.loadVisits();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No visits assigned for today');
  });

  it('triggers on_the_way journey action and refreshes visits', async () => {
    await component.markOnTheWay(mockVisits[0]);

    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
      kind: 'on_the_way',
      expected_in_minutes: 15,
    });
    expect(mockFieldService.getTodayVisits).toHaveBeenCalledTimes(2);
  });

  it('triggers arrived journey action and refreshes visits', async () => {
    await component.markArrived(mockVisits[0]);

    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
      kind: 'arrived',
    });
    expect(mockFieldService.getTodayVisits).toHaveBeenCalledTimes(2);
  });

  it('enforces that collection action is enabled only after tubes are scanned', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    // Visit 1 has tubes that are scanned -> canCollectAndPay is true
    expect(component.canCollectAndPay(mockVisits[0])).toBe(true);

    // Visit 2 has no tubes generated -> canCollectAndPay is false
    expect(component.canCollectAndPay(mockVisits[1])).toBe(false);

    // Visit with pending tubes (not scanned) -> canCollectAndPay is false
    const pendingTubeVisit: FieldVisit = {
      ...mockVisits[0],
      tubes: [
        {
          id: 'tube-p',
          tube_code: 'FLT-2222-3333',
          order_id: 'order-1',
          attempt: 1,
          patient_row_id: 'p-1',
          test_ordinal: 0,
          status: 'generated',
          created_at: '2026-10-20T07:15:00Z',
        },
      ],
    };
    expect(component.allTubesScanned(pendingTubeVisit)).toBe(false);
    expect(component.canCollectAndPay(pendingTubeVisit)).toBe(false);
  });

  describe('collection with payment modal', () => {
    const findButton = (label: string): HTMLButtonElement | undefined =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').trim().startsWith(label),
      ) as HTMLButtonElement | undefined;

    it('passes exact order total in paise and records cash collection', async () => {
      mockFieldService.recordEvent.mockResolvedValue({ kind: 'event_recorded' });
      await fixture.whenStable();
      fixture.detectChanges();

      const collectBtn = fixture.nativeElement.querySelector(
        '[data-testid="collect-pay-btn"]',
      ) as HTMLButtonElement;
      expect(collectBtn).not.toBeNull();
      expect(collectBtn.disabled).toBe(false);

      collectBtn.click();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('₹899.00');
      const confirmBtn = findButton('Confirm Collection');
      expect(confirmBtn).toBeDefined();
      expect(confirmBtn!.disabled).toBe(false);

      confirmBtn!.click();
      await fixture.whenStable();

      expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
        kind: 'collected',
        payment: { method: 'cash', amount_paise: 89900 },
      });
    });
  });

  it('handles server event refusal gracefully without crashing', async () => {
    mockFieldService.recordEvent.mockRejectedValue(
      new ApiClientError(422, 'validation_failed', 'Event not allowed'),
    );
    await component.markOnTheWay(mockVisits[0]);

    expect(component.errorMessage()).toContain('Event not allowed');
  });

  it('navigates to daily summary route cleanly', async () => {
    await router.navigate(['summary']);
    expect(router.url).toContain('summary');
  });

  describe('Code 128-B SVG barcode encoding and tube normalization', () => {
    it('normalizes tube codes with Crockford mapping and case insensitivity', () => {
      expect(normalizeInputTubeCode('flt-1234-5678')).toBe('FLT-1234-5678');
      expect(normalizeInputTubeCode('flt 1234 5678')).toBe('FLT-1234-5678');
      expect(normalizeInputTubeCode('12345678')).toBe('FLT-1234-5678');
      // Ambiguous letters: I -> 1, L -> 1, O -> 0
      expect(normalizeInputTubeCode('flt-iloa-bbbb')).toBe('FLT-110A-BBBB');
      // Invalid length
      expect(normalizeInputTubeCode('123')).toBeNull();
    });

    it('encodes Code 128-B barcode with start 104, weighted checksum, stop 106, and quiet zones', () => {
      const code = 'FLT-1111-2222';
      const barcode = encodeCode128B(code);

      expect(barcode.height).toBe(60);
      expect(barcode.totalWidth).toBeGreaterThan(150);
      expect(barcode.bars.length).toBeGreaterThan(20);

      // Bars start after quiet zone (>= 10 modules)
      expect(barcode.bars[0].x).toBe(10);
      // All bar rects have positive dimensions
      for (const bar of barcode.bars) {
        expect(bar.width).toBeGreaterThanOrEqual(1);
        expect(bar.height).toBe(60);
        expect(bar.y).toBe(0);
      }
    });

    it('verifies independent Code 128-B checksum calculation against manual calculation', () => {
      // Manual verification: 'FLT-1111-2222'
      // start 104
      // 'F'(38)*1=38, 'L'(44)*2=88, 'T'(52)*3=156, '-'(13)*4=52,
      // '1'(17)*5=85, '1'(17)*6=102, '1'(17)*7=119, '1'(17)*8=136,
      // '-'(13)*9=117, '2'(18)*10=180, '2'(18)*11=198, '2'(18)*12=216, '2'(18)*13=234
      // sum = 104 + 1721 = 1825; 1825 % 103 = 74.
      // Expected total width: 10 + 11 + 13*11 + 11 + 13 + 10 = 198 modules
      const barcode = encodeCode128B('FLT-1111-2222');
      expect(barcode.totalWidth).toBe(198);
      expect(barcode.bars.slice(-7, -4).map(({ x, width }) => [x, width])).toEqual([
        [164, 1],
        [169, 2],
        [173, 1],
      ]);
    });
  });

  describe('TubeScanModalComponent interactions', () => {
    it('generates tubes when none exist for the visit', async () => {
      mockFieldService.generateTubes.mockResolvedValue({
        kind: 'tubes_generated',
        order_id: 'order-2',
        attempt: 1,
        tubes: [
          {
            id: 'tube-new',
            tube_code: 'FLT-2222-3333',
            order_id: 'order-2',
            attempt: 1,
            patient_row_id: 'p-2',
            test_ordinal: 0,
            status: 'generated',
            created_at: '2026-10-20T08:00:00Z',
          },
        ],
      });

      component.openTubeModal(mockVisits[1]);
      fixture.detectChanges();

      const modalEl = fixture.nativeElement.querySelector('app-tube-scan-modal');
      expect(modalEl).not.toBeNull();

      const tubeComp = component;
      expect(tubeComp.tubeScanModalVisible()).toBe(true);
      const generate = Array.from(
        modalEl.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((b) => b.textContent?.includes('Generate Sample Tubes'))!;
      generate.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(mockFieldService.generateTubes).toHaveBeenCalledWith('order-2');
    });
  });

  describe('FieldSummaryComponent', () => {
    it('renders daily summary metrics and performs handover confirmation and submission', async () => {
      mockFieldService.handoverTubes.mockResolvedValue({
        kind: 'tubes_handed_over',
        tubes: [
          {
            id: 'tube-1',
            tube_code: 'FLT-1111-2222',
            order_id: 'order-1',
            attempt: 1,
            patient_row_id: 'p-1',
            test_ordinal: 0,
            status: 'handed_over',
            created_at: '2026-10-20T07:15:00Z',
          },
        ],
      });

      const { FieldSummaryComponent } = await import('../../field-summary.component');
      const summaryFixture = TestBed.createComponent(FieldSummaryComponent);
      const summaryComp = summaryFixture.componentInstance;
      summaryFixture.detectChanges();
      await summaryFixture.whenStable();
      summaryFixture.detectChanges();

      expect(mockFieldService.getFieldSummary).toHaveBeenCalled();
      const el = summaryFixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Visits Today');
      expect(el.textContent).toContain('FLT-1111-2222');

      // Click handover button
      summaryComp.confirmHandover();
      summaryFixture.detectChanges();
      expect(summaryComp.showConfirmHandover()).toBe(true);

      // Submit handover
      await summaryComp.submitHandover();
      expect(mockFieldService.handoverTubes).toHaveBeenCalledWith(['FLT-1111-2222']);
      expect(summaryComp.successMessage()).toContain('handed over 1 tube(s)');
    });
  });
});
