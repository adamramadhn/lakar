// setupFiles proyek vitest `viewer-dom`: matcher jest-dom, stub browser per tes, dan pembersihan DOM/stub sesudahnya.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { installDomStubs } from './dom';

beforeEach(() => {
  installDomStubs();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  history.replaceState(null, '', '/');
});
