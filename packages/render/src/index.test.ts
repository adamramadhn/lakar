import { describe, expect, it } from 'vitest';
import { PACKAGE } from './index.js';

describe('@lakar/render', () => {
  it('mengekspor nama paket', () => {
    expect(PACKAGE).toBe('@lakar/render');
  });
});
