export interface Collection {
  id: string;
  title: string;
  /** Freeform grouping label; "" renders under "Uncategorized". */
  category: string;
  postIds: number[];
  createdAt: number;
  /** When set, a post newly added to this collection is auto-queued for download here. */
  autoDownloadFolder: string | null;
}
