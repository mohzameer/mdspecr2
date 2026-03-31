const DELAYS = { notion: 350, confluence: 500, clickup: 650 } as const
type TargetType = keyof typeof DELAYS

const lastRun = new Map<TargetType, number>()

export async function rateLimit(targetType: TargetType): Promise<void> {
  const delay = DELAYS[targetType]
  const last = lastRun.get(targetType) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < delay) {
    await new Promise((resolve) => setTimeout(resolve, delay - elapsed))
  }
  lastRun.set(targetType, Date.now())
}
