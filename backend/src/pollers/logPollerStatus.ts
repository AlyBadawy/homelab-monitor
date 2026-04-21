import { LogLevel, logToConsole } from "../utils/logger";
import { PollerEntry } from "./pollers";

export function logPollerStatus(entry: PollerEntry) {
  if (entry.enabled) {
    logToConsole(LogLevel.info, `[pollers] starting ${entry.name}...`);
  } else {
    logToConsole(
      LogLevel.warn,
      `[pollers] ${entry.name} disabled (${entry.disabledReason})`,
    );
  }
}
