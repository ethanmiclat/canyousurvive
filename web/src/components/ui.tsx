import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'pixel-button-primary',
    ghost: 'pixel-button-ghost',
    danger: 'pixel-button-primary',
  }
  return (
    <button
      {...props}
      className={`pixel-button display ${styles[variant]} ${className}`}
    />
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow">{children}</h3>
}
