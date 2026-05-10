/** Passed via `react-router` location state after successful registration. */
export interface RegisterSuccessLocationState {
  displayName: string
  userId: string
  password: string
  transactionPassword: string
  referenceId: string
}

export function isRegisterSuccessState(x: unknown): x is RegisterSuccessLocationState {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.displayName === 'string' &&
    typeof o.userId === 'string' &&
    typeof o.password === 'string' &&
    typeof o.transactionPassword === 'string' &&
    typeof o.referenceId === 'string'
  )
}
