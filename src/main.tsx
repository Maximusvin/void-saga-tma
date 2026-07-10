import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GameErrorBoundary } from './components/GameErrorBoundary.tsx'
import './components/GameErrorBoundary.css'
import { installClientErrorReporting } from './observability/clientErrorReporter.ts'
import { installStaleChunkRecovery } from './observability/staleChunkRecovery.ts'
import { initializeGameRenderQuality } from './utils/renderQuality.ts'
import { initializeTelegramApp } from './utils/telegram.ts'

installStaleChunkRecovery()
installClientErrorReporting()
initializeGameRenderQuality()
initializeTelegramApp()

createRoot(document.getElementById('root')!).render(
  <GameErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </GameErrorBoundary>,
)
