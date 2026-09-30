import { describe, expect, it } from 'vitest'
import { inflectionSuffix, normalize } from './text'

describe('normalize', () => {
  it('strips case, accents, spaces and hyphens', () => {
    expect(normalize('  Above-Board ')).toBe('aboveboard')
    expect(normalize('Cliché')).toBe('cliche')
  })
})

describe('inflectionSuffix', () => {
  it('returns the ending an inflected form adds', () => {
    expect(inflectionSuffix('palaver', 'palavered')).toBe('ed')
    expect(inflectionSuffix('begrudge', 'Begrudged')).toBe('d')
    expect(inflectionSuffix('abet', 'abetted')).toBe('ted')
    expect(inflectionSuffix('mollify', 'mollified')).toBe('ied')
  })

  it('is empty for the bare headword or an irregular form', () => {
    expect(inflectionSuffix('palaver', 'palaver')).toBe('')
    expect(inflectionSuffix('underwrite', 'underwrote')).toBe('')
    expect(inflectionSuffix('check', 'unchecked')).toBe('')
  })
})
