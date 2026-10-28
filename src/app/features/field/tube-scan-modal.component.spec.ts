import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TestBed } from '@angular/core/testing';
import { TubeScanModalComponent } from './tube-scan-modal.component';
import { FieldService, FieldVisit, StaffTube } from './services/field.service';

const tube = (code: string, order = 'a', attempt = 1): StaffTube => ({
  id: code,
  tube_code: code,
  order_id: order,
  attempt,
  patient_row_id: 'p',
  test_ordinal: 0,
  status: 'generated',
  created_at: '2026-10-20T00:00:00Z',
});
const visit = (order: string, tubes: StaffTube[], attempt = 1) =>
  ({ order_id: order, booking_ref: order, attempt, tubes }) as FieldVisit;

describe('Tube scan modal lifecycle', () => {
  const service = { generateTubes: vi.fn(), scanTubeCollection: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [TubeScanModalComponent],
      providers: [{ provide: FieldService, useValue: service }],
    });
  });
  it('replaces the rendered bottle barcode on order and attempt change and clears it on close', async () => {
    const f = TestBed.createComponent(TubeScanModalComponent);
    f.componentRef.setInput('visible', true);
    f.componentRef.setInput(
      'visit',
      visit('a', [{ ...tube('FLT-AAAA-BBBB'), bottle_barcode: 'BOTTLE-AAA' }]),
    );
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('BOTTLE-AAA');
    f.componentRef.setInput(
      'visit',
      visit('b', [{ ...tube('FLT-CCCC-DDDD', 'b'), bottle_barcode: 'BOTTLE-CCC' }]),
    );
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('BOTTLE-AAA');
    expect(f.nativeElement.textContent).toContain('BOTTLE-CCC');
    f.componentRef.setInput('visit', visit('b', [], 2));
    await f.whenStable();
    f.detectChanges();
    f.nativeElement.querySelector('[aria-label="Close modal"]').click();
    f.detectChanges();
    expect(f.componentInstance.activeTubeForBarcode()).toBeNull();
    expect(f.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
  it('ignores a generation result from a previously open visit', async () => {
    let resolve!: (value: any) => void;
    service.generateTubes.mockReturnValue(new Promise((r) => (resolve = r)));
    const f = TestBed.createComponent(TubeScanModalComponent);
    f.componentRef.setInput('visible', true);
    f.componentRef.setInput('visit', visit('a', []));
    await f.whenStable();
    f.detectChanges();
    Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Generate Sample'))!
      .click();
    expect(service.generateTubes).toHaveBeenCalledWith('a');
    f.componentRef.setInput('visit', visit('b', [], 2));
    f.detectChanges();
    resolve({ tubes: [tube('FLT-AAAA-BBBB')] });
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.tubes()).toEqual([]);
  });
  it.each(['close', 'destroy', 'visit change'])(
    'stops a late camera stream after %s',
    async (action) => {
      let resolve!: (stream: MediaStream) => void;
      const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const stop = vi.fn();
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn(() => new Promise((r) => (resolve = r))) },
      });
      try {
        const f = TestBed.createComponent(TubeScanModalComponent);
        f.componentRef.setInput('visible', true);
        f.componentRef.setInput('visit', visit('a', [tube('FLT-AAAA-BBBB')]));
        await f.whenStable();
        f.detectChanges();
        const pending = f.componentInstance.startCamera();
        if (action === 'close') f.nativeElement.querySelector('[aria-label="Close modal"]').click();
        else if (action === 'destroy') f.destroy();
        else {
          f.componentRef.setInput('visit', visit('b', []));
          f.detectChanges();
        }
        resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
        await pending;
        expect(stop).toHaveBeenCalledTimes(1);
        expect(f.componentInstance.cameraActive()).toBe(false);
        expect(service.scanTubeCollection).not.toHaveBeenCalled();
      } finally {
        if (original) Object.defineProperty(navigator, 'mediaDevices', original);
        else Reflect.deleteProperty(navigator, 'mediaDevices');
      }
    },
  );
});

// Independent fixed run-width fixture from ZXing 3.5.3 Code128Reader, Apache-2.0:
// https://github.com/zxing/zxing/blob/zxing-3.5.3/core/src/main/java/com/google/zxing/oned/Code128Reader.java
// Start B; F,L,T,-,1,2,3,4,-,5,6,7,Y; checksum 38; stop.
const label = 'FLT-1234-567Y'; // Valid Damm check character Y.
const runs = [
  '211214',
  '132311',
  '132131',
  '213311',
  '122132',
  '123221',
  '223211',
  '221132',
  '221231',
  '122132',
  '213212',
  '223112',
  '312131',
  '312113',
  '132311',
  '2331112',
];

describe('Tube labels and actual HTTP interactions', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [TubeScanModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const setup = async (tubes = [tube(label)]) => {
    const f = TestBed.createComponent(TubeScanModalComponent);
    f.componentRef.setInput('visible', true);
    f.componentRef.setInput('visit', visit('a', tubes));
    await f.whenStable();
    f.detectChanges();
    return f;
  };
  it('generates then scans through real controls, rejecting invalid, foreign and stale-attempt codes', async () => {
    const f = await setup([]),
      http = TestBed.inject(HttpTestingController);
    const click = (text: string) =>
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes(text))!
        .click();
    click('Generate Sample Tubes');
    const generated = http.expectOne(environment.apiUrl + '/staff/orders/a/tubes');
    generated.flush({ kind: 'tubes_generated', tubes: [tube(label)] });
    await f.whenStable();
    f.detectChanges();
    const input = async (value: string) => {
      const el = f.nativeElement.querySelector('#manual-tube-input');
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await f.whenStable();
      f.detectChanges();
      click('Confirm');
      await f.whenStable();
      f.detectChanges();
    };
    await input('bad');
    expect(f.nativeElement.textContent).toContain('not a usable bottle barcode');
    await input('FLT-0000-0000');
    expect(f.nativeElement.textContent).toContain('does not belong');
    http.expectNone((r) => r.method === 'POST');
    await input('flt 1234 567y');
    const scan = http.expectOne(environment.apiUrl + '/staff/tubes/' + label + '/scan');
    scan.flush({ kind: 'tube_scanned', tube: { ...tube(label), status: 'scanned_at_collection' } });
    await f.whenStable();
    f.detectChanges();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('scanned and confirmed');
    });
    f.componentRef.setInput('visit', visit('a', [tube('FLT-0000-0000', 'a', 2)], 2));
    await f.whenStable();
    f.detectChanges();
    await input(label);
    expect(f.nativeElement.textContent).toContain('does not belong');
    http.expectNone((r) => r.method === 'POST');
    http.verify();
  });
  it('links the bottle barcode to the tube waiting for a bottle and shows the patient and test', async () => {
    const f = await setup([]),
      http = TestBed.inject(HttpTestingController);
    const click = (text: string) =>
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes(text))!
        .click();
    click('Generate Sample Tubes');
    http.expectOne(environment.apiUrl + '/staff/orders/a/tubes').flush({
      kind: 'tubes_generated',
      tubes: [{ ...tube(label), patient_label: 'Asha (FRM-1)', test_name: 'CBC' }],
    });
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Waiting for bottle');
    expect(f.nativeElement.textContent).toContain('Asha (FRM-1) · CBC');

    const el = f.nativeElement.querySelector('#manual-tube-input');
    el.value = ' ab 123456 ';
    el.dispatchEvent(new Event('input'));
    await f.whenStable();
    f.detectChanges();
    click('Confirm');
    const scan = http.expectOne(environment.apiUrl + '/staff/tubes/' + label + '/scan');
    expect(scan.request.body).toEqual({ barcode: 'AB123456' });
    scan.flush({
      kind: 'tube_scanned',
      tube: {
        ...tube(label),
        bottle_barcode: 'AB123456',
        status: 'scanned_at_collection',
        patient_label: 'Asha (FRM-1)',
        test_name: 'CBC',
      },
    });
    await f.whenStable();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('Bottle AB123456 linked to Asha (FRM-1) · CBC');
    });
    expect(f.nativeElement.textContent).toContain('Bottle linked');
    http.verify();
  });
  it('uses the native detector fixture and stops tracks after a successful scan', async () => {
    let frame: FrameRequestCallback | undefined;
    const stop = vi.fn();
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    class Detector {
      static getSupportedFormats = async () => ['code_128'];
      detect = vi.fn().mockResolvedValue([{ rawValue: label }]);
    }
    vi.stubGlobal('BarcodeDetector', Detector);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    try {
      const f = await setup();
      await Promise.resolve();
      f.detectChanges();
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes('Scan Barcode with Camera'))!
        .click();
      await f.whenStable();
      f.detectChanges();
      const video = f.nativeElement.querySelector('video');
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      await new Promise((r) => setTimeout(r, 60));
      expect(frame).toBeDefined();
      frame!(0);
      await Promise.resolve();
      await Promise.resolve();
      const http = TestBed.inject(HttpTestingController);
      const scan = http.expectOne(environment.apiUrl + '/staff/tubes/' + label + '/scan');
      scan.flush({
        kind: 'tube_scanned',
        tube: { ...tube(label), status: 'scanned_at_collection' },
      });
      await f.whenStable();
      f.detectChanges();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(f.componentInstance.cameraActive()).toBe(false);
      await vi.waitFor(() => {
        f.detectChanges();
        expect(f.nativeElement.textContent).toContain('scanned and confirmed');
      });
      http.verify();
    } finally {
      if (original) Object.defineProperty(navigator, 'mediaDevices', original);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });
  it('shows typing fallback on permission refusal', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
      },
    });
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        static getSupportedFormats = async () => ['code_128'];
      },
    );
    try {
      const f = await setup();
      await Promise.resolve();
      f.detectChanges();
      Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent?.includes('Scan Barcode with Camera'))!
        .click();
      await vi.waitFor(() => {
        f.detectChanges();
        expect(f.nativeElement.textContent).toContain('Camera permission denied');
      });
      expect(f.nativeElement.querySelector('#manual-tube-input')).not.toBeNull();
      expect(f.componentInstance.cameraActive()).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, 'mediaDevices', original);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });
});
