/**
 * Parsers for optional/auxiliary fields in the Proxmox API responses.
 *
 * Kept separate from `client.ts` (HTTP) and `poller.ts` (orchestration) so the
 * parse logic is easy to unit-test in isolation without dragging in the full
 * API surface.
 */

/**
 * Extract a single "CPU temperature" (°C) from PVE's `thermalstate` field.
 *
 * PVE 8+/9 returns the output of `sensors -j` as a JSON *string* when
 * `lm-sensors` is installed on the node. The shape looks like:
 *
 *   {
 *     "coretemp-isa-0000": {
 *       "Adapter": "ISA adapter",
 *       "Package id 0": { "temp1_input": 45.0, "temp1_max": 100.0, ... },
 *       "Core 0":        { "temp2_input": 42.0, ... },
 *       "Core 1":        { "temp3_input": 44.0, ... }
 *     },
 *     "k10temp-pci-00c3": { "Tctl": { "temp1_input": 48.0 }, ... },
 *     "nvme-pci-0400":    { "Composite": { "temp1_input": 37.0 } },   <- DRIVE, skip
 *     "drivetemp-scsi-0": { ... }                                     <- DRIVE, skip
 *   }
 *
 * We:
 *   1. whitelist chips whose name looks like a CPU sensor (coretemp / k10temp /
 *      zenpower / generic "cpu") — that avoids picking up NVMe or HDD temps;
 *   2. walk one level deep and take every `temp*_input` value we can find;
 *   3. return the max — because "CPU temp" on multi-core systems is really
 *      "the hottest core right now", same semantics as our UNAS thermal-zone
 *      parser;
 *   4. apply a sanity guard (0–150 °C) so a junk value can't escape.
 *
 * Returns null when: no thermalstate, parse error, no matching chips, or all
 * values failed the sanity guard. Null is rendered as "—" in the UI.
 */
export function parseThermalState(thermalstate: string | undefined): number | null {
  if (!thermalstate) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(thermalstate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  // Chip-name whitelist. Broad enough to cover common Intel/AMD/ARM patterns
  // without accidentally including NVMe (`nvme-*`) or SATA (`drivetemp-*`).
  const CPU_CHIP_RE = /^(?:coretemp|k10temp|k8temp|zenpower|zenergy|cpu)/i;

  let max = -Infinity;
  for (const [chipName, chipData] of Object.entries(parsed as Record<string, unknown>)) {
    if (!CPU_CHIP_RE.test(chipName)) continue;
    if (!chipData || typeof chipData !== 'object') continue;

    for (const section of Object.values(chipData as Record<string, unknown>)) {
      if (!section || typeof section !== 'object') continue;
      for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
        // `sensors -j` names inputs `temp<N>_input`. Crit / max / alarms use
        // different suffixes so they won't match this regex.
        if (!/^temp\d+_input$/.test(key)) continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (value > max) max = value;
      }
    }
  }

  if (max === -Infinity) return null;
  if (max < 0 || max > 150) return null;
  return Math.round(max);
}
