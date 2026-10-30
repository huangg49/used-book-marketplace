import type { ReactNode } from "react";

interface DashboardSectionHeadingProps {
  id?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  inverse?: boolean;
}

export function DashboardSectionHeading({
  id,
  title,
  description,
  icon,
  inverse = false,
}: DashboardSectionHeadingProps) {
  return (
    <div className="flex min-w-0 items-center gap-space-sm" data-overview-heading>
      {icon && (
        <div aria-hidden="true" className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${inverse ? "bg-white/10 text-white" : "bg-surface-container-high text-secondary"}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex flex-col gap-1">
        <h2 id={id} className={`m-0 text-xl md:text-2xl leading-snug font-bold tracking-normal ${inverse ? "text-white" : "text-primary"}`}>
          {title}
        </h2>
        {description && (
          <p className={`m-0 font-body-sm text-body-sm leading-normal ${inverse ? "text-[#f5eddc]/85" : "text-on-surface-variant"}`}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
