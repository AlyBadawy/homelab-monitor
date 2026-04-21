export function nullIfUndef(v: number | undefined | null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
