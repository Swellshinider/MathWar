import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter, Router, Routes } from '@angular/router';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';
import { SeoService } from './seo.service';

@Component({ template: '' })
class TestPageComponent {}

const testRoutes: Routes = [
  {
    path: '',
    component: TestPageComponent,
    data: {
      seo: {
        title: 'MathWar | Math mini-games for graphing and arithmetic practice',
        description: 'Play math games.',
        schemaType: 'WebSite',
      },
    },
  },
  {
    path: 'games/equation-artillery',
    component: TestPageComponent,
    data: {
      seo: {
        title: 'Equation Artillery | MathWar graphing game',
        description: 'Shape functions to guide shots through targets.',
        image: '/images/equation-artillery.png',
        schemaType: 'VideoGame',
      },
    },
  },
  {
    path: 'account/login',
    component: TestPageComponent,
    data: {
      seo: {
        title: 'Sign in | MathWar',
        description: 'Sign in to your MathWar account.',
        robots: 'noindex, follow',
      },
    },
  },
];

describe('SeoService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        {
          provide: MULTIPLAYER_CONFIG,
          useValue: {
            serverUrl: 'https://math-war.example',
            siteUrl: 'https://math-war.example/',
          },
        },
      ],
    });
    TestBed.inject(SeoService);
  });

  afterEach(() => {
    document.head
      .querySelectorAll(
        [
          "link[rel='canonical']",
          '#math-war-route-schema',
          "meta[name='description']",
          "meta[name='robots']",
          "meta[property^='og:']",
          "meta[name^='twitter:']",
        ].join(','),
      )
      .forEach((element) => element.remove());
    TestBed.inject(Title).setTitle('');
  });

  it('sets indexable metadata and structured data for a public route', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/games/equation-artillery?room=ABCD-1234');

    const meta = TestBed.inject(Meta);
    const schema = JSON.parse(document.getElementById('math-war-route-schema')!.textContent ?? '');

    expect(TestBed.inject(Title).getTitle()).toBe('Equation Artillery | MathWar graphing game');
    expect(meta.getTag("name='description'")?.content).toBe(
      'Shape functions to guide shots through targets.',
    );
    expect(meta.getTag("name='robots'")?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href).toBe(
      'https://math-war.example/games/equation-artillery',
    );
    expect(meta.getTag("property='og:image'")?.content).toBe(
      'https://math-war.example/images/equation-artillery.png',
    );
    expect(meta.getTag("name='twitter:card'")?.content).toBe('summary_large_image');
    expect(schema).toEqual({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: 'Equation Artillery | MathWar graphing game',
      description: 'Shape functions to guide shots through targets.',
      url: 'https://math-war.example/games/equation-artillery',
      image: 'https://math-war.example/images/equation-artillery.png',
    });
  });

  it('marks private workflow routes noindex', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/account/login');

    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex, follow');
    expect(document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href).toBe(
      'https://math-war.example/account/login',
    );
  });

  it('replaces route structured data instead of appending duplicates', async () => {
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    await router.navigateByUrl('/account/login');

    const schemas = document.querySelectorAll('#math-war-route-schema');
    expect(schemas).toHaveLength(1);
    expect(JSON.parse(schemas[0].textContent ?? '')['@type']).toBe('WebPage');
  });
});
