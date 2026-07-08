import { Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-math-cross-help-dialog',
  templateUrl: './math-cross-help-dialog.component.html',
  styleUrl: './math-cross-help-dialog.component.scss',
})
export class MathCrossHelpDialogComponent {
  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;

  readonly howToPlay = [
    'Math Cross is an arithmetic crossword. Equations run across (left to right) and down (top to' +
      ' bottom), crossing on shared cells. Fill in every blank so every equation is true.',
    'Numbers, operators, the equals sign, and some cells are given; only the highlighted blanks are' +
      ' yours to fill. Blocked cells are empty spaces where no equation passes.',
    'Hover or focus any cell to light up the full equation it belongs to. The connected strip behind' +
      ' each equation marks where it starts and ends, and shows where two equations cross.',
    'Need a nudge? Use a hint with the lightbulb button or the H key. Each puzzle gives you three' +
      ' hints, and each one fills one correct blank.',
  ] as const;

  readonly cellColors = [
    {
      tone: 'open',
      label: 'Open',
      description: 'A blank you can fill. None of its equations are finished yet.',
    },
    {
      tone: 'valid',
      label: 'Valid',
      description: 'Filled, and every completed equation it belongs to checks out.',
    },
    {
      tone: 'conflict',
      label: 'Conflict',
      description: 'Clashes with at least one completed equation around it.',
    },
    {
      tone: 'given',
      label: 'Given',
      description: 'A number, operator, or equals sign provided by the puzzle.',
    },
    {
      tone: 'empty',
      label: 'Empty',
      description: 'A blocked cell with no equation passing through it.',
    },
  ] as const;

  readonly operations = [
    { symbol: '+', description: 'Addition.' },
    { symbol: '-', description: 'Subtraction.' },
    { symbol: '×', description: 'Multiplication. Type *, x, or ×.' },
    { symbol: '÷', description: 'Division. Type / or ÷.' },
    { symbol: '^', description: 'Exponent (power).' },
    { symbol: '√', description: 'Square root. Type sqrt or √.' },
  ] as const;

  open(): void {
    const dialog = this.dialogRef.nativeElement;
    if (dialog.open) return;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch {
      dialog.setAttribute('open', '');
    }
    if (!dialog.open) dialog.setAttribute('open', '');
  }

  close(): void {
    const dialog = this.dialogRef.nativeElement;
    dialog.close?.();
    dialog.removeAttribute('open');
  }
}
