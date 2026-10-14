import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './mobile.css'

// iOS Safari ignores user-scalable=no, so block pinch-zoom gestures explicitly
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(<App />)