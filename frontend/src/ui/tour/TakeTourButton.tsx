import { Button } from '@base-ui/react/button'
import { Compass } from 'lucide-react'
import { secondaryButton } from '../components/classes'
import { useTour } from './GuidedTour'

export function TakeTourButton() {
  const tour = useTour()
  if (!tour) return null
  const { start, registerStartButton } = tour
  return (
    <Button ref={registerStartButton} className={`${secondaryButton} flex-none max-md:ml-auto max-sm:w-9 max-sm:px-0`} onClick={start}>
      <Compass size={16} aria-hidden />
      <span className="max-sm:sr-only">Take the tour</span>
    </Button>
  )
}
