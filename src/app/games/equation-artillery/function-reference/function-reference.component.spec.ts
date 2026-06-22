import { TestBed } from '@angular/core/testing';
import { FUNCTION_REFERENCES } from '../game/expression-catalog';
import { FunctionReferenceComponent } from './function-reference.component';

describe('FunctionReferenceComponent', () => {
  it('renders every supplied function and optional syntax guidance', async () => {
    await TestBed.configureTestingModule({
      imports: [FunctionReferenceComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(FunctionReferenceComponent);
    fixture.componentRef.setInput('title', 'All functions');
    fixture.componentRef.setInput('functions', FUNCTION_REFERENCES);
    fixture.componentRef.setInput('showSyntax', true);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    FUNCTION_REFERENCES.forEach((reference) => expect(text).toContain(reference.syntax));
    expect(text).toContain('Constants');
    expect(text).toContain('Angles use radians');
  });
});
