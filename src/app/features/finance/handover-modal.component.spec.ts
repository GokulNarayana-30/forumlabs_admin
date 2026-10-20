import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { HandoverModalComponent } from './handover-modal.component';

describe('Handover unresolved action', () => {
  it('freezes amounts, note and UUID across a lost response and reopening through real HTTP', async () => {
    TestBed.configureTestingModule({
      imports: [HandoverModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(HandoverModalComponent);
    f.componentRef.setInput('day', {
      recorder: { member_id: 'm', display_name: 'Recorder' },
      date: '2026-10-18',
      cash_expected_paise: 10000,
      upi_expected_paise: 0,
      latest_entry: null,
    });
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    const fields = f.nativeElement.querySelectorAll('input');
    fields[0].value = '90.00';
    fields[0].dispatchEvent(new Event('input'));
    const note = f.nativeElement.querySelector('textarea');
    note.value = ' Shortage counted ';
    note.dispatchEvent(new Event('input'));
    await f.whenStable();
    f.detectChanges();
    const click = (text: string) =>
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes(text))!
        .click();
    click('Confirm Handover');
    const req = http.expectOne(
      environment.apiUrl + '/staff/finance/cash-close/m/2026-10-18/handover',
    );
    const body = req.request.body,
      key = req.request.headers.get('Idempotency-Key');
    expect(body.cash_handed_over_paise).toBe(9000);
    expect(body.note).toBe('Shortage counted');
    req.error(new ProgressEvent('error'));
    await f.whenStable();
    f.detectChanges();
    expect(fields[0].disabled).toBe(true);
    expect(note.disabled).toBe(true);
    f.nativeElement.querySelector('button').click();
    f.componentRef.setInput('visible', false);
    f.detectChanges();
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('textarea').value).toBe('Shortage counted');
    f.componentInstance.cashRupeesInput.set('80');
    f.componentInstance.noteInput.set('Changed');
    f.detectChanges();
    click('Retry exact handover');
    const retry = http.expectOne(
      environment.apiUrl + '/staff/finance/cash-close/m/2026-10-18/handover',
    );
    expect(retry.request.body).toEqual(body);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ kind: 'cash_close_not_allowed', reason: 'day_reconciled' });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('textarea').disabled).toBe(false);
    expect(f.nativeElement.textContent).toContain('day_reconciled');
    http.verify();
  });
});
