export type Board = "main" | "game" | "programmer";
export type Status = "live" | "developing";

export interface AuthorLink {
  label: string;
  url: string;
}

export interface Project {
  slug: string;
  board: Board;
  name: string;
  intro: string;
  status: Status;
  date: string; // YYYY-MM-DD
  url: string;
  author: string;
  authorLinks: AuthorLink[];
  likes: number;
  comments: number;
}

export interface SiteDataCounts {
  main: number;
  game: number;
  programmer: number;
  total: number;
}

export interface SiteDataMeta {
  contentSyncedAt: string;
  statsSyncedAt: string;
  counts: SiteDataCounts;
}

export interface SiteData {
  meta: SiteDataMeta;
  main: Project[];
  game: Project[];
  programmer: Project[];
}
