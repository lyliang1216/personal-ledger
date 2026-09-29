import { request } from './request'

export type AccountType =
  'CASH' | 'WECHAT' | 'ALIPAY' | 'BANK_CARD' | 'CREDIT_CARD' | 'JD' | 'OTHER'

export interface Account {
  id: string
  name: string
  type: AccountType
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAccountParams {
  name: string
  type: AccountType
  description?: string
}

export interface UpdateAccountParams {
  name?: string
  type?: AccountType
  description?: string
  isActive?: boolean
}

export const getAccountsApi = (isActive?: boolean): Promise<Account[]> => {
  const query = isActive === undefined ? '' : `?isActive=${String(isActive)}`

  return request<Account[]>(`/accounts${query}`)
}

export const createAccountApi = (params: CreateAccountParams): Promise<Account> => {
  return request<Account>('/accounts', {
    method: 'POST',
    body: params,
  })
}

export const updateAccountApi = (id: string, params: UpdateAccountParams): Promise<Account> => {
  return request<Account>(`/accounts/${id}`, {
    method: 'PATCH',
    body: params,
  })
}

export const deleteAccountApi = (id: string): Promise<void> => {
  return request<void>(`/accounts/${id}`, {
    method: 'DELETE',
  })
}
