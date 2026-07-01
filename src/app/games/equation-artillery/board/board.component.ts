import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall } from '../models/wall';
import { WORLD_BOUNDS } from '../models/world-bounds';
import { BoardCharacter, BoardRenderer } from '../game/board-renderer.service';
import { canvasToWorld } from '../game/coordinates';

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent implements AfterViewInit, OnDestroy {
  readonly player = input.required<Player>();
  readonly characters = input<readonly BoardCharacter[]>([]);
  readonly targets = input.required<readonly Target[]>();
  readonly walls = input.required<readonly Wall[]>();
  readonly bullet = input<Bullet | null>(null);
  readonly previewTrail = input<readonly Point[]>([]);
  readonly trail = input<readonly Point[]>([]);
  readonly visibleTrailPointCount = input<number | null>(null);
  readonly movementEnabled = input(false);
  readonly pointSelectionEnabled = input(false);
  readonly boardPoint = output<Point>();
  readonly move = output<Point>();
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly renderer = inject(BoardRenderer);
  private resizeObserver: ResizeObserver | null = null;
  private frameId: number | null = null;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;
  private lastRatio = 0;

  constructor() {
    effect(() => {
      this.player();
      this.characters();
      this.targets();
      this.walls();
      this.bullet();
      this.previewTrail();
      this.trail();
      this.visibleTrailPointCount();
      this.requestDraw();
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.requestDraw());
    this.resizeObserver.observe(this.canvasRef.nativeElement);
    this.requestDraw();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
  }

  handlePointer(event: PointerEvent): void {
    if (!this.movementEnabled() && !this.pointSelectionEnabled()) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const position = canvasToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      WORLD_BOUNDS,
      { width: rect.width, height: rect.height },
    );
    const radius = this.player().radius;
    const point = {
      x: Math.min(WORLD_BOUNDS.maxX - radius, Math.max(WORLD_BOUNDS.minX + radius, position.x)),
      y: Math.min(WORLD_BOUNDS.maxY - radius, Math.max(WORLD_BOUNDS.minY + radius, position.y)),
    };
    if (this.pointSelectionEnabled()) this.boardPoint.emit(point);
    if (this.movementEnabled()) this.move.emit(point);
  }

  private requestDraw(): void {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.draw();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(width * ratio);
    const canvasHeight = Math.round(height * ratio);
    if (
      canvas.width !== canvasWidth ||
      canvas.height !== canvasHeight ||
      this.lastCanvasWidth !== width ||
      this.lastCanvasHeight !== height ||
      this.lastRatio !== ratio
    ) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      this.lastCanvasWidth = width;
      this.lastCanvasHeight = height;
      this.lastRatio = ratio;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.renderer.draw(context, { width, height }, WORLD_BOUNDS, {
      player: this.player(),
      characters: this.characters(),
      targets: this.targets(),
      walls: this.walls(),
      bullet: this.bullet(),
      previewTrail: this.previewTrail(),
      trail: this.trail(),
      visibleTrailPointCount: this.visibleTrailPointCount(),
    });
  }
}
