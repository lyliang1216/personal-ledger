import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import BasicLayout from '@/layouts/BasicLayout.vue'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      guestOnly: true,
    },
  },
  {
    path: '/',
    component: BasicLayout,
    redirect: '/dashboard',
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/index.vue'),
      },
      {
        path: 'transactions',
        name: 'transactions',
        component: () => import('@/views/transactions/index.vue'),
      },
      {
        path: 'imports',
        name: 'imports',
        component: () => import('@/views/imports/index.vue'),
      },
      {
        path: 'imports/:id',
        name: 'import-detail',
        component: () => import('@/views/imports/detail/index.vue'),
      },
      {
        path: 'statistics',
        name: 'statistics',
        component: () => import('@/views/statistics/index.vue'),
      },
      {
        path: 'categories',
        name: 'categories',
        component: () => import('@/views/categories/index.vue'),
      },
      {
        path: 'tags',
        name: 'tags',
        component: () => import('@/views/tags/index.vue'),
      },
      {
        path: 'ledgers',
        name: 'ledgers',
        component: () => import('@/views/ledgers/index.vue'),
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('@/views/accounts/index.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/index.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated && to.meta.requiresAuth) {
    return {
      path: '/login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  if (authStore.isAuthenticated && !authStore.currentUser) {
    try {
      await authStore.loadCurrentUser()
    } catch (error) {
      console.error(error)

      if (to.path !== '/login') {
        return {
          path: '/login',
          query: {
            redirect: to.fullPath,
          },
        }
      }
    }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated && authStore.currentUser) {
    return '/dashboard'
  }

  return true
})

export default router
