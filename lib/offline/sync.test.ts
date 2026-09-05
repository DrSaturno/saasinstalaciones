import { beforeEach, describe, expect, it, vi } from "vitest";

type TestOutboxItem = {
  id: string;
  kind: "update" | "transition" | "chat" | "chat_read";
  orderId?: string;
  photoIds?: string[];
  toStatus?: "en_camino" | "en_sitio" | "en_proceso" | "en_revision";
  createdAt: number;
  tries: number;
  blocked?: boolean;
  lastError?: string;
};

const state = vi.hoisted(() => {
  const items: TestOutboxItem[] = [];
  const outbox = {
    orderBy: vi.fn(() => ({
      toArray: vi.fn(async () => [...items]),
    })),
    update: vi.fn(async (id: string, changes: Partial<TestOutboxItem>) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return 0;
      Object.assign(item, changes);
      return 1;
    }),
    get: vi.fn(async (id: string) => items.find((item) => item.id === id)),
    delete: vi.fn(async (id: string) => {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
    }),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        filter: vi.fn((predicate: (item: TestOutboxItem) => boolean) => ({
          toArray: vi.fn(async () => items.filter(predicate)),
        })),
      })),
    })),
  };
  const photos = { delete: vi.fn(async () => undefined) };
  const db = {
    outbox,
    photos,
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === "function") await callback();
    }),
  };

  return { items, outbox, photos, db };
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/actions/tasks", () => ({ syncInstallerTransition: vi.fn() }));
vi.mock("@/lib/push/events", () => ({ requestPushDelivery: vi.fn() }));
vi.mock("@/lib/observability", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/offline/db", () => ({ db: state.db }));

import {
  discardOutboxItem,
  latestPendingTransition,
  queueSnapshot,
  retryOutboxItem,
} from "@/lib/offline/sync";

describe("offline queue recovery", () => {
  beforeEach(() => {
    state.items.splice(0);
    vi.clearAllMocks();
  });

  it("separa pendientes normales, reintentos repetidos y bloqueos", async () => {
    state.items.push(
      { id: "fresh", kind: "update", createdAt: 1, tries: 0 },
      { id: "retrying", kind: "chat", createdAt: 2, tries: 3 },
      {
        id: "blocked",
        kind: "transition",
        orderId: "order-1",
        createdAt: 3,
        tries: 1,
        blocked: true,
        lastError: "La orden cambió de estado",
      },
    );

    await expect(queueSnapshot()).resolves.toEqual({
      pending: 3,
      blocked: 1,
      issues: [
        {
          id: "retrying",
          kind: "chat",
          orderId: null,
          createdAt: 2,
          tries: 3,
          blocked: false,
          reason: null,
        },
        {
          id: "blocked",
          kind: "transition",
          orderId: "order-1",
          createdAt: 3,
          tries: 1,
          blocked: true,
          reason: "La orden cambió de estado",
        },
      ],
    });
  });

  it("habilita un bloqueo para reintentar", async () => {
    state.items.push({
      id: "blocked",
      kind: "transition",
      createdAt: 1,
      tries: 1,
      blocked: true,
      lastError: "conflict",
    });

    await retryOutboxItem("blocked");

    expect(state.outbox.update).toHaveBeenCalledWith("blocked", {
      blocked: false,
      lastError: undefined,
    });
    expect(state.items[0]?.blocked).toBe(false);
  });

  it("descarta también las fotos locales dependientes", async () => {
    state.items.push({
      id: "update-1",
      kind: "update",
      photoIds: ["photo-1", "photo-2"],
      createdAt: 1,
      tries: 3,
    });

    await discardOutboxItem("update-1");

    expect(state.photos.delete).toHaveBeenCalledTimes(2);
    expect(state.outbox.delete).toHaveBeenCalledWith("update-1");
    expect(state.items).toHaveLength(0);
  });

  it("recupera el último estado optimista no bloqueado", async () => {
    state.items.push(
      {
        id: "first",
        kind: "transition",
        orderId: "order-1",
        toStatus: "en_camino",
        createdAt: 1,
        tries: 0,
      },
      {
        id: "latest",
        kind: "transition",
        orderId: "order-1",
        toStatus: "en_sitio",
        createdAt: 2,
        tries: 0,
      },
      {
        id: "rejected",
        kind: "transition",
        orderId: "order-1",
        toStatus: "en_proceso",
        createdAt: 3,
        tries: 1,
        blocked: true,
      },
    );

    await expect(latestPendingTransition("order-1")).resolves.toBe("en_sitio");
  });
});
