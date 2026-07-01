import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { buildFunctionPreview } from '../game/function-preview';

@Component({
  selector: 'app-function-preview',
  templateUrl: './function-preview.component.html',
  styleUrl: './function-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FunctionPreviewComponent {
  readonly equation = input.required<string>();
  readonly preview = computed(() => buildFunctionPreview(this.equation()));
  readonly accessibleLabel = computed(() =>
    this.preview().available
      ? `Shape preview for f(x) = ${this.equation()}`
      : 'Function shape preview unavailable',
  );
}
