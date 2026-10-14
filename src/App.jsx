import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './Scene.jsx'
import { SHADES } from './palette.js'
import { isMobile, isTouch } from './device.js'

const tap = isTouch ? 'tap' : 'click'
const Tap = isTouch ? 'Tap' : 'Click'

export default function App() {
  const [view, setView] = useState('table') // 'table' | 'face'
  const [boxOpen, setBoxOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shade, setShade] = useState(SHADES[6])
  const [brushColor, setBrushColor] = useState(null) // null = clean white brush
  const [toast, setToast] = useState('')
  const [fx, setFx] = useState(0)
  const [clearKey, setClearKey] = useState(0)
  const toastTimer = useRef()

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

  const goto = useCallback((v) => {
    setView(v)
    setFx((n) => n + 1)
    if (v === 'face') setMenuOpen(false)
  }, [])

  const onHeadClick = useCallback(() => {
    if (view === 'table') goto('face')
  }, [view, goto])

  const onBoxClick = useCallback(() => {
    if (view !== 'table') return
    if (!boxOpen) {
      setBoxOpen(true)
      setMenuOpen(true)
    } else {
      setMenuOpen((m) => !m)
    }
  }, [view, boxOpen])

  const pickShade = (s) => {
    setShade(s)
    setBrushColor(s.hex)
    setMenuOpen(false)
    say(`Brush loaded with ${s.name}`)
  }

  const onLoadColor = useCallback(
    (hex, name) => {
      setBrushColor(hex)
      say(`Brush loaded with ${name}`)
    },
    [say],
  )

  const onNeedColor = useCallback(() => say('Dip the brush in a colour first'), [say])

  const closeCase = () => {
    setBoxOpen(false)
    setMenuOpen(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (menuOpen) setMenuOpen(false)
        else if (view === 'face') goto('table')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, view, goto])

  const hint =
    view === 'face'
      ? 'Drag across the cheeks to blend colour'
      : !boxOpen
        ? `${Tap} the makeup case, then ${tap} the statue to zoom in`
        : brushColor
          ? `${Tap} the statue to zoom in and start painting`
          : 'Pick a shade, or drag the brush onto a colour pan'

  return (
    <div className={`app ${view}`}>
      <Canvas
        shadows
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        camera={{ fov: 45, near: 0.1, far: 60, position: [0, 3.6, 7.5] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene
          view={view}
          boxOpen={boxOpen}
          shade={shade}
          brushColor={brushColor}
          onBoxClick={onBoxClick}
          onHeadClick={onHeadClick}
          onLoadColor={onLoadColor}
          onNeedColor={onNeedColor}
          clearKey={clearKey}
        />
      </Canvas>

      {fx > 0 && <div key={fx} className="fx" />}

      <header className="brand">
        <h1>Blush Studio</h1>
        <p>try a cheek colour before you commit</p>
      </header>

      <div className="hud">
        {view === 'face' ? (
          <>
            <button onClick={() => setClearKey((k) => k + 1)}>Wipe cheeks</button>
            <button className="primary" onClick={() => goto('table')}>
              Back to table
            </button>
          </>
        ) : (
          boxOpen && (
            <>
              <button onClick={() => setMenuOpen(true)}>All 75 shades</button>
              <button onClick={closeCase}>Close case</button>
            </>
          )
        )}
      </div>

      <div className="brushchip">
        <span className="dot" style={{ background: brushColor || '#ffffff' }} />
        <span>{brushColor ? 'Brush loaded' : 'Clean brush'}</span>
      </div>

      <div className="hint">{hint}</div>
      {toast && <div className="toast">{toast}</div>}

      {menuOpen && view === 'table' && (
        <div className="menu-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <section className="menu" role="dialog" aria-label="Choose a cheek shade">
            <div className="menu-head">
              <div>
                <h2>Cheek shades</h2>
                <p>
                  <span className="chip" style={{ background: shade.hex }} />
                  {shade.name}
                </p>
              </div>
              <button className="x" onClick={() => setMenuOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="grid">
              {SHADES.map((s) => (
                <button
                  key={s.name}
                  className={`sw ${s.hex === shade.hex ? 'on' : ''}`}
                  style={{ background: s.hex }}
                  title={s.name}
                  aria-label={s.name}
                  onClick={() => pickShade(s)}
                />
              ))}
            </div>
            <p className="menu-foot">Choosing a shade fills the middle pan and loads your brush.</p>
          </section>
        </div>
      )}
    </div>
  )
}
