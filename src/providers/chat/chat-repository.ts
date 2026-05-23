import type { ChatMessage, ChatSession, ChatSessionSummary, IStorageProvider, IChatRepository, TaskStatus } from '@/types';
import { GENERAL_SESSION_ID } from '@/types';
import { sanitizeChatMessages } from '@/providers/sync';

const SESSIONS_INDEX_KEY = 'chat_sessions_index';
const SESSION_KEY_PREFIX = 'chat_session_';
const MAX_SESSIONS = 50;

function sessionKey(id: string): string {
  return `${SESSION_KEY_PREFIX}${id}`;
}

export class ChatRepository implements IChatRepository {
  constructor(private storage: IStorageProvider) {}

  async getSessions(): Promise<ChatSessionSummary[]> {
    return this.storage.get<ChatSessionSummary[]>(SESSIONS_INDEX_KEY, []);
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const session = await this.storage.get<ChatSession | null>(sessionKey(id), null);
    if (session) {
      session.messages = sanitizeChatMessages(session.messages);
    }
    return session;
  }

  /** Get or create the permanent #general session */
  async getOrCreateGeneralSession(): Promise<ChatSession> {
    const existing = await this.getSession(GENERAL_SESSION_ID);
    if (existing) return existing;

    const now = Date.now();
    const session: ChatSession = {
      id: GENERAL_SESSION_ID,
      title: '#general',
      messages: [],
      createdAt: now,
      updatedAt: now,
      isGeneral: true,
    };

    await this.storage.set(sessionKey(GENERAL_SESSION_ID), session);

    // Ensure it's in the index
    const index = await this.getSessions();
    const summary: ChatSessionSummary = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isGeneral: true,
    };
    // Always keep #general at the front
    index.unshift(summary);
    await this.storage.set(SESSIONS_INDEX_KEY, index);

    return session;
  }

  /** Clear the #general session messages (for /new command) without deleting it */
  async clearGeneralSession(): Promise<ChatSession> {
    const session = await this.getSession(GENERAL_SESSION_ID);
    if (!session) return this.getOrCreateGeneralSession();

    session.messages = [];
    session.updatedAt = Date.now();
    await this.storage.set(sessionKey(GENERAL_SESSION_ID), session);
    await this.updateIndex(GENERAL_SESSION_ID, { updatedAt: session.updatedAt });
    return session;
  }

  /** Create a new task session. When `id` is provided and the session already exists, returns the existing session (idempotent). */
  async createSession(id?: string): Promise<ChatSession> {
    if (id) {
      const existing = await this.getSession(id);
      if (existing) return existing;
    }

    const now = Date.now();
    const sessionId = id ?? crypto.randomUUID();
    const session: ChatSession = {
      id: sessionId,
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.set(sessionKey(session.id), session);

    const index = await this.getSessions();
    const summary: ChatSessionSummary = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    // Insert after #general (which is always index 0)
    const generalIdx = index.findIndex((s) => s.isGeneral);
    if (generalIdx >= 0) {
      index.splice(generalIdx + 1, 0, summary);
    } else {
      index.unshift(summary);
    }

    // Enforce max sessions (never remove #general)
    if (index.length > MAX_SESSIONS) {
      const removed = index.splice(MAX_SESSIONS);
      const toRemove = removed.filter((s) => !s.isGeneral);
      await Promise.all(toRemove.map((s) => this.storage.remove(sessionKey(s.id))));
    }

    await this.storage.set(SESSIONS_INDEX_KEY, index);
    return session;
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.messages.push(message);
    session.updatedAt = Date.now();

    // Auto-title tasks (not #general) from the first user message
    if (session.title === 'New Chat' && !session.isGeneral && message.role === 'user') {
      session.title = message.content.slice(0, 80);
    }

    await this.storage.set(sessionKey(sessionId), session);
    await this.updateIndex(sessionId, { title: session.title, updatedAt: session.updatedAt });
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (session) {
      if (session.isGeneral) return;
      session.title = title;
      session.updatedAt = Date.now();
      await this.storage.set(sessionKey(sessionId), session);
    }

    await this.updateIndex(sessionId, { title, updatedAt: Date.now(), isAiTitled: true });
  }

  async updateMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.messages = messages;
    session.updatedAt = Date.now();
    await this.storage.set(sessionKey(sessionId), session);
    await this.updateIndex(sessionId, { updatedAt: session.updatedAt });
  }

  async pinSession(id: string): Promise<void> {
    if (id === GENERAL_SESSION_ID) return;
    const session = await this.getSession(id);
    if (!session) return;

    const index = await this.getSessions();
    const maxOrder = index
      .filter((s) => s.isPinned)
      .reduce((max, s) => Math.max(max, s.pinnedOrder ?? 0), 0);

    session.isPinned = true;
    session.pinnedOrder = maxOrder + 1;
    await this.storage.set(sessionKey(id), session);

    const entry = index.find((s) => s.id === id);
    if (entry) {
      entry.isPinned = true;
      entry.pinnedOrder = session.pinnedOrder;
      await this.storage.set(SESSIONS_INDEX_KEY, index);
    }
  }

  async unpinSession(id: string): Promise<void> {
    if (id === GENERAL_SESSION_ID) return;
    const session = await this.getSession(id);
    if (!session) return;
    session.isPinned = false;
    delete session.pinnedOrder;
    await this.storage.set(sessionKey(id), session);
    const index = await this.getSessions();
    const entry = index.find((s) => s.id === id);
    if (entry) {
      entry.isPinned = false;
      delete entry.pinnedOrder;
      await this.storage.set(SESSIONS_INDEX_KEY, index);
    }
  }

  async reorderPinnedSessions(orderedIds: string[]): Promise<void> {
    const index = await this.getSessions();

    for (let i = 0; i < orderedIds.length; i++) {
      const entry = index.find((s) => s.id === orderedIds[i]);
      if (entry && entry.isPinned) {
        entry.pinnedOrder = i;
      }
      const session = await this.getSession(orderedIds[i]);
      if (session && session.isPinned) {
        session.pinnedOrder = i;
        await this.storage.set(sessionKey(orderedIds[i]), session);
      }
    }

    await this.storage.set(SESSIONS_INDEX_KEY, index);
  }

  async deleteSession(id: string): Promise<void> {
    // Never delete #general
    if (id === GENERAL_SESSION_ID) return;

    await this.storage.remove(sessionKey(id));

    const index = await this.getSessions();
    const filtered = index.filter((s) => s.id !== id);
    await this.storage.set(SESSIONS_INDEX_KEY, filtered);
  }

  async getOrCreateCurrentSession(): Promise<ChatSession> {
    // Always ensure #general exists first
    await this.getOrCreateGeneralSession();

    const index = await this.getSessions();

    if (index.length > 0) {
      // Return #general as the default starting session
      const general = await this.getSession(GENERAL_SESSION_ID);
      if (general) return general;

      const latest = await this.getSession(index[0].id);
      if (latest) return latest;
    }

    return this.getOrCreateGeneralSession();
  }

  async updateStatus(id: string, status: TaskStatus): Promise<void> {
    if (id === GENERAL_SESSION_ID) return;
    const session = await this.getSession(id);
    if (!session) return;
    session.status = status;
    session.updatedAt = Date.now();
    await this.storage.set(sessionKey(id), session);
    // Update index
    const index = await this.getSessions();
    const entry = index.find((s) => s.id === id);
    if (entry) {
      entry.status = status;
      entry.updatedAt = session.updatedAt;
      await this.storage.set(SESSIONS_INDEX_KEY, index);
    }
  }

  async saveSession(session: ChatSession): Promise<void> {
    await this.storage.set(sessionKey(session.id), session);
  }

  async saveSessions(index: ChatSessionSummary[]): Promise<void> {
    await this.storage.set(SESSIONS_INDEX_KEY, index);
  }

  private async updateIndex(
    sessionId: string,
    updates: Partial<Pick<ChatSessionSummary, 'title' | 'updatedAt' | 'isAiTitled'>>,
  ): Promise<void> {
    const index = await this.getSessions();
    const entry = index.find((s) => s.id === sessionId);
    if (!entry) return;

    if (updates.title !== undefined) entry.title = updates.title;
    if (updates.updatedAt !== undefined) entry.updatedAt = updates.updatedAt;
    if (updates.isAiTitled !== undefined) entry.isAiTitled = updates.isAiTitled;

    // Re-sort: #general always first, then by updatedAt
    const general = index.filter((s) => s.isGeneral);
    const tasks = index.filter((s) => !s.isGeneral);
    // Move the updated task to the top of the tasks list
    if (!entry.isGeneral) {
      const taskIdx = tasks.findIndex((s) => s.id === sessionId);
      if (taskIdx > 0) {
        tasks.splice(taskIdx, 1);
        tasks.unshift(entry);
      }
    }

    await this.storage.set(SESSIONS_INDEX_KEY, [...general, ...tasks]);
  }
}
