import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTransitionProps {
  children: ReactNode
}

/**
 * Wrap content with a fade+slide-up animation on every route change.
 * Uses a key on `location.pathname` to retrigger the CSS animation class.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Re-trigger animation by removing and re-adding the class
    el.classList.remove('page-enter')
    // Force reflow
    void el.offsetWidth
    el.classList.add('page-enter')
  }, [location.pathname])

  return (
    <div ref={ref} className="page-enter">
      {children}
    </div>
  )
}
