import { motion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon?: ReactNode
  variant?: 'aqua' | 'pink'
  children: ReactNode
}

/** Convex, skeuomorphic pill button. Motion owns hover/press; CSS owns the gloss. */
export function GlossyButton({ icon, variant = 'aqua', children, className = '', ...rest }: Props) {
  return (
    <motion.button
      type="button"
      className={`aqua-btn ${variant === 'pink' ? 'aqua-btn--pink' : ''} ${className}`}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.94, y: 2 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
      {...rest}
    >
      {icon && <span className="aqua-btn__gem">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  )
}
