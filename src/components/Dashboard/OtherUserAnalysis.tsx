import { useState } from "react";
import { Search } from "lucide-react";
import type { Site } from "../../models/site";
import { Button } from "../ui/Button";
import { FavoritesAnalysisRunner } from "./FavoritesAnalysisRunner";
import { RecentAnalyses } from "./RecentAnalyses";

interface OtherUserAnalysisProps {
  site: Site;
  onSearchTag: (tag: string) => void;
}

export function OtherUserAnalysis({ site, onSearchTag }: OtherUserAnalysisProps) {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  function submit() {
    const v = input.trim();
    if (v) setTarget(v);
  }

  function pick(ref: string) {
    setInput(ref);
    setTarget(ref);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs opacity-60">
        Run the same breakdown on any user's public favourites. Enter their username or numeric ID.
      </p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="username or ID"
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-black/10 bg-white/60 px-2.5 py-1.5 text-sm
                     outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] dark:border-white/10 dark:bg-black/30"
        />
        <Button icon={<Search size={13} />} onClick={submit} disabled={!input.trim() || input.trim() === target}>
          Analyze
        </Button>
      </div>

      <RecentAnalyses site={site} activeRef={target} onPick={pick} />

      {target !== null && (
        <FavoritesAnalysisRunner key={target} site={site} userRef={target} onSearchTag={onSearchTag} />
      )}
    </div>
  );
}
