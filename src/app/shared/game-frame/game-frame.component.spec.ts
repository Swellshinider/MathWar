import { TestBed } from '@angular/core/testing';
import { GameFrameComponent } from './game-frame.component';

describe('GameFrameComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameFrameComponent],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(GameFrameComponent);
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
});
