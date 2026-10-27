import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BreakdownResult } from './revenue.service';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import { formatInr } from '../../marketing/inr';

@Component({
  selector: 'app-breakdown-table',
  standalone: true,
  imports: [CommonModule, UiTagComponent],
  templateUrl: './breakdown-table.component.html',
})
export class BreakdownTableComponent {
  readonly result = input<BreakdownResult | null>(null);

  readonly formatInr = formatInr;
}
