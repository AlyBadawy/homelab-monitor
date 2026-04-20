import { PropsWithChildren, ReactNode } from "react";

interface SectionProps {
  title: string;
  accessory?: ReactNode;
}

/**
 * Titled section wrapper. The body is free-form — the caller supplies its
 * own grid or layout so sections can differ (e.g. 2-up infrastructure row
 * vs. VM rows with dynamic column counts).
 */
export function Section({
  title,
  accessory,
  children,
}: PropsWithChildren<SectionProps>) {
  return (
    <section className="relative z-10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 md:w-32 bg-accent-cyan/60" />
          <h2 className="section-title">{title}</h2>
        </div>
        {accessory}
      </div>
      {children}
    </section>
  );
}
