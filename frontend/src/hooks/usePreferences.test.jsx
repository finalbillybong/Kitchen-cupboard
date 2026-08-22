import { describe, expect, it } from 'vitest';
import { migratePreferences } from './usePreferences';

describe('tap preference migration', () => {
  it.each([
    [{}, 'row'],
    [{ tapMode: 'one' }, 'row'],
    [{ tapMode: 'two' }, 'checkbox'],
    [{ tapMode: 'row' }, 'row'],
    [{ tapMode: 'checkbox' }, 'checkbox'],
    [{ tapMode: 'unexpected' }, 'row'],
  ])('migrates %j to %s', (stored, expected) => {
    expect(migratePreferences(stored).tapMode).toBe(expected);
  });
});
