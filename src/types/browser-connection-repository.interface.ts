export interface BrowserConnection {
  id: string;
  slug: string;
  name: string;
  url: string;
  connected: number;
  created_at: number;
  updated_at: number;
  focus_text?: string;
  ignore_text?: string;
}

export interface IBrowserConnectionRepository {
  listConnected(): Promise<BrowserConnection[]>;
  upsert(slug: string, url: string, name?: string): Promise<BrowserConnection>;
  getBySlug(slug: string): Promise<BrowserConnection | null>;
  updatePreferences(slug: string, focusText: string, ignoreText: string, name?: string): Promise<void>;
  deleteBySlug(slug: string): Promise<void>;
}
