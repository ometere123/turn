import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { TurnTools } from './components/TurnTools.tsx'
import { installLatencyCopy } from './lib/latency-ux.ts'
import './styles.css'

installLatencyCopy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <TurnTools />
  </StrictMode>,
)
