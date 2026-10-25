import { vi } from "vitest";

export function fakeEvent() {
  const listeners: Array<(...args: any[]) => any> = [];
  const filters: Array<{ types?: string[] } | undefined> = [];
  return {
    listeners,
    addListener: vi.fn((fn: (...args: any[]) => any, filter?: any, _extra?: any) => {
      listeners.push(fn);
      filters.push(filter);
    }),
    // Like the browser, skip webRequest listeners whose `types` filter
    // excludes the request's type.
    fire: (...args: any[]) =>
      listeners.flatMap((fn, i) => {
        const types = filters[i]?.types;
        const type = args[0]?.type;
        return types && type && !types.includes(type) ? [] : [fn(...args)];
      }),
  };
}

export function createFakeBrowser(storageData: Record<string, unknown> = {}) {
  const portOnMessage = fakeEvent();
  const port = {
    name: "",
    onMessage: portOnMessage,
    onDisconnect: fakeEvent(),
    postMessage: vi.fn(),
  };

  return {
    storage: {
      sync: {
        get: vi.fn(async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            wanted.filter((k) => k in storageData).map((k) => [k, storageData[k]])
          );
        }),
        set: vi.fn(async () => {}),
      },
      onChanged: fakeEvent(),
    },
    runtime: {
      onInstalled: fakeEvent(),
      onMessage: fakeEvent(),
      onConnect: fakeEvent(),
      sendMessage: vi.fn(async (_message?: unknown): Promise<any> => ({})),
      connect: vi.fn(() => port),
    },
    contextMenus: {
      removeAll: vi.fn(async () => {}),
      create: vi.fn(),
      onClicked: fakeEvent(),
    },
    downloads: { onCreated: fakeEvent() },
    webRequest: {
      onBeforeRequest: fakeEvent(),
      onBeforeSendHeaders: fakeEvent(),
      onHeadersReceived: fakeEvent(),
    },
    tabs: {
      sendMessage: vi.fn(async (..._args: unknown[]) => ({})),
      onRemoved: fakeEvent(),
      onUpdated: fakeEvent(),
    },
    devtools: {
      network: { onRequestFinished: fakeEvent() },
      panels: { create: vi.fn() },
    },
    port,
  };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;

export async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

export async function loadScript(name: string, fake: FakeBrowser) {
  vi.resetModules();
  vi.stubGlobal("browser", fake);
  await import(`../src/${name}.ts`);
  await flush();
}

export function silenceConsole() {
  for (const m of ["debug", "log", "warn"] as const) {
    vi.spyOn(console, m).mockImplementation(() => {});
  }
}
