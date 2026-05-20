import { cn } from "@/lib/utils"

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const toneStyles: Record<StatusTone, { dot: string; text: string }> = {
  success: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  warning: { dot: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400" },
  danger: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  info: { dot: "bg-brand", text: "text-brand" },
  neutral: { dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
}

function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone
  label: string
  className?: string
}) {
  const s = toneStyles[tone]
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium capitalize",
        s.text,
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
      {label}
    </span>
  )
}

export { StatusBadge }
export type { StatusTone }
