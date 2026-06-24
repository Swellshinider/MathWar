import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';
import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall } from '../models/wall';
import { WORLD_BOUNDS } from '../models/world-bounds';
import { BoardCharacter, BoardRenderer } from '../game/board-renderer.service';

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent implements AfterViewInit, OnDestroy {
  readonly player = input.required<Player>();
  readonly characters = input<readonly BoardCharacter[]>([]);
  readonly targets = input.required<readonly Target[]>();
  readonly walls = input.required<readonly Wall[]>();
  readonly bullet = input<Bullet | null>(null);
  readonly trail = input<readonly Point[]>([]);
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly renderer = inject(BoardRenderer);
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      this.player();
      this.characters();
      this.targets();
      this.walls();
      this.bullet();
      this.trail();
      queueMicrotask(() => this.draw());
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvasRef.nativeElement);
    this.draw();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.renderer.draw(context, { width, height }, WORLD_BOUNDS, {
      player: this.player(),
      characters: this.characters(),
      targets: this.targets(),
      walls: this.walls(),
      bullet: this.bullet(),
      trail: this.trail(),
    });
  }
}
