import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { FocusModeService } from './shared/game-frame/focus-mode.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the site chrome outside focus mode', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-site-header')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-footer')).not.toBeNull();
  });

  it('removes the site chrome while a game is focused', () => {
    const fixture = TestBed.createComponent(App);
    const focusMode = TestBed.inject(FocusModeService);
    fixture.detectChanges();

    focusMode.enter();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-site-header')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-footer')).toBeNull();
  });
});
