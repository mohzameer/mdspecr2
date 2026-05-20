import { cn } from "@/lib/utils"

function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  )
}

export { Spinner }
