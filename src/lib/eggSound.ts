/** The easter egg's drumroll + reveal sting, synthesised with Web Audio - no audio files, nothing
 *  licensed. A snare roll (filtered noise hits, accelerating) builds for `rollMs`, then a bright
 *  major chord hits with a cymbal-ish noise splash. Returns a stop function. */
export function playDrumrollSting(rollMs: number, golden: boolean): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  // One second of white noise, reused by every hit.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  function hit(at: number, gain: number, decay: number, freq: number) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + decay);
    src.connect(filter).connect(g).connect(master);
    src.start(at, Math.random() * 0.5, decay + 0.05);
  }

  const start = ctx.currentTime + 0.05;
  const rollEnd = start + rollMs / 1000;
  // Hits accelerate from ~12/s to ~30/s and swell in volume.
  for (let t = start; t < rollEnd; ) {
    const p = (t - start) / (rollEnd - start);
    hit(t, 0.25 + 0.55 * p, 0.07, 1800);
    t += 1 / (12 + 18 * p);
  }

  // Sting: major chord (C5 E5 G5 C6; golden adds a high E for sparkle) + splash.
  const notes = golden ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
  for (const f of notes) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, rollEnd);
    g.gain.linearRampToValueAtTime(0.22, rollEnd + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, rollEnd + 1.6);
    osc.connect(g).connect(master);
    osc.start(rollEnd);
    osc.stop(rollEnd + 1.7);
  }
  hit(rollEnd, 0.9, 1.2, 6000);

  const closeTimer = window.setTimeout(() => void ctx.close(), rollMs + 2200);
  return () => {
    window.clearTimeout(closeTimer);
    void ctx.close();
  };
}
