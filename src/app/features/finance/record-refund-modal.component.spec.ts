import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { RecordRefundModalComponent } from './record-refund-modal.component';

describe('Refund unresolved action through real HTTP client', () => {
  it('locks every field and replays the same body and UUID after closing and reopening', async () => {
    TestBed.configureTestingModule({
      imports: [RecordRefundModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(RecordRefundModalComponent);
    f.componentRef.setInput('order', {
      order_id: 'a',
      booking_ref: 'BK-a',
      remaining_paise: 30000,
      total_paid_paise: 30000,
      refunded_paise: 0,
    });
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    const input = async (selector: string, value: string) => {
      const el = f.nativeElement.querySelector(selector);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await f.whenStable();
      f.detectChanges();
    };
    const click = (text: string) =>
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes(text))!
        .click();
    await input('#refundAmount', '100.00');
    await input('#refundReason', '  Cancellation  ');
    click('Confirm Refund');
    const first = http.expectOne(environment.apiUrl + '/staff/finance/orders/a/refunds');
    const body = first.request.body;
    const key = first.request.headers.get('Idempotency-Key');
    expect(body.amount_paise).toBe(10000);
    expect(body.reason).toBe('Cancellation');
    first.error(new ProgressEvent('error'));
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#refundAmount').disabled).toBe(true);
    expect(f.nativeElement.querySelector('#refundReason').disabled).toBe(true);
    expect(f.nativeElement.querySelector('[role="status"]').textContent).toContain('unresolved');
    click('Close');
    f.detectChanges();
    f.componentRef.setInput('visible', false);
    f.detectChanges();
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#refundAmount').value).toBe('100.00');
    // Even a programmatic change cannot change the retained request.
    f.componentInstance.amountRs.set('90');
    f.componentInstance.reason.set('different');
    f.detectChanges();
    click('Retry exact refund');
    const retry = http.expectOne(environment.apiUrl + '/staff/finance/orders/a/refunds');
    expect(retry.request.body).toEqual(body);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ kind: 'refund_not_allowed', reason: 'exceeds_paid_amount' });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('#refundAmount').disabled).toBe(false);
    expect(f.nativeElement.textContent).toContain('exceeds_paid_amount');
    http.verify();
  });
});
