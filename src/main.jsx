import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

/*
 * BrowserRouter is the outermost piece of React Router.
 * It watches the browser's URL bar and, whenever the URL changes,
 * tells the <Routes> inside App.jsx which component to show.
 *
 * It must wrap the entire app so every component can access routing features
 * (like useNavigate and useLocation) no matter how deep they are.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
