import { useState, ViewTransition } from 'react'
import type { Panels } from '../tour/GuidedTour'
import { Header } from './Header'
import { PageTitleContext } from './pageTitle'
import { RoutedPage } from './RoutedPage'
import { Sidebar } from './Sidebar'

export function AppShell({ inspectorOpen, nav }: { inspectorOpen: boolean; nav: Panels['nav-drawer'] }) {
  const [childTitle, setChildTitle] = useState<string | null>(null)
  return (
    <PageTitleContext value={setChildTitle}>
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] border-r border-rule bg-white lg:block">
        <Sidebar />
      </aside>
      <div className="lg:pl-[248px]">
        <Header childTitle={childTitle} nav={nav} />
        <ViewTransition update={{ inspector: 'content-shift', default: 'none' }}>
          <main
            data-inspector={inspectorOpen || undefined}
            className="px-4 pt-6 pb-32 sm:px-8 sm:pt-8 xl:data-[inspector]:pr-[476px]"
          >
            <div className="@container mx-auto max-w-[1120px]">
              <RoutedPage />
            </div>
          </main>
        </ViewTransition>
      </div>
    </PageTitleContext>
  )
}
