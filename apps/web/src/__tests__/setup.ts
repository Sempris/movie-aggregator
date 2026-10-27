import { vi } from 'vitest';

// Report reduced motion so tweened numbers settle immediately in tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
