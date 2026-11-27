import type { ComponentProps, ReactNode } from "react";
import "./PageHeading.css";

export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1 {...props} className={className ? `page-title ${className}` : "page-title"} />
  );
}

export function PageHeading({
  title,
  description,
  details,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        <PageTitle>{title}</PageTitle>
        {description && <p className="page-heading-description">{description}</p>}
        {details}
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </header>
  );
}
