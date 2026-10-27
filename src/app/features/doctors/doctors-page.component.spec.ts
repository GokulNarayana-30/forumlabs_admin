import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DoctorsPageComponent } from './doctors-page.component';
import {
  DoctorsService,
  StaffDepartment,
  StaffDoctorSummary,
  StaffDoctorDetail,
} from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('DoctorsPageComponent', () => {
  let fixture: ComponentFixture<DoctorsPageComponent>;
  let component: DoctorsPageComponent;
  let mockDoctorsService: {
    listDepartments: ReturnType<typeof vi.fn>;
    createDepartment: ReturnType<typeof vi.fn>;
    updateDepartment: ReturnType<typeof vi.fn>;
    listDoctors: ReturnType<typeof vi.fn>;
    createDoctor: ReturnType<typeof vi.fn>;
    getDoctor: ReturnType<typeof vi.fn>;
    updateDoctor: ReturnType<typeof vi.fn>;
    createCode: ReturnType<typeof vi.fn>;
    updateCode: ReturnType<typeof vi.fn>;
    listOptions: ReturnType<typeof vi.fn>;
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
    getOrderDoctor: ReturnType<typeof vi.fn>;
    setOrderDoctor: ReturnType<typeof vi.fn>;
  };

  const initialDepartments: StaffDepartment[] = [
    {
      id: 'dept-1',
      name: 'Cardiology',
      sort_order: 10,
      active: true,
      doctor_count: 1,
      active_doctor_count: 1,
    },
    {
      id: 'dept-2',
      name: 'Orthopaedics',
      sort_order: 20,
      active: true,
      doctor_count: 0,
      active_doctor_count: 0,
    },
  ];

  const initialDoctors: StaffDoctorSummary[] = [
    {
      id: 'doc-1',
      display_name: 'Dr A Kumar',
      department: { id: 'dept-1', name: 'Cardiology' },
      registration_number: 'KMC 12345',
      registration_council: 'Karnataka Medical Council',
      active: true,
      show_in_app: true,
      code_count: 1,
      active_code_count: 1,
    },
  ];

  beforeEach(async () => {
    mockDoctorsService = {
      listDepartments: vi.fn().mockResolvedValue({
        kind: 'departments',
        departments: [...initialDepartments],
      }),
      createDepartment: vi.fn(),
      updateDepartment: vi.fn(),
      listDoctors: vi.fn().mockResolvedValue({
        kind: 'doctors',
        doctors: [...initialDoctors],
        truncated: false,
      }),
      createDoctor: vi.fn(),
      getDoctor: vi.fn(),
      updateDoctor: vi.fn(),
      createCode: vi.fn(),
      updateCode: vi.fn(),
      listOptions: vi.fn().mockResolvedValue({ kind: 'doctor_options', doctors: [] }),
      getSettings: vi.fn().mockResolvedValue({ kind: 'doctor_settings', card_link_base_url: null }),
      updateSettings: vi.fn(),
      getOrderDoctor: vi.fn(),
      setOrderDoctor: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DoctorsPageComponent, FormsModule],
      providers: [provideRouter([]), { provide: DoctorsService, useValue: mockDoctorsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorsPageComponent);
    component = fixture.componentInstance;
  });

  it('on init loads departments and doctors once each and shows doctor row with tags and code count', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockDoctorsService.listDepartments).toHaveBeenCalledTimes(1);
    expect(mockDoctorsService.listDoctors).toHaveBeenCalledTimes(1);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Dr A Kumar');
    expect(el.textContent).toContain('Cardiology');
    expect(el.textContent).toContain('KMC 12345');
    expect(el.textContent).toContain('Karnataka Medical Council');
    expect(el.textContent).toContain('Active');
    expect(el.textContent).toContain('Shown in app');
    expect(el.textContent).toContain('1 code');
  });

  it('shows error if registration number is provided without a council and sends nothing', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // Trigger add doctor form with number but no council
    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="show-add-doctor-btn"]',
    ) as HTMLButtonElement;
    if (addBtn) addBtn.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-name-input"]',
    ) as HTMLInputElement;
    const deptSelect = fixture.nativeElement.querySelector(
      '[data-testid="doctor-dept-select"]',
    ) as HTMLSelectElement;
    const numInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-reg-num-input"]',
    ) as HTMLInputElement;
    const submitBtn = fixture.nativeElement.querySelector(
      '[data-testid="save-doctor-btn"]',
    ) as HTMLButtonElement;

    expect(nameInput).toBeTruthy();
    expect(deptSelect).toBeTruthy();
    expect(numInput).toBeTruthy();
    expect(submitBtn).toBeTruthy();

    nameInput.value = 'Dr S Rao';
    nameInput.dispatchEvent(new Event('input'));
    deptSelect.value = 'dept-1';
    deptSelect.dispatchEvent(new Event('change'));
    numInput.value = 'KMC 99999';
    numInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    submitBtn.click();
    fixture.detectChanges();

    expect(mockDoctorsService.createDoctor).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain(
      'Enter the council with the registration number.',
    );
  });

  it('creates doctor with complete form, sends createDoctor once, and shows in list', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const createdDoctor: StaffDoctorSummary = {
      id: 'doc-2',
      display_name: 'Dr S Rao',
      department: { id: 'dept-1', name: 'Cardiology' },
      registration_number: 'KMC 99999',
      registration_council: 'Karnataka Medical Council',
      active: true,
      show_in_app: true,
      code_count: 0,
      active_code_count: 0,
    };

    mockDoctorsService.createDoctor.mockResolvedValue({
      kind: 'doctor_created',
      doctor: createdDoctor,
    });
    mockDoctorsService.listDoctors.mockResolvedValue({
      kind: 'doctors',
      doctors: [...initialDoctors, createdDoctor],
      truncated: false,
    });

    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="show-add-doctor-btn"]',
    ) as HTMLButtonElement;
    if (addBtn) addBtn.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-name-input"]',
    ) as HTMLInputElement;
    const deptSelect = fixture.nativeElement.querySelector(
      '[data-testid="doctor-dept-select"]',
    ) as HTMLSelectElement;
    const numInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-reg-num-input"]',
    ) as HTMLInputElement;
    const councilInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-reg-council-input"]',
    ) as HTMLInputElement;
    const submitBtn = fixture.nativeElement.querySelector(
      '[data-testid="save-doctor-btn"]',
    ) as HTMLButtonElement;

    nameInput.value = 'Dr S Rao';
    nameInput.dispatchEvent(new Event('input'));
    deptSelect.value = 'dept-1';
    deptSelect.dispatchEvent(new Event('change'));
    numInput.value = 'KMC 99999';
    numInput.dispatchEvent(new Event('input'));
    councilInput.value = 'Karnataka Medical Council';
    councilInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    submitBtn.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(mockDoctorsService.createDoctor).toHaveBeenCalledTimes(1);
    expect(mockDoctorsService.createDoctor).toHaveBeenCalledWith({
      display_name: 'Dr S Rao',
      department_id: 'dept-1',
      registration_number: 'KMC 99999',
      registration_council: 'Karnataka Medical Council',
      show_in_app: true,
    });

    expect(fixture.nativeElement.textContent).toContain('Dr S Rao');
  });

  it('shows "That department is switched off. Pick another." when department_inactive error occurs', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    mockDoctorsService.createDoctor.mockRejectedValue(
      new ApiClientError(400, 'department_inactive', 'Department is inactive'),
    );

    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="show-add-doctor-btn"]',
    ) as HTMLButtonElement;
    if (addBtn) addBtn.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-name-input"]',
    ) as HTMLInputElement;
    const deptSelect = fixture.nativeElement.querySelector(
      '[data-testid="doctor-dept-select"]',
    ) as HTMLSelectElement;
    const submitBtn = fixture.nativeElement.querySelector(
      '[data-testid="save-doctor-btn"]',
    ) as HTMLButtonElement;

    nameInput.value = 'Dr Test';
    nameInput.dispatchEvent(new Event('input'));
    deptSelect.value = 'dept-2';
    deptSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    submitBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'That department is switched off. Pick another.',
    );
  });

  it('disables save button while pending and ignores second click', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    let resolveSave: any;
    mockDoctorsService.createDoctor.mockReturnValue(
      new Promise((res) => {
        resolveSave = res;
      }),
    );

    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="show-add-doctor-btn"]',
    ) as HTMLButtonElement;
    if (addBtn) addBtn.click();
    fixture.detectChanges();

    const nameInput = fixture.nativeElement.querySelector(
      '[data-testid="doctor-name-input"]',
    ) as HTMLInputElement;
    const deptSelect = fixture.nativeElement.querySelector(
      '[data-testid="doctor-dept-select"]',
    ) as HTMLSelectElement;
    const submitBtn = fixture.nativeElement.querySelector(
      '[data-testid="save-doctor-btn"]',
    ) as HTMLButtonElement;

    nameInput.value = 'Dr Slow';
    nameInput.dispatchEvent(new Event('input'));
    deptSelect.value = 'dept-1';
    deptSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    submitBtn.click();
    fixture.detectChanges();

    expect(mockDoctorsService.createDoctor).toHaveBeenCalledTimes(1);
    expect(submitBtn.disabled).toBe(true);

    // Second click
    submitBtn.click();
    expect(mockDoctorsService.createDoctor).toHaveBeenCalledTimes(1);

    resolveSave({
      kind: 'doctor_created',
      doctor: {
        id: 'doc-3',
        display_name: 'Dr Slow',
        department: { id: 'dept-1', name: 'Cardiology' },
        registration_number: null,
        registration_council: null,
        active: true,
        show_in_app: true,
        code_count: 0,
        active_code_count: 0,
      },
    });
    await fixture.whenStable();
  });

  it('renders doctor name with HTML markup as plain text, not parsed markup', async () => {
    const markupDoctor: StaffDoctorSummary = {
      id: 'doc-markup',
      display_name: '<b>x</b>',
      department: { id: 'dept-1', name: 'Cardiology' },
      registration_number: null,
      registration_council: null,
      active: true,
      show_in_app: true,
      code_count: 0,
      active_code_count: 0,
    };
    mockDoctorsService.listDoctors.mockResolvedValue({
      kind: 'doctors',
      doctors: [markupDoctor],
      truncated: false,
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('<b>x</b>');
    expect(host.querySelector('b')).toBeNull();
  });

  it('calls createCode once when "Generate code" is clicked and shows the code in large monospace line', async () => {
    const detailWithCode: StaffDoctorDetail = {
      ...initialDoctors[0],
      codes: [
        {
          id: 'code-1',
          code: 'ABCD2E',
          location_label: 'Main OPD',
          active: true,
          created_at: '2026-10-23T10:00:00Z',
        },
      ],
    };
    mockDoctorsService.getDoctor.mockResolvedValue({
      kind: 'doctor',
      doctor: detailWithCode,
    });
    mockDoctorsService.createCode.mockResolvedValue({
      kind: 'doctor_code_created',
      code: {
        id: 'code-1',
        code: 'ABCD2E',
        location_label: 'Main OPD',
        active: true,
        created_at: '2026-10-23T10:00:00Z',
      },
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const manageCodesBtn = (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="manage-codes-btn-doc-1"]`,
    ) as HTMLButtonElement;
    expect(manageCodesBtn).toBeTruthy();
    manageCodesBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const genBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="generate-code-btn"]',
    ) as HTMLButtonElement;
    expect(genBtn).toBeTruthy();
    genBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockDoctorsService.createCode).toHaveBeenCalledWith('doc-1', { location_label: null });
    const codeDisplay = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="doctor-code-ABCD2E"]',
    ) as HTMLElement;
    expect(codeDisplay).toBeTruthy();
    expect(codeDisplay.textContent).toContain('ABCD2E');
    expect(codeDisplay.className).toContain('font-mono');
  });

  it('shows "Switch the doctor on before creating a code." when doctor_inactive error occurs', async () => {
    const detail: StaffDoctorDetail = {
      ...initialDoctors[0],
      active: false,
      codes: [],
    };
    mockDoctorsService.getDoctor.mockResolvedValue({
      kind: 'doctor',
      doctor: detail,
    });
    mockDoctorsService.createCode.mockRejectedValue(
      new ApiClientError(400, 'doctor_inactive', 'Doctor is inactive'),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const manageCodesBtn = (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="manage-codes-btn-doc-1"]`,
    ) as HTMLButtonElement;
    manageCodesBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const genBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="generate-code-btn"]',
    ) as HTMLButtonElement;
    genBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Switch the doctor on before creating a code.',
    );
  });

  describe('Task 2 additions: filters, edit, switch off, department actions', () => {
    it('filters doctors by department, active status, query and ignores late older responses', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      mockDoctorsService.listDoctors.mockClear();

      let resolveSlowFirst: any;
      mockDoctorsService.listDoctors.mockReturnValueOnce(
        new Promise((res) => {
          resolveSlowFirst = res;
        }),
      );

      // Trigger first filter change
      const deptFilter = fixture.nativeElement.querySelector(
        '[data-testid="filter-dept-select"]',
      ) as HTMLSelectElement;
      deptFilter.value = 'dept-1';
      deptFilter.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(mockDoctorsService.listDoctors).toHaveBeenCalledWith({
        department_id: 'dept-1',
      });

      // Second faster filter change (query)
      const fastFilteredDoctor: StaffDoctorSummary = {
        id: 'doc-fast',
        display_name: 'Dr Fast',
        department: { id: 'dept-1', name: 'Cardiology' },
        registration_number: null,
        registration_council: null,
        active: true,
        show_in_app: true,
        code_count: 0,
        active_code_count: 0,
      };
      mockDoctorsService.listDoctors.mockResolvedValueOnce({
        kind: 'doctors',
        doctors: [fastFilteredDoctor],
        truncated: false,
      });

      const queryInput = fixture.nativeElement.querySelector(
        '[data-testid="filter-query-input"]',
      ) as HTMLInputElement;
      queryInput.value = 'Fast';
      queryInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Dr Fast');

      // Now first slow response resolves LATER with older doctor
      resolveSlowFirst({
        kind: 'doctors',
        doctors: initialDoctors,
        truncated: false,
      });
      await fixture.whenStable();
      fixture.detectChanges();

      // Dr Fast must remain, NOT overwritten by older response
      expect(fixture.nativeElement.textContent).toContain('Dr Fast');
    });

    it('Edit doctor opens form pre-filled and sends only CHANGED fields to updateDoctor', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      const editBtn = fixture.nativeElement.querySelector(
        '[data-testid="edit-doctor-btn-doc-1"]',
      ) as HTMLButtonElement;
      expect(editBtn).toBeTruthy();
      editBtn.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      const nameInput = fixture.nativeElement.querySelector(
        '[data-testid="doctor-name-input"]',
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('Dr A Kumar');

      // Change ONLY name
      nameInput.value = 'Dr A Kumar MD';
      nameInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      mockDoctorsService.updateDoctor.mockResolvedValue({
        kind: 'doctor_updated',
        doctor: { ...initialDoctors[0], display_name: 'Dr A Kumar MD', codes: [] },
      });

      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="save-doctor-btn"]',
      ) as HTMLButtonElement;
      saveBtn.click();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(mockDoctorsService.updateDoctor).toHaveBeenCalledTimes(1);
      // ONLY display_name was changed, department_id, reg_num etc. were NOT changed
      expect(mockDoctorsService.updateDoctor).toHaveBeenCalledWith('doc-1', {
        display_name: 'Dr A Kumar MD',
      });
    });

    it('Switch off sends active: false and row shows Inactive', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      mockDoctorsService.updateDoctor.mockResolvedValue({
        kind: 'doctor_updated',
        doctor: { ...initialDoctors[0], active: false, codes: [] },
      });
      mockDoctorsService.listDoctors.mockResolvedValue({
        kind: 'doctors',
        doctors: [{ ...initialDoctors[0], active: false }],
        truncated: false,
      });

      const toggleActiveBtn = fixture.nativeElement.querySelector(
        '[data-testid="toggle-doctor-active-btn-doc-1"]',
      ) as HTMLButtonElement;
      expect(toggleActiveBtn).toBeTruthy();

      toggleActiveBtn.click();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(mockDoctorsService.updateDoctor).toHaveBeenCalledWith('doc-1', { active: false });
      expect(fixture.nativeElement.textContent).toContain('Inactive');
    });

    it('Department switch off shows "Move or switch off its active doctors first." on department_has_active_doctors', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      mockDoctorsService.updateDepartment.mockRejectedValue(
        new ApiClientError(400, 'department_has_active_doctors', 'Department has active doctors'),
      );

      const toggleDeptBtn = fixture.nativeElement.querySelector(
        '[data-testid="toggle-dept-active-btn-dept-1"]',
      ) as HTMLButtonElement;
      expect(toggleDeptBtn).toBeTruthy();

      toggleDeptBtn.click();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Move or switch off its active doctors first.',
      );
    });

    it('Department rename shows "A department with this name already exists." on department_name_taken', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      mockDoctorsService.updateDepartment.mockRejectedValue(
        new ApiClientError(409, 'department_name_taken', 'Department name taken'),
      );

      const renameDeptBtn = fixture.nativeElement.querySelector(
        '[data-testid="rename-dept-btn-dept-1"]',
      ) as HTMLButtonElement;
      expect(renameDeptBtn).toBeTruthy();
      renameDeptBtn.click();
      fixture.detectChanges();

      const renameInput = fixture.nativeElement.querySelector(
        '[data-testid="rename-dept-input-dept-1"]',
      ) as HTMLInputElement;
      renameInput.value = 'Orthopaedics';
      renameInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const saveRenameBtn = fixture.nativeElement.querySelector(
        '[data-testid="save-dept-rename-btn-dept-1"]',
      ) as HTMLButtonElement;
      saveRenameBtn.click();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'A department with this name already exists.',
      );
    });

    it('Departments card displays doctor_count and active_doctor_count', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('1 active / 1 doctors');
      expect(el.textContent).toContain('0 active / 0 doctors');
    });
  });
  it.each(['number', 'council'])(
    'WR-02 sends the complete registration pair when only %s changes',
    async (field) => {
      component.startEditDoctor(initialDoctors[0]);
      if (field === 'number') component.doctorRegNum = 'KMC 67890';
      else component.doctorRegCouncil = 'Medical Council of India';
      mockDoctorsService.updateDoctor.mockResolvedValue({
        kind: 'doctor_updated',
        doctor: initialDoctors[0],
      });
      await component.saveDoctor();
      expect(mockDoctorsService.updateDoctor).toHaveBeenCalledWith('doc-1', {
        registration_number: field === 'number' ? 'KMC 67890' : 'KMC 12345',
        registration_council:
          field === 'council' ? 'Medical Council of India' : 'Karnataka Medical Council',
      });
    },
  );
  it('WR-04 handles HTTP 200 refusal kinds without applying success state', async () => {
    component.startEditDoctor(initialDoctors[0]);
    mockDoctorsService.updateDoctor.mockResolvedValue({ kind: 'department_inactive' });
    await component.saveDoctor();
    expect(component.errorText()).toBe('That department is switched off. Pick another.');
    expect(component.showAddDoctor()).toBe(true);
    mockDoctorsService.updateDepartment.mockResolvedValue({
      kind: 'department_has_active_doctors',
    });
    await component.toggleDeptActive(initialDepartments[0]);
    expect(component.errorText()).toBe('Move or switch off its active doctors first.');
    component.newDeptName = 'Cardiology';
    mockDoctorsService.createDepartment.mockResolvedValue({ kind: 'department_name_taken' });
    await component.createDepartment();
    expect(component.errorText()).toBe('A department with this name already exists.');
    expect(component.newDeptName).toBe('Cardiology');
    component.selectedDoctorDetail.set({ ...initialDoctors[0], codes: [] });
    mockDoctorsService.createCode.mockResolvedValue({ kind: 'doctor_inactive' });
    await component.generateCodeForSelectedDoctor();
    expect(component.errorText()).toBe('Switch the doctor on before creating a code.');
    expect(component.selectedDoctorDetail()?.codes).toEqual([]);
  });
});
