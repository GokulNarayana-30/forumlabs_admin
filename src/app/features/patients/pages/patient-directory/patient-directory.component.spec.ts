import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PatientDirectoryComponent } from './patient-directory.component';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientDirectoryItem,
  StaffPatientDirectoryPage,
} from '../../services/patients.service';
import routes from '../../patients.routes';

const item = (n: number): StaffPatientDirectoryItem => ({
  patient_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  patient_code: `FL-P-${100000 + n}`,
  name_masked: 'La***** Iy**',
  phone_masked: '+91 ******3210',
  relation: n % 2 === 0 ? 'self' : 'parent',
  account_status: n === 2 ? 'blocked' : 'active',
  booking_count: n,
  last_booking_at: n === 0 ? null : '2026-10-20T05:00:00.000Z',
  created_at: '2026-10-28T05:00:00.000Z',
});

const detail: StaffPatientDetail = {
  account_user_id: '11111111-2222-4333-8444-555555555555',
  account_status: 'active',
  patient_id: item(1).patient_id,
  patient_code: item(1).patient_code,
  name: 'Lakshmi Iyer',
  phone: '+919876543210',
  gender: 'female',
  date_of_birth: '1990-05-15',
  relation: 'self',
  family: [],
  bookings: [],
  reports: [],
};

describe('PatientDirectoryComponent', () => {
  let fixture: ComponentFixture<PatientDirectoryComponent>;
  let component: PatientDirectoryComponent;
  let service: {
    getDirectoryPage: ReturnType<typeof vi.fn>;
    getPatientDetail: ReturnType<typeof vi.fn>;
  };
  const pages: Record<string, StaffPatientDirectoryPage> = {
    '': { items: [item(0), item(1), item(2)], next_cursor: 'cursor-2' },
    'cursor-2': { items: [item(3)], next_cursor: null },
  };

  beforeEach(async () => {
    service = {
      getDirectoryPage: vi.fn(async (cursor?: string) => pages[cursor ?? '']!),
      getPatientDetail: vi.fn().mockResolvedValue(detail),
    };
    await TestBed.configureTestingModule({
      imports: [PatientDirectoryComponent],
      providers: [provideRouter([]), { provide: PatientsService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(PatientDirectoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const rows = () =>
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="directory-row"]');
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('loads the first page on open and shows masked values only', () => {
    expect(service.getDirectoryPage).toHaveBeenCalledWith(undefined);
    expect(rows()).toHaveLength(3);
    expect(text()).toContain('La***** Iy**');
    expect(text()).toContain('+91 ******3210');
    expect(text()).not.toContain('Lakshmi');
    expect(text()).toContain('Page 1');
    expect(component.hasNext()).toBe(true);
    expect(component.hasPrevious()).toBe(false);
  });

  it('shows a dash for a patient who was never booked and flags a blocked account', () => {
    expect(text()).toContain('—');
    expect(text()).toContain('blocked');
  });

  it('Next 25 loads the next page with the cursor and Previous returns to page 1', async () => {
    await component.next();
    fixture.detectChanges();
    expect(service.getDirectoryPage).toHaveBeenLastCalledWith('cursor-2');
    expect(rows()).toHaveLength(1);
    expect(component.pageNumber()).toBe(2);
    expect(component.hasNext()).toBe(false);
    expect(component.hasPrevious()).toBe(true);

    await component.previous();
    fixture.detectChanges();
    expect(service.getDirectoryPage).toHaveBeenLastCalledWith(undefined);
    expect(rows()).toHaveLength(3);
    expect(component.pageNumber()).toBe(1);
  });

  it('a failed page keeps the current page and does not move the page number', async () => {
    service.getDirectoryPage.mockRejectedValueOnce(new Error('boom'));
    await component.next();
    expect(component.pageNumber()).toBe(1);
    expect(component.items()).toHaveLength(3);
  });

  it('opens the normal patient record for a row', async () => {
    await component.open(item(1));
    expect(service.getPatientDetail).toHaveBeenCalledWith(item(1).patient_id);
    expect(component.selectedPatient()?.name).toBe('Lakshmi Iyer');
    expect(component.detailVisible()).toBe(true);
  });

  it('the route is for the super admin only', () => {
    const route = routes.find((r) => r.path === 'directory');
    expect(route?.data).toEqual({ roles: ['super_admin'] });
    expect(route?.canActivate).toBeDefined();
  });
});
