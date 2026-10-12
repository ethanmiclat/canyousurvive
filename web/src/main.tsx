import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Bundled with the app so the pixel font never depends on Google Fonts loading.
import '@fontsource/tiny5'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/600.css'
import './index.css'

const root = createRoot(document.getElementById('root')!)
if (import.meta.env.DEV && new URLSearchParams(location.search).has('design-preview')) {
  import('./DesignPreview').then(({ default: Preview }) => root.render(<StrictMode><Preview /></StrictMode>))
} else {
  root.render(<StrictMode><App /></StrictMode>)
}
