import { Component } from '@angular/core';

@Component({
  selector: 'app-finance-placeholder',
  standalone: true,
  template: `
    <div class="p-6">
      <h1 class="text-xl font-semibold text-primary-700">Finance Operations</h1>
      <p class="text-surface-600 mt-2">Finance operations placeholder</p>
    </div>
  `,
})
export class FinancePlaceholderComponent {}
