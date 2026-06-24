import { TestBed } from '@angular/core/testing';
import { EquationArtilleryAudioService } from '../game/audio.service';
import { SoundSettingsDialogComponent } from './sound-settings-dialog.component';

describe('SoundSettingsDialogComponent', () => {
  const audio = {
    muted: vi.fn(() => false),
    volume: vi.fn(() => 0.75),
    resume: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [SoundSettingsDialogComponent],
      providers: [{ provide: EquationArtilleryAudioService, useValue: audio }],
    }).compileComponents();
  });

  it('renders mute and volume controls', () => {
    const fixture = TestBed.createComponent(SoundSettingsDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Sound');
    expect(text).toContain('Mute sound');
    expect(text).toContain('Volume');
    expect(text).toContain('75%');
  });

  it('opens and closes the native modal', () => {
    const fixture = TestBed.createComponent(SoundSettingsDialogComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const showModal = vi.fn();
    const close = vi.fn();
    dialog.showModal = showModal;
    dialog.close = close;

    fixture.componentInstance.open();
    fixture.componentInstance.close();

    expect(audio.resume).toHaveBeenCalledOnce();
    expect(showModal).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('updates audio settings from controls', () => {
    const fixture = TestBed.createComponent(SoundSettingsDialogComponent);

    fixture.componentInstance.setMuted(true);
    fixture.componentInstance.setVolume('0.4');

    expect(audio.setMuted).toHaveBeenCalledWith(true);
    expect(audio.setVolume).toHaveBeenCalledWith(0.4);
  });
});
