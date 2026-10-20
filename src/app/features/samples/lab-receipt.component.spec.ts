import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LabReceiptComponent } from './lab-receipt.component';
import {
  SamplesService,
  Tube,
  TubeResult,
  TubeReceivedResult,
  TubeRejectedResult,
  OverdueTubesResult,
} from './samples.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('LabReceiptComponent', () => {
  let component: LabReceiptComponent;
  let fixture: ComponentFixture<LabReceiptComponent>;
  let mockSamplesService: any;

  const sampleTube: Tube = {
    tube_code: 'FLT-B123-4567',
    order_id: 'ord-8888',
    attempt: 1,
    patient_row_id: 'pat-1',
    test_ordinal: 0,
    status: 'scanned_at_collection',
    created_at: '2026-10-20T08:00:00Z',
    booking_ref: 'BK-9999',
    patient_label: 'Ananya (P02)',
    test_name: 'Lipid Profile',
    collector: {
      member_id: 'mem-10',
      user_id: 'usr-10',
      display_name: 'Rajesh Phlebotomist',
      status: 'active',
      roles: ['phlebotomist'],
    },
    collected_at: '2026-10-20T08:45:00Z',
  };

  beforeEach(async () => {
    mockSamplesService = {
      getTubeByCode: vi.fn(),
      receiveTube: vi.fn(),
      rejectTube: vi.fn(),
      getOverdueTubes: vi.fn().mockResolvedValue({
        kind: 'overdue_tubes',
        tubes: [],
        next_cursor: null,
      } as OverdueTubesResult),
    };

    await TestBed.configureTestingModule({
      imports: [LabReceiptComponent],
      providers: [{ provide: SamplesService, useValue: mockSamplesService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LabReceiptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders initial scanning interface with autofocus input', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Lab Specimen Receipt');
    expect(compiled.textContent).toContain('Scan or Enter Tube Barcode');
    const input = compiled.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('performs lookup and displays patient label, test name, and collector without raw UUIDs', async () => {
    const tubeRes: TubeResult = { kind: 'tube', tube: sampleTube };
    mockSamplesService.getTubeByCode.mockResolvedValue(tubeRes);

    component.tubeCodeInput.set('FLT-B123-4567');
    await component.onSearchOrScan();
    fixture.detectChanges();

    expect(mockSamplesService.getTubeByCode).toHaveBeenCalledWith('FLT-B123-4567');
    expect(component.currentTube()).toEqual(sampleTube);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('FLT-B123-4567');
    expect(compiled.textContent).toContain('BK-9999');
    expect(compiled.textContent).toContain('Ananya (P02)');
    expect(compiled.textContent).toContain('Lipid Profile');
    expect(compiled.textContent).toContain('Rajesh Phlebotomist');

    // Never display raw user_id or member_id
    expect(compiled.textContent).not.toContain('usr-10');
    expect(compiled.textContent).not.toContain('mem-10');
  });

  it('clears stale tube details and displays safe error on missing tube (404)', async () => {
    // First successfully load a tube
    component.currentTube.set(sampleTube);
    fixture.detectChanges();

    // Now scan a nonexistent tube
    const notFoundError = new ApiClientError(404, 'not_found', 'Specimen tube not found');
    mockSamplesService.getTubeByCode.mockRejectedValue(notFoundError);

    component.tubeCodeInput.set('FLT-UNKNOWN-9999');
    await component.onSearchOrScan();
    fixture.detectChanges();

    // currentTube MUST be cleared so stale details are never shown
    expect(component.currentTube()).toBeNull();
    expect(component.scanErrorMessage()).toContain('Specimen tube not found');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Ananya (P02)');
    expect(compiled.textContent).not.toContain('Lipid Profile');
  });

  it('disables submit and sends nothing when receipt reason is blank', async () => {
    component.currentTube.set(sampleTube);
    component.receiptReason.set('   ');
    fixture.detectChanges();

    await component.onReceiveTube();

    expect(mockSamplesService.receiveTube).not.toHaveBeenCalled();
    expect(component.receiptErrorMessage()).toContain('Receipt reason is required');
  });

  it('submits valid receipt, updates tube status, and displays success banner', async () => {
    component.currentTube.set(sampleTube);
    component.receiptReason.set('Specimen received in lab intact and cold-chain maintained');

    const receivedRes: TubeReceivedResult = {
      kind: 'tube_received',
      tube: { ...sampleTube, status: 'received' },
    };
    mockSamplesService.receiveTube.mockResolvedValue(receivedRes);

    await component.onReceiveTube();
    fixture.detectChanges();

    expect(mockSamplesService.receiveTube).toHaveBeenCalledWith('FLT-B123-4567', {
      reason: 'Specimen received in lab intact and cold-chain maintained',
    });
    expect(component.currentTube()?.status).toBe('received');
    expect(component.successMessage()).toContain('Tube FLT-B123-4567 successfully received');
    expect(component.orderTransitionNote()).toContain('received_by_lab');
  });

  it('opens rejection modal, displays canonical reasons and recollection required notice', () => {
    component.currentTube.set(sampleTube);
    component.openRejectModal();
    fixture.detectChanges();

    expect(component.isRejectModalVisible()).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Reject Specimen Sample');
    expect(compiled.textContent).toContain('recollection_required');
    expect(compiled.textContent).toContain('Not enough sample (insufficient quantity)');
    expect(compiled.textContent).toContain('Damaged (leaked, broken, or compromised container)');
    expect(compiled.textContent).toContain('Label mismatch (incorrect patient or barcode)');
    expect(compiled.textContent).toContain('Wrong container / tube type');
    expect(compiled.textContent).toContain('Other specimen integrity issue');
  });

  it('submits rejection with canonical reason code and displays confirmation', async () => {
    component.currentTube.set(sampleTube);

    const rejectRes: TubeRejectedResult = {
      kind: 'tube_rejected',
      tube: { ...sampleTube, status: 'rejected' },
    };
    mockSamplesService.rejectTube.mockResolvedValue(rejectRes);
    mockSamplesService.getTubeByCode.mockResolvedValue({
      kind: 'tube',
      tube: { ...sampleTube, status: 'rejected' },
    });

    fixture.detectChanges();
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Reject Specimen'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(
      '#rejectionReasonSelect',
    ) as HTMLSelectElement;
    select.value = 'damaged';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Confirm Rejection'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockSamplesService.rejectTube).toHaveBeenCalledWith('FLT-B123-4567', {
      reason_code: 'damaged',
    });

    expect(component.successMessage()).toContain('recollection_required');
  });
  it('invalidates old receive/reject controls immediately while the next scanned tube is loading', async () => {
    mockSamplesService.getTubeByCode.mockResolvedValueOnce({ kind: 'tube', tube: sampleTube });
    const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = sampleTube.tube_code;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    const oldButtons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    );
    const receive =
      oldButtons.find((b) => b.textContent?.includes('Confirm Receipt')) ??
      oldButtons.find((b) => b.getAttribute('class')?.includes('bg-green-600'))!;
    const reject = oldButtons.find((b) => b.textContent?.includes('Reject Specimen'))!;
    let resolve!: (value: TubeResult) => void;
    mockSamplesService.getTubeByCode.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    input.value = 'FLT-CCCC-DDDD';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(component.currentTube()).toBeNull();
    receive.click();
    reject.click();
    fixture.detectChanges();
    expect(mockSamplesService.receiveTube).not.toHaveBeenCalled();
    expect(mockSamplesService.rejectTube).not.toHaveBeenCalled();
    expect(component.isRejectModalVisible()).toBe(false);
    resolve({
      kind: 'tube',
      tube: { ...sampleTube, tube_code: 'FLT-CCCC-DDDD', booking_ref: 'BK-B' },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('BK-B');
  });

  it('ignores an older lookup that completes after the newest lookup', async () => {
    let first!: (value: TubeResult) => void;
    mockSamplesService.getTubeByCode.mockReturnValueOnce(new Promise((r) => (first = r)));
    component.tubeCodeInput.set('A');
    const a = component.onSearchOrScan();
    mockSamplesService.getTubeByCode.mockResolvedValueOnce({
      kind: 'tube',
      tube: { ...sampleTube, booking_ref: 'BK-B' },
    });
    component.tubeCodeInput.set('B');
    await component.onSearchOrScan();
    first({ kind: 'tube', tube: sampleTube });
    await a;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('BK-B');
    expect(fixture.nativeElement.textContent).not.toContain('BK-9999');
  });
});
