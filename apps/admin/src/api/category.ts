import { request } from './request'

export type TransactionType = 'INCOME' | 'EXPENSE'

export interface Category {
  id: string
  parentId: string | null
  name: string
  type: TransactionType
  icon: string | null
  sort: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryParams {
  name: string
  type: TransactionType
  parentId?: string
  icon?: string
  sort?: number
}

export interface UpdateCategoryParams {
  name?: string
  icon?: string
  sort?: number
  isActive?: boolean
}

export const getCategoriesApi = (type?: TransactionType): Promise<Category[]> => {
  const query = type ? `?type=${type}` : ''

  return request<Category[]>(`/categories${query}`)
}

export const createCategoryApi = (params: CreateCategoryParams): Promise<Category> => {
  return request<Category>('/categories', {
    method: 'POST',
    body: params,
  })
}

export const updateCategoryApi = (id: string, params: UpdateCategoryParams): Promise<Category> => {
  return request<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: params,
  })
}

export const deleteCategoryApi = (id: string): Promise<void> => {
  return request<void>(`/categories/${id}`, {
    method: 'DELETE',
  })
}
