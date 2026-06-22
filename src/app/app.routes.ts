import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./games/game-catalog/game-catalog.component').then(
        (module) => module.GameCatalogComponent,
      ),
  },
  {
    path: 'games/equation-artillery',
    pathMatch: 'full',
    loadComponent: () =>
      import('./games/equation-artillery/equation-artillery-page.component').then(
        (module) => module.EquationArtilleryPageComponent,
      ),
  },
  {
    path: 'games/equation-artillery/multiplayer',
    loadComponent: () =>
      import('./games/equation-artillery/multiplayer/multiplayer-page.component').then(
        (module) => module.MultiplayerPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
