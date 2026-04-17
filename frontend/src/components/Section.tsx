import { PropsWithChildren, ReactNode } from 'react';

interface SectionProps {
  title: string;
  accessory?: ReactNode;
}

export function Section({
  title,
  accessory,
  children,
}: PropsWithChildren<SectionProps>) {
  return (
    <section className="relative z-10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-accent-cyan/60" />
          <h2 className="section-title">{title}</h2>
        </div>
        {accessory}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
