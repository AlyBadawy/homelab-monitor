import clsx from 'clsx';

/**
 * Visual state for a single rollup tile.
 *   ok      → green dot, "OK"
 *   error   → red dot, "ERROR"
 *   warn    → amber dot, custom sub-label
 *   unknown → grey dot, "UNKNOWN" (used when a poller is enabled but
 *             hasn't produced data yet)
 *   tbd     → grey dot, "TBD" (reserved for an integration that hasn't
 *             been wired yet — e.g. Router, Switch, UPS, Backups today)
 */
export type TileState = 'ok' | 'error' | 'warn' | 'unknown' | 'tbd';

interface StatusTileProps {
  label: string;
  state: TileState;
  /**
   * Optional short text shown under the label (e.g. "3/5 online" for a
   * rollup). When omitted, the state's default label is used.
   */
  detail?: string;
  /** Click handler — only clickable tiles show a subtle hover border. */
  onClick?: () => void;
  title?: string;
}

const TONE: Record<
  TileState,
  { dot: string; text: string; defaultDetail: string }
> = {
  ok: {
    dot: 'bg-accent-emerald shadow-[0_0_8px_theme(colors.accent.emerald)]',
    text: 'text-accent-emerald',
    defaultDetail: 'OK',
  },
  error: {
    dot: 'bg-accent-rose shadow-[0_0_8px_theme(colors.accent.rose)]',
    text: 'text-accent-rose',
    defaultDetail: 'ERROR',
  },
  warn: {
    dot: 'bg-accent-amber shadow-[0_0_8px_theme(colors.accent.amber)]',
    text: 'text-accent-amber',
    defaultDetail: 'WARN',
  },
  unknown: {
    dot: 'bg-text-dim',
    text: 'text-text-dim',
    defaultDetail: 'UNKNOWN',
  },
  tbd: {
    dot: 'bg-text-dim/40',
    text: 'text-text-dim',
    defaultDetail: 'TBD',
  },
};

/**
 * Small rollup tile shown at the top of the page. Tiles are purely
 * informational today — they read from the summary data already in state
 * and don't trigger fetches of their own.
 */
export function StatusTile({
  label,
  state,
  detail,
  onClick,
  title,
}: StatusTileProps) {
  const tone = TONE[state];
  const clickable = !!onClick;
  const shown = detail ?? tone.defaultDetail;

  return (
    <div
      className={clsx(
        'relative rounded-md border border-border bg-bg-800/60 px-2.5 py-2',
        'flex items-center gap-2',
        clickable && 'cursor-pointer transition-colors hover:border-border-strong',
        state === 'tbd' && 'opacity-60',
      )}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      title={title}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone.dot,
          state === 'ok' && 'animate-pulse',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-mono text-[0.7rem] uppercase tracking-[0.16em] text-text"
          title={label}
        >
          {label}
        </div>
        <div
          className={clsx(
            'truncate font-mono text-[0.6rem] uppercase tracking-[0.18em]',
            tone.text,
          )}
        >
          {shown}
        </div>
      </div>
    </div>
  );
}
