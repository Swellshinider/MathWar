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
    path: 'about',
    pathMatch: 'full',
    loadComponent: () =>
      import('./about/about-page.component').then((module) => module.AboutPageComponent),
  },
  {
    path: 'account/login',
    pathMatch: 'full',
    loadComponent: () =>
      import('./account/login-page.component').then((module) => module.LoginPageComponent),
  },
  {
    path: 'account/create',
    pathMatch: 'full',
    loadComponent: () =>
      import('./account/create-account-page.component').then(
        (module) => module.CreateAccountPageComponent,
      ),
  },
  {
    path: 'account/settings',
    pathMatch: 'full',
    loadComponent: () =>
      import('./account/account-settings-page.component').then(
        (module) => module.AccountSettingsPageComponent,
      ),
  },
  {
    path: 'leaderboard/:gameId',
    pathMatch: 'full',
    loadComponent: () =>
      import('./leaderboard/leaderboard-page.component').then(
        (module) => module.LeaderboardPageComponent,
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
  {
    path: 'games/formula-frenzy',
    pathMatch: 'full',
    loadComponent: () =>
      import('./games/formula-frenzy/formula-frenzy-page.component').then(
        (module) => module.FormulaFrenzyPageComponent,
      ),
  },
  {
    path: 'games/formula-frenzy/multiplayer',
    loadComponent: () =>
      import('./games/formula-frenzy/multiplayer/formula-frenzy-multiplayer-page.component').then(
        (module) => module.FormulaFrenzyMultiplayerPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
