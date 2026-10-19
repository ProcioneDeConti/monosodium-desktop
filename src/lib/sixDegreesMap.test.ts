import { describe, expect, it } from "vitest";
import { buildMapTree, layoutMap, type MapNode } from "./sixDegreesMap";

const kinds = (n: MapNode): Record<string, string> =>
  Object.assign({ [n.tag]: n.kind }, ...n.children.map(kinds));

describe("buildMapTree", () => {
  // spyro -> dragon -> (dead) scalie, back to dragon -> pokemon (target)
  const input = {
    start: "spyro",
    target: "pokemon",
    edges: [
      { from: "spyro", to: "dragon", postId: 1 },
      { from: "dragon", to: "scalie", postId: 2 },
      { from: "dragon", to: "pokemon", postId: 3 },
    ],
    finalPath: ["spyro", "dragon", "pokemon"],
    untaken: new Map([["dragon", ["wings", "scalie", "pokemon", "horn"]]]),
    stubsPerNode: 2,
  };

  it("classifies route, dead ends and stubs, without duplicating tags", () => {
    const tree = buildMapTree(input);
    expect(kinds(tree)).toEqual({
      spyro: "start",
      dragon: "path",
      pokemon: "target",
      scalie: "dead",
      wings: "stub",
      horn: "stub",
    });
  });

  it("puts the route first so it lays out along row 0", () => {
    const { placed, cols, rows } = layoutMap(buildMapTree(input));
    const row = (tag: string) => placed.find((p) => p.node.tag === tag)!.row;
    expect([row("spyro"), row("dragon"), row("pokemon")]).toEqual([0, 0, 0]);
    expect(cols).toBe(3);
    expect(rows).toBe(4);
  });

  it("attaches the route through the edge it used, even if a tag was first reached elsewhere", () => {
    const tree = buildMapTree({
      start: "a",
      target: "d",
      edges: [
        { from: "a", to: "x", postId: 1 },
        { from: "x", to: "b", postId: 2 },
        { from: "a", to: "b", postId: 3 },
        { from: "b", to: "d", postId: 4 },
      ],
      finalPath: ["a", "b", "d"],
      untaken: new Map(),
    });
    expect(tree.children[0].tag).toBe("b");
    expect(tree.children[0].children[0].tag).toBe("d");
  });
});
