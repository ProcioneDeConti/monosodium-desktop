import { useMemo } from "react";
import { buildMapTree, layoutMap, type MapInput, type MapNodeKind } from "../../lib/sixDegreesMap";
import { displayTagName } from "../../lib/tagdle";

const COL_W = 168;
const ROW_H = 40;
const NODE_W = 140;
const NODE_H = 26;
const PAD = 8;

const NODE_STYLE: Record<MapNodeKind, { fill: string; stroke: string; text: string; dash?: string }> = {
  start: { fill: "rgb(var(--accent))", stroke: "rgb(var(--accent))", text: "white" },
  path: { fill: "rgb(var(--accent) / 0.25)", stroke: "rgb(var(--accent))", text: "currentColor" },
  target: { fill: "rgb(34 197 94)", stroke: "rgb(34 197 94)", text: "white" },
  dead: { fill: "rgb(239 68 68 / 0.12)", stroke: "rgb(239 68 68 / 0.7)", text: "currentColor" },
  stub: { fill: "transparent", stroke: "currentColor", text: "currentColor", dash: "3 3" },
};

/** Approximate truncation so long tags fit their box (no text measuring needed at this size). */
function fit(tag: string): string {
  const name = displayTagName(tag);
  return name.length > 20 ? `${name.slice(0, 19)}…` : name;
}

/** End-of-game map: the route along the top, dead ends in red, untaken tags as dashed stubs.
 *  Scrolls horizontally/vertically when big. */
export function SixDegreesMap(props: MapInput) {
  const { placed, cols, rows } = useMemo(
    () => layoutMap(buildMapTree(props)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.edges, props.finalPath, props.untaken],
  );
  const width = cols * COL_W - (COL_W - NODE_W) + PAD * 2;
  const height = rows * ROW_H + PAD * 2;
  const x = (col: number) => PAD + col * COL_W;
  const y = (row: number) => PAD + row * ROW_H;

  return (
    <div className="w-full">
      <div className="max-h-[50vh] overflow-auto rounded-xl border border-black/10 dark:border-white/10 bg-neutral-900/80 backdrop-blur-sm p-1">
        <svg width={width} height={height} className="block text-[11px]">
          {placed.map((p) =>
            p.parent ? (
              <path
                key={`e:${p.node.tag}`}
                d={`M ${x(p.parent.col) + NODE_W} ${y(p.parent.row) + NODE_H / 2}
                    C ${x(p.col) - 14} ${y(p.parent.row) + NODE_H / 2}, ${x(p.parent.col) + NODE_W + 14} ${y(p.row) + NODE_H / 2},
                      ${x(p.col)} ${y(p.row) + NODE_H / 2}`}
                fill="none"
                stroke={NODE_STYLE[p.node.kind].stroke}
                strokeWidth={p.node.kind === "path" || p.node.kind === "target" ? 2.5 : 1.25}
                strokeDasharray={NODE_STYLE[p.node.kind].dash}
                opacity={p.node.kind === "stub" ? 0.35 : 0.9}
              />
            ) : null,
          )}
          {placed.map((p) => {
            const style = NODE_STYLE[p.node.kind];
            return (
              <g key={`n:${p.node.tag}`} opacity={p.node.kind === "stub" ? 0.5 : 1}>
                <title>
                  {displayTagName(p.node.tag)}
                  {p.node.via !== undefined ? ` (via post #${p.node.via})` : ""}
                </title>
                <rect
                  x={x(p.col)}
                  y={y(p.row)}
                  width={NODE_W}
                  height={NODE_H}
                  rx={NODE_H / 2}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeDasharray={style.dash}
                  strokeWidth={1.25}
                />
                <text
                  x={x(p.col) + NODE_W / 2}
                  y={y(p.row) + NODE_H / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fill={style.text}
                  fontWeight={p.node.kind === "stub" ? 400 : 600}
                >
                  {fit(p.node.tag)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mx-auto mt-2 flex w-fit flex-wrap justify-center gap-3 rounded-full bg-neutral-900/80 px-3 py-1 text-[11px]">
        <Legend color="rgb(var(--accent))" label="Your route" />
        <Legend color="rgb(239 68 68)" label="Dead end (backed out)" />
        <Legend color="currentColor" label="Not taken" dashed />
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8">
        <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "3 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
