const ACCESS_TOKEN_STORAGE_KEY = 'ledger_access_token'

export const getAccessToken = (): string | null => {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
}

export const setAccessToken = (accessToken: string): void => {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
}

export const removeAccessToken = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}
