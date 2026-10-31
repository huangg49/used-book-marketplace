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
    <div className="flex min-w-0 items-start gap-space-sm" data-overview-heading>
      {icon && (
        <div aria-hidden="true" className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-lg border flex items-center justify-center [&>svg]:h-6 [&>svg]:w-6 ${inverse ? "bg-white/10 border-white/15 text-white" : "bg-surface-container-low border-outline-variant/30 text-primary"}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 self-center flex flex-col gap-1">
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
