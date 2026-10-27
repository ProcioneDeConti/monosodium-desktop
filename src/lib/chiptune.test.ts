import { describe, expect, it } from "vitest";
import { SONGS } from "./chiptune";

const NOTE = /^[A-G]#?\d$/;

describe("chiptune songs", () => {
  it.each(SONGS.map((s) => [s.title, s] as const))("%s is well-formed", (_, song) => {
    expect(song.lead).toHaveLength(8);
    song.bass?.forEach((bar) => bar.split(" ").forEach((t) => expect(t === "-" || t === "." || NOTE.test(t)).toBe(true)));
    song.bass?.forEach((bar) => expect(bar.split(" ")).toHaveLength(16));
    expect(song.chords).toHaveLength(8);
    song.lead.forEach((bar) => {
      const tokens = bar.split(" ");
      expect(tokens).toHaveLength(16);
      tokens.forEach((t) => expect(t === "-" || t === "." || NOTE.test(t)).toBe(true));
    });
    song.chords.forEach((c) => [...c.arp, c.root].forEach((n) => expect(n).toMatch(NOTE)));
  });
});
