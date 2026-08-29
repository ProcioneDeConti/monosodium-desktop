import { useState, type ReactNode } from "react";
import { Gauge, Share2, Trophy } from "lucide-react";
import type { Site } from "../../models/site";
import type { FavoritesAnalysis } from "../../lib/favoritesAnalysis";
import { Button } from "../ui/Button";
import { BarList, StatTile, type BarItem } from "./charts";
import { FavoritesCardDialog } from "./FavoritesCardDialog";

interface FavoritesAnalysisViewProps {
  data: FavoritesAnalysis;
  sampled: number;
  /** Resolved username - shown, used for the share card, and passed to tag searches. */
  name: string;
  /** Resolved avatar post id, for the share card. */
  avatarId?: number | null;
  site: Site;
  onSearchTag: (tag: string) => void;
}

export function FavoritesAnalysisView({
  data,
  sampled,
  name,
  avatarId = null,
  site,
  onSearchTag,
}: FavoritesAnalysisViewProps) {
  const [cardOpen, setCardOpen] = useState(false);

  const pct = (n: number) =>
    data.total ? `${n} · ${Math.round((n / data.total) * 100)}%` : String(n);
  const bars = (items: { label: string; count: number }[], withPct = false): BarItem[] =>
    items.map((i) => ({
      label: i.label,
      value: i.count,
      display: withPct ? pct(i.count) : undefined,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] opacity-55">
          Based on {sampled.toLocaleString()} sampled favourites
          {name ? ` of ${name}` : ""}.
        </p>
        {sampled > 0 && (
          <Button icon={<Share2 size={13} />} onClick={() => setCardOpen(true)}>
            Share card
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile icon={<Gauge size={13} />} label="Avg score" value={data.avgScore.toLocaleString()} />
        <StatTile icon={<Gauge size={13} />} label="Median score" value={data.medianScore.toLocaleString()} />
        <StatTile icon={<Trophy size={13} />} label="Top score" value={data.highestScore.toLocaleString()} />
      </div>

      <SubChart title="Ratings">
        <BarList items={bars(data.ratings, true)} />
      </SubChart>
      <SubChart title="File types">
        <BarList items={bars(data.fileTypes, true)} />
      </SubChart>
      <SubChart title="Score distribution">
        <BarList items={bars(data.scoreBuckets)} />
      </SubChart>
      {data.byYear.length > 0 && (
        <SubChart title="Favourited posts by upload year">
          <BarList items={bars(data.byYear)} />
        </SubChart>
      )}
      <SubChart title="Top artists">
        <BarList
          items={data.topArtists.map((a) => ({
            label: a.label.replace(/_/g, " "),
            value: a.count,
            onClick: () => onSearchTag(a.label),
          }))}
        />
      </SubChart>
      <SubChart title="Top characters & series">
        <BarList
          items={data.topTags.map((t) => ({
            label: t.label.replace(/_/g, " "),
            value: t.count,
            onClick: () => onSearchTag(t.label),
          }))}
        />
      </SubChart>

      {cardOpen && (
        <FavoritesCardDialog
          analysis={data}
          displayName={name}
          avatarId={avatarId}
          site={site}
          sampled={sampled}
          onClose={() => setCardOpen(false)}
        />
      )}
    </div>
  );
}

function SubChart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-50">{title}</div>
      {children}
    </div>
  );
}
