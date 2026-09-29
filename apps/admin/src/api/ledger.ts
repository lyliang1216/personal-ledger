import { request } from './request'

export interface Ledger {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateLedgerParams {
  name: string
  description?: string
}

export interface UpdateLedgerParams {
  name?: string
  description?: string
}

export const getLedgersApi = (): Promise<Ledger[]> => {
  return request<Ledger[]>('/ledgers')
}

export const createLedgerApi = (params: CreateLedgerParams): Promise<Ledger> => {
  return request<Ledger>('/ledgers', {
    method: 'POST',
    body: params,
  })
}

export const updateLedgerApi = (id: string, params: UpdateLedgerParams): Promise<Ledger> => {
  return request<Ledger>(`/ledgers/${id}`, {
    method: 'PATCH',
    body: params,
  })
}

export const setDefaultLedgerApi = (id: string): Promise<Ledger> => {
  return request<Ledger>(`/ledgers/${id}/default`, {
    method: 'PATCH',
  })
}

export const deleteLedgerApi = (id: string): Promise<void> => {
  return request<void>(`/ledgers/${id}`, {
    method: 'DELETE',
  })
}
