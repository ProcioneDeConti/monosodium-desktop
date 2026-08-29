export interface PostVersion {
  id: number;
  version: number;
  updated_at: string | null;
  added_tags: string[];
  removed_tags: string[];
  rating: string;
  rating_changed: boolean;
  parent_changed: boolean;
  source_changed: boolean;
  description_changed: boolean;
  reason: string;
  updater_id: number | null;
  updater_name: string;
}
