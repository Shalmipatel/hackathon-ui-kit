/**
 * Provider initialization and dependency injection.
 * Creates singleton instances of all infrastructure providers.
 *
 * GatewayTransport is the composition pivot: created once with auth + storage,
 * then injected into every gateway client. Individual clients never receive
 * IAuthRepository and IStorageProvider for HTTP concerns — they receive
 * GatewayTransport, which owns all HTTP concerns.
 */

import { StubAuthProvider } from '@/providers/auth';
import { LocalStorageProvider, IndexedDBStorageProvider } from '@/providers/storage';
import { ChatRepository, StreamClient, NonStreamingClient, SystemSession } from '@/providers/chat';
import { AgentStreamClient } from '@/providers/stream/agent-stream-client';
import { SessionSyncClient, SessionSync } from '@/providers/sync';
import { SettingsRepository } from '@/providers/settings';
import { TranscriptionClient, TranscriptionTransport } from '@/providers/transcription';
import { Connection } from '@/providers/connection';
import { PlatformEvents } from '@/providers/events';
import { SocialClient, IntegrationClient } from '@/providers/connections';
import { DataClient, BrowserConnectionRepository, PreferenceRepository } from '@/providers/data';
import { GatewayTransport } from '@/providers/transport/gateway-transport';
import { ExternalTransport } from '@/providers/transport/external-transport';
import { ClientEventsClient } from '@/providers/client-events';
import type {
  IStorageProvider,
  IAuthRepository,
  IChatRepository,
  ISettingsRepository,
  IStreamClient,
  INonStreamingClient,
  ISystemSession,
  ITranscriptionClient,
  ISessionSyncClient,
  ISocialClient,
  IIntegrationClient,
  IContextDataClient,
  ExtensionSettings,
} from '@/types';
import type { IBrowserConnectionRepository } from '@/types/browser-connection-repository.interface';
import type { IPreferenceRepository } from '@/types/preference-repository.interface';
import { DEFAULT_SETTINGS } from '@/types';
import { getDefaultConfig } from '@/features/app/config';

interface ProviderRegistry {
  storageProvider: IStorageProvider;
  chatStorageProvider: IStorageProvider;
  authProvider: IAuthRepository;
  gateway: GatewayTransport;
  chatRepo: IChatRepository;
  settingsRepo: ISettingsRepository;
  streamClient: IStreamClient;
  nonStreamingClient: INonStreamingClient;
  systemSession: ISystemSession;
  transcriptionClient: ITranscriptionClient;
  sessionSyncClient: ISessionSyncClient;
  sessionSync: SessionSync;
  connection: Connection;
  platformEvents: PlatformEvents;
  socialClient: ISocialClient;
  integrationClient: IIntegrationClient;
  contextDataClient: IContextDataClient;
  browserConnectionRepo: IBrowserConnectionRepository;
  preferenceRepo: IPreferenceRepository;
}

let registry: ProviderRegistry | null = null;

export function initializeProviders(): void {
  if (registry) return;

  const storage = new LocalStorageProvider();
  const chatStorage = new IndexedDBStorageProvider();

  let parsedSettings: Partial<ExtensionSettings> = {};
  try {
    const rawSettings = localStorage.getItem('settings');
    if (rawSettings) {
      parsedSettings = JSON.parse(rawSettings) as Partial<ExtensionSettings>;
    }
  } catch {
    // Corrupted settings blob -- fall back to defaults
  }
  const hasEnvAccessToken = Boolean(import.meta.env.VITE_NEOCLAW_API_KEY?.trim());
  const tokenAuthEnabled = hasEnvAccessToken
    || parsedSettings.tokenAuthEnabled
    || DEFAULT_SETTINGS.tokenAuthEnabled;

  const agentApiEnabled = parsedSettings.agentApiEnabled ?? DEFAULT_SETTINGS.agentApiEnabled;

  const config = getDefaultConfig();

  /* Starter kit: always use the stub auth provider so the app boots
   * straight in. Swap this for a real IAuthRepository implementation
   * when you wire your own backend. */
  const auth: IAuthRepository = new StubAuthProvider();

  const gateway = new GatewayTransport(auth, storage, tokenAuthEnabled);
  const clientEventsClient = new ClientEventsClient(gateway);

  const chatRepo = new ChatRepository(chatStorage);
  const settingsRepo = new SettingsRepository(storage);
  const streamClient: IStreamClient = agentApiEnabled
    ? new AgentStreamClient(gateway, clientEventsClient)
    : new StreamClient(gateway);
  const nonStreamingClient = new NonStreamingClient(gateway);
  const systemSession = new SystemSession(nonStreamingClient);
  const transcriptionTransport = new TranscriptionTransport(storage);
  const transcriptionClient = new TranscriptionClient(transcriptionTransport);
  const sessionSyncClient = new SessionSyncClient(gateway);
  const sessionSync = new SessionSync(sessionSyncClient, chatRepo);
  const connection = new Connection(gateway, auth, storage);
  const platformEvents = new PlatformEvents(gateway, auth, storage);

  const socialTransport = new ExternalTransport('', auth);
  const integrationProxyTransport = new ExternalTransport('', auth, true);
  const integrationDirectTransport = new ExternalTransport(config.api.integration.baseUrl, auth, true);
  const socialClient = new SocialClient(socialTransport);
  const integrationClient = new IntegrationClient(integrationProxyTransport, integrationDirectTransport, config.api.identity.callbackBaseUrl);

  const contextDataClient = new DataClient(gateway);
  const browserConnectionRepo = new BrowserConnectionRepository(contextDataClient);
  const preferenceRepo = new PreferenceRepository(contextDataClient);

  registry = {
    storageProvider: storage,
    chatStorageProvider: chatStorage,
    authProvider: auth,
    gateway,
    chatRepo,
    settingsRepo,
    streamClient,
    nonStreamingClient,
    systemSession,
    transcriptionClient,
    sessionSyncClient,
    sessionSync,
    connection,
    platformEvents,
    socialClient,
    integrationClient,
    contextDataClient,
    browserConnectionRepo,
    preferenceRepo,
  };
}

export function getProviders(): ProviderRegistry {
  if (!registry) throw new Error('Providers not initialized. Call initializeProviders() first.');
  return registry;
}

export function getStorageProvider(): IStorageProvider {
  return getProviders().storageProvider;
}

export function getChatRepo(): IChatRepository {
  return getProviders().chatRepo;
}

export function getAuthProvider(): IAuthRepository {
  return getProviders().authProvider;
}

export function getGateway(): GatewayTransport {
  return getProviders().gateway;
}

export function getStreamClient(): IStreamClient {
  return getProviders().streamClient;
}

export function getNonStreamingClient(): INonStreamingClient {
  return getProviders().nonStreamingClient;
}

export function getSystemSession(): ISystemSession {
  return getProviders().systemSession;
}

export function getTranscriptionClient(): ITranscriptionClient {
  return getProviders().transcriptionClient;
}

export function getSessionSyncService(): SessionSync {
  return getProviders().sessionSync;
}

export function getPlatformEvents(): PlatformEvents {
  return getProviders().platformEvents;
}

export function getConnectionManager(): Connection {
  return getProviders().connection;
}

export function getSocialClient(): ISocialClient {
  return getProviders().socialClient;
}

export function getIntegrationClient(): IIntegrationClient {
  return getProviders().integrationClient;
}

export function getContextDataClient(): IContextDataClient {
  return getProviders().contextDataClient;
}

export function getBrowserConnectionRepository(): IBrowserConnectionRepository {
  return getProviders().browserConnectionRepo;
}

export function getPreferenceRepository(): IPreferenceRepository {
  return getProviders().preferenceRepo;
}
