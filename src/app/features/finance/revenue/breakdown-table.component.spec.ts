import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { BreakdownTableComponent } from './breakdown-table.component';
import { BreakdownResult } from './revenue.service';

describe('BreakdownTableComponent', () => {
  let fixture: ComponentFixture<BreakdownTableComponent>;
  let component: BreakdownTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BreakdownTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BreakdownTableComponent);
    component = fixture.componentInstance;
  });

  it('renders rows in order with ₹ figures, totals row and Matches the headline tag', () => {
    const mockResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: '2026-10-27T02:00:00.000Z',
      missing_days: [],
      scope_label: null,
      rows: [
        {
          key_id: 't1',
          key_label: 'Test 1',
          item_kind: 'test',
          orders_count: 1,
          units_count: 1,
          gross_paise: 40000,
          offer_discount_paise: 3000,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 37000,
        },
        {
          key_id: 'p1',
          key_label: 'Package 1',
          item_kind: 'package',
          orders_count: 2,
          units_count: 4,
          gross_paise: 100000,
          offer_discount_paise: 7000,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 93000,
        },
        {
          key_id: 't2',
          key_label: 'Test 2',
          item_kind: 'test',
          orders_count: 1,
          units_count: 1,
          gross_paise: 25000,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 25000,
        },
        {
          key_id: 't3',
          key_label: 'Test 3',
          item_kind: 'test',
          orders_count: 1,
          units_count: 1,
          gross_paise: 0,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 0,
        },
        {
          key_id: '__fee__',
          key_label: 'Collection fee',
          item_kind: 'fee',
          orders_count: 1,
          units_count: 0,
          gross_paise: 10000,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 10000,
          tax_paise: 0,
          earned_paise: 10000,
        },
      ],
      totals: {
        orders_count: 6,
        units_count: 7,
        gross_paise: 175000,
        offer_discount_paise: 10000,
        coupon_cost_paise: 0,
        collection_fee_paise: 10000,
        tax_paise: 0,
        earned_paise: 165000,
      },
      headline: {
        orders_count: 6,
        gross_paise: 175000,
        offer_discount_paise: 10000,
        coupon_cost_paise: 0,
        collection_fee_paise: 10000,
        tax_paise: 0,
        earned_paise: 165000,
      },
      sums_to_headline: true,
      notice: null,
    };

    fixture.componentRef.setInput('result', mockResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Test 1');
    expect(el.textContent).toContain('Package 1');
    expect(el.textContent).toContain('Test 2');
    expect(el.textContent).toContain('Test 3');
    expect(el.textContent).toContain('Collection fee');
    expect(el.textContent).toContain('₹370');
    expect(el.textContent).toContain('₹930');
    expect(el.textContent).toContain('₹250');
    expect(el.textContent).toContain('₹0');
    expect(el.textContent).toContain('₹100');
    expect(el.textContent).toContain('₹1,650');
    expect(el.textContent).toContain('Matches the headline');
  });

  it('renders warn tag when sums_to_headline is false', () => {
    const mockResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: null,
      missing_days: [],
      scope_label: null,
      rows: [],
      totals: {
        orders_count: 0,
        units_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      headline: {
        orders_count: 1,
        gross_paise: 50000,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 50000,
      },
      sums_to_headline: false,
      notice: null,
    };

    fixture.componentRef.setInput('result', mockResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Does not match the headline: refresh the days');
  });

  it('shows notice banner for doctor or department with notice text, but no banner for item', () => {
    const doctorResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'doctor',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: null,
      missing_days: [],
      scope_label: 'app_and_web_bookings_only',
      rows: [],
      totals: {
        orders_count: 0,
        units_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      headline: {
        orders_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      sums_to_headline: true,
      notice: 'app and web bookings only, never for doctors’ pay or targets',
    };

    fixture.componentRef.setInput('result', doctorResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(
      'app and web bookings only, never for doctors’ pay or targets',
    );

    const itemResult: BreakdownResult = {
      ...doctorResult,
      dimension: 'item',
      notice: null,
    };
    fixture.componentRef.setInput('result', itemResult);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('app and web bookings only');
  });

  it('escapes html in row labels and creates no img element', () => {
    const mockResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: null,
      missing_days: [],
      scope_label: null,
      rows: [
        {
          key_id: 'xss',
          key_label: '<img src=x onerror=alert(1)>',
          item_kind: null,
          orders_count: 1,
          units_count: 1,
          gross_paise: 1000,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 1000,
        },
      ],
      totals: {
        orders_count: 1,
        units_count: 1,
        gross_paise: 1000,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 1000,
      },
      headline: {
        orders_count: 1,
        gross_paise: 1000,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 1000,
      },
      sums_to_headline: true,
      notice: null,
    };

    fixture.componentRef.setInput('result', mockResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('img').length).toBe(0);
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows "No figures for this range" when rows array is empty', () => {
    const mockResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: null,
      missing_days: [],
      scope_label: null,
      rows: [],
      totals: {
        orders_count: 0,
        units_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      headline: {
        orders_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      sums_to_headline: true,
      notice: null,
    };

    fixture.componentRef.setInput('result', mockResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No figures for this range');
  });

  it('formats large money values with formatInr without floating point drift', () => {
    const mockResult: BreakdownResult = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-26',
      as_of: null,
      missing_days: [],
      scope_label: null,
      rows: [
        {
          key_id: 'big',
          key_label: 'Large row',
          item_kind: null,
          orders_count: 10,
          units_count: 20,
          gross_paise: 12345678901,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 12345678901,
        },
      ],
      totals: {
        orders_count: 10,
        units_count: 20,
        gross_paise: 12345678901,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 12345678901,
      },
      headline: {
        orders_count: 10,
        gross_paise: 12345678901,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 12345678901,
      },
      sums_to_headline: true,
      notice: null,
    };

    fixture.componentRef.setInput('result', mockResult);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('₹12,34,56,789.01');
  });
});
