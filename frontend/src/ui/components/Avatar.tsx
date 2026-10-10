import type { User } from '../../domain/user'

const SIZES = {
  sm: 'size-9 rounded-[10px] text-sm',
  lg: 'size-14 rounded-sm text-lg',
}

export function Avatar({ user, size }: { user: User; size: keyof typeof SIZES }) {
  const initials = `${user.first_name.at(0) ?? ''}${user.last_name.at(0) ?? ''}` || (user.email.at(0) ?? '')
  return (
    <span aria-hidden="true" className={`grid flex-none place-items-center bg-g600 font-bold text-white uppercase ${SIZES[size]}`}>
      {initials}
    </span>
  )
}
