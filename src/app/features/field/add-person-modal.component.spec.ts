import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPersonModalComponent, ageOnToday } from './add-person-modal.component';
import { AddPersonOptions, AddPersonResult, FieldService } from './services/field.service';

const options: AddPersonOptions = {
  kind: 'add_person_options',
  open: true,
  people_left: 4,
  people: [
    {
      id: 'p-self',
      name: 'Account Holder',
      relation: 'self',
      date_of_birth: '1985-01-01',
      gender: 'male',
      on_this_visit: true,
    },
    {
      id: 'p-sis',
      name: 'Sister',
      relation: 'sibling',
      date_of_birth: '1990-02-02',
      gender: 'female',
      on_this_visit: false,
    },
  ],
  items: [
    {
      id: 'cbc',
      kind: 'test',
      name: 'CBC',
      price_paise: 30000,
      mrp_paise: 40000,
      gender: 'any',
      min_age_years: null,
      max_age_years: null,
    },
    {
      id: 'psa',
      kind: 'test',
      name: 'PSA',
      price_paise: 50000,
      mrp_paise: 60000,
      gender: 'male',
      min_age_years: null,
      max_age_years: null,
    },
  ],
};

const result: AddPersonResult = {
  kind: 'person_added',
  order: {
    id: 'o2',
    booking_ref: 'FL-B-2026-000002',
    status: 'phlebotomist_assigned',
    payment_status: 'due_at_collection',
    total_paise: 30000,
  },
  patient: { id: 'p-new', name: 'Door Person', patient_code: 'FL-P-123456' },
  lines: [{ item_id: 'cbc', item_name: 'CBC', net_paise: 30000 }],
};

describe('AddPersonModalComponent', () => {
  let service: {
    getAddPersonOptions: ReturnType<typeof vi.fn>;
    addPerson: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      getAddPersonOptions: vi.fn().mockResolvedValue(options),
      addPerson: vi.fn().mockResolvedValue(result),
    };
    TestBed.configureTestingModule({
      imports: [AddPersonModalComponent],
      providers: [{ provide: FieldService, useValue: service }],
    });
  });

  async function open() {
    const f = TestBed.createComponent(AddPersonModalComponent);
    f.componentRef.setInput('orderId', 'o1');
    f.componentRef.setInput('visible', true);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }

  it('computes ages on the Indian date and refuses non dates', () => {
    const now = new Date('2026-10-28T10:00:00Z');
    expect(ageOnToday('2008-10-28', now)).toBe(18);
    expect(ageOnToday('2008-10-29', now)).toBe(17);
    expect(ageOnToday('2027-01-01', now)).toBeNull();
    expect(ageOnToday('banana', now)).toBeNull();
    expect(ageOnToday('2026-02-30', now)).toBeNull();
  });

  it('loads the options when opened and needs the consent, a gender and a test before it can create the booking', async () => {
    const f = await open();
    const c = f.componentInstance;
    expect(service.getAddPersonOptions).toHaveBeenCalledWith('o1', '');
    expect(c.canSubmit()).toBe(false);

    c.name.set('Door Person');
    c.dateOfBirth.set('1990-05-10');
    c.gender.set('female');
    c.toggle(options.items[0]!);
    expect(c.canSubmit()).toBe(false); // no consent yet
    c.shareConsent.set(true);
    expect(c.canSubmit()).toBe(true);
    expect(c.totalPaise()).toBe(30000);
  });

  it('asks for the guardian tick for a minor, and greys out a test that does not fit the person', async () => {
    const c = (await open()).componentInstance;
    c.name.set('Child');
    c.dateOfBirth.set('2020-01-01');
    c.gender.set('female');
    c.shareConsent.set(true);
    c.toggle(options.items[0]!);
    expect(c.isMinor()).toBe(true);
    expect(c.canSubmit()).toBe(false);
    c.guardianConfirmed.set(true);
    expect(c.canSubmit()).toBe(true);

    expect(c.notForPerson(options.items[1]!)).toBe('Men only');
    c.gender.set('male');
    expect(c.notForPerson(options.items[1]!)).toBeNull();
  });

  it('creates the booking for a new person with the consent and shows what to collect', async () => {
    const f = await open();
    const c = f.componentInstance;
    const added = vi.fn();
    c.added.subscribe(added);
    c.name.set('  Door Person ');
    c.relation.set('sibling');
    c.dateOfBirth.set('1990-05-10');
    c.gender.set('female');
    c.shareConsent.set(true);
    c.toggle(options.items[0]!);

    await c.submit();
    f.detectChanges();

    expect(service.addPerson).toHaveBeenCalledWith('o1', {
      person: {
        kind: 'new',
        details: {
          name: 'Door Person',
          relation: 'sibling',
          date_of_birth: '1990-05-10',
          gender: 'female',
          share_consent: true,
        },
      },
      item_ids: ['cbc'],
    });
    expect(added).toHaveBeenCalledWith(result);
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('FL-B-2026-000002');
    expect(text).toContain('Door Person');
    expect(text).toContain('in cash or UPI at the door');
  });

  it('adds a saved family member, but never one who is already on the visit', async () => {
    const f = await open();
    const c = f.componentInstance;
    c.mode.set('existing');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const radios = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll('input[type="radio"]'),
    ) as HTMLInputElement[];
    expect(radios[0]!.disabled).toBe(true);
    expect(radios[1]!.disabled).toBe(false);

    c.patientId.set('p-sis');
    c.toggle(options.items[0]!);
    await c.submit();
    expect(service.addPerson).toHaveBeenCalledWith('o1', {
      person: { kind: 'existing', patient_id: 'p-sis' },
      item_ids: ['cbc'],
    });
  });

  it('says so when the visit is closed or full, and shows the server refusal', async () => {
    service.getAddPersonOptions.mockResolvedValue({ ...options, open: false });
    const closed = await open();
    expect(closed.componentInstance.errorMessage()).toContain('already collected');
    expect(closed.componentInstance.canSubmit()).toBe(false);

    service.getAddPersonOptions.mockResolvedValue(options);
    service.addPerson.mockRejectedValue(new Error('boom'));
    const f = await open();
    const c = f.componentInstance;
    c.mode.set('existing');
    c.patientId.set('p-sis');
    c.toggle(options.items[0]!);
    await c.submit();
    expect(c.errorMessage()).not.toBe('');
    expect(c.result()).toBeNull();
  });
});
