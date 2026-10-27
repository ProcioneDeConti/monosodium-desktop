/** The About page's theme: an original, keygen-installer-style chiptune synthesised live with
 *  Web Audio - no audio files, nothing licensed. A tiny four-channel "tracker": a pulse lead with
 *  echo, fast 32nd-note chord arpeggios, a triangle bass, and noise drums, looping one of `SONGS`
 *  (8 bars each). Notes are scheduled ahead on the audio clock, so
 *  timing stays tight even if the UI thread stutters. */

// --- the songs -----------------------------------------------------------------------------
// Lead: one token per 16th - a note ("G#5"), "-" holds the previous note, "." is a rest. Each
// song is 8 bars; `chords[i]` (arpeggio tones + bass root) goes with `lead[i]`.
export interface Song {
  title: string;
  bpm: number;
  lead: string[];
  chords: { arp: string[]; root: string }[];
  kick: number[];
  snare: number[];
  /** Pulse duty cycles - 0.125 is thin/nasal, 0.5 a full square. */
  leadDuty: number;
  arpDuty: number;
  /** Bars of arps/bass/drums before the lead first comes in. */
  introBars: number;
  /** Optional variations, so songs differ in feel and not just notes: */
  /** Shuffle - delays every off-16th by this fraction of a step (0.33 = triplet swing). */
  swing?: number;
  /** "stab": short whole-chord hits on `stabSteps` (reggae skank) instead of 32nd arpeggios. */
  chordStyle?: "arp" | "stab";
  stabSteps?: number[];
  /** A written bass line (same token format as `lead`) instead of the octave-bouncing root. */
  bass?: string[];
  /** Lead through a triangle (soft, flute/melodica-ish) instead of a pulse. */
  softLead?: boolean;
}

const c = (arp: string, root: string) => ({ arp: arp.split(" "), root });

export const SONGS: Song[] = [
  {
    title: "Crack Intro",
    bpm: 140,
    lead: [
      "A4 . C5 . E5 . A5 - G5 - E5 . D5 . C5 .",
      "F5 - - . E5 . C5 . A4 - - . C5 . E5 .",
      "G5 - - . E5 . G5 . C6 - B5 - G5 . E5 .",
      "D5 - - - B4 - - . D5 . G5 . F5 - D5 .",
      "F5 . A5 . D6 - - . C6 . A5 . F5 . D5 .",
      "E5 - - . C5 . E5 . A5 - - - G5 . E5 .",
      "C6 . A5 . F5 . A5 . C6 - D6 - C6 . A5 .",
      "G#5 - - - E5 - - - B4 . E5 . G#5 . B5 .",
    ],
    chords: [c("A4 C5 E5", "A2"), c("F4 A4 C5", "F2"), c("C5 E5 G5", "C3"), c("G4 B4 D5", "G2"),
      c("D4 F4 A4", "D3"), c("A4 C5 E5", "A2"), c("F4 A4 C5", "F2"), c("E4 G#4 B4", "E2")],
    kick: [0, 6, 8, 11],
    snare: [4, 12],
    leadDuty: 0.25,
    arpDuty: 0.125,
    introBars: 4,
  },
  {
    title: "Trash Panda Groove",
    bpm: 128,
    lead: [
      "F#5 . A5 . D6 - A5 . F#5 . A5 . B5 - A5 .",
      "F#5 - - . D5 . F#5 . B5 - - . A5 . F#5 .",
      "G5 . B5 . D6 - B5 . G5 . A5 . B5 - D6 .",
      "C#6 - - - A5 - - . E5 . A5 . C#6 . E6 .",
      "D6 - A5 . F#5 - A5 . D6 . E6 . F#6 - E6 .",
      "C#6 - - . A5 . F#5 . C#6 - - . A5 . C#6 .",
      "B5 . D6 . B5 . G5 . A5 . B5 . D6 - B5 .",
      "A5 - - - E5 - C#5 . E5 . A5 . A5 - - .",
    ],
    chords: [c("D4 F#4 A4", "D3"), c("B3 D4 F#4", "B2"), c("G4 B4 D5", "G2"), c("A4 C#5 E5", "A2"),
      c("D4 F#4 A4", "D3"), c("F#4 A4 C#5", "F#2"), c("G4 B4 D5", "G2"), c("A4 C#5 E5", "A2")],
    kick: [0, 3, 8, 10],
    snare: [4, 12],
    leadDuty: 0.5,
    arpDuty: 0.25,
    introBars: 2,
  },
  {
    title: "Midnight Warez",
    bpm: 118,
    lead: [
      "E5 - - - G5 - - - B5 - A5 - G5 - F#5 -",
      "E5 - - - - - . . C5 . E5 . G5 . E5 .",
      "F#5 - - - A5 - - - D6 - C6 - B5 - A5 -",
      "B5 - - - - - - . D#5 - F#5 - A5 - - .",
      "G5 . B5 . E6 - - - D6 - B5 - G5 . E5 .",
      "G5 - - . E5 . G5 . C6 - - - B5 - G5 -",
      "A5 - - . F#5 . A5 . D6 - C6 - A5 - F#5 -",
      "D#6 - - - B5 - - - F#5 - - - D#5 - - .",
    ],
    chords: [c("E4 G4 B4", "E2"), c("C4 E4 G4", "C3"), c("D4 F#4 A4", "D3"), c("B3 D#4 F#4", "B2"),
      c("E4 G4 B4", "E2"), c("C4 E4 G4", "C3"), c("D4 F#4 A4", "D3"), c("B3 D#4 F#4", "B2")],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    leadDuty: 0.125,
    arpDuty: 0.25,
    introBars: 4,
  },
  {
    title: "Speedrun Bonus",
    bpm: 168,
    lead: [
      "A5 . C6 . A5 . F5 . G5 . A5 . C6 . F6 .",
      "F6 - E6 . D6 . A5 . F5 . A5 . D6 - - .",
      "D6 . F6 . D6 . A#5 . C6 . D6 . F6 - D6 .",
      "E6 - - . C6 . G5 . E5 - G5 - C6 - - .",
      "F5 . A5 . C6 . F6 . E6 . C6 . A5 . C6 .",
      "D6 - - . A5 . F5 . D6 . E6 . F6 - - .",
      "G6 - F6 - D6 - A#5 - G5 - A#5 - D6 - G6 -",
      "E6 . G6 . E6 . C6 . G5 . C6 . E6 - - .",
    ],
    chords: [c("F4 A4 C5", "F2"), c("D4 F4 A4", "D3"), c("A#3 D4 F4", "A#2"), c("C4 E4 G4", "C3"),
      c("F4 A4 C5", "F2"), c("D4 F4 A4", "D3"), c("G4 A#4 D5", "G2"), c("C4 E4 G4", "C3")],
    kick: [0, 8, 10],
    snare: [4, 12],
    leadDuty: 0.25,
    arpDuty: 0.125,
    introBars: 2,
  },
  {
    // Deliberately unlike the others: slow one-drop dub - swung, offbeat chord skanks instead of
    // arps, a written walking bass, a soft melodica-ish lead drowning in echo.
    title: "Bin Diving Dub",
    bpm: 84,
    lead: [
      ". . . . D5 - - - . . G5 . A#5 - A5 G5",
      "G5 - - - - - . . . . D#5 . G5 . F5 D#5",
      "D5 - - - - - - . . . A#4 . C5 . D5 .",
      "F#5 - - - A5 - - - D6 - - - C6 - A5 .",
      ". . . . A#5 - - - A5 - G5 - A5 - A#5 -",
      "C6 - - - - - A#5 . G5 - - - D#5 - - .",
      "D5 - G5 - A#5 - D6 - C6 - A#5 - A5 - G5 -",
      "F#5 - - - - - - - . . . . . . . .",
    ],
    bass: [
      "G2 - - . . . A#2 . D3 - - . C3 . A#2 .",
      "C3 - - . . . D#3 . G2 - - . A#2 . C3 .",
      "G2 - - . . . A#2 . D3 - - . C3 . A#2 .",
      "D3 - - . . . F#2 . A2 - - . C3 . D3 .",
      "G2 - - . . . A#2 . D3 - - . C3 . A#2 .",
      "C3 - - . . . D#3 . G2 - - . A#2 . C3 .",
      "G2 - - . . . A#2 . D3 - - . C3 . A#2 .",
      "D3 - - . A2 . F#2 . D2 - - . . . . .",
    ],
    chords: [c("G4 A#4 D5", "G2"), c("C5 D#5 G5", "C3"), c("G4 A#4 D5", "G2"), c("F#4 A4 D5", "D3"),
      c("G4 A#4 D5", "G2"), c("C5 D#5 G5", "C3"), c("G4 A#4 D5", "G2"), c("F#4 A4 D5", "D3")],
    kick: [8],
    snare: [8],
    leadDuty: 0.5,
    arpDuty: 0.25,
    introBars: 4,
    swing: 0.33,
    chordStyle: "stab",
    stabSteps: [4, 12],
    softLead: true,
  },
];

/** A random song, never the same one twice in a row. */
let lastSong = -1;
export function pickSong(): Song {
  let i = Math.floor(Math.random() * SONGS.length);
  if (i === lastSong) i = (i + 1) % SONGS.length;
  lastSong = i;
  return SONGS[i];
}

const STEPS_PER_BAR = 16;

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(note: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return 0;
  const midi = (Number(m[3]) + 1) * 12 + SEMITONE[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A pulse wave of the given duty cycle (the NES/C64 timbre; 0.5 = plain square). */
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

export interface Chiptune {
  stop(): void;
  /** Audio-clock time the song started at (for syncing visuals to the beat). */
  startedAt: number;
  ctx: AudioContext;
}

export function playChiptune(song: Song, volume = 0.16): Chiptune | null {
  const STEP = 60 / song.bpm / 4; // one 16th note, in seconds
  const LEAD = song.lead.map((bar) => bar.split(" "));
  const KICK = new Set(song.kick);
  const SNARE = new Set(song.snare);
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  // Lead echo - the dotted-8th slapback every keygen tune has.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(master);

  const leadWave = pulseWave(ctx, song.leadDuty);
  const arpWave = pulseWave(ctx, song.arpDuty);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function tone(at: number, dur: number, hz: number, gain: number, wave: PeriodicWave | OscillatorType, toEcho = false, vibrato = false) {
    const osc = ctx.createOscillator();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(hz, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.004);
    g.gain.setValueAtTime(gain * 0.8, at + Math.min(dur * 0.5, 0.08));
    g.gain.linearRampToValueAtTime(0, at + dur);
    if (vibrato && dur > STEP * 2) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(hz * 0.012, at + dur);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur);
    }
    osc.connect(g).connect(master);
    if (toEcho) g.connect(echo);
    osc.start(at);
    osc.stop(at + dur + 0.01);
  }

  function drum(at: number, kind: "kick" | "snare" | "hat") {
    if (kind === "kick") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
      osc.connect(g).connect(master);
      osc.start(at);
      osc.stop(at + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = kind === "hat" ? "highpass" : "bandpass";
    filter.frequency.value = kind === "hat" ? 7000 : 1600;
    const g = ctx.createGain();
    const [level, decay] = kind === "hat" ? [0.16, 0.035] : [0.45, 0.12];
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + decay);
    src.connect(filter).connect(g).connect(master);
    src.start(at, Math.random() * 0.5, decay + 0.02);
  }

  /** How many steps a lead note at `step` lasts (itself plus following "-" holds). */
  function leadLength(bar: string[], step: number): number {
    let n = 1;
    while (step + n < bar.length && bar[step + n] === "-") n++;
    return n;
  }

  const BASS = song.bass?.map((bar) => bar.split(" "));

  function scheduleStep(index: number, at: number) {
    if (song.swing && index % 2 === 1) at += STEP * song.swing;
    const barNo = Math.floor(index / STEPS_PER_BAR) % LEAD.length;
    const step = index % STEPS_PER_BAR;
    // The first pass skips the lead for a few bars - an intro of just arps, bass and drums.
    const intro = index < STEPS_PER_BAR * song.introBars;
    const bar = LEAD[barNo];
    const chord = song.chords[barNo];

    const note = bar[step];
    if (!intro && note !== "-" && note !== ".") {
      const dur = leadLength(bar, step) * STEP * 0.95;
      if (song.softLead) tone(at, dur, freq(note), 0.55, "triangle", true, true);
      else tone(at, dur, freq(note), 0.32, leadWave, true, true);
    }
    if (song.chordStyle === "stab") {
      // Skank: the whole chord, short and choppy, on the offbeats.
      if (song.stabSteps?.includes(step)) {
        for (const n of chord.arp) tone(at, STEP * 0.7, freq(n), 0.09, arpWave, true);
      }
    } else {
      // Arpeggio: two 32nds per 16th, cycling up the chord.
      for (let h = 0; h < 2; h++) {
        const tones = chord.arp;
        tone(at + (h * STEP) / 2, STEP / 2, freq(tones[(step * 2 + h) % tones.length]), 0.13, arpWave);
      }
    }
    if (BASS) {
      const b = BASS[barNo][step];
      if (b !== "-" && b !== ".") tone(at, leadLength(BASS[barNo], step) * STEP * 0.9, freq(b), 0.6, "triangle");
    } else if (step % 2 === 0) {
      // Bass: octave-bouncing 8ths.
      const hz = freq(chord.root) * (step % 4 === 2 ? 2 : 1);
      tone(at, STEP * 1.8, hz, 0.5, "triangle");
    }
    if (KICK.has(step)) drum(at, "kick");
    if (SNARE.has(step)) drum(at, "snare");
    if (step % 2 === 0) drum(at, "hat");
  }

  // Lookahead scheduler: every 25ms, queue anything due in the next 120ms.
  const startedAt = ctx.currentTime + 0.1;
  let next = 0;
  const timer = window.setInterval(() => {
    while (startedAt + next * STEP < ctx.currentTime + 0.12) {
      scheduleStep(next, startedAt + next * STEP);
      next++;
    }
  }, 25);

  return {
    ctx,
    startedAt,
    stop() {
      window.clearInterval(timer);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      window.setTimeout(() => void ctx.close(), 300);
    },
  };
}
