import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-equation-controls',
  imports: [ReactiveFormsModule],
  templateUrl: './equation-controls.component.html',
  styleUrl: './equation-controls.component.scss',
})
export class EquationControlsComponent {
  readonly active = input(false);
  readonly roundComplete = input(false);
  readonly error = input<string | null>(null);
  readonly status = input('Ready');
  readonly fire = output<string>();
  readonly newRound = output<void>();
  readonly equation = new FormControl('0.35x', {
    nonNullable: true,
    validators: [Validators.required],
  });

  submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.active() && this.equation.valid) this.fire.emit(this.equation.value);
  }
}
