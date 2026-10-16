import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import clsx from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
}

export function Button({
  asChild = false,
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={clsx(
        'button',
        `button-${variant}`,
        `button-${size}`,
        className,
      )}
      {...props}
    >
      {leadingIcon}
      {children}
    </Comp>
  )
}
