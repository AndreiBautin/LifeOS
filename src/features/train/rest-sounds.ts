import type { RestCue } from '@/domain/programs/rest-cues'

let context: AudioContext | undefined

/**
 * Wakes the audio on a tap. iOS starts an `AudioContext` suspended and
 * only resumes one inside a user gesture — and the rest timer starts on
 * the tap that logs a set, so that is where this is called. Anywhere
 * without Web Audio it does nothing.
 */
export function primeRestSounds(): void {
  if (typeof AudioContext === 'undefined') return
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
}

/**
 * Plays a cue, synthesised rather than loaded: a short sine blip for a
 * tick and two rising notes for the end. No audio file ships, so there is
 * nothing to cache or fetch, and a muted phone stays muted.
 */
export function playRestCue(cue: RestCue): void {
  if (context?.state !== 'running') return
  const at = context.currentTime
  if (cue === 'tick') {
    blip(context, 880, at, 0.08, 0.18)
    return
  }
  blip(context, 660, at, 0.16, 0.25)
  blip(context, 990, at + 0.17, 0.32, 0.25)
}

function blip(audio: AudioContext, hz: number, at: number, length: number, peak: number) {
  const tone = audio.createOscillator()
  const level = audio.createGain()
  tone.type = 'sine'
  tone.frequency.value = hz
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(peak, at + 0.01)
  level.gain.exponentialRampToValueAtTime(0.0001, at + length)
  tone.connect(level).connect(audio.destination)
  tone.start(at)
  tone.stop(at + length + 0.02)
}
