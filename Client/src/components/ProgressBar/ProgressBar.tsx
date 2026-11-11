import { dictionary } from '../../dictionary/dictionary'
import { classes } from '../../utils/classes'
import { clampProgress, progressFill, progressWidth } from '../../utils/progress'
import './ProgressBar.scss'

export default function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const value = clampProgress(progress)

  return (
    <span
      className={classes('progress-bar', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={dictionary.courses.progress}
    >
      <span style={{ width: progressWidth(value), background: progressFill(value) }} />
    </span>
  )
}
