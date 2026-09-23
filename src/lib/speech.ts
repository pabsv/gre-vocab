/** Pronounces a word with the browser's speech engine (works offline on most devices). */
let voice: SpeechSynthesisVoice | null = null
const PREFERRED = ['Google US English', 'Samantha', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Daniel']

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
  for (const name of PREFERRED) {
    const v = voices.find((x) => x.name.includes(name))
    if (v) return v
  }
  return voices.find((v) => v.lang === 'en-US') ?? voices[0] ?? null
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string) {
  if (!canSpeak()) return
  voice ??= pickVoice()
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.9
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
}

if (canSpeak()) {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = pickVoice()
  })
}
