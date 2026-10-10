import { Drawer } from '@base-ui/react/drawer'
import { Menu, X } from 'lucide-react'
import { useMediaQuery } from '../components/useMediaQuery'
import { Sidebar } from './Sidebar'

const iconButton =
  'grid size-10 flex-none cursor-pointer place-items-center rounded-full text-g700 transition-[background-color,color,scale] duration-150 hover:bg-mint hover:text-g900 active:scale-95'

/** Shell owns `open`, so the guided tour can open the drawer for a step that points into it. */
export function NavDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const docked = useMediaQuery('(min-width: 1024px)')
  return (
    <Drawer.Root open={open && !docked} onOpenChange={onOpenChange} swipeDirection="left">
      <Drawer.Trigger className={`${iconButton} -ml-2 lg:hidden`} aria-label="Open navigation">
        <Menu size={20} aria-hidden />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-g900/25 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[swiping]:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-40 flex justify-start">
          <Drawer.Popup className="relative h-full w-[280px] max-w-[calc(100vw-48px)] translate-x-(--drawer-swipe-movement-x) bg-white shadow-lg outline-none transition-transform duration-[360ms] ease-pop data-[ending-style]:-translate-x-full data-[ending-style]:duration-200 data-[ending-style]:ease-out data-[starting-style]:-translate-x-full data-[swiping]:duration-0 data-[swiping]:select-none">
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            <Drawer.Close className={`${iconButton} absolute top-3 right-3 z-10`} aria-label="Close navigation">
              <X size={18} aria-hidden />
            </Drawer.Close>
            <Sidebar onNavigate={() => onOpenChange(false)} />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
