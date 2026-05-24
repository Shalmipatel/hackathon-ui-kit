import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ChatMessage,
  ChatSessionSummary,
  TaskStatus,
  StreamState,
  IChatRepository,
  IStreamClient,
  ISystemSession,
  StreamRequest,
  FileAttachment,
} from '@/types';
import { INITIAL_STREAM_STATE, GENERAL_SESSION_ID, GENERAL_START_CONTENT } from '@/types';
import type { SessionSync } from '@/providers/sync';
import { PLACEHOLDER_NEW_SESSION_TITLE } from '@/providers/sync';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';

export interface ActiveTool {
  name: string;
  toolCallId: string;
  meta?: string;
  args?: Record<string, unknown>;
  status: 'running' | 'processing';
}

/** State for a single chat session */
export interface SessionState {
  messages: ChatMessage[];
  stream: StreamState;
  activeTool: ActiveTool | null;
}

/** Store dependencies injected at creation time */
export interface StoreDependencies {
  chatRepo: IChatRepository;
  streamClient: IStreamClient;
  systemSession: ISystemSession;
  sessionSyncService: SessionSync;
}

/** Core store state */
export interface ChatStoreState {
  sessions: Record<string, SessionState>;
  sessionIndex: ChatSessionSummary[];
  activeSessionId: string | null;
  isHydrated: boolean;
  generalStarted: boolean;
  isSyncing: boolean;
  syncError: string | null;
}

/** Store actions */
export interface ChatStoreActions {
  hydrate(): Promise<void>;
  setActiveSession(id: string): void;
  loadSession(id: string): Promise<void>;
  sendMessage(
    sessionId: string,
    content: string,
    audioDataUrl?: string,
    attachments?: FileAttachment[],
    isHidden?: boolean,
  ): Promise<void>;
  addUserMessage(sessionId: string, message: ChatMessage): void;
  startStreaming(sessionId: string, messageId: string): void;
  appendDelta(sessionId: string, chunk: string): void;
  finishStream(sessionId: string): Promise<void>;
  streamError(sessionId: string, error: string): void;
  createSession(id?: string): Promise<string>;
  deleteSession(id: string): Promise<void>;
  pinSession(id: string): Promise<void>;
  unpinSession(id: string): Promise<void>;
  updateStatus(id: string, status: TaskStatus): Promise<void>;
  clearGeneralSession(): Promise<void>;
  regenerate(sessionId: string): Promise<void>;
  refreshSessions(): Promise<void>;
  abortStream(sessionId: string): void;
  initGeneralSession(): Promise<void>;
  renameSession(sessionId: string, newTitle: string): Promise<void>;
  reorderPinnedSessions(orderedIds: string[]): Promise<void>;
  generateTaskTitle(sessionId: string, userMessage: string): Promise<void>;
  syncWithBackend(): Promise<void>;
  setActiveTool(sessionId: string, tool: ActiveTool): void;
  clearActiveTool(sessionId: string): void;
  incrementUnreadCount(sessionId: string): Promise<void>;
  clearUnreadCount(sessionId: string): Promise<void>;
  refreshActiveSession(): Promise<void>;
  /**
   * Lifecycle-resume reconcile entry point.
   *
   * Invoked by the bootstrap-owned `chat-resume-listener` when the
   * RefreshCoordinator fires after a backgrounded/idle period. Performs:
   *   1. Self-heal stale `stream.status === 'streaming'` flags by intersecting
   *      against `streamClient.getActiveSessionIds()` (the authoritative live
   *      set). Local flags can drift across BG/FG transitions; the stream-
   *      client controllers cannot.
   *   2. Sync the session index via `sessionSyncService.syncSessionIndex()`
   *      (no per-session history fetch; new rows get a placeholder title).
   *   3. Refresh the currently-active session's content via
   *      `loadFromBackend(activeSessionId)` — but only if that session is NOT
   *      currently streaming (skip is intentional; `loadFromBackend` would
   *      clobber an in-progress assistant message).
   *
   * Race protection (user sends a message during step 3) is handled
   * structurally at the input layer: `ChatInput` is disabled while
   * `isSyncing` is true. AI title generation is intentionally NOT triggered
   * here — title gen runs from the existing post-message path and at hydrate
   * via `syncWithBackend`. Re-running it on every resume duplicates LLM
   * round-trips with no user-visible benefit.
   */
  reconcileOnResume(): Promise<void>;
  setCronSessionMeta(sessionId: string, title: string): Promise<void>;
}

export type ChatStore = ChatStoreState & ChatStoreActions;

const INITIAL_STATE: ChatStoreState = {
  sessions: {},
  sessionIndex: [],
  activeSessionId: null,
  isHydrated: false,
  generalStarted: false,
  isSyncing: false,
  syncError: null,
};

function createSessionState(messages: ChatMessage[] = [], streamOverrides?: Partial<StreamState>): SessionState {
  return {
    messages,
    stream: { ...INITIAL_STREAM_STATE, ...streamOverrides },
    activeTool: null,
  };
}

export function createChatStore(deps: StoreDependencies) {
  const { chatRepo, streamClient, systemSession, sessionSyncService } = deps;

  return create<ChatStore>()(
    subscribeWithSelector((set, get) => ({
      ...INITIAL_STATE,

      async hydrate() {
        try {
          // Phase 1: load local data instantly
          await chatRepo.getOrCreateGeneralSession();
          const session = await chatRepo.getOrCreateCurrentSession();

          const sessions: Record<string, SessionState> = {};
          sessions[session.id] = createSessionState(session.messages);

          set({
            sessionIndex: await chatRepo.getSessions(),
            sessions,
            activeSessionId: session.id,
            isHydrated: true,
          });
        } catch (err) {
          console.error('[ChatStore] Hydration failed:', err);
          set({ isHydrated: true });
        }

        // Phase 2: async backend sync (non-blocking)
        get().syncWithBackend().catch((err) => {
          console.warn('[ChatStore] Background sync failed:', err);
        });
      },

      setActiveSession(id: string) {
        set({ activeSessionId: id });
      },

      async loadSession(id: string) {
        // V1: always pull latest history from backend on click.
        // Exception — never re-fetch a session that is currently streaming;
        // overwriting messages would clobber the in-progress assistant message.
        // We use streamClient.getActiveSessionIds() (the AbortController set)
        // as the truth source rather than local stream.status flags, which
        // can be stale across BG/FG transitions.
        const liveStreams = new Set(streamClient.getActiveSessionIds());
        if (liveStreams.has(id)) {
          set({ activeSessionId: id });
          await get().clearUnreadCount(id);
          return;
        }

        try {
          const localSession = await chatRepo.getSession(id);

          // Hydrate skeleton with cached messages (if any) while the backend
          // fetch runs; gives the user instant content instead of an empty
          // list. The 'loading' stream status drives the spinner overlay.
          set((state) => ({
            sessions: {
              ...state.sessions,
              [id]: createSessionState(localSession?.messages ?? [], { status: 'loading' as const }),
            },
            activeSessionId: id,
          }));

          // Fetch from backend
          const messages = await sessionSyncService.loadFromBackend(id);

          set((state) => {
            // Clear the needsRefresh flag in the index (no-op if already false;
            // kept for any legacy code paths still writing it).
            const updatedIndex = state.sessionIndex.map((s) =>
              s.id === id ? { ...s, needsRefresh: false } : s,
            );

            return {
              sessions: {
                ...state.sessions,
                [id]: createSessionState(messages),
              },
              sessionIndex: updatedIndex,
            };
          });

          await chatRepo.saveSessions(get().sessionIndex);
          await get().clearUnreadCount(id);
        } catch (err) {
          console.error('[ChatStore] Failed to load session:', err);
          // Reset loading state on error; keep whatever local data exists
          set((state) => {
            const current = state.sessions[id];
            if (current?.stream.status === 'loading') {
              return {
                sessions: {
                  ...state.sessions,
                  [id]: { ...current, stream: { ...INITIAL_STREAM_STATE } },
                },
              };
            }
            return state;
          });
        }
      },

      async sendMessage(
        sessionId: string,
        content: string,
        audioDataUrl?: string,
        attachments?: FileAttachment[],
        isHidden?: boolean,
      ) {
        console.log('[ChatStore] sendMessage called:', { sessionId, content: content.slice(0, 50) });
        const trimmed = content.trim();
        if (!trimmed) return;

        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmed,
          timestamp: Date.now(),
          ...(audioDataUrl ? { audioDataUrl } : {}),
          ...(attachments?.length
            ? {
                attachments: attachments.map(
                  ({
                    dataUrl: _dataUrl,
                    uploadStatus: _uploadStatus,
                    uploadProgress: _uploadProgress,
                    uploadError: _uploadError,
                    ...meta
                  }) => meta,
                ),
              }
            : {}),
          ...(isHidden ? { isHidden: true } : {}),
        };

        set((state) => {
          const session = state.sessions[sessionId] ?? createSessionState();
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: [...session.messages, userMessage],
              },
            },
          };
        });

        await chatRepo.addMessage(sessionId, userMessage);

        const request: StreamRequest = {
          messages: [{ role: 'user', content: trimmed }],
          audioDataUrl,
          attachments,
        };

        // Set streaming status immediately so typing indicator shows
        // Reset messageId to null so new chunks create a fresh assistant message
        set((state) => {
          const currentSession = state.sessions[sessionId];
          if (!currentSession) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...currentSession,
                activeTool: null,
                stream: {
                  status: 'streaming',
                  messageId: null,
                  content: '',
                  error: null,
                  startedAt: Date.now(),
                },
              },
            },
          };
        });

        await streamClient.startStream(sessionId, request);

        // Generate a title immediately from the user's first message
        if (sessionId !== GENERAL_SESSION_ID) {
          get().generateTaskTitle(sessionId, trimmed).catch(() => {});
        }
      },

      addUserMessage(sessionId: string, message: ChatMessage) {
        set((state) => {
          const session = state.sessions[sessionId] ?? createSessionState();
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: [...session.messages, message],
              },
            },
          };
        });
      },

      startStreaming(sessionId: string, messageId: string) {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const assistantMessage: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          };

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: [...session.messages, assistantMessage],
                stream: {
                  status: 'streaming',
                  messageId,
                  content: '',
                  error: null,
                  startedAt: Date.now(),
                },
              },
            },
          };
        });
      },

      appendDelta(sessionId: string, chunk: string) {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const { stream, messages } = session;
          let messageId = stream.messageId;
          let updatedMessages = messages;

          if (!messageId) {
            messageId = crypto.randomUUID();
            const assistantMessage: ChatMessage = {
              id: messageId,
              role: 'assistant',
              content: chunk,
              timestamp: Date.now(),
            };
            updatedMessages = [...messages, assistantMessage];
          } else {
            updatedMessages = messages.map((m) =>
              m.id === messageId ? { ...m, content: m.content + chunk } : m,
            );
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                messages: updatedMessages,
                stream: {
                  ...stream,
                  status: 'streaming',
                  messageId,
                  content: stream.content + chunk,
                },
              },
            },
          };
        });
      },

      async finishStream(sessionId: string) {
        const { sessions } = get();
        const session = sessions[sessionId];
        if (!session) return;

        const { stream, messages } = session;
        const content = stream.content;
        const messageId = stream.messageId;

        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              stream: { ...INITIAL_STREAM_STATE },
              activeTool: null,
            },
          },
        }));

        if (content && messageId) {
          const finalMessage: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          };
          await chatRepo.addMessage(sessionId, finalMessage);
        }

        await get().refreshSessions();
      },

      async renameSession(sessionId: string, newTitle: string) {
        if (sessionId === GENERAL_SESSION_ID) return;
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed.length > 80) return;

        try {
          await chatRepo.updateTitle(sessionId, trimmed);
          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to rename session:', err);
        }
      },

      async reorderPinnedSessions(orderedIds: string[]) {
        try {
          await chatRepo.reorderPinnedSessions(orderedIds);
          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to reorder pinned sessions:', err);
        }
      },

      async generateTaskTitle(sessionId: string, userMessage: string) {
        if (sessionId === GENERAL_SESSION_ID) return;

        const index = get().sessionIndex;
        const entry = index.find((s) => s.id === sessionId);
        if (entry?.isAiTitled) return;
        if (entry?.isRecurring) return;

        try {
          const title = await systemSession.execute({
            type: 'generate_title',
            userMessage,
            sessionId,
          });

          if (title && title.length > 0 && title.length <= 80) {
            await chatRepo.updateTitle(sessionId, title);
            await get().refreshSessions();
          }
        } catch (err) {
          console.warn('[ChatStore] Failed to generate task title:', err);
        }
      },

      streamError(sessionId: string, error: string) {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          const { stream, messages } = session;
          let updatedMessages = messages;

          if (stream.content && stream.messageId) {
            updatedMessages = messages.map((m) =>
              m.id === stream.messageId ? { ...m, content: stream.content } : m,
            );
          }

          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Error: ${error}`,
            timestamp: Date.now(),
          };

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                messages: [...updatedMessages, errorMessage],
                stream: {
                  status: 'error',
                  messageId: null,
                  content: '',
                  error,
                  startedAt: null,
                },
                activeTool: null,
              },
            },
          };
        });

        const { sessions } = get();
        const session = sessions[sessionId];
        if (session?.stream.content) {
          chatRepo.addMessage(sessionId, {
            id: session.stream.messageId ?? crypto.randomUUID(),
            role: 'assistant',
            content: session.stream.content,
            timestamp: Date.now(),
          });
        }
      },

      async createSession(id?: string) {
        /*
         * De-dup empty sessions. If the caller isn't asking for a specific
         * id (i.e. this is a plain "new chat" tap, not a restore of a
         * known-id session), check whether there's already a freshly-made
         * empty session lying around — no messages, not the permanent
         * general chat — and just activate it instead of stacking another.
         *
         * Prevents the "multiple empty New Chat entries" pile-up when
         * users tap the new-chat FAB / button repeatedly without sending
         * anything.
         *
         * Note: sessions in `sessions` are those already loaded into the
         * store. We scan that map directly (not the sessionIndex) so we
         * only see sessions whose full message state we can inspect.
         */
        if (!id) {
          const { sessions, sessionIndex } = get();
          // Prefer the most recently created empty session — sessionIndex
          // is ordered newest-first (see refreshSessions) so walk it and
          // stop at the first match.
          for (const summary of sessionIndex) {
            if (summary.id === GENERAL_SESSION_ID) continue;
            const loaded = sessions[summary.id];
            if (loaded && loaded.messages.length === 0) {
              set({ activeSessionId: summary.id });
              return summary.id;
            }
          }
        }

        try {
          const session = await chatRepo.createSession(id);

          set((state) => ({
            sessions: {
              ...state.sessions,
              [session.id]: createSessionState(session.messages),
            },
            activeSessionId: session.id,
          }));

          await get().refreshSessions();
          return session.id;
        } catch (err) {
          console.error('[ChatStore] Failed to create session:', err);
          throw err;
        }
      },

      async deleteSession(id: string) {
        if (id === GENERAL_SESSION_ID) return;

        try {
          streamClient.abortStream(id);

          // Optimistic UI update: remove from sessions map and sessionIndex immediately
          const { activeSessionId, sessions, sessionIndex } = get();
          const { [id]: _deleted, ...remaining } = sessions;
          const filteredIndex = sessionIndex.filter((s) => s.id !== id);

          if (activeSessionId === id) {
            const generalSession = await chatRepo.getOrCreateGeneralSession();
            set({
              sessions: {
                ...remaining,
                [GENERAL_SESSION_ID]: createSessionState(generalSession.messages),
              },
              sessionIndex: filteredIndex,
              activeSessionId: GENERAL_SESSION_ID,
            });
          } else {
            set({ sessions: remaining, sessionIndex: filteredIndex });
          }

          // Persist local delete (background, non-blocking)
          chatRepo.deleteSession(id).catch((err) => {
            console.warn('[ChatStore] Local delete failed:', err);
          });

          // Server delete (background, non-blocking). Without this, the
          // next syncWithBackend / reconcileOnResume call would fetch the
          // session back from openclaw and re-insert it client-side.
          import('@/features/app/bootstrap/providers').then(({ getGateway }) => {
            getGateway().request(GATEWAY_ENDPOINTS.TOOLS_INVOKE, {
              method: 'POST',
              body: { tool: 'sessions.delete', args: { key: `agent:main:neoclaw-${id}`, deleteTranscript: true } },
              timeoutMs: 10_000,
            }).then((resp) => resp.json()).then((data) => {
              if (data?.ok) console.log('[ChatStore] Server session deleted:', id);
              else console.warn('[ChatStore] Server delete response:', data);
            }).catch((err) => {
              console.warn('[ChatStore] Server-side session delete failed:', err);
            });
          });
        } catch (err) {
          console.error('[ChatStore] Failed to delete session:', err);
        }
      },

      async pinSession(id: string) {
        try {
          await chatRepo.pinSession(id);
          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to pin session:', err);
        }
      },

      async unpinSession(id: string) {
        try {
          await chatRepo.unpinSession(id);
          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to unpin session:', err);
        }
      },

      async updateStatus(id: string, status: TaskStatus) {
        try {
          await chatRepo.updateStatus(id, status);
          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to update status:', err);
        }
      },

      async clearGeneralSession() {
        try {
          await chatRepo.clearGeneralSession();

          set((state) => ({
            sessions: {
              ...state.sessions,
              [GENERAL_SESSION_ID]: createSessionState([]),
            },
            generalStarted: false,
          }));

          await get().refreshSessions();
        } catch (err) {
          console.error('[ChatStore] Failed to clear #general:', err);
        }
      },

      async regenerate(sessionId: string) {
        const { sessions } = get();
        const session = sessions[sessionId];
        if (!session) return;

        const stream = session.stream;
        if (stream.status === 'streaming') return;

        const trimmed = [...session.messages];
        while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== 'user') {
          trimmed.pop();
        }
        if (trimmed.length === 0) return;

        // Reset to trimmed messages and set streaming status immediately
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              messages: trimmed,
              activeTool: null,
              stream: {
                status: 'streaming',
                messageId: null,
                content: '',
                error: null,
                startedAt: Date.now(),
              },
            },
          },
        }));

        await chatRepo.updateMessages(sessionId, trimmed);

        const lastUserMessage = [...trimmed].reverse().find((m) => m.role === 'user');
        if (!lastUserMessage) return;

        const request: StreamRequest = {
          messages: [{ role: 'user', content: lastUserMessage.content }],
        };
        await streamClient.startStream(sessionId, request);
      },

      async refreshSessions() {
        try {
          const sessionIndex = await chatRepo.getSessions();
          set({ sessionIndex });
        } catch (err) {
          console.error('[ChatStore] Failed to refresh sessions:', err);
        }
      },

      abortStream(sessionId: string) {
        streamClient.abortStream(sessionId);
      },

      async syncWithBackend() {
        set({ isSyncing: true, syncError: null });

        try {
          const { sessions } = get();
          const streamingSessionIds = Object.entries(sessions)
            .filter(([, s]) => s.stream.status === 'streaming')
            .map(([id]) => id);

          const reconciled = await sessionSyncService.reconcile(streamingSessionIds);

          await chatRepo.saveSessions(reconciled);

          set({ sessionIndex: reconciled });

          const { activeSessionId } = get();
          if (activeSessionId) {
            const active = reconciled.find((s) => s.id === activeSessionId);
            if (active?.needsRefresh) {
              await get().loadSession(activeSessionId);
            }
          }

          set({ isSyncing: false });

          for (const s of reconciled) {
            if (s.isGeneral || s.isAiTitled) continue;
            try {
              await get().generateTaskTitle(s.id, s.title);
            } catch (err) {
              console.warn('[ChatStore] AI title generation failed for synced session:', s.id, err);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Backend sync failed';
          console.warn('[ChatStore] syncWithBackend failed:', err);
          set({ isSyncing: false, syncError: message });
        }
      },

      async initGeneralSession() {
        const { generalStarted, sessions } = get();
        if (generalStarted) return;

        set({ generalStarted: true });

        try {
          const persisted = await chatRepo.getSession(GENERAL_SESSION_ID);
          if (persisted && persisted.messages.length > 0) {
            set((state) => ({
              sessions: {
                ...state.sessions,
                [GENERAL_SESSION_ID]: createSessionState(persisted.messages),
              },
            }));
            return;
          }

          const startMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: GENERAL_START_CONTENT,
            timestamp: Date.now(),
            isHidden: true,
          };

          // Set streaming status immediately so typing indicator shows
          set((state) => ({
            sessions: {
              ...state.sessions,
              [GENERAL_SESSION_ID]: createSessionState([startMessage], {
                status: 'streaming',
                messageId: null,
                content: '',
                error: null,
                startedAt: Date.now(),
              }),
            },
          }));

          await chatRepo.addMessage(GENERAL_SESSION_ID, startMessage);

          const history = [{ role: 'user', content: GENERAL_START_CONTENT }];
          const request: StreamRequest = { messages: history };
          await streamClient.startStream(GENERAL_SESSION_ID, request);
        } catch (err) {
          console.error('[ChatStore] Failed to init #general:', err);
          set({ generalStarted: false });
        }
      },

      setActiveTool(sessionId: string, tool: ActiveTool) {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;

          let updatedSession = { ...session, activeTool: tool };
          if (!session.stream.messageId) {
            const messageId = crypto.randomUUID();
            const assistantMessage: ChatMessage = {
              id: messageId,
              role: 'assistant' as const,
              content: '',
              timestamp: Date.now(),
            };
            updatedSession = {
              ...updatedSession,
              messages: [...session.messages, assistantMessage],
              stream: {
                ...session.stream,
                status: 'streaming' as const,
                messageId,
                content: '',
                startedAt: session.stream.startedAt ?? Date.now(),
              },
            };
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: updatedSession,
            },
          };
        });
      },

      clearActiveTool(sessionId: string) {
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session || !session.activeTool) return state;

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                activeTool: null,
              },
            },
          };
        });
      },

      async incrementUnreadCount(sessionId: string) {
        set((state) => {
          const updatedIndex = state.sessionIndex.map((s) =>
            s.id === sessionId
              ? { ...s, unreadCount: (s.unreadCount ?? 0) + 1, needsRefresh: true }
              : s,
          );
          return { sessionIndex: updatedIndex };
        });
        await chatRepo.saveSessions(get().sessionIndex);
      },

      async clearUnreadCount(sessionId: string) {
        const entry = get().sessionIndex.find((s) => s.id === sessionId);
        if (!entry?.unreadCount) return;

        set((state) => {
          const updatedIndex = state.sessionIndex.map((s) =>
            s.id === sessionId ? { ...s, unreadCount: 0 } : s,
          );
          return { sessionIndex: updatedIndex };
        });
        await chatRepo.saveSessions(get().sessionIndex);
      },

      async reconcileOnResume() {
        // Re-entrancy guard: if a sync (this one or syncWithBackend) is
        // already running, skip — the in-flight one will leave the store
        // consistent.
        if (get().isSyncing) return;

        set({ isSyncing: true, syncError: null });

        try {
          // Step 1 — self-heal stale streaming flags.
          // streamClient.activeStreams (exposed via getActiveSessionIds) is
          // the authoritative truth: a controller in flight means the fetch
          // read-loop is still alive. Any local `stream.status === 'streaming'`
          // for a session NOT in this set is stale (likely from a stream that
          // errored while JS was suspended in the background).
          const liveSet = new Set(streamClient.getActiveSessionIds());
          set((state) => {
            let changed = false;
            const sessions = { ...state.sessions };
            for (const [id, s] of Object.entries(state.sessions)) {
              if (s.stream.status === 'streaming' && !liveSet.has(id)) {
                sessions[id] = {
                  ...s,
                  stream: { ...INITIAL_STREAM_STATE },
                  activeTool: null,
                };
                changed = true;
              }
            }
            return changed ? { sessions } : state;
          });

          // Step 2 — sync the session index (no per-session history fetch).
          // New remote rows get a placeholder title; their real title is
          // acquired organically when the user opens them.
          const merged = await sessionSyncService.syncSessionIndex();
          await chatRepo.saveSessions(merged);
          set({ sessionIndex: merged });

          // Step 3 — refresh the currently-open session's content.
          const { activeSessionId, sessions } = get();
          const activeMessageCount = activeSessionId
            ? sessions[activeSessionId]?.messages.length ?? 0
            : 0;
          if (activeSessionId && !liveSet.has(activeSessionId) && activeMessageCount > 0) {
            try {
              const messages = await sessionSyncService.loadFromBackend(activeSessionId);
              set((state) => ({
                sessions: {
                  ...state.sessions,
                  [activeSessionId]: createSessionState(messages),
                },
                sessionIndex: state.sessionIndex.map((s) =>
                  s.id === activeSessionId ? { ...s, needsRefresh: false } : s,
                ),
              }));
              await chatRepo.saveSessions(get().sessionIndex);
            } catch (err) {
              console.warn('[ChatStore] reconcileOnResume: active refresh failed:', err);
            }
          }

          set({ isSyncing: false });

          // Generate real titles for newly-discovered placeholder sessions.
          // Runs after isSyncing is cleared so the input is re-enabled and
          // the LLM round-trips don't block the user. Scoped to placeholder
          // rows only — existing sessions already have settled titles.
          for (const s of merged) {
            if (s.isGeneral || s.isAiTitled) continue;
            if (s.title !== PLACEHOLDER_NEW_SESSION_TITLE) continue;
            try {
              const messages = await sessionSyncService.loadFromBackend(s.id);
              const firstUserMsg = messages.find((m) => m.role === 'user');
              if (firstUserMsg) {
                await get().generateTaskTitle(s.id, firstUserMsg.content);
              }
            } catch (err) {
              console.warn('[ChatStore] AI title for resume-discovered session failed:', s.id, err);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Resume reconcile failed';
          console.warn('[ChatStore] reconcileOnResume failed:', err);
          set({ isSyncing: false, syncError: message });
        }
      },

      async refreshActiveSession() {
        const { activeSessionId } = get();
        if (!activeSessionId) return;

        try {
          const messages = await sessionSyncService.loadFromBackend(activeSessionId);

          set((state) => {
            const updatedIndex = state.sessionIndex.map((s) =>
              s.id === activeSessionId ? { ...s, needsRefresh: false } : s,
            );
            return {
              sessions: {
                ...state.sessions,
                [activeSessionId]: createSessionState(messages),
              },
              sessionIndex: updatedIndex,
            };
          });

          await chatRepo.saveSessions(get().sessionIndex);
        } catch (err) {
          console.warn('[ChatStore] refreshActiveSession failed:', err);
        }
      },

      async setCronSessionMeta(sessionId: string, title: string) {
        set((state) => {
          const updatedIndex = state.sessionIndex.map((s) =>
            s.id === sessionId
              ? { ...s, title, isRecurring: true, needsRefresh: true, unreadCount: 1 }
              : s,
          );
          return { sessionIndex: updatedIndex };
        });
        await chatRepo.saveSessions(get().sessionIndex);
      },
    })),
  );
}

// Selectors
export const selectActiveSession = (state: ChatStore): SessionState | null =>
  state.activeSessionId ? state.sessions[state.activeSessionId] ?? null : null;

/* Stable empty array — `?? []` would create a fresh reference each
   call, which trips zustand's getSnapshot caching check
   ("getSnapshot should be cached") and lands the app in a render
   loop when activeSessionId points at a session whose messages
   aren't loaded yet. */
const EMPTY_MESSAGES: ChatMessage[] = Object.freeze([]) as ChatMessage[];
export const selectActiveMessages = (state: ChatStore): ChatMessage[] =>
  selectActiveSession(state)?.messages ?? EMPTY_MESSAGES;

export const selectIsStreaming =
  (sessionId: string) =>
  (state: ChatStore): boolean =>
    state.sessions[sessionId]?.stream.status === 'streaming';

export const selectActiveIsStreaming = (state: ChatStore): boolean => {
  const session = selectActiveSession(state);
  return session?.stream.status === 'streaming';
};

export const selectStreamingMessageId = (state: ChatStore): string | null =>
  selectActiveSession(state)?.stream.messageId ?? null;

export const selectSessionList = (state: ChatStore): ChatSessionSummary[] =>
  state.sessionIndex;

export const selectIsGeneralSession = (state: ChatStore): boolean =>
  state.activeSessionId === GENERAL_SESSION_ID;

export const selectActiveStreamError = (state: ChatStore): string | null =>
  selectActiveSession(state)?.stream.error ?? null;

export const selectConnectionStatus = (state: ChatStore): 'idle' | 'streaming' | 'error' => {
  const session = selectActiveSession(state);
  if (!session) return 'idle';
  if (session.stream.status === 'streaming') return 'streaming';
  if (session.stream.status === 'error') return 'error';
  return 'idle';
};

export const selectIsSyncing = (state: ChatStore): boolean => state.isSyncing;

export const selectSyncError = (state: ChatStore): string | null => state.syncError;

export const selectIsSessionLoading = (state: ChatStore): boolean => {
  const session = selectActiveSession(state);
  return session?.stream.status === 'loading';
};

export const selectActiveTool = (state: ChatStore): ActiveTool | null =>
  selectActiveSession(state)?.activeTool ?? null;

export type { StoreDependencies as ChatStoreDependencies };
