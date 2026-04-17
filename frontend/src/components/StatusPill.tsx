import clsx from 'clsx';
import type { TargetStatus } from '../lib/api';

interface StatusPillProps {
  status: TargetStatus;
}

const STYLES: Record<TargetStatus, { dot: string; text: string; label: string }> =
  {
    online: {
      dot: 'bg-accent-emerald shadow-[0_0_8px_theme(colors.accent.emerald)]',
      text: 'text-accent-emerald',
      label: 'ONLINE',
    },
    offline: {
      dot: 'bg-accent-rose shadow-[0_0_8px_theme(colors.accent.rose)]',
      text: 'text-accent-rose',
      label: 'OFFLINE',
    },
    unknown: {
      dot: 'bg-text-dim',
      text: 'text-text-dim',
      label: 'UNKNOWN',
    },
  };

export function StatusPill({ status }: StatusPillProps) {
  const s = STYLES[status];
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
      <span
        className={clsx(
          'font-mono text-[0.65rem] uppercase tracking-[0.22em]',
          s.text,
        )}
      >
        {s.label}
      </span>
    </div>
  );
}
