// Minimal leveled logger. Wraps console with ISO timestamps + level so logs
// are scannable in production without pulling in a heavy dependency.

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) &&
  ORDER[process.env.LOG_LEVEL as Level] !== undefined
    ? (process.env.LOG_LEVEL as Level)
    : "info";

function emit(level: Level, args: unknown[]) {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  // eslint-disable-next-line no-console
  (console[level === "debug" ? "log" : level] as (...a: unknown[]) => void)(
    prefix,
    ...args,
  );
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
