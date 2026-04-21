import { envInt } from "../../utils/envInt";
import { UnasConfig } from "./types";

export function loadUnasConfig(): UnasConfig {
  const unasHost = (process.env.UNAS_HOST ?? "").trim();
  const unasUser = (process.env.UNAS_USER ?? "").trim();
  const unasKeyPath = (process.env.UNAS_SSH_KEY_PATH ?? "").trim() || null;
  const unasPassword = process.env.UNAS_PASSWORD ?? null;
  // Considered enabled when we have host+user and at least one credential.
  const unasEnabled = Boolean(
    unasHost && unasUser && (unasKeyPath || unasPassword),
  );

  return {
    enabled: unasEnabled,
    name: process.env.UNAS_NAME ?? "UNAS",
    host: unasHost,
    port: envInt("UNAS_PORT", 22),
    user: unasUser,
    privateKeyPath: unasKeyPath,
    passphrase: process.env.UNAS_SSH_KEY_PASSPHRASE ?? null,
    password: unasPassword,
    execTimeoutMs: envInt("UNAS_EXEC_TIMEOUT_MS", 15_000),
  };
}
