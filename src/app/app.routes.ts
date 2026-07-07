import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'MathWar | Math mini-games for graphing and arithmetic practice',
        description:
          'Play MathWar, an open-source collection of math mini-games for graphing functions, solving formulas, and practicing arithmetic.',
        schemaType: 'WebSite',
      },
    },
    loadComponent: () =>
      import('./games/game-catalog/game-catalog.component').then(
        (module) => module.GameCatalogComponent,
      ),
  },
  {
    path: 'about',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'About MathWar | Open-source math mini-games',
        description:
          'Learn about MathWar, an open-source project with browser-based mini-games for practicing mathematical ideas.',
        schemaType: 'AboutPage',
      },
    },
    loadComponent: () =>
      import('./about/about-page.component').then((module) => module.AboutPageComponent),
  },
  {
    path: 'account/login',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Sign in | MathWar',
        description: 'Sign in to your MathWar account.',
        robots: 'noindex, follow',
      },
    },
    loadComponent: () =>
      import('./account/login-page.component').then((module) => module.LoginPageComponent),
  },
  {
    path: 'account/create',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Create account | MathWar',
        description: 'Create a MathWar account.',
        robots: 'noindex, follow',
      },
    },
    loadComponent: () =>
      import('./account/create-account-page.component').then(
        (module) => module.CreateAccountPageComponent,
      ),
  },
  {
    path: 'account/settings',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Account settings | MathWar',
        description: 'Manage your MathWar account settings.',
        robots: 'noindex, follow',
      },
    },
    loadComponent: () =>
      import('./account/account-settings-page.component').then(
        (module) => module.AccountSettingsPageComponent,
      ),
  },
  {
    path: 'leaderboard/:gameId',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Formula Frenzy Leaderboard | MathWar',
        description:
          'View Formula Frenzy leaderboard rankings and compare MathWar arithmetic sprint scores.',
        schemaType: 'CollectionPage',
      },
    },
    loadComponent: () =>
      import('./leaderboard/leaderboard-page.component').then(
        (module) => module.LeaderboardPageComponent,
      ),
  },
  {
    path: 'games/equation-artillery',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Equation Artillery | MathWar graphing game',
        description:
          'Play Equation Artillery, a MathWar graphing game where you shape functions to guide shots through targets.',
        image: '/images/equation-artillery.png',
        schemaType: 'VideoGame',
      },
    },
    loadComponent: () =>
      import('./games/equation-artillery/equation-artillery-page.component').then(
        (module) => module.EquationArtilleryPageComponent,
      ),
  },
  {
    path: 'games/equation-artillery/multiplayer',
    data: {
      seo: {
        title: 'Equation Artillery Multiplayer | MathWar',
        description: 'Join an Equation Artillery multiplayer room.',
        robots: 'noindex, follow',
      },
    },
    loadComponent: () =>
      import('./games/equation-artillery/multiplayer/multiplayer-page.component').then(
        (module) => module.MultiplayerPageComponent,
      ),
  },
  {
    path: 'games/formula-frenzy',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Formula Frenzy | MathWar arithmetic game',
        description:
          'Play Formula Frenzy, a fast arithmetic sprint where formulas get harder as your score climbs.',
        image: '/images/formula-frenzy.png',
        schemaType: 'VideoGame',
      },
    },
    loadComponent: () =>
      import('./games/formula-frenzy/formula-frenzy-page.component').then(
        (module) => module.FormulaFrenzyPageComponent,
      ),
  },
  {
    path: 'games/formula-frenzy/multiplayer',
    data: {
      seo: {
        title: 'Formula Frenzy Multiplayer | MathWar',
        description: 'Join a Formula Frenzy multiplayer sprint room.',
        robots: 'noindex, follow',
      },
    },
    loadComponent: () =>
      import('./games/formula-frenzy/multiplayer/formula-frenzy-multiplayer-page.component').then(
        (module) => module.FormulaFrenzyMultiplayerPageComponent,
      ),
  },
  {
    path: 'games/math-cross',
    pathMatch: 'full',
    data: {
      seo: {
        title: 'Math Cross | MathWar equation crossword game',
        description:
          'Play Math Cross, a MathWar puzzle game where number and operator blanks complete crossed equations.',
        image: '/images/math-cross.png',
        schemaType: 'VideoGame',
      },
    },
    loadComponent: () =>
      import('./games/math-cross/math-cross-page.component').then(
        (module) => module.MathCrossPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
