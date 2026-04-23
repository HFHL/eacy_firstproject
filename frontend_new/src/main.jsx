import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

import App from './App'
import store from './store'
import './styles/global.css'
import { setupMessageToNotificationBridge, setupNotificationPersistence } from './utils/notificationBridge'
import { appThemeToken, appComponentTokens, medicalUIConfig } from './styles/themeTokens'

// 设置dayjs中文语言
dayjs.locale('zh-cn')

// Ant Design 主题配置
const theme = {
  token: appThemeToken,
  components: appComponentTokens,
}

// 将医疗UI配置添加到全局
window.MEDICAL_UI_CONFIG = medicalUIConfig

// 通知中心：拦截 antd message.* 并持久化通知列表
setupMessageToNotificationBridge(store)
setupNotificationPersistence(store)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider 
        locale={zhCN} 
        theme={theme}
        componentSize="middle"
      >
        <App />
      </ConfigProvider>
    </Provider>
  </React.StrictMode>
)
