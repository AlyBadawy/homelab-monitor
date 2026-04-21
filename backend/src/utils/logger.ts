export enum LogLevel {
  error = "error",
  warn = "warn",
  info = "info",
  debug = "debug",
}

// severity ranking
const LogLevelWeight: Record<LogLevel, number> = {
  [LogLevel.error]: 0,
  [LogLevel.warn]: 1,
  [LogLevel.info]: 2,
  [LogLevel.debug]: 3,
};

// read from env (fallback to "info")
const MIN_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) ?? LogLevel.info;
const minLevelWeight = LogLevelWeight[MIN_LOG_LEVEL] ?? LogLevelWeight.info;

interface LoggerLevels {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

const logger: LoggerLevels = {
  error: (...args) => console.error("[ERROR]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  info: (...args) => console.info("[INFO]", ...args),
  debug: (...args) => console.debug("[DEBUG]", ...args),
};

export function logToConsole(level: LogLevel, ...args: any[]) {
  if (LogLevelWeight[level] <= minLevelWeight) {
    logger[level](...args);
  }
}
