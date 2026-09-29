import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getCurrentUserApi, loginApi, type AuthUser } from '@/api/auth'
import { getAccessToken, removeAccessToken, setAccessToken } from '@/utils/auth-token'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(getAccessToken())
  const currentUser = ref<AuthUser | null>(null)

  const isAuthenticated = computed(() => Boolean(accessToken.value))

  const login = async (username: string, password: string): Promise<void> => {
    const result = await loginApi({
      username: username.trim().toLowerCase(),
      password,
    })

    accessToken.value = result.accessToken
    currentUser.value = result.user
    setAccessToken(result.accessToken)
  }

  const logout = (): void => {
    accessToken.value = null
    currentUser.value = null
    removeAccessToken()
  }

  const loadCurrentUser = async (): Promise<void> => {
    if (!accessToken.value) {
      currentUser.value = null
      return
    }

    try {
      currentUser.value = await getCurrentUserApi()
    } catch (error) {
      logout()
      throw error
    }
  }

  return {
    accessToken,
    currentUser,
    isAuthenticated,
    login,
    logout,
    loadCurrentUser,
  }
})
