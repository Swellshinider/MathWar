import { Component, computed, input } from '@angular/core';

export type FormulaPromptPart =
  | { readonly kind: 'fraction'; readonly numerator: string; readonly denominator: string }
  | { readonly kind: 'operator'; readonly value: string; readonly multiply: boolean }
  | { readonly kind: 'text'; readonly value: string };

const TOKEN_PATTERN = /√\d+|∛\d+|\d+[²³]?|\?\?|[()+\-*/]/g;

@Component({
  selector: 'app-formula-prompt',
  template: `
    <span class="formula-prompt" [attr.aria-label]="prompt()">
      <span class="formula-prompt__visual" aria-hidden="true">
        @for (part of parts(); track $index) {
          @if (part.kind === 'fraction') {
            <span class="formula-fraction">
              <span class="formula-fraction__numerator">{{ part.numerator }}</span>
              <span class="formula-fraction__denominator">{{ part.denominator }}</span>
            </span>
          } @else if (part.kind === 'operator') {
            <span class="formula-operator" [class.formula-operator--multiply]="part.multiply">
              {{ part.value }}
            </span>
          } @else {
            <span>{{ part.value }}</span>
          }
        }
      </span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      max-width: 100%;
    }

    .formula-prompt {
      display: inline-block;
      max-width: 100%;
    }

    .formula-prompt__visual {
      display: inline-flex;
      max-width: 100%;
      align-items: center;
      justify-content: center;
      gap: 0.18em;
      flex-wrap: wrap;
    }

    .formula-fraction {
      display: inline-grid;
      align-items: center;
      justify-items: center;
      min-width: 0.9em;
      line-height: 0.9;
      vertical-align: middle;
    }

    .formula-fraction__numerator,
    .formula-fraction__denominator {
      display: block;
      min-width: 100%;
      padding-inline: 0.12em;
      text-align: center;
    }

    .formula-fraction__numerator {
      padding-bottom: 0.08em;
      border-bottom: 0.06em solid currentColor;
    }

    .formula-fraction__denominator {
      padding-top: 0.08em;
    }

    .formula-operator {
      display: inline-block;
      line-height: 1;
    }

    .formula-operator--multiply {
      font-size: 0.74em;
      transform: translateY(-0.04em);
    }
  `,
})
export class FormulaPromptComponent {
  readonly prompt = input.required<string>();
  readonly parts = computed(() => renderFormulaPrompt(this.prompt()));
}

export function renderFormulaPrompt(prompt: string): readonly FormulaPromptPart[] {
  const tokens = prompt.match(TOKEN_PATTERN);
  if (!tokens || tokens.join('') !== prompt.replace(/\s+/g, '')) {
    return [{ kind: 'text', value: prompt }];
  }

  const parts: FormulaPromptPart[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '/' && parts.length > 0 && tokens[index + 1]) {
      const numerator = parts.pop();
      const denominator = tokens[index + 1];
      if (numerator?.kind === 'text' && isFractionOperand(numerator.value)) {
        parts.push({ kind: 'fraction', numerator: numerator.value, denominator });
        index += 1;
        continue;
      }
      if (numerator) parts.push(numerator);
    }

    if (token === '*') {
      parts.push({ kind: 'operator', value: '×', multiply: true });
    } else if (isOperator(token)) {
      parts.push({ kind: 'operator', value: token, multiply: false });
    } else {
      parts.push({ kind: 'text', value: token });
    }
  }

  return parts;
}

function isFractionOperand(token: string): boolean {
  return /^\d+$/.test(token);
}

function isOperator(token: string): boolean {
  return token === '+' || token === '-' || token === '(' || token === ')';
}
