import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue'

import 'ant-design-vue/dist/reset.css'

import App from './App.vue'
import router from './router'
import './assets/styles/global.less'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Button)
app.use(DatePicker)
app.use(Drawer)
app.use(Form)
app.use(Input)
app.use(InputNumber)
app.use(Layout)
app.use(Menu)
app.use(Modal)
app.use(Popconfirm)
app.use(Select)
app.use(Space)
app.use(Switch)
app.use(Table)
app.use(Tag)
app.mount('#app')
