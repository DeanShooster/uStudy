import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SWRConfig } from 'swr'
import { get } from './api/api'
import logo from './assets/LogoHelmet.png'
import { UserProvider } from './context/UserContext'
import { dictionary } from './dictionary/dictionary'
import './style/global.sass'
import App from './App.tsx'

document.querySelector('link[rel="icon"]')?.setAttribute('href', logo)

document.title = dictionary.app.title
document
  .querySelector('meta[name="description"]')
  ?.setAttribute('content', dictionary.app.description)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SWRConfig value={{ fetcher: get }}>
        <UserProvider>
          <App />
        </UserProvider>
      </SWRConfig>
    </BrowserRouter>
  </StrictMode>,
)
