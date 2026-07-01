import { ChangeDetectionStrategy, Component, effect, input, model, output } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { FunctionPreviewComponent } from '../function-preview/function-preview.component';

@Component({
  selector: 'app-equation-controls',
  imports: [ReactiveFormsModule, FunctionPreviewComponent],
  templateUrl: './equation-controls.component.html',
  styleUrl: './equation-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquationControlsComponent {
  readonly active = input(false);
  readonly roundComplete = input(false);
  readonly error = input<string | null>(null);
  readonly status = input('Ready');
  readonly showPreview = input(true);
  readonly fire = output<string>();
  readonly newRound = output<void>();
  readonly equation = model('0.35x');
  readonly equationControl = new FormControl(this.equation(), {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly equationValue = toSignal(this.equationControl.valueChanges, {
    initialValue: this.equationControl.value,
  });

  constructor() {
    effect(() => {
      const equation = this.equation();
      if (this.equationControl.value !== equation) {
        this.equationControl.setValue(equation);
      }
    });
    this.equationControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((equation) => this.equation.set(equation));
  }

  submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.active() && this.equationControl.valid) {
      this.fire.emit(this.equationControl.value);
    }
  }
}
