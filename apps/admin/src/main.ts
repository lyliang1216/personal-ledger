import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Radio,
  Result,
  Select,
  Skeleton,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue'

import 'ant-design-vue/dist/reset.css'

import App from './App.vue'
import router from './router'
import './assets/styles/global.less'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Alert)
app.use(Badge)
app.use(Button)
app.use(Card)
app.use(Checkbox)
app.use(DatePicker)
app.use(Descriptions)
app.use(Divider)
app.use(Drawer)
app.use(Empty)
app.use(Form)
app.use(Input)
app.use(InputNumber)
app.use(Layout)
app.use(Menu)
app.use(Modal)
app.use(Popconfirm)
app.use(Radio)
app.use(Result)
app.use(Select)
app.use(Skeleton)
app.use(Space)
app.use(Spin)
app.use(Switch)
app.use(Table)
app.use(Tag)
app.use(Tooltip)
app.mount('#app')
