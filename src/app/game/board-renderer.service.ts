import { Injectable } from '@angular/core';
import { Bullet } from '../models/bullet';
import { Player } from '../models/player';
import { Point } from '../models/point';
import { Target } from '../models/target';
import { WorldBounds } from '../models/world-bounds';
import { CanvasSize, worldToCanvas } from './coordinates';

export interface BoardScene {
  readonly player: Player;
  readonly targets: readonly Target[];
  readonly bullet: Bullet | null;
  readonly trail: readonly Point[];
}

@Injectable({ providedIn: 'root' })
export class BoardRenderer {
  draw(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    scene: BoardScene,
  ): void {
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = '#07111f';
    context.fillRect(0, 0, size.width, size.height);
    this.drawGrid(context, size, bounds);
    this.drawTrail(context, size, bounds, scene.trail);
    scene.targets.forEach((target) => this.drawTarget(context, size, bounds, target));
    this.drawPlayer(context, size, bounds, scene.player);
    if (scene.bullet) this.drawBullet(context, size, bounds, scene.bullet);
  }

  private drawGrid(context: CanvasRenderingContext2D, size: CanvasSize, bounds: WorldBounds): void {
    context.font = '11px system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let x = Math.ceil(bounds.minX); x <= Math.floor(bounds.maxX); x += 1) {
      const screen = worldToCanvas({ x, y: 0 }, bounds, size);
      context.beginPath();
      context.strokeStyle = x === 0 ? '#7891ad' : '#1c3046';
      context.lineWidth = x === 0 ? 2 : 1;
      context.moveTo(screen.x, 0);
      context.lineTo(screen.x, size.height);
      context.stroke();
      if (x !== 0) {
        context.fillStyle = '#8295aa';
        context.fillText(String(x), screen.x, worldToCanvas({ x: 0, y: 0 }, bounds, size).y + 5);
      }
    }
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (let y = Math.ceil(bounds.minY); y <= Math.floor(bounds.maxY); y += 1) {
      const screen = worldToCanvas({ x: 0, y }, bounds, size);
      context.beginPath();
      context.strokeStyle = y === 0 ? '#7891ad' : '#1c3046';
      context.lineWidth = y === 0 ? 2 : 1;
      context.moveTo(0, screen.y);
      context.lineTo(size.width, screen.y);
      context.stroke();
      if (y !== 0) {
        context.fillStyle = '#8295aa';
        context.fillText(String(y), screen.x - 5, screen.y);
      }
    }
  }

  private drawTrail(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    trail: readonly Point[],
  ): void {
    if (trail.length < 2) return;
    context.beginPath();
    const first = worldToCanvas(trail[0], bounds, size);
    context.moveTo(first.x, first.y);
    trail.slice(1).forEach((point) => {
      const screen = worldToCanvas(point, bounds, size);
      context.lineTo(screen.x, screen.y);
    });
    context.strokeStyle = '#f8c15c';
    context.lineWidth = 2.5;
    context.stroke();
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
    context.fillStyle = '#45d483';
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
    context.fillStyle = '#f45b69';
    context.fillRect(center.x - width / 2, center.y - height / 2, width, height);
    context.strokeStyle = '#ffd3d7';
    context.lineWidth = 2;
    context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
  }

  private drawBullet(
    context: CanvasRenderingContext2D,
    size: CanvasSize,
    bounds: WorldBounds,
    bullet: Bullet,
  ): void {
    const center = worldToCanvas(bullet.position, bounds, size);
    const radius = (bullet.radius * size.width) / (bounds.maxX - bounds.minX);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = '#fff0a6';
    context.fill();
  }
}
