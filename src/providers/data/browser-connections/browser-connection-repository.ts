import type { IContextDataClient } from '@/types/context-data-client.interface';
import type {
  IBrowserConnectionRepository,
  BrowserConnection,
} from '@/types/browser-connection-repository.interface';

const TABLE = 'browser_connections';

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function deriveNameFromUrl(url: string): string {
  const domain = extractDomain(url);
  const parts = domain.replace(/^www\./, '').split('.');
  const base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export class BrowserConnectionRepository implements IBrowserConnectionRepository {
  constructor(private client: IContextDataClient) {}

  async listConnected(): Promise<BrowserConnection[]> {
    const result = await this.client.query<BrowserConnection>({
      table: TABLE,
      where: { connected: 1 },
    });
    return result.rows;
  }

  async upsert(slug: string, url: string, name?: string): Promise<BrowserConnection> {
    const now = Date.now();

    const existing = await this.client.query<BrowserConnection>({
      table: TABLE,
      where: slug === 'other' ? undefined : { slug },
    });

    const match = slug === 'other'
      ? existing.rows.find((r) => r.url === url)
      : existing.rows[0];

    if (match) {
      await this.client.execute({
        action: 'update',
        table: TABLE,
        data: { connected: 1, updated_at: now },
        where: { id: match.id },
      });
      return { ...match, connected: 1, updated_at: now };
    }

    const resolvedName = name ?? (slug === 'other' ? deriveNameFromUrl(url) : slug.charAt(0).toUpperCase() + slug.slice(1));
    const id = generateId();
    const row: BrowserConnection = { id, slug, name: resolvedName, url, connected: 1, created_at: now, updated_at: now };

    await this.client.execute({
      action: 'insert',
      table: TABLE,
      data: { ...row },
    });

    return row;
  }

  async getBySlug(slug: string): Promise<BrowserConnection | null> {
    const result = await this.client.query<BrowserConnection>({
      table: TABLE,
      where: { slug },
      limit: 1,
    });
    return result.rows[0] ?? null;
  }

  async updatePreferences(
    slug: string,
    focusText: string,
    ignoreText: string,
    name?: string,
  ): Promise<void> {
    const now = Date.now();
    const existing = await this.client.query<BrowserConnection>({
      table: TABLE,
      where: { slug },
      limit: 1,
    });

    if (existing.rows.length > 0) {
      await this.client.execute({
        action: 'update',
        table: TABLE,
        data: { focus_text: focusText, ignore_text: ignoreText, updated_at: now },
        where: { id: existing.rows[0].id },
      });
    } else {
      const id = generateId();
      await this.client.execute({
        action: 'insert',
        table: TABLE,
        data: {
          id,
          slug,
          name: name ?? slug,
          url: '',
          connected: 1,
          focus_text: focusText,
          ignore_text: ignoreText,
          created_at: now,
          updated_at: now,
        },
      });
    }
  }

  async deleteBySlug(slug: string): Promise<void> {
    await this.client.execute({
      action: 'delete',
      table: TABLE,
      where: { slug },
    });
  }
}
