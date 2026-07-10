import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteFooterComponent } from './layout/site-footer/site-footer.component';
import { SiteHeaderComponent } from './layout/site-header/site-header.component';
import { SeoService } from './seo/seo.service';
import { ToastContainerComponent } from './shared/toast/toast-container.component';
import { PlayFocusService } from './shared/game-frame/play-focus.service';
import { ThemeService } from './shared/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteFooterComponent, SiteHeaderComponent, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly playFocus = inject(PlayFocusService);

  constructor(_seo: SeoService, _theme: ThemeService) {}

  @HostListener('document:keydown.escape', ['$event'])
  suspendPlayFocus(event: Event): void {
    if (!this.playFocus.active()) return;
    const overlayOpen = document.querySelector(
      'dialog[open], .sound-menu__panel:not([hidden]), .theme-menu__panel:not([hidden])',
    );
    if (overlayOpen) return;
    event.preventDefault();
    this.playFocus.suspend();
  }
}
