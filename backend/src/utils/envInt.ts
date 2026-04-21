export function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;

  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
