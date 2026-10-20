import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiToastComponent } from './shared/ui/ui-toast.component';

@Component({
  imports: [RouterOutlet, UiToastComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('admin');
}
