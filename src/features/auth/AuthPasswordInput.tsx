import { Eye, EyeSlash } from '@phosphor-icons/react'
import { forwardRef, useState } from 'react'

type Props = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'> & {
  id: string
}

/** Password field with show/hide toggle for public auth forms. */
export const AuthPasswordInput = forwardRef<HTMLInputElement, Props>(function AuthPasswordInput(
  { id, className = 'form-control', ...rest },
  ref,
) {
  const [show, setShow] = useState(false)

  return (
    <div className="auth-password-wrap">
      <input
        id={id}
        ref={ref}
        type={show ? 'text' : 'password'}
        className={className}
        {...rest}
      />
      <button
        type="button"
        className="auth-password-toggle"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={() => setShow((visible) => !visible)}
      >
        {show ? <EyeSlash weight="bold" size={20} aria-hidden /> : <Eye weight="bold" size={20} aria-hidden />}
      </button>
    </div>
  )
})
