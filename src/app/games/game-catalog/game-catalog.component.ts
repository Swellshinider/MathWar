import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAMES } from '../games';

@Component({
  selector: 'app-game-catalog',
  imports: [RouterLink],
  templateUrl: './game-catalog.component.html',
  styleUrl: './game-catalog.component.scss',
})
export class GameCatalogComponent {
  protected readonly games = GAMES;
}
