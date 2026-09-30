import { describe, expect, it } from 'vitest'
import { normalize } from './text'

describe('normalize', () => {
  it('strips case, accents, spaces and hyphens', () => {
    expect(normalize('  Above-Board ')).toBe('aboveboard')
    expect(normalize('Cliché')).toBe('cliche')
  })
})
