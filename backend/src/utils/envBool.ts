export function envBool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined) return def;

  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}
