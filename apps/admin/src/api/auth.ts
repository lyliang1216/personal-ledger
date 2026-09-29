import { request } from './request'

export type UserRole = 'ADMIN' | 'USER'

export interface AuthUser {
  id: string
  nickname: string
  username: string | null
  role: UserRole
}

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export const loginApi = (params: LoginParams): Promise<LoginResponse> => {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: params,
  })
}

export const getCurrentUserApi = (): Promise<AuthUser> => {
  return request<AuthUser>('/auth/me')
}
