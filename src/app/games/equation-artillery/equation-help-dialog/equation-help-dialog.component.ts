import { Component, ElementRef, ViewChild, computed, signal } from '@angular/core';
import {
  CONSTANT_REFERENCES,
  FUNCTION_REFERENCES,
  OPERATOR_REFERENCES,
} from '../game/expression-catalog';

interface ReferenceEntry {
  readonly syntax: string;
  readonly description: string;
  readonly name?: string;
  readonly evaluatorName?: string;
}

interface BaseHelpSection {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

interface ContentHelpSection extends BaseHelpSection {
  readonly kind: 'content';
  readonly paragraphs: readonly string[];
}

interface ReferenceHelpSection extends BaseHelpSection {
  readonly kind: 'references';
  readonly entries: readonly ReferenceEntry[];
}

type HelpSection = ContentHelpSection | ReferenceHelpSection;

@Component({
  selector: 'app-equation-help-dialog',
  templateUrl: './equation-help-dialog.component.html',
  styleUrl: './equation-help-dialog.component.scss',
})
export class EquationHelpDialogComponent {
  @ViewChild('dialog', { static: true }) private dialogRef!: ElementRef<HTMLDialogElement>;

  readonly searchQuery = signal('');
  private readonly expandedSectionIds = signal(new Set(['how-to-play', 'syntax']));
  private readonly sections: readonly HelpSection[] = [
    {
      id: 'how-to-play',
      title: 'How to play',
      summary: 'How fired functions become shot paths.',
      kind: 'content',
      paragraphs: [
        'Type a function and fire. The shot follows the same trajectory as the function graph.',
        'The shot still has to start at your soldier. Because the soldier may not stand on the function you typed, the game translates the graph vertically by adding a constant. If you type f(x) = x, the actual shot path is f(x) = x + c.',
        'This translation means any constant you add is ignored by the game. For example, y = 2x + 3, and y = 2x produce the same in-game trajectory.',
        'The board has limited x and y ranges, while functions can become large quickly. For example, y = x^2 reaches 100 when x is 10, so it can hit the ceiling fast and may look almost vertical when your soldier starts far from the origin.',
        'Scale steep functions to make them useful. For example, y = (x^2)/50 produces a more controllable parabola.',
      ],
    },
    {
      id: 'syntax',
      title: 'Constants and operators',
      summary: 'Values and symbols available in every equation.',
      kind: 'references',
      entries: [...CONSTANT_REFERENCES, ...OPERATOR_REFERENCES],
    },
    {
      id: 'trigonometry',
      title: 'Trigonometric functions',
      summary: 'Wave, angle, and hyperbolic functions.',
      kind: 'references',
      entries: FUNCTION_REFERENCES.filter((reference) => reference.category === 'trigonometry'),
    },
    {
      id: 'numeric',
      title: 'Numeric functions',
      summary: 'Roots, logs, rounding, signs, and exponential curves.',
      kind: 'references',
      entries: FUNCTION_REFERENCES.filter((reference) => reference.category === 'numeric'),
    },
  ];

  readonly visibleSections = computed(() => {
    const query = normalizeSearch(this.searchQuery());
    return this.sections
      .map((section) => this.filterSection(section, query))
      .filter((section): section is HelpSection => section !== null);
  });

  open(): void {
    const dialog = this.dialogRef.nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  close(): void {
    this.dialogRef.nativeElement.close();
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  isSectionOpen(sectionId: string): boolean {
    return this.searchQuery().trim().length > 0 || this.expandedSectionIds().has(sectionId);
  }

  toggleSection(sectionId: string): void {
    this.expandedSectionIds.update((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  private filterSection(section: HelpSection, query: string): HelpSection | null {
    if (!query) return section;
    const sectionMatch = matchesSearch(`${section.title} ${section.summary}`, query);

    if (section.kind === 'content') {
      const contentMatch = section.paragraphs.some((paragraph) => matchesSearch(paragraph, query));
      return sectionMatch || contentMatch ? section : null;
    }

    const entries = sectionMatch
      ? section.entries
      : section.entries.filter((entry) =>
          matchesSearch(
            `${entry.syntax} ${entry.description} ${entry.name ?? ''} ${entry.evaluatorName ?? ''}`,
            query,
          ),
        );
    return entries.length > 0 ? { ...section, entries } : null;
  }
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearch(value: string, query: string): boolean {
  return normalizeSearch(value).includes(query);
}
