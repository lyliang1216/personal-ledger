import { request } from './request'

export interface LedgerTag {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTagParams {
  name: string
  description?: string
}

export interface UpdateTagParams {
  name?: string
  description?: string
}

export const getTagsApi = (keyword?: string): Promise<LedgerTag[]> => {
  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''

  return request<LedgerTag[]>(`/tags${query}`)
}

export const createTagApi = (params: CreateTagParams): Promise<LedgerTag> => {
  return request<LedgerTag>('/tags', {
    method: 'POST',
    body: params,
  })
}

export const updateTagApi = (id: string, params: UpdateTagParams): Promise<LedgerTag> => {
  return request<LedgerTag>(`/tags/${id}`, {
    method: 'PATCH',
    body: params,
  })
}

export const deleteTagApi = (id: string): Promise<void> => {
  return request<void>(`/tags/${id}`, {
    method: 'DELETE',
  })
}
