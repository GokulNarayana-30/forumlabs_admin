import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { OrderDoctorTagComponent } from './order-doctor-tag.component';
import { DoctorsService, StaffDoctorOptionItem, StaffOrderDoctorResult } from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('OrderDoctorTagComponent', () => {
  let fixture: ComponentFixture<OrderDoctorTagComponent>;
  let component: OrderDoctorTagComponent;
  let mockDoctorsService: {
    getOrderDoctor: ReturnType<typeof vi.fn>;
    setOrderDoctor: ReturnType<typeof vi.fn>;
    listOptions: ReturnType<typeof vi.fn>;
  };

  const sampleOptions: StaffDoctorOptionItem[] = [
    { id: 'doc-1', display_name: 'Dr A Kumar', department_name: 'Cardiology' },
    { id: 'doc-2', display_name: 'Dr B Rao', department_name: 'Orthopaedics' },
  ];

  const initialOrderDoctor: StaffOrderDoctorResult = {
    kind: 'order_doctor',
    order_id: 'ord-1',
    doctor: { id: 'doc-1', display_name: 'Dr A Kumar', department_name: 'Cardiology' },
    source: 'doctor_code',
  };

  beforeEach(async () => {
    mockDoctorsService = {
      getOrderDoctor: vi.fn().mockResolvedValue(initialOrderDoctor),
      setOrderDoctor: vi.fn(),
      listOptions: vi.fn().mockResolvedValue({ kind: 'doctor_options', doctors: sampleOptions }),
    };

    await TestBed.configureTestingModule({
      imports: [OrderDoctorTagComponent, FormsModule],
      providers: [{ provide: DoctorsService, useValue: mockDoctorsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderDoctorTagComponent);
    component = fixture.componentInstance;
  });

  const initComponentWithOrder = async (orderId: string) => {
    fixture.componentRef.setInput('orderId', orderId);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  };

  it('on init loads effective doctor and options, showing name, department, and source in words', async () => {
    await initComponentWithOrder('ord-1');

    expect(mockDoctorsService.getOrderDoctor).toHaveBeenCalledWith('ord-1');
    expect(mockDoctorsService.listOptions).toHaveBeenCalled();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Dr A Kumar');
    expect(el.textContent).toContain('Cardiology');
    expect(el.textContent).toContain("From the customer's doctor code");
  });

  it('displays "No doctor recorded" when order has no attributed doctor', async () => {
    mockDoctorsService.getOrderDoctor.mockResolvedValue({
      kind: 'order_doctor',
      order_id: 'ord-1',
      doctor: null,
      source: null,
    });

    await initComponentWithOrder('ord-1');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No doctor recorded');
  });

  it('selecting a doctor and clicking Save calls setOrderDoctor once and updates to "Set by staff"', async () => {
    await initComponentWithOrder('ord-1');

    mockDoctorsService.setOrderDoctor.mockResolvedValue({
      kind: 'order_doctor_set',
      order_id: 'ord-1',
      doctor: { id: 'doc-2', display_name: 'Dr B Rao', department_name: 'Orthopaedics' },
      source: 'staff_tag',
      changed: true,
    });

    const select = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="order-doctor-select"]',
    ) as HTMLSelectElement;
    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="save-order-doctor-btn"]',
    ) as HTMLButtonElement;

    select.value = 'doc-2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    saveBtn.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(mockDoctorsService.setOrderDoctor).toHaveBeenCalledTimes(1);
    expect(mockDoctorsService.setOrderDoctor).toHaveBeenCalledWith('ord-1', 'doc-2');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Doctor saved.');
    expect(el.textContent).toContain('Dr B Rao');
    expect(el.textContent).toContain('Orthopaedics');
    expect(el.textContent).toContain('Set by staff');
  });

  it('shows "No change." when save result has changed: false', async () => {
    await initComponentWithOrder('ord-1');

    mockDoctorsService.setOrderDoctor.mockResolvedValue({
      kind: 'order_doctor_set',
      order_id: 'ord-1',
      doctor: { id: 'doc-1', display_name: 'Dr A Kumar', department_name: 'Cardiology' },
      source: 'doctor_code',
      changed: false,
    });

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="save-order-doctor-btn"]',
    ) as HTMLButtonElement;
    saveBtn.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No change.');
  });

  it('clicking Clear doctor calls setOrderDoctor(orderId, null)', async () => {
    await initComponentWithOrder('ord-1');

    mockDoctorsService.setOrderDoctor.mockResolvedValue({
      kind: 'order_doctor_set',
      order_id: 'ord-1',
      doctor: null,
      source: null,
      changed: true,
    });

    const clearBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="clear-order-doctor-btn"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();

    clearBtn.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(mockDoctorsService.setOrderDoctor).toHaveBeenCalledWith('ord-1', null);
    expect(fixture.nativeElement.textContent).toContain('No doctor recorded');
  });

  it('shows "That doctor is not available. Pick another." on doctor_inactive or doctor_not_found', async () => {
    await initComponentWithOrder('ord-1');

    mockDoctorsService.setOrderDoctor.mockRejectedValue(
      new ApiClientError(400, 'doctor_inactive', 'Doctor inactive'),
    );

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="save-order-doctor-btn"]',
    ) as HTMLButtonElement;
    saveBtn.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'That doctor is not available. Pick another.',
    );
  });

  it('disables buttons during pending save and ignores second click', async () => {
    await initComponentWithOrder('ord-1');

    let resolveSave: any;
    mockDoctorsService.setOrderDoctor.mockReturnValue(
      new Promise((res) => {
        resolveSave = res;
      }),
    );

    const saveBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="save-order-doctor-btn"]',
    ) as HTMLButtonElement;
    const clearBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="clear-order-doctor-btn"]',
    ) as HTMLButtonElement;

    saveBtn.click();
    fixture.detectChanges();

    expect(mockDoctorsService.setOrderDoctor).toHaveBeenCalledTimes(1);
    expect(saveBtn.disabled).toBe(true);
    expect(clearBtn.disabled).toBe(true);

    // Second click
    saveBtn.click();
    expect(mockDoctorsService.setOrderDoctor).toHaveBeenCalledTimes(1);

    resolveSave({
      kind: 'order_doctor_set',
      order_id: 'ord-1',
      doctor: null,
      source: null,
      changed: true,
    });
    await fixture.whenStable();
  });

  it('ignores older response for previous orderId that arrives later', async () => {
    let resolveFirstOrder: any;
    mockDoctorsService.getOrderDoctor.mockReturnValueOnce(
      new Promise((res) => {
        resolveFirstOrder = res;
      }),
    );

    fixture.componentRef.setInput('orderId', 'ord-1');
    fixture.detectChanges();

    // Now change orderId to ord-2
    mockDoctorsService.getOrderDoctor.mockResolvedValueOnce({
      kind: 'order_doctor',
      order_id: 'ord-2',
      doctor: { id: 'doc-2', display_name: 'Dr B Rao', department_name: 'Orthopaedics' },
      source: 'staff_tag',
    });
    fixture.componentRef.setInput('orderId', 'ord-2');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const effectiveDocPre = fixture.nativeElement.querySelector(
      '[data-testid="effective-doctor-name"]',
    );
    expect(effectiveDocPre?.textContent).toContain('Dr B Rao');

    // First request resolves LATER
    resolveFirstOrder(initialOrderDoctor);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    // Still ord-2 (Dr B Rao), not overwritten by ord-1 (Dr A Kumar)
    const effectiveDoc = fixture.nativeElement.querySelector(
      '[data-testid="effective-doctor-name"]',
    );
    expect(effectiveDoc?.textContent).toContain('Dr B Rao');
    expect(effectiveDoc?.textContent).not.toContain('Dr A Kumar');
  });

  it('never displays monetary amounts (assert no ₹ symbol) (D-06, D-13)', async () => {
    await initComponentWithOrder('ord-1');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('₹');
    expect(text.toLowerCase()).not.toContain('rupee');
    expect(text.toLowerCase()).not.toContain('paise');
  });
  it.each(['doctor_inactive', 'doctor_not_found'])(
    'WR-04 handles the resolved %s body',
    async (kind) => {
      await initComponentWithOrder('ord-1');
      mockDoctorsService.setOrderDoctor.mockResolvedValue({ kind });
      await component.saveDoctor();
      expect(component.errorText()).toBe('That doctor is not available. Pick another.');
      expect(component.currentDoctor()).toEqual(initialOrderDoctor.doctor);
      expect(component.statusMessage()).toBeNull();
    },
  );
  it.each(['save', 'clear'])(
    'WR-06 ignores a previous booking %s completion and messages',
    async (action) => {
      await initComponentWithOrder('ord-1');
      let finish!: (value: unknown) => void;
      mockDoctorsService.setOrderDoctor.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const pending = action === 'save' ? component.saveDoctor() : component.clearDoctor();
      fixture.componentRef.setInput('orderId', 'ord-2');
      const nextDoctor = { id: 'doc-b', display_name: 'Dr B', department_name: 'Medicine' };
      mockDoctorsService.getOrderDoctor.mockResolvedValue({
        kind: 'order_doctor',
        order_id: 'ord-2',
        doctor: nextDoctor,
        source: 'customer_selected',
      });
      await component.loadData();
      finish({
        kind: 'order_doctor_set',
        order_id: 'ord-1',
        doctor: null,
        source: 'staff_tag',
        changed: true,
      });
      await pending;
      expect(component.currentDoctor()).toEqual(nextDoctor);
      expect(component.currentSource()).toBe('customer_selected');
      expect(component.statusMessage()).toBeNull();
      expect(component.errorText()).toBeNull();
    },
  );
});
