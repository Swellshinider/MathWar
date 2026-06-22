import { Component, ElementRef, ViewChild } from '@angular/core';
import { FunctionReferenceComponent } from '../function-reference/function-reference.component';
import { FUNCTION_REFERENCES } from '../game/expression-catalog';

@Component({
  selector: 'app-equation-help-dialog',
  imports: [FunctionReferenceComponent],
  templateUrl: './equation-help-dialog.component.html',
  styleUrl: './equation-help-dialog.component.scss',
})
export class EquationHelpDialogComponent {
  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;

  readonly trigonometryFunctions = FUNCTION_REFERENCES.filter(
    (reference) => reference.category === 'trigonometry',
  );
  readonly numericFunctions = FUNCTION_REFERENCES.filter(
    (reference) => reference.category === 'numeric',
  );

  open(): void {
    const dialog = this.dialogRef.nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  close(): void {
    this.dialogRef.nativeElement.close();
  }
}
