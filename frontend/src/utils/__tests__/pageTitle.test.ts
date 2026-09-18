import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_TITLE, getPlotmioPageTitle } from '../pageTitle';

describe('page title', () => {
  it('uses Plotmio as the default site title', () => {
    expect(DEFAULT_PAGE_TITLE).toBe('Plotmio');
    expect(getPlotmioPageTitle(null)).toBe('Plotmio');
    expect(getPlotmioPageTitle('')).toBe('Plotmio');
    expect(getPlotmioPageTitle('   ')).toBe('Plotmio');
  });

  it('uses the project name while a project is open', () => {
    expect(getPlotmioPageTitle('Mouse Detective')).toBe('Mouse Detective · Plotmio');
    expect(getPlotmioPageTitle('  Cheese Heist  ')).toBe('Cheese Heist · Plotmio');
  });
});
