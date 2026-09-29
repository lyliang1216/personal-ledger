import { getAccessToken, removeAccessToken } from '@/utils/auth-token'

interface ErrorResponse {
  message?: string | string[]
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const errorResponse = (await response.json()) as ErrorResponse

    if (Array.isArray(errorResponse.message)) {
      return errorResponse.message.join('，')
    }

    return errorResponse.message || '请求失败'
  } catch (_error) {
    return '请求失败'
  }
}

const handleUnauthorized = (): void => {
  removeAccessToken()

  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL 未配置。')
  }

  const headers = new Headers(options.headers)
  const accessToken = getAccessToken()

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 401) {
    handleUnauthorized()
  }

  if (!response.ok) {
    throw new ApiError(response.status, await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
