const button =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap cursor-pointer select-none transition-[scale,background-color,border-color,color] duration-150 active:scale-[0.97] focus-visible:outline-offset-3 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:active:scale-100'

export const primaryButton = `${button} h-12 px-6 bg-g900 text-white hover:bg-g800 active:bg-g700 data-[disabled]:hover:bg-g900`

export const compactPrimaryButton = `${button} h-9 px-4 text-sm bg-g900 text-white hover:bg-g800 active:bg-g700`

export const secondaryButton = `${button} h-9 px-4 text-sm border border-g200 bg-white text-g700 hover:border-g300 hover:bg-mint active:bg-g100 data-[disabled]:hover:border-g200 data-[disabled]:hover:bg-white`

export const dangerButton = `${button} h-9 px-4 text-sm border border-danger-line bg-white text-danger hover:bg-danger-wash active:bg-danger-wash data-[disabled]:hover:bg-white`

export const solidDangerButton = `${button} h-10 px-5 text-sm bg-danger text-white hover:bg-[#a83128] active:bg-[#93291f]`

export const card = 'rounded-lg bg-white shadow-lg'

export const dialogBackdrop =
  'fixed inset-0 z-40 bg-g900/25 transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[starting-style]:opacity-0'

export const dialogPopup =
  'fixed top-1/2 left-1/2 z-41 w-[min(440px,calc(100vw-32px))] -translate-1/2 rounded-lg bg-white p-6 shadow-lg ring-1 ring-rule transition-[opacity,scale] duration-300 ease-pop outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[ending-style]:ease-out data-[starting-style]:scale-90 data-[starting-style]:opacity-0 sm:p-7'

/** A 40px filter-bar field, used by the audit log's selects and its actor search. */
export const filterControl =
  'h-10 w-full rounded-sm border border-g200 bg-white px-3.5 text-sm text-ink transition-[border-color,box-shadow] duration-200 outline-none hover:border-g300 focus-visible:border-g600 focus-visible:shadow-[0_0_0_4px_rgb(60_122_69/0.16)]'
export const filterLabel = 'font-display text-xs font-bold text-ink-3'
