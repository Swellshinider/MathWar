import { Component, input } from '@angular/core';
import {
  CONSTANT_REFERENCES,
  FunctionReference,
  OPERATOR_REFERENCES,
} from '../game/expression-catalog';

@Component({
  selector: 'app-function-reference',
  templateUrl: './function-reference.component.html',
  styleUrl: './function-reference.component.scss',
})
export class FunctionReferenceComponent {
  readonly title = input.required<string>();
  readonly functions = input.required<readonly FunctionReference[]>();
  readonly showSyntax = input(false);
  readonly constants = CONSTANT_REFERENCES;
  readonly operators = OPERATOR_REFERENCES;
}
