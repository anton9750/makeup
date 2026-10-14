// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './Scene.jsx'
import Tube from './Tube.jsx'
import { SHADES } from './palette.js'
import { isMobile, isTouch } from './device.js'
import { SONG_URL } from './music.js'
import { VIDEO_URL } from './video.js'

const tap = isTouch ? 'tap' : 'click'
const Tap = isTouch ? 'Tap' : 'Click'

// Creates the video element and "unlocks" it inside the tap that opens the laptop.
// Phones only allow sound-on playback for media that was started from a real tap,
// so we start it here, pause it straight away, and the player resumes it later.
function primeVideo(ref) {
  if (!VIDEO_URL) return
  let v = ref.current
  if (!v) {
    v = document.createElement('video')
    v.className = 'bt-video'
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.setAttribute('webkit-playsinline', '')
    v.controls = true
    v.preload = 'auto'
    v.src = VIDEO_URL
    ref.current = v
  }
  v.muted = false
  const p = v.play()
  if (p) {
    p.then(() => {
      if (v.dataset.live !== '1') {
        v.pause()
        v.currentTime = 0
      }
    }).catch(() => {})
  }
}

export default function App() {
  const [view, setView] = useState('table') // 'table' | 'face' | 'bed' | 'pc'
  const [tube, setTube] = useState(false) // fake-YouTube overlay on the laptop screen
  const [fxKind, setFxKind] = useState('')
  const [boxOpen, setBoxOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shade, setShade] = useState(SHADES[6])
  const [brushColor, setBrushColor] = useState(null) // null = clean white brush
  const [toast, setToast] = useState('')
  const [fx, setFx] = useState(0)
  const [clearKey, setClearKey] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tool, setTool] = useState({ mode: 'place', size: 'fine', precision: 'x4' })
  const [stampKey, setStampKey] = useState(0)
  const [touchUi, setTouchUi] = useState(() => isTouch)
  const toastTimer = useRef()
  const audioRef = useRef(null)
  const radioWas = useRef(false)
  const videoEl = useRef(null)
  const overlayRef = useRef({ nudge: { x: 0, y: 0 }, texel: 3 })

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const sync = () => setTouchUi(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    const stopGesture = (e) => e.preventDefault()
    document.addEventListener('gesturestart', stopGesture)
    const stopPinch = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault()
    }
    document.addEventListener('touchmove', stopPinch, { passive: false })
    return () => {
      mq.removeEventListener?.('change', sync)
      document.removeEventListener('gesturestart', stopGesture)
      document.removeEventListener('touchmove', stopPinch)
    }
  }, [])

  const nudge = (x, y) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const step = () => {
      overlayRef.current.nudge.x += x
      overlayRef.current.nudge.y += y
    }
    step()
    const id = setInterval(step, 80)
    const up = () => {
      clearInterval(id)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  useEffect(() => {
    if (!SONG_URL) return
    const a = new Audio(SONG_URL)
    a.loop = true
    a.preload = 'auto'
    a.addEventListener('play', () => setPlaying(true))
    a.addEventListener('pause', () => setPlaying(false))
    audioRef.current = a
    return () => {
      a.pause()
      audioRef.current = null
    }
  }, [])

  const toggleRadio = useCallback(() => {
    const a = audioRef.current
    if (!a) {
      say('Add song-01 to assets/music to hear the radio')
      return
    }
    if (a.paused) {
      a.play().then(() => say('Radio on')).catch(() => say('Could not play the song'))
    } else {
      a.pause()
      say('Radio off')
    }
  }, [say])

  const goto = useCallback((v) => {
    setView(v)
    setFxKind(v === 'pc' ? 'pc' : v === 'bed' ? 'bed' : '')
    setFx((n) => n + 1)
    if (v !== 'table') setMenuOpen(false)
  }, [])

  // on the laptop: after the camera has flown in, the screen takes over the whole window
  useEffect(() => {
    if (view !== 'pc') return
    const id = setTimeout(() => setTube(true), 1750)
    return () => clearTimeout(id)
  }, [view])

  // the radio steps aside while the video plays, and comes back after
  useEffect(() => {
    const a = audioRef.current
    if (tube) {
      radioWas.current = !!a && !a.paused
      if (a && !a.paused) a.pause()
    } else if (radioWas.current) {
      radioWas.current = false
      a?.play().catch(() => {})
    }
  }, [tube])

  const closeTube = useCallback(() => {
    setTube(false)
    goto('bed')
  }, [goto])

  const onLaptopClick = useCallback(() => {
    if (view !== 'bed') return
    primeVideo(videoEl)
    goto('pc')
  }, [view, goto])

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
  const onBrushMiss = useCallback(() => say('Slide the brush onto the face'), [say])

  const closeCase = () => {
    setBoxOpen(false)
    setMenuOpen(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (tube) closeTube()
        else if (menuOpen) setMenuOpen(false)
        else if (view === 'face' || view === 'bed') goto('table')
        else if (view === 'pc') goto('bed')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, view, goto, tube, closeTube])

  const hint =
    view === 'face'
      ? touchUi
        ? tool.mode === 'paint'
          ? 'Drag to paint. The brush moves slower than your finger, so you can hit one spot.'
          : 'Drag to slide the brush onto a pixel. It stays when you lift. Then Stamp or Paint.'
        : 'Drag across the cheeks to blend colour'
      : view === 'bed'
        ? `${Tap} the laptop on the bed`
        : !boxOpen
        ? `${Tap} the makeup case, then ${tap} the statue to zoom in`
        : brushColor
          ? `${Tap} the statue to zoom in and start painting`
          : 'Pick a shade, or drag the brush onto a colour pan'

  return (
    <div
      className={`app ${view} ${touchUi ? 'touch' : ''} ${touchUi && view === 'face' && tool.mode === 'paint' ? 'painting' : ''} ${touchUi && view === 'face' && tool.precision === 'direct' ? 'prec-direct' : ''}`}
    >
      <Canvas
        shadows
        frameloop={tube ? 'never' : 'always'}
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
          onLaptopClick={onLaptopClick}
          onLoadColor={onLoadColor}
          onNeedColor={onNeedColor}
          onBrushMiss={onBrushMiss}
          clearKey={clearKey}
          playing={playing}
          onRadioClick={toggleRadio}
          tool={tool}
          stampKey={stampKey}
          overlayRef={overlayRef}
        />
      </Canvas>

      {fx > 0 && <div key={fx} className={`fx ${fxKind}`} />}

      <header className="brand">
        <h1>Blush Studio</h1>
        <p>try a cheek colour before you commit</p>
      </header>

      {view !== 'pc' && (
      <div className="hud">
        <button onClick={toggleRadio} aria-pressed={playing}>
          {playing ? '♪ Pause radio' : '♪ Radio'}
        </button>
        {view === 'bed' ? (
          <button className="primary" onClick={() => goto('table')}>
            Back to table
          </button>
        ) : view === 'face' ? (
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
      )}

      {(view === 'table' || view === 'face') && (
        <div className="brushchip">
          <span className="dot" style={{ background: brushColor || '#ffffff' }} />
          <span>{brushColor ? 'Brush loaded' : 'Clean brush'}</span>
        </div>
      )}

      {touchUi && view === 'face' && (
        <>
          <div
            className="reticle"
            ref={(node) => {
              overlayRef.current.reticle = node
            }}
          >
            <i
              ref={(node) => {
                overlayRef.current.ring = node
              }}
            />
            <b />
            <span className="finger-ghost" />
          </div>
          <div
            className="loupe"
            ref={(node) => {
              overlayRef.current.loupe = node
            }}
          >
            <canvas
              width={180}
              height={180}
              className="loupe-cv"
              ref={(node) => {
                overlayRef.current.canvas = node
              }}
            />
            <span
              className="loupe-read"
              ref={(node) => {
                overlayRef.current.readout = node
              }}
            />
          </div>
          <div className="prec-dock" onPointerDown={(e) => e.stopPropagation()}>
            <div className="prec-row">
              <div className="nudge" aria-label="Nudge one pixel">
                <button type="button" aria-label="Nudge brush left" onPointerDown={nudge(-1, 0)}>
                  ←
                </button>
                <button type="button" aria-label="Nudge brush up" onPointerDown={nudge(0, -1)}>
                  ↑
                </button>
                <button type="button" aria-label="Nudge brush down" onPointerDown={nudge(0, 1)}>
                  ↓
                </button>
                <button type="button" aria-label="Nudge brush right" onPointerDown={nudge(1, 0)}>
                  →
                </button>
              </div>
              <div className="prec-seg" role="group" aria-label="Brush mode">
                <button
                  type="button"
                  className={tool.mode === 'place' ? 'on' : ''}
                  onClick={() => setTool((t) => ({ ...t, mode: 'place' }))}
                >
                  Place
                </button>
                <button
                  type="button"
                  className={tool.mode === 'paint' ? 'on' : ''}
                  onClick={() => setTool((t) => ({ ...t, mode: 'paint' }))}
                >
                  Paint
                </button>
              </div>
              <button
                type="button"
                className="primary prec-stamp"
                onClick={() => {
                  if (!brushColor) {
                    say('Dip the brush in a colour first')
                    return
                  }
                  setStampKey((k) => k + 1)
                }}
              >
                Stamp
              </button>
            </div>
            <div className="prec-row sizes" role="group" aria-label="Brush size">
              {[
                ['pixel', 'Pixel'],
                ['fine', 'Fine'],
                ['soft', 'Soft'],
                ['blush', 'Blush'],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={tool.size === id ? 'on' : ''}
                  onClick={() => setTool((t) => ({ ...t, size: id }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="prec-row speeds" role="group" aria-label="How fast the brush follows your finger">
              {[
                ['x8', '8× fine'],
                ['x4', '4×'],
                ['direct', 'Direct'],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={tool.precision === id ? 'on' : ''}
                  onClick={() => setTool((t) => ({ ...t, precision: id }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="prec-help">
              <i className="prec-swatch" style={{ background: brushColor || '#fff' }} />
              {tool.precision === 'direct'
                ? 'Direct: the colour lands a fingertip above your finger.'
                : tool.mode === 'place'
                  ? 'Place: drag anywhere. The crosshair creeps onto the exact pixel, then Stamp.'
                  : 'Paint: same slow drag, and it lays colour as it moves. Lift to reposition.'}
            </p>
          </div>
        </>
      )}

      {view !== 'pc' && !(touchUi && view === 'face') && <div className="hint">{hint}</div>}
      {toast && <div className="toast">{toast}</div>}

      {/* arrows that swing the camera round between the table and the bed */}
      {view === 'table' && !menuOpen && (
        <button className="turn-arrow right" onClick={() => goto('bed')} aria-label="Turn around to look at the bed">
          <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
            <path d="M10 26a14 14 0 1 0 5-12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M8 6v10h10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Turn around</span>
        </button>
      )}
      {view === 'bed' && (
        <button className="turn-arrow left" onClick={() => goto('table')} aria-label="Turn back to the table">
          <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
            <path d="M38 26a14 14 0 1 1-5-12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <path d="M40 6v10H30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Turn back</span>
        </button>
      )}

      {tube && <Tube video={videoEl.current} onClose={closeTube} />}

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