<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import { APP_NAME } from '@ledger/constants'

import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const { sidebarCollapsed } = storeToRefs(appStore)
const { currentUser } = storeToRefs(authStore)

const selectedKeys = computed(() => [route.path])

const handleNavigate = (path: string) => {
  if (route.path !== path) {
    void router.push(path)
  }
}

const handleToggleSidebar = () => {
  appStore.toggleSidebar()
}

const handleLogout = () => {
  authStore.logout()
  void router.replace('/login')
}
</script>

<template>
  <a-layout class="basic-layout-wrapper">
    <a-layout-sider v-model:collapsed="sidebarCollapsed" collapsible :trigger="null" theme="dark">
      <div class="basic-layout-logo">
        {{ sidebarCollapsed ? 'PL' : APP_NAME }}
      </div>

      <a-menu :selected-keys="selectedKeys" mode="inline" theme="dark">
        <a-menu-item key="/dashboard" @click="handleNavigate('/dashboard')"> 首页 </a-menu-item>
        <a-menu-item key="/transactions" @click="handleNavigate('/transactions')">
          账单明细
        </a-menu-item>
        <a-menu-item key="/imports" @click="handleNavigate('/imports')"> 账单导入 </a-menu-item>
        <a-menu-item key="/statistics" @click="handleNavigate('/statistics')">
          统计分析
        </a-menu-item>

        <a-menu-item-group title="基础数据">
          <a-menu-item key="/categories" @click="handleNavigate('/categories')">
            分类管理
          </a-menu-item>
          <a-menu-item key="/tags" @click="handleNavigate('/tags')"> 标签管理 </a-menu-item>
          <a-menu-item key="/ledgers" @click="handleNavigate('/ledgers')"> 账本管理 </a-menu-item>
          <a-menu-item key="/accounts" @click="handleNavigate('/accounts')"> 账户管理 </a-menu-item>
        </a-menu-item-group>

        <a-menu-item key="/settings" @click="handleNavigate('/settings')"> 系统设置 </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="basic-layout-header">
        <a-button @click="handleToggleSidebar">
          {{ sidebarCollapsed ? '展开菜单' : '收起菜单' }}
        </a-button>
        <span class="basic-layout-title">{{ APP_NAME }}</span>
        <div class="basic-layout-user">
          <span>{{ currentUser?.nickname }}</span>
          <a-button type="link" @click="handleLogout">退出登录</a-button>
        </div>
      </a-layout-header>

      <a-layout-content class="basic-layout-content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped lang="less">
.basic-layout-wrapper {
  min-height: 100vh;
}

.basic-layout-logo {
  height: 64px;
  padding: 0 16px;
  overflow: hidden;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  line-height: 64px;
  text-align: center;
  white-space: nowrap;
}

.basic-layout-header {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.basic-layout-title {
  font-size: 18px;
  font-weight: 600;
}

.basic-layout-user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.basic-layout-content {
  margin: 24px;
}
</style>
