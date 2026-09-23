import { describe, expect, it } from 'vitest'
import { getEntry } from '../data/words'
import { checkTyped, forms, letterHint, normalize, osa } from './grade'

describe('normalize and forms', () => {
  it('strips case, accents, spaces and hyphens', () => {
    expect(normalize('  Above-Board ')).toBe('aboveboard')
    expect(normalize('Cliché')).toBe('cliche')
  })

  it('accepts inflections', () => {
    expect(forms('abjure')).toContain('abjured')
    expect(forms('abjure')).toContain('abjuring')
    expect(forms('mollify')).toContain('mollified')
    expect(forms('flag')).toContain('flagged')
    expect(forms('behooves')).toContain('behoove')
  })

  it('computes swap-aware distance', () => {
    expect(osa('abate', 'abtae')).toBe(1)
    expect(osa('kitten', 'sitting')).toBe(3)
  })
})

describe('checkTyped', () => {
  it('accepts the word and its inflections', () => {
    expect(checkTyped('Abstruse', getEntry('abstruse')).kind).toBe('correct')
    expect(checkTyped('abjured', getEntry('abjure')).kind).toBe('correct')
  })

  it('accepts a single typo on longer words', () => {
    expect(checkTyped('abstruce', getEntry('abstruse')).kind).toBe('typo')
    expect(checkTyped('obsequius', getEntry('obsequious')).kind).toBe('typo')
    expect(checkTyped('perfunctroy', getEntry('perfunctory')).kind).toBe('typo')
  })

  it('rejects a near miss that is another deck word', () => {
    expect(checkTyped('arrant', getEntry('errant'))).toEqual({ kind: 'confusion', entryId: 'arrant' })
    // one edit from errant but also one edit from arrant: too ambiguous to call a typo
    expect(checkTyped('irrant', getEntry('errant')).kind).toBe('wrong')
  })

  it('treats a same-meaning deck word as a synonym', () => {
    const v = checkTyped('transitory', getEntry('transient'))
    expect(v).toEqual({ kind: 'synonym', entryId: 'transitory' })
  })

  it('rejects wrong and empty answers', () => {
    expect(checkTyped('banana', getEntry('abstruse')).kind).toBe('wrong')
    expect(checkTyped('   ', getEntry('abstruse')).kind).toBe('empty')
    expect(checkTyped('acm', getEntry('acme')).kind).toBe('wrong')
  })

  it('builds letter hints', () => {
    expect(letterHint('abate')).toBe('a _ _ _ _')
  })
})
