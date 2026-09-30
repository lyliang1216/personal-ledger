import { getAccessToken, removeAccessToken } from '@/utils/auth-token'

export interface ErrorResponse {
  message?: string | string[]
  [key: string]: unknown
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data: ErrorResponse = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const getErrorResponse = async (response: Response): Promise<ErrorResponse> => {
  try {
    return (await response.json()) as ErrorResponse
  } catch (_error) {
    return {}
  }
}

const getErrorMessage = (errorResponse: ErrorResponse): string =>
  Array.isArray(errorResponse.message)
    ? errorResponse.message.join('，')
    : errorResponse.message || '请求失败'

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
  const optionBody = options.body
  const isFormData = optionBody instanceof FormData
  let body: BodyInit | undefined

  if (optionBody !== undefined && !isFormData) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(optionBody)
  } else if (isFormData) {
    body = optionBody
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    body,
  })

  if (response.status === 401) {
    handleUnauthorized()
  }

  if (!response.ok) {
    const errorResponse = await getErrorResponse(response)
    throw new ApiError(response.status, getErrorMessage(errorResponse), errorResponse)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
