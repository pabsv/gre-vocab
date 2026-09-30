/** Lowercase letters only: strips accents, spaces, hyphens and apostrophes. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/**
 * The inflection an example sentence adds to its headword ("palaver" in "palavered" gives "ed"), so a
 * blanked sentence can keep the ending visible. Empty when the form is the bare headword, or when it
 * shares too little of the headword for a suffix to make sense (irregular forms such as "underwrote").
 */
export function inflectionSuffix(headword: string, form: string): string {
  const h = headword.toLowerCase()
  const f = form.toLowerCase()
  let i = 0
  while (i < h.length && i < f.length && h[i] === f[i]) i++
  const suffix = form.slice(i)
  if (i < h.length - 2 || !/^[a-z']+$/i.test(suffix)) return ''
  return suffix
}
