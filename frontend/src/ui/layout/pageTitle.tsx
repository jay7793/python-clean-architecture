import { createContext, useContext, useEffect } from 'react'

/** A page below a nav entry (a user's detail) knows its own title only once its data loads, so it hands it up. */
export const PageTitleContext = createContext<(title: string | null) => void>(() => undefined)

export function usePageTitle(title: string) {
  const setTitle = useContext(PageTitleContext)
  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [setTitle, title])
}
