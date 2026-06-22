import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the site chrome without a Games navigation item', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.skip-link')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-header')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-footer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-site-header nav')).toBeNull();
  });
});
