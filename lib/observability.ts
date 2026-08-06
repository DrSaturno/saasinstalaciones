const SENSITIVE_KEY = /authorization|cookie|password|secret|token|body|content|message|signed.?url|file/i;

type LogLevel = "info" | "warn" | "error";
type Primitive = string | number | boolean | null;
type LogValue = Primitive | LogValue[] | { [key: string]: LogValue };
export type LogContext = Record<string, unknown>;

function sanitizeValue(value: unknown, depth = 0): LogValue {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, code: "cause" in value ? String(value.cause ?? "unknown") : "unknown" };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1)]),
    );
  }
  return String(value);
}

export function sanitizeLogContext(context: LogContext = {}): Record<string, LogValue> {
  return sanitizeValue(context) as Record<string, LogValue>;
}

export function createCorrelationId(candidate?: string | null): string {
  if (candidate && /^[a-zA-Z0-9_-]{8,80}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}

export function logEvent(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: event.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100),
    ...sanitizeLogContext(context),
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export async function observeOperation<T>(
  event: string,
  context: LogContext,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await operation();
    logEvent("info", `${event}.completed`, {
      ...context,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    logEvent("error", `${event}.failed`, {
      ...context,
      duration_ms: Math.round(performance.now() - startedAt),
      error,
    });
    throw error;
  }
}
