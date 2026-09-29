<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { FormInstance, Rule } from 'ant-design-vue/es/form'

import { APP_NAME } from '@ledger/constants'

import { ApiError } from '@/api/request'
import { useAuthStore } from '@/stores/auth'

interface LoginForm {
  username: string
  password: string
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const FormRef = ref<FormInstance>()
const submitLoading = ref(false)
const loginForm = reactive<LoginForm>({
  username: '',
  password: '',
})

const rules: Record<string, Rule[]> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { max: 100, message: '用户名最多输入100个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { max: 256, message: '密码最多输入256个字符', trigger: 'blur' },
  ],
}

const handleLogin = async (): Promise<void> => {
  try {
    await FormRef.value?.validate()
    submitLoading.value = true

    await authStore.login(loginForm.username, loginForm.password)
    message.success('登录成功')

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    console.error(error)

    if (error instanceof ApiError && error.status === 401) {
      message.error('用户名或密码错误')
      return
    }

    message.error('登录失败，请稍后重试')
  } finally {
    submitLoading.value = false
  }
}
</script>

<template>
  <main class="login-page-wrapper">
    <section class="login-form-container">
      <h1 class="login-title">{{ APP_NAME }}</h1>
      <a-form
        ref="FormRef"
        :model="loginForm"
        :rules="rules"
        layout="vertical"
        autocomplete="off"
        @finish="handleLogin"
      >
        <a-form-item label="用户名" name="username">
          <a-input
            v-model:value="loginForm.username"
            placeholder="请输入用户名"
            autocomplete="username"
            allow-clear
          />
        </a-form-item>

        <a-form-item label="密码" name="password">
          <a-input-password
            v-model:value="loginForm.password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </a-form-item>

        <a-button block html-type="submit" type="primary" :loading="submitLoading"> 登录 </a-button>
      </a-form>
    </section>
  </main>
</template>

<style scoped lang="less">
.login-page-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.login-form-container {
  width: 100%;
  max-width: 360px;
  padding: 32px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
}

.login-title {
  margin: 0 0 24px;
  font-size: 24px;
  text-align: center;
}
</style>
