import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let dark = true;
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
  let storage: Map<string, string>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    delete document.documentElement.dataset['theme'];
    document.documentElement.style.colorScheme = '';
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() =>
        ({
          get matches() {
            return dark;
          },
          media: '(prefers-color-scheme: dark)',
          onchange: null,
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            mediaListener = listener;
          },
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    dark = true;
    mediaListener = null;
  });

  it('uses the system preference until the player selects a theme', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('system');
    expect(service.resolvedTheme()).toBe('dark');

    dark = false;
    mediaListener?.({ matches: false } as MediaQueryListEvent);

    expect(service.resolvedTheme()).toBe('light');
  });

  it('persists and resolves an explicit preference', () => {
    const service = TestBed.inject(ThemeService);

    service.setPreference('light');

    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
    expect(storage.get('math-war.theme')).toBe('light');
  });

  it('restores a saved preference', () => {
    storage.set('math-war.theme', 'light');

    const service = TestBed.inject(ThemeService);

    expect(service.preference()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
  });
});
