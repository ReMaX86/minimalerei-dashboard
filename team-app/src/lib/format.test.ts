import { describe, expect, it } from 'vitest';
import { shortPlayerName } from './format';

describe('shortPlayerName', () => {
  it('shortens a two-part name to first name + last initial', () => {
    expect(shortPlayerName('Marc Rewald')).toBe('Marc R.');
  });

  it('uses only the first and last part of a multi-part name', () => {
    expect(shortPlayerName('Anna Maria Schmidt')).toBe('Anna S.');
  });

  it('leaves a single-word name unchanged', () => {
    expect(shortPlayerName('Cristiano')).toBe('Cristiano');
  });
});
