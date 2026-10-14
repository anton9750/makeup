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
  const toastTimer = useRef()
  const audioRef = useRef(null)
  const radioWas = useRef(false)
  const videoEl = useRef(null)

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

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
      ? 'Drag across the cheeks to blend colour'
      : view === 'bed'
        ? `${Tap} the laptop on the bed`
        : !boxOpen
        ? `${Tap} the makeup case, then ${tap} the statue to zoom in`
        : brushColor
          ? `${Tap} the statue to zoom in and start painting`
          : 'Pick a shade, or drag the brush onto a colour pan'

  return (
    <div className={`app ${view}`}>
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
          clearKey={clearKey}
          playing={playing}
          onRadioClick={toggleRadio}
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

      {view !== 'pc' && <div className="hint">{hint}</div>}
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