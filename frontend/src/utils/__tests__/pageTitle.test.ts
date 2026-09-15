import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_TITLE, getRenpyOnlinePageTitle } from '../pageTitle';

describe('page title', () => {
  it('uses renpy.online as the default site title', () => {
    expect(DEFAULT_PAGE_TITLE).toBe('renpy.online');
    expect(getRenpyOnlinePageTitle(null)).toBe('renpy.online');
    expect(getRenpyOnlinePageTitle('')).toBe('renpy.online');
    expect(getRenpyOnlinePageTitle('   ')).toBe('renpy.online');
  });

  it('uses the project name while a project is open', () => {
    expect(getRenpyOnlinePageTitle('Mouse Detective')).toBe('Mouse Detective');
    expect(getRenpyOnlinePageTitle('  Cheese Heist  ')).toBe('Cheese Heist');
  });
});
