export interface UnasConfig {
  enabled: boolean;
  name: string;
  host: string;
  port: number;
  user: string;
  privateKeyPath: string | null;
  passphrase: string | null;
  password: string | null;
  execTimeoutMs: number;
}
