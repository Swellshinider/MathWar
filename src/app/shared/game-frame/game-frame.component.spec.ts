import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GameFrameComponent } from './game-frame.component';
import { PlayFocusService } from './play-focus.service';

@Component({
  imports: [GameFrameComponent],
  template: `
    <app-game-frame
      gameId="equation-artillery"
      eyebrow="Topic"
      title="Game"
      objective="Objective"
    >
      <button gameActions type="button">Help</button>
    </app-game-frame>
  `,
})
class GameFrameHostComponent {}

describe('GameFrameComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameFrameComponent],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(GameFrameComponent);
    fixture.componentRef.setInput('gameId', 'equation-artillery');
    fixture.componentRef.setInput('eyebrow', 'Functions and graphs');
    fixture.componentRef.setInput('title', 'Equation Artillery');
    fixture.componentRef.setInput('objective', 'Destroy every target.');
    fixture.detectChanges();
    return fixture;
  }

  it('renders the game introduction without focus mode controls', () => {
    const fixture = createFixture();

    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Equation Artillery');
    expect(fixture.nativeElement.textContent).toContain('Functions and graphs');
    expect(fixture.nativeElement.textContent).toContain('Destroy every target.');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('supports a wider game layout', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('wide', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('article').classList).toContain('wide');
  });

  it('projects game actions into the introduction', () => {
    const fixture = TestBed.createComponent(GameFrameHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.intro-actions button').textContent).toContain(
      'Help',
    );
  });

  it('automatically enters focus while gameplay is active and clears it on destroy', () => {
    const fixture = createFixture();
    const playFocus = TestBed.inject(PlayFocusService);

    fixture.componentRef.setInput('playing', true);
    fixture.detectChanges();

    expect(playFocus.active()).toBe(true);
    expect(fixture.nativeElement.querySelector('article').classList).toContain(
      'game-frame--focused',
    );

    fixture.destroy();
    expect(playFocus.active()).toBe(false);
  });
});
