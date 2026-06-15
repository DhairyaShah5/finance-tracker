export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="h-7 w-1.5 rounded-full bg-brand" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground sm:pl-[18px]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
