import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { MULTIPLAYER_CONFIG } from '../shared/multiplayer/multiplayer-config';

export interface RouteSeoData {
  readonly title: string;
  readonly description: string;
  readonly image?: string;
  readonly robots?: string;
  readonly schemaType?: 'AboutPage' | 'CollectionPage' | 'VideoGame' | 'WebPage' | 'WebSite';
}

const DEFAULT_IMAGE = '/mathwar-logo.png';
const DEFAULT_ROBOTS = 'index, follow';
const JSON_LD_ID = 'math-war-route-schema';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(MULTIPLAYER_CONFIG);

  constructor() {
    this.applyCurrentRoute();
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.applyCurrentRoute());
  }

  private applyCurrentRoute(): void {
    const seo = this.currentSeoData();
    if (!seo) return;

    const canonicalUrl = this.absoluteUrl(this.currentPath());
    const imageUrl = this.absoluteUrl(seo.image ?? DEFAULT_IMAGE);
    const robots = seo.robots ?? DEFAULT_ROBOTS;

    this.title.setTitle(seo.title);
    this.updateMeta('name', 'description', seo.description);
    this.updateMeta('name', 'robots', robots);
    this.updateMeta('property', 'og:type', seo.schemaType === 'VideoGame' ? 'game' : 'website');
    this.updateMeta('property', 'og:title', seo.title);
    this.updateMeta('property', 'og:description', seo.description);
    this.updateMeta('property', 'og:url', canonicalUrl);
    this.updateMeta('property', 'og:image', imageUrl);
    this.updateMeta('name', 'twitter:card', 'summary_large_image');
    this.updateMeta('name', 'twitter:title', seo.title);
    this.updateMeta('name', 'twitter:description', seo.description);
    this.updateMeta('name', 'twitter:image', imageUrl);
    this.updateCanonical(canonicalUrl);
    this.updateStructuredData(seo, canonicalUrl, imageUrl);
  }

  private currentSeoData(): RouteSeoData | null {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let seo: RouteSeoData | null = null;
    while (route) {
      if (route.data['seo']) seo = route.data['seo'] as RouteSeoData;
      route = route.firstChild;
    }
    return seo;
  }

  private currentPath(): string {
    const [path] = this.router.url.split(/[?#]/, 1);
    return path || '/';
  }

  private siteOrigin(): string {
    const configured = this.config.siteUrl ?? this.document.location.origin;
    return configured.replace(/\/+$/, '');
  }

  private absoluteUrl(path: string): string {
    return new URL(path, `${this.siteOrigin()}/`).toString();
  }

  private updateMeta(attribute: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attribute]: key, content }, `${attribute}='${key}'`);
  }

  private updateCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }

  private updateStructuredData(seo: RouteSeoData, url: string, image: string): void {
    this.document.getElementById(JSON_LD_ID)?.remove();
    const script = this.document.createElement('script');
    script.id = JSON_LD_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': seo.schemaType ?? 'WebPage',
      name: seo.title.replace(/ \| MathWar$/, ''),
      description: seo.description,
      url,
      image,
    });
    this.document.head.appendChild(script);
  }
}
