import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardRowProps<T> {
  items: T[];
  /** Maximum number of cards per row on desktop. Below the breakpoint, always 1 col. */
  maxPerRow: 2 | 3;
  renderItem: (item: T) => ReactNode;
  keyFor: (item: T) => string;
  /** Gap between cards (Tailwind class). Defaults to `gap-4`. */
  gap?: string;
}

/**
 * Renders a grid of cards that:
 *   - stacks to a single column below the `md` breakpoint (mobile),
 *   - chunks into rows of up to `maxPerRow` on md+,
 *   - makes every row fill 100% width — so a trailing short row (e.g. 1 VM
 *     on a row by itself) still stretches to the full container width rather
 *     than sitting in a fixed-size column.
 *
 * Visual contract: regardless of item count, the overall card area equals
 * the container width. 1 card = 100%, 2 cards = two 50%s, 3 cards = three
 * 33%s, 4 cards = row of 3 + row of 1 (the lone card takes 100%), 5 cards =
 * row of 3 + row of 2 (halves), etc.
 */
export function CardRow<T>({
  items,
  maxPerRow,
  renderItem,
  keyFor,
  gap = 'gap-4',
}: CardRowProps<T>) {
  if (items.length === 0) return null;

  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += maxPerRow) {
    rows.push(items.slice(i, i + maxPerRow));
  }

  return (
    <div className={clsx('space-y-4')}>
      {rows.map((row, idx) => (
        <div
          key={idx}
          className={clsx(
            'grid',
            gap,
            // Below md: always single column (cards stack).
            'grid-cols-1',
            // md+: distribute evenly across the row based on row length.
            row.length === 2 && 'md:grid-cols-2',
            row.length === 3 && 'md:grid-cols-3',
          )}
        >
          {row.map((item) => (
            <div key={keyFor(item)} className="min-w-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
