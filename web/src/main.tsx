import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bungee/400.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import { App } from './App'
import { StoreProvider } from './lib/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider><App /></StoreProvider>
  </StrictMode>,
)
