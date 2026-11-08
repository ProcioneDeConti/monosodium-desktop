// Sound effects for the post-based games: tiny synthesised blips (Web Audio oscillators + a bit of
// filtered noise), so there are no audio files to bundle or license. Every sound is a one-shot
// triggered by something the player did - nothing loops. Muted by gamesStore's `sfxOn`.

import { useGamesStore } from "../../state/gamesStore";

/** Overall loudness - kept well under the background music (which starts at 0.25). */
const MASTER = 0.16;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** The shared context, created on first use (always inside a click, so autoplay rules allow it). */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!useGamesStore.getState().sfxOn) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

interface Note {
  freq: number;
  /** Seconds from now. */
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the note. */
  slideTo?: number;
}

function play(notes: Note[]) {
  const a = audio();
  if (!a) return;
  const now = a.ctx.currentTime;
  for (const n of notes) {
    const t0 = now + (n.at ?? 0);
    const osc = a.ctx.createOscillator();
    const env = a.ctx.createGain();
    osc.type = n.type ?? "triangle";
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + n.dur);
    // Fast attack, exponential tail - a plucky "blip" rather than a beep.
    const peak = n.gain ?? 1;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(env).connect(a.out);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.02);
  }
}

/** A short burst of band-passed noise sweeping from `from` to `to` Hz - whooshes and thumps. */
function noise(dur: number, from: number, to: number, gain = 0.6, at = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const buffer = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * dur), a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t0);
}

const semis = (base: number, n: number) => base * 2 ** (n / 12);

/** Correct answers in a row, for the rising "ding" - reset by a miss or a fresh run. */
let combo = 0;

export const sfx = {
  /** UI click: choices, Next. */
  tap() {
    play([{ freq: 660, slideTo: 440, dur: 0.05, gain: 0.35 }]);
  },
  /** One click of a rolling counter (Score Sniffer's slot reel, Time Machine's flip clock). */
  tick(pitch = 1) {
    play([{ freq: 1800 * pitch, dur: 0.025, type: "square", gain: 0.12 }]);
  },
  /** Horny Jail's verdict: a two-tone police wail. */
  siren() {
    const notes: Note[] = [];
    for (let i = 0; i < 2; i++) {
      notes.push({ freq: 660, slideTo: 990, at: i * 0.5, dur: 0.25, type: "sawtooth", gain: 0.12 });
      notes.push({ freq: 990, slideTo: 660, at: i * 0.5 + 0.25, dur: 0.25, type: "sawtooth", gain: 0.12 });
    }
    play(notes);
  },
  /** Sunday School's verdict: a soft, rising "aah" of a chord. */
  halo() {
    play([0, 4, 7, 11, 14].map((s, i) => ({ freq: semis(784, s), at: i * 0.06, dur: 0.9, type: "sine" as const, gain: 0.22 })));
  },
  /** Bingo's dauber hitting a square: a soft wet splat. */
  daub() {
    noise(0.12, 1400, 300, 0.45);
    play([{ freq: 300, slideTo: 140, dur: 0.1, type: "sine", gain: 0.5 }]);
  },
  /** Something appearing (a stamp landing, a tile popping in). */
  pop() {
    play([{ freq: 380, slideTo: 900, dur: 0.07, type: "sine", gain: 0.5 }]);
  },
  /** Right answer: a two-note ding that climbs a semitone per answer in a row (up to an octave). */
  correct() {
    const base = semis(880, Math.min(combo, 12));
    combo++;
    play([
      { freq: base, dur: 0.12, type: "square", gain: 0.22 },
      { freq: base, dur: 0.12, gain: 0.5 },
      { freq: semis(base, 7), at: 0.07, dur: 0.22, type: "square", gain: 0.22 },
      { freq: semis(base, 7), at: 0.07, dur: 0.26, gain: 0.55 },
    ]);
    // A sparkle on top at 3, 5 and every 5 after.
    if (combo === 3 || combo % 5 === 0) {
      play([0, 4, 7, 12].map((s, i) => ({ freq: semis(base * 2, s), at: 0.2 + i * 0.045, dur: 0.12, type: "sine" as const, gain: 0.3 })));
    }
  },
  /** Partly right (Time Machine's near misses): one friendly note, combo kept as is. */
  close() {
    play([
      { freq: 660, dur: 0.14, gain: 0.5 },
      { freq: 620, at: 0.1, dur: 0.2, gain: 0.4 },
    ]);
  },
  /** Wrong answer: a descending "bwomp". Ends the combo. */
  wrong() {
    combo = 0;
    play([
      { freq: 220, slideTo: 110, dur: 0.32, type: "sawtooth", gain: 0.28 },
      { freq: 224, slideTo: 112, dur: 0.32, type: "square", gain: 0.12 },
    ]);
  },
  /** A miss that doesn't end the round (Enhance! ruling out a choice): a short low blip. */
  miss() {
    play([{ freq: 260, slideTo: 180, dur: 0.12, type: "square", gain: 0.18 }]);
  },
  /** The verdict stamp hitting the page. */
  thump() {
    play([{ freq: 140, slideTo: 55, dur: 0.14, type: "sine", gain: 0.9 }]);
    noise(0.08, 900, 200, 0.25);
  },
  whoosh() {
    noise(0.35, 300, 2400, 0.5);
  },
  /** End of a run: a little arpeggio, bigger when it's a new best. */
  finish(newBest: boolean) {
    const steps = newBest ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    play(
      steps.flatMap((s, i) => [
        { freq: semis(523, s), at: i * 0.08, dur: 0.18, type: "square" as const, gain: 0.16 },
        { freq: semis(523, s), at: i * 0.08, dur: 0.22, gain: 0.4 },
      ]),
    );
    const end = steps.length * 0.08;
    // Held chord at the end.
    play([0, 4, 7].map((s) => ({ freq: semis(newBest ? 1046 : 523, s), at: end, dur: 0.6, gain: 0.25 })));
  },
  /** Start of a run: forget the previous run's combo. */
  resetCombo() {
    combo = 0;
  },
};
