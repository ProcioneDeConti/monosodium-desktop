// The end-of-game map for Six Degrees: everything the player explored, as a tree rooted at the
// start tag. Pure logic (tree building + layout) only; components/Games/SixDegreesMap.tsx draws it.

export interface HopEdge {
  from: string;
  to: string;
  /** The post the hop went through. */
  postId: number;
}

/** "start" / "target" endpoints, "path" the winning route, "dead" tags visited then backed out
 *  of, "stub" a tag seen on an opened post but never taken. */
export type MapNodeKind = "start" | "target" | "path" | "dead" | "stub";

export interface MapNode {
  tag: string;
  kind: MapNodeKind;
  /** Post id of the hop that reached this node (none for the start and stubs). */
  via?: number;
  children: MapNode[];
}

export interface MapInput {
  start: string;
  target: string;
  /** Every hop made, in order, including ones later undone by backtracking. */
  edges: HopEdge[];
  /** The final route, start first - ends with the target if it was reached. */
  finalPath: string[];
  /** Tag -> tags seen on posts opened there but never hopped to. */
  untaken: Map<string, string[]>;
  /** Stubs drawn per explored node at most. */
  stubsPerNode?: number;
}

/** Builds the exploration tree. A tag appears once, under the hop that first reached it (later
 *  hops back to it would make cycles). Children are ordered route first, then dead ends, then
 *  stubs, so the winning route runs along the top row. */
export function buildMapTree({ start, target, edges, finalPath, untaken, stubsPerNode = 3 }: MapInput): MapNode {
  const onPath = new Set(finalPath);
  const kindOf = (tag: string): MapNodeKind =>
    tag === start ? "start" : tag === target ? "target" : onPath.has(tag) ? "path" : "dead";
  const root: MapNode = { tag: start, kind: "start", children: [] };
  const nodes = new Map<string, MapNode>([[start, root]]);

  // Route hops attach first, in route order, so the tree follows the route even when the player
  // first reached a route tag from somewhere else.
  const routeHops = finalPath.slice(1).flatMap((to, i) => {
    const hop = [...edges].reverse().find((e) => e.from === finalPath[i] && e.to === to);
    return hop ? [hop] : [];
  });
  let pending = [...routeHops, ...edges];
  // Repeat until nothing more attaches - a dead-end branch can hang off another dead end.
  for (let changed = true; changed; ) {
    changed = false;
    const rest: HopEdge[] = [];
    for (const e of pending) {
      const parent = nodes.get(e.from);
      if (nodes.has(e.to)) continue;
      if (!parent) {
        rest.push(e);
        continue;
      }
      const node: MapNode = { tag: e.to, kind: kindOf(e.to), via: e.postId, children: [] };
      parent.children.push(node);
      nodes.set(e.to, node);
      changed = true;
    }
    pending = rest;
  }

  for (const node of [...nodes.values()]) {
    if (node.kind === "target") continue;
    const stubs = (untaken.get(node.tag) ?? []).filter((t) => !nodes.has(t)).slice(0, stubsPerNode);
    for (const tag of stubs) {
      const stub: MapNode = { tag, kind: "stub", children: [] };
      node.children.push(stub);
      nodes.set(tag, stub);
    }
  }

  const rank: Record<MapNodeKind, number> = { target: 0, path: 0, start: 0, dead: 1, stub: 2 };
  const sortTree = (n: MapNode) => {
    n.children.sort((a, b) => rank[a.kind] - rank[b.kind]);
    n.children.forEach(sortTree);
  };
  sortTree(root);
  return root;
}

export interface PlacedNode {
  node: MapNode;
  /** Column (depth) and row; the parent sits on its first child's row, so the route is straight. */
  col: number;
  row: number;
  parent?: PlacedNode;
}

/** Tree layout on a grid: depth -> column, each leaf takes the next row, a parent shares its first
 *  child's row. Returns the placed nodes and the grid size. */
export function layoutMap(root: MapNode): { placed: PlacedNode[]; cols: number; rows: number } {
  const placed: PlacedNode[] = [];
  let nextRow = 0;
  const visit = (node: MapNode, col: number, parent?: PlacedNode): PlacedNode => {
    const p: PlacedNode = { node, col, row: 0, parent };
    placed.push(p);
    if (node.children.length === 0) {
      p.row = nextRow++;
    } else {
      const kids = node.children.map((c) => visit(c, col + 1, p));
      p.row = kids[0].row;
    }
    return p;
  };
  visit(root, 0);
  return { placed, cols: Math.max(...placed.map((p) => p.col)) + 1, rows: nextRow };
}
