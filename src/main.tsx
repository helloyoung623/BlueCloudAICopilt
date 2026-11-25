import React from 'react'
import ReactDOM from 'react-dom/client'
import App from "./app/App"
import LoginPage from "./app/login-page"
import './styles/index.css'

// 登录页单独成页：/login（`/#/login` 也可，方便静态预览）
const isLoginRoute = () => {
  const { pathname, hash } = window.location
  if (pathname === '/login.html') return true
  if (pathname === '/login.html') return true
  return /^\/login\/?$/.test(pathname) || hash.startsWith('#/login')
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

const render = () => {
  root.render(
    <React.StrictMode>
      {isLoginRoute() ? <LoginPage /> : <App />}
    </React.StrictMode>,
  )
}

render()

// 仅 hash 变化时浏览器不会重新加载，手动切一次页面
window.addEventListener('hashchange', render)
