let ctx: AudioContext | null = null;
let muted = false;
let whoosh: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let noise: AudioBuffer | null = null;

export function setArcadeMuted(next: boolean) {
  muted = next;
  if (next) stopWhoosh();
}

function context() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return null;
    ctx = new Audio();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockArcadeAudio() {
  context();
}

function noiseBuffer(audio: AudioContext) {
  if (noise) return noise;
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

export function playPeg() {
  const audio = context();
  if (!audio || muted) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = 1280 + Math.random() * 520;
  gain.gain.setValueAtTime(0.045, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.028);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.03);
}

export function playLever() {
  const audio = context();
  if (!audio || muted) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(70, audio.currentTime + 0.18);
  gain.gain.setValueAtTime(0.06, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.2);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.21);
}

export function startWhoosh() {
  const audio = context();
  if (!audio || muted) return;
  stopWhoosh();
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer(audio);
  source.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.65;
  filter.frequency.setValueAtTime(1600, audio.currentTime);
  filter.frequency.exponentialRampToValueAtTime(240, audio.currentTime + 5.4);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.04, audio.currentTime + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 5.2);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start();
  whoosh = { source, gain };
}

export function stopWhoosh() {
  if (!whoosh || !ctx) {
    whoosh = null;
    return;
  }
  const { source, gain } = whoosh;
  whoosh = null;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  try { source.stop(now + 0.2); } catch { /* already stopped */ }
}

function chime(notes: number[], step: number) {
  const audio = context();
  if (!audio || muted) return;
  notes.forEach((freq, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const at = audio.currentTime + index * step;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.3);
  });
}

export function playLand() {
  chime([523.25, 659.25], 0.07);
}

export function playWin() {
  chime([523.25, 659.25, 783.99, 1046.5], 0.09);
}
