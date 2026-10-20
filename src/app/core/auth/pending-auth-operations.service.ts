import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Only operation identity and target survive closing. No credentials or fingerprints. */
@Injectable({ providedIn: 'root' })
export class PendingAuthOperations {
  private readonly operations = new Map<string, { id: string; target: string }>();
  readonly cleared = new Subject<void>();
  epoch = 0;
  get(key: string) {
    return this.operations.get(key);
  }
  set(key: string, id: string, target: string): void {
    this.operations.set(key, { id, target });
  }
  delete(key: string): void {
    this.operations.delete(key);
  }
  clear(): void {
    this.operations.clear();
    this.epoch++;
    this.cleared.next();
  }
}
