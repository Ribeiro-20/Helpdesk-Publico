import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderSize = "page" | "detail";

interface PageHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  backHref?: string;
  backLabel?: string;
  size?: PageHeaderSize;
}

export default function PageHeader({
  icon: Icon,
  title,
  description,
  meta,
  badge,
  backHref,
  backLabel,
  size = "page",
}: PageHeaderProps) {
  const titleClassName =
    size === "detail"
      ? "text-xl font-bold text-brand-700 leading-tight"
      : "text-2xl font-bold text-brand-700 leading-tight";
  const iconClassName = size === "detail" ? "mt-1 h-5 w-5 shrink-0 text-brand-700" : "mt-1 h-5 w-5 shrink-0 text-brand-700";

  return (
    <div className="space-y-3">
      {backHref && backLabel && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 transition-colors hover:text-brand-600"
        >
          <span aria-hidden="true">&larr;</span>
          <span>{backLabel}</span>
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={iconClassName} />

          <div className="min-w-0">
            <h1 className={titleClassName}>{title}</h1>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
            {meta && <div className="mt-1 flex flex-wrap items-center gap-3">{meta}</div>}
          </div>
        </div>

        {badge && <div className="mt-1 shrink-0">{badge}</div>}
      </div>
    </div>
  );
}