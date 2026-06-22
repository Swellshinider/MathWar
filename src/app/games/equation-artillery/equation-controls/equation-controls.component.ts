import { Component, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FunctionPreviewComponent } from '../function-preview/function-preview.component';

@Component({
  selector: 'app-equation-controls',
  imports: [ReactiveFormsModule, FunctionPreviewComponent],
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
  readonly equationValue = toSignal(this.equation.valueChanges, {
    initialValue: this.equation.value,
  });

  submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.active() && this.equation.valid) this.fire.emit(this.equation.value);
  }
}
