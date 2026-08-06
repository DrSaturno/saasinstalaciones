import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCorrelationId,
  logEvent,
  observeOperation,
  sanitizeLogContext,
} from "@/lib/observability";

afterEach(() => vi.restoreAllMocks());

describe("structured observability", () => {
  it("redacts sensitive values recursively", () => {
    expect(
      sanitizeLogContext({
        company_id: "company-1",
        authorization: "Bearer private",
        nested: { refreshToken: "private", count: 2 },
      }),
    ).toEqual({
      company_id: "company-1",
      authorization: "[redacted]",
      nested: { refreshToken: "[redacted]", count: 2 },
    });
  });

  it("accepts safe correlation ids and replaces invalid ones", () => {
    expect(createCorrelationId("request_1234")).toBe("request_1234");
    expect(createCorrelationId("bad id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("emits JSON and never serializes an error message", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logEvent("error", "command failed", { error: new Error("private row data"), token: "secret" });
    const entry = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(entry.event).toBe("command_failed");
    expect(entry.token).toBe("[redacted]");
    expect(JSON.stringify(entry)).not.toContain("private row data");
  });

  it("logs duration and preserves the operation result", async () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(observeOperation("sync.command", { correlation_id: "request_1234" }, async () => 42)).resolves.toBe(42);
    const entry = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(entry.event).toBe("sync.command.completed");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
