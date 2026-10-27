import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DoctorsService,
  StaffDepartment,
  StaffDoctorSummary,
  StaffDoctorDetail,
  StaffDoctorUpdateBody,
} from './doctors.service';
import { DoctorCodesPanelComponent } from './doctor-codes-panel.component';
import { ApiClientError } from '../../core/api/api-client.service';

@Component({
  selector: 'app-doctors-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DoctorCodesPanelComponent],
  templateUrl: './doctors-page.component.html',
})
export class DoctorsPageComponent implements OnInit {
  private readonly doctorsService = inject(DoctorsService);

  readonly departments = signal<StaffDepartment[]>([]);
  readonly doctors = signal<StaffDoctorSummary[]>([]);
  readonly selectedDoctorDetail = signal<StaffDoctorDetail | null>(null);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorText = signal<string | null>(null);
  readonly showAddDoctor = signal(false);
  readonly showAddDept = signal(false);

  // Editing Doctor
  readonly editingDoctorId = signal<string | null>(null);
  private editingDoctorOriginal: StaffDoctorSummary | null = null;

  // Editing Department
  readonly editingDeptId = signal<string | null>(null);
  deptRenameValue = '';

  // Filters (D-04, D-13)
  readonly filterDeptId = signal<string>('');
  readonly filterActive = signal<string>(''); // '', 'true', 'false'
  readonly filterQuery = signal<string>('');

  // Doctor Form
  doctorName = '';
  doctorDeptId = '';
  doctorRegNum = '';
  doctorRegCouncil = '';
  doctorShowInApp = true;

  // New Dept Form
  newDeptName = '';

  private loadDoctorsGen = 0;
  private loadDeptsGen = 0;

  ngOnInit(): void {
    void this.loadDepartments();
    void this.loadDoctors();
  }

  async loadDepartments(): Promise<void> {
    const gen = ++this.loadDeptsGen;
    try {
      const res = await this.doctorsService.listDepartments();
      if (gen === this.loadDeptsGen) {
        this.departments.set(res.departments);
      }
    } catch (err: unknown) {
      if (gen === this.loadDeptsGen) {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to load departments');
      }
    }
  }

  async loadDoctors(): Promise<void> {
    const gen = ++this.loadDoctorsGen;
    this.loading.set(true);
    try {
      const activeParam =
        this.filterActive() === 'true' ? true : this.filterActive() === 'false' ? false : undefined;

      const params: { department_id?: string; active?: boolean; q?: string } = {};
      if (this.filterDeptId()) {
        params.department_id = this.filterDeptId();
      }
      if (activeParam !== undefined) {
        params.active = activeParam;
      }
      if (this.filterQuery()) {
        params.q = this.filterQuery();
      }

      const res = await this.doctorsService.listDoctors(
        Object.keys(params).length > 0 ? params : undefined,
      );

      if (gen === this.loadDoctorsGen) {
        this.doctors.set(res.doctors);
      }
    } catch (err: unknown) {
      if (gen === this.loadDoctorsGen) {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to load doctors');
      }
    } finally {
      if (gen === this.loadDoctorsGen) {
        this.loading.set(false);
      }
    }
  }

  onFilterDeptChange(deptId: string): void {
    this.filterDeptId.set(deptId);
    void this.loadDoctors();
  }

  onFilterActiveChange(active: string): void {
    this.filterActive.set(active);
    void this.loadDoctors();
  }

  onFilterQueryChange(query: string): void {
    this.filterQuery.set(query);
    void this.loadDoctors();
  }

  toggleAddDoctor(): void {
    this.showAddDoctor.update((v) => !v);
    this.errorText.set(null);
    if (this.showAddDoctor()) {
      this.resetDoctorForm();
    }
  }

  startEditDoctor(doc: StaffDoctorSummary): void {
    this.editingDoctorId.set(doc.id);
    this.editingDoctorOriginal = doc;
    this.doctorName = doc.display_name;
    this.doctorDeptId = doc.department.id;
    this.doctorRegNum = doc.registration_number ?? '';
    this.doctorRegCouncil = doc.registration_council ?? '';
    this.doctorShowInApp = doc.show_in_app;
    this.errorText.set(null);
    this.showAddDoctor.set(true);
  }

  resetDoctorForm(): void {
    this.editingDoctorId.set(null);
    this.editingDoctorOriginal = null;
    this.doctorName = '';
    this.doctorDeptId = this.departments()[0]?.id ?? '';
    this.doctorRegNum = '';
    this.doctorRegCouncil = '';
    this.doctorShowInApp = true;
  }

  async saveDoctor(): Promise<void> {
    if (this.saving()) return;
    this.errorText.set(null);

    const name = this.doctorName.trim();
    const deptId = this.doctorDeptId;
    const regNum = this.doctorRegNum.trim();
    const regCouncil = this.doctorRegCouncil.trim();

    if (!name) {
      this.errorText.set('Doctor name is required.');
      return;
    }
    if (!deptId) {
      this.errorText.set('Department is required.');
      return;
    }

    // Doctor Registration Pair Rule (D-04):
    // Registration number and council are a co-dependent pair: either both are provided or neither is.
    if ((regNum && !regCouncil) || (!regNum && regCouncil)) {
      this.errorText.set('Enter the council with the registration number.');
      return;
    }

    this.saving.set(true);
    try {
      const editId = this.editingDoctorId();
      if (editId) {
        // Send only CHANGED fields
        const orig = this.editingDoctorOriginal;
        const payload: StaffDoctorUpdateBody = {};

        if (name !== orig?.display_name) {
          payload.display_name = name;
        }
        if (deptId !== orig?.department.id) {
          payload.department_id = deptId;
        }
        const regNumVal = regNum || null;
        const regCouncilVal = regCouncil || null;
        if (
          regNumVal !== (orig?.registration_number ?? null) ||
          regCouncilVal !== (orig?.registration_council ?? null)
        ) {
          payload.registration_number = regNumVal;
          payload.registration_council = regCouncilVal;
        }
        if (this.doctorShowInApp !== orig?.show_in_app) {
          payload.show_in_app = this.doctorShowInApp;
        }

        const result = await this.doctorsService.updateDoctor(editId, payload);
        if (result.kind !== 'doctor_updated') {
          this.errorText.set('That department is switched off. Pick another.');
          return;
        }
      } else {
        const result = await this.doctorsService.createDoctor({
          display_name: name,
          department_id: deptId,
          registration_number: regNum || null,
          registration_council: regCouncil || null,
          show_in_app: this.doctorShowInApp,
        });
        if (result.kind !== 'doctor_created') {
          this.errorText.set('That department is switched off. Pick another.');
          return;
        }
      }

      this.showAddDoctor.set(false);
      this.resetDoctorForm();
      await this.loadDoctors();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'department_inactive') {
        this.errorText.set('That department is switched off. Pick another.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to save doctor.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async toggleDoctorActive(doc: StaffDoctorSummary): Promise<void> {
    if (this.saving()) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      const result = await this.doctorsService.updateDoctor(doc.id, { active: !doc.active });
      if (result.kind !== 'doctor_updated') {
        this.errorText.set('That department is switched off. Pick another.');
        return;
      }
      await this.loadDoctors();
    } catch (err: unknown) {
      this.errorText.set(err instanceof Error ? err.message : 'Failed to update doctor status.');
    } finally {
      this.saving.set(false);
    }
  }

  async selectDoctor(docId: string): Promise<void> {
    this.errorText.set(null);
    try {
      const res = await this.doctorsService.getDoctor(docId);
      this.selectedDoctorDetail.set(res.doctor);
    } catch (err: unknown) {
      this.errorText.set(err instanceof Error ? err.message : 'Failed to get doctor details.');
    }
  }

  closeDoctorDetail(): void {
    this.selectedDoctorDetail.set(null);
    this.errorText.set(null);
  }

  async onDoctorCodesChanged(): Promise<void> {
    const doc = this.selectedDoctorDetail();
    if (doc) {
      await this.selectDoctor(doc.id);
    }
    await this.loadDoctors();
  }

  async generateCodeForSelectedDoctor(): Promise<void> {
    const doc = this.selectedDoctorDetail();
    if (!doc || this.saving()) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      const res = await this.doctorsService.createCode(doc.id, { location_label: null });
      if (res.kind !== 'doctor_code_created') {
        this.errorText.set('Switch the doctor on before creating a code.');
        return;
      }
      this.selectedDoctorDetail.update((current) => {
        if (!current) return null;
        return {
          ...current,
          code_count: current.code_count + 1,
          active_code_count: current.active_code_count + 1,
          codes: [res.code, ...current.codes],
        };
      });
      await this.loadDoctors();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'doctor_inactive') {
        this.errorText.set('Switch the doctor on before creating a code.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to generate code.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  // Department Management
  startRenameDept(dept: StaffDepartment): void {
    this.editingDeptId.set(dept.id);
    this.deptRenameValue = dept.name;
    this.errorText.set(null);
  }

  cancelRenameDept(): void {
    this.editingDeptId.set(null);
    this.deptRenameValue = '';
  }

  async saveDeptRename(dept: StaffDepartment): Promise<void> {
    if (this.saving()) return;
    const name = this.deptRenameValue.trim();
    if (!name) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      const result = await this.doctorsService.updateDepartment(dept.id, { name });
      if (result.kind !== 'department_updated') {
        this.errorText.set(
          result.kind === 'department_name_taken'
            ? 'A department with this name already exists.'
            : 'Move or switch off its active doctors first.',
        );
        return;
      }
      this.editingDeptId.set(null);
      await this.loadDepartments();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'department_name_taken') {
        this.errorText.set('A department with this name already exists.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to rename department.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  async toggleDeptActive(dept: StaffDepartment): Promise<void> {
    if (this.saving()) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      const result = await this.doctorsService.updateDepartment(dept.id, { active: !dept.active });
      if (result.kind !== 'department_updated') {
        this.errorText.set(
          result.kind === 'department_name_taken'
            ? 'A department with this name already exists.'
            : 'Move or switch off its active doctors first.',
        );
        return;
      }
      await this.loadDepartments();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'department_has_active_doctors') {
        this.errorText.set('Move or switch off its active doctors first.');
      } else {
        this.errorText.set(
          err instanceof Error ? err.message : 'Failed to update department status.',
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  async createDepartment(): Promise<void> {
    if (this.saving()) return;
    const name = this.newDeptName.trim();
    if (!name) return;
    this.errorText.set(null);

    this.saving.set(true);
    try {
      const result = await this.doctorsService.createDepartment({ name });
      if (result.kind !== 'department_created') {
        this.errorText.set('A department with this name already exists.');
        return;
      }
      this.newDeptName = '';
      this.showAddDept.set(false);
      await this.loadDepartments();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'department_name_taken') {
        this.errorText.set('A department with this name already exists.');
      } else {
        this.errorText.set(err instanceof Error ? err.message : 'Failed to create department.');
      }
    } finally {
      this.saving.set(false);
    }
  }
}
