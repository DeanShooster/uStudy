export function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress))
}

export function progressWidth(progress: number) {
  return `${clampProgress(progress)}%`
}

export function progressFill(progress: number) {
  const value = clampProgress(progress)
  const hue = value <= 50 ? (value / 50) * 32 : 32 + ((value - 50) / 50) * 110
  return `hsl(${hue} 78% 56%)`
}

export function topicProgress(
  topics: { topic: { name: string }; progress: number }[] | undefined,
  name: string,
) {
  return topics?.find((entry) => entry.topic.name === name)?.progress
}
