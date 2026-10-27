import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DoctorsService, StaffDoctorDetail, StaffDoctorCode } from './doctors.service';

export function cardLinkFor(base: string | null, code: string): string | null {
  if (!base) return null;
  const cleanBase = base.replace(/\/+$/, '');
  return `${cleanBase}/rx/${code.toUpperCase()}`;
}

@Component({
  selector: 'app-opd-card',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './opd-card.component.html',
})
export class OpdCardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly doctorsService = inject(DoctorsService);

  readonly doctor = signal<StaffDoctorDetail | null>(null);
  readonly codeId = signal<string>('');
  readonly cardLinkBaseUrl = signal<string | null>(null);

  readonly loading = signal(true);
  readonly errorText = signal<string | null>(null);
  readonly codeNotFound = signal(false);

  readonly matchedCode = computed<StaffDoctorCode | null>(() => {
    const doc = this.doctor();
    const cid = this.codeId();
    if (!doc || !cid) return null;
    return doc.codes.find((c) => c.id === cid) ?? null;
  });

  readonly cardLink = computed<string | null>(() => {
    const c = this.matchedCode();
    const base = this.cardLinkBaseUrl();
    if (!c || !base) return null;
    return cardLinkFor(base, c.code);
  });

  async ngOnInit(): Promise<void> {
    const doctorId =
      this.route.snapshot.paramMap.get('doctor_id') ?? this.route.snapshot.params['doctor_id'];
    const codeId =
      this.route.snapshot.paramMap.get('code_id') ?? this.route.snapshot.params['code_id'];

    this.codeId.set(codeId ?? '');

    if (!doctorId || !codeId) {
      this.errorText.set('Doctor ID and Code ID are required.');
      this.loading.set(false);
      return;
    }

    try {
      const [doctorRes, settingsRes] = await Promise.all([
        this.doctorsService.getDoctor(doctorId),
        this.doctorsService.getSettings(),
      ]);

      this.doctor.set(doctorRes.doctor);
      this.cardLinkBaseUrl.set(settingsRes.card_link_base_url);

      const found = doctorRes.doctor.codes.some((c) => c.id === codeId);
      if (!found) {
        this.codeNotFound.set(true);
      }
    } catch (err: unknown) {
      this.errorText.set(err instanceof Error ? err.message : 'Failed to load card details.');
    } finally {
      this.loading.set(false);
    }
  }

  printCard(): void {
    window.print();
  }
}
