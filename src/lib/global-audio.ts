/**
 * Global audio manager — ensures only one audio element plays at a time.
 *
 * Usage:
 *   1. Add `onPause={() => setPlaying(false)}` on your <audio> element
 *   2. Call `claimAudio(audioRef.current)` right before `audio.play()`
 *
 * When a new audio claims playback, the previous one is paused,
 * which fires its `onPause` handler and updates component state.
 */

let current: HTMLAudioElement | null = null;

export function claimAudio(audio: HTMLAudioElement) {
  if (current && current !== audio) {
    current.pause();
  }
  current = audio;
}

export function releaseAudio(audio: HTMLAudioElement) {
  if (current === audio) current = null;
}
