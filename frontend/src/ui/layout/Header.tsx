import { Fragment } from 'react'
import { useLocation } from 'react-router'
import { SkeletonBlock } from '../components/Placeholder'
import type { Panels } from '../tour/GuidedTour'
import { TakeTourButton } from '../tour/TakeTourButton'
import { pageAt } from './nav'
import { NavDrawer } from './NavDrawer'

export function Header({ childTitle, nav }: { childTitle: string | null; nav: Panels['nav-drawer'] }) {
  const page = pageAt(useLocation().pathname)
  const crumbs = page ? [page.group, ...('parent' in page ? [page.parent] : [])] : []
  const title = page && ('title' in page ? page.title : childTitle)
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-rule bg-white px-4 sm:px-8">
      <NavDrawer {...nav} />
      {page && (
        <div className="flex min-w-0 items-center gap-2">
          <nav aria-label="Breadcrumb" className="flex-none text-sm text-ink-3">
            <ol className="flex items-center gap-2">
              {crumbs.map((crumb) => (
                <Fragment key={crumb}>
                  <li>{crumb}</li>
                  <li aria-hidden="true" className="text-g200">
                    /
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>
          <h1 className="min-w-0 overflow-hidden text-lg leading-tight font-bold text-ink">
            <span key={title} className="block animate-roll truncate">
              {title}
            </span>
          </h1>
        </div>
      )}
      <SkeletonBlock className="ml-auto flex h-10 w-full max-w-[300px] items-center gap-3 px-3 max-md:hidden">
        <div className="size-[18px] flex-none rounded-[6px] bg-g100" />
        <div className="h-2.5 w-28 rounded-full bg-g100" />
      </SkeletonBlock>
      <TakeTourButton />
    </header>
  )
}
