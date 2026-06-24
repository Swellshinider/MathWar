import { Injectable } from '@angular/core';
import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { Wall, WallPiece } from '../models/wall';
import { WorldBounds } from '../models/world-bounds';
import { CanvasSize, worldToCanvas } from './coordinates';
import { BOARD_PALETTE } from './board-palette';

export interface BoardScene {
  readonly player: Player;
  readonly targets: readonly Target[];
  readonly walls: readonly Wall[];
  readonly bullet: Bullet | null;
  readonly trail: readonly Point[];
}

@Injectable({ providedIn: 'root' })
export class BoardRenderer {
  private motionQuery?: MediaQueryList;

  draw(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    scene: BoardScene,
  ): void {
    const glow = this.allowsGlow();
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = BOARD_PALETTE.background;
    context.fillRect(0, 0, size.width, size.height);
    this.drawGrid(context, size, bounds);
    this.drawTrail(context, size, bounds, scene.trail, glow);
    scene.walls.forEach((wall) =>
      wall.pieces.forEach((piece) => this.drawWallPiece(context, size, bounds, piece)),
    );
    scene.targets.forEach((target) => this.drawTarget(context, size, bounds, target));
    this.drawPlayer(context, size, bounds, scene.player);
    if (scene.bullet) this.drawBullet(context, size, bounds, scene.bullet, glow);
  }

  private allowsGlow(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    if (!this.motionQuery) {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    return !this.motionQuery.matches;
  }

  private drawGrid(context: CanvasRenderingContext2D, size: CanvasSize, bounds: WorldBounds): void {
    context.font = '11px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let x = Math.ceil(bounds.minX); x <= Math.floor(bounds.maxX); x += 1) {
      const screen = worldToCanvas({ x, y: 0 }, bounds, size);
      context.beginPath();
      context.strokeStyle = x === 0 ? BOARD_PALETTE.gridAxis : BOARD_PALETTE.gridMinor;
      context.lineWidth = x === 0 ? 2 : 1;
      context.moveTo(screen.x, 0);
      context.lineTo(screen.x, size.height);
      context.stroke();
      if (x !== 0) {
        context.fillStyle = BOARD_PALETTE.gridLabel;
        context.fillText(String(x), screen.x, worldToCanvas({ x: 0, y: 0 }, bounds, size).y + 5);
      }
    }
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (let y = Math.ceil(bounds.minY); y <= Math.floor(bounds.maxY); y += 1) {
      const screen = worldToCanvas({ x: 0, y }, bounds, size);
      context.beginPath();
      context.strokeStyle = y === 0 ? BOARD_PALETTE.gridAxis : BOARD_PALETTE.gridMinor;
      context.lineWidth = y === 0 ? 2 : 1;
      context.moveTo(0, screen.y);
      context.lineTo(size.width, screen.y);
      context.stroke();
      if (y !== 0) {
        context.fillStyle = BOARD_PALETTE.gridLabel;
        context.fillText(String(y), screen.x - 5, screen.y);
      }
    }
  }

  private drawTrail(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    trail: readonly Point[],
    glow: boolean,
  ): void {
    if (trail.length < 2) return;
    context.beginPath();
    const first = worldToCanvas(trail[0], bounds, size);
    context.moveTo(first.x, first.y);
    trail.slice(1).forEach((point) => {
      const screen = worldToCanvas(point, bounds, size);
      context.lineTo(screen.x, screen.y);
    });
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = BOARD_PALETTE.trail;
    context.lineWidth = 2.5;
    if (glow) {
      context.shadowColor = BOARD_PALETTE.trailGlow;
      context.shadowBlur = 8;
    }
    context.stroke();
    context.shadowBlur = 0;
  }

  private drawPlayer(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    player: Player,
  ): void {
    const center = worldToCanvas(player.position, bounds, size);
    const radius = (player.radius * size.width) / (bounds.maxX - bounds.minX);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = BOARD_PALETTE.player;
    context.fill();
  }

  private drawTarget(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    target: Target,
  ): void {
    const center = worldToCanvas(target.center, bounds, size);
    const width = (target.width * size.width) / (bounds.maxX - bounds.minX);
    const height = (target.height * size.height) / (bounds.maxY - bounds.minY);
    context.fillStyle = BOARD_PALETTE.target;
    context.fillRect(center.x - width / 2, center.y - height / 2, width, height);
    context.strokeStyle = BOARD_PALETTE.targetBorder;
    context.lineWidth = 2;
    context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
  }

  private drawWallPiece(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    piece: WallPiece,
  ): void {
    const center = worldToCanvas(piece.center, bounds, size);
    const width = (piece.size * size.width) / (bounds.maxX - bounds.minX);
    const height = (piece.size * size.height) / (bounds.maxY - bounds.minY);
    context.fillStyle = BOARD_PALETTE.wall;
    context.fillRect(center.x - width / 2, center.y - height / 2, width, height);
    context.strokeStyle = BOARD_PALETTE.wallBorder;
    context.lineWidth = 1;
    context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
  }

  private drawBullet(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    bullet: Bullet,
    glow: boolean,
  ): void {
    const center = worldToCanvas(bullet.position, bounds, size);
    const radius = (bullet.radius * size.width) / (bounds.maxX - bounds.minX);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = BOARD_PALETTE.bullet;
    if (glow) {
      context.shadowColor = BOARD_PALETTE.bulletGlow;
      context.shadowBlur = 10;
    }
    context.fill();
    context.shadowBlur = 0;
  }
}
