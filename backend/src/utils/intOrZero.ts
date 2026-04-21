export function intOrZero(v: number | undefined | null): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
