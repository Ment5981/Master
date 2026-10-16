import clsx from 'clsx'

interface ProgressRingProps {
  value: number
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

const sizes = {
  sm: 28,
  md: 38,
  lg: 52,
}

export function ProgressRing({
  value,
  size = 'md',
  label,
  className,
}: ProgressRingProps) {
  const dimension = sizes[size]
  const normalized = Math.min(100, Math.max(0, value))

  return (
    <div
      className={clsx('progress-ring', className)}
      style={
        {
          '--progress': `${normalized * 3.6}deg`,
          width: dimension,
          height: dimension,
        } as React.CSSProperties
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      aria-label={label ?? `进度 ${normalized}%`}
    >
      <span>{size === 'sm' ? normalized : `${normalized}%`}</span>
    </div>
  )
}
