import { useCallback, useEffect, useRef, useState } from 'react'

/* A stylised "YouTube" (called BlushTube here - rename in LOGO_NAME).
   Flow: power-on flash -> home page -> a ghost cursor clicks video-01 ->
   the watch page zooms out of the thumbnail -> the video autoplays. */

const LOGO_NAME = 'BlushTube'

const THUMBS = [
  { id: 'v0', title: 'video-01', channel: 'You', meta: 'Just now', g: ['#ff7aa2', '#7b4bd6'], hero: true },
  { id: 'v1', title: '15 blush shades, ranked by vibes', channel: 'Cheek Lab', meta: '1.2M views', g: ['#ffb184', '#ff6b8b'] },
  { id: 'v2', title: 'I tried every berry tone so you do not have to', channel: 'Berry Club', meta: '340K views', g: ['#c95a78', '#4b2a6b'] },
  { id: 'v3', title: 'Peach vs coral: the final answer', channel: 'Petal Papers', meta: '88K views', g: ['#ffd1a8', '#ff8e7a'] },
  { id: 'v4', title: 'lofi radio beats to blend to', channel: 'Little Radio', meta: '5.4M views', g: ['#7fb6ff', '#8f6bd8'] },
  { id: 'v5', title: 'Mauve season is back', channel: 'Cheek Lab', meta: '210K views', g: ['#d9a6d6', '#6a4b9a'] },
  { id: 'v6', title: 'Statue makeup challenge (gone wrong)', channel: 'Pedestal TV', meta: '9K views', g: ['#f2d2c0', '#a86a8a'] },
  { id: 'v7', title: 'Bedroom tour: tiny studio edition', channel: 'Cosy Corner', meta: '57K views', g: ['#ffe29a', '#ff9a8b'] },
]

const SIDE = THUMBS.slice(1, 6)

const Logo = () => (
  <div className="bt-logo" aria-label={LOGO_NAME}>
    <svg viewBox="0 0 36 26" width="34" height="24" aria-hidden="true">
      <rect width="36" height="26" rx="7" fill="#ff2e63" />
      <path d="M14.5 7.5v11l9.5-5.5z" fill="#fff" />
    </svg>
    <span>{LOGO_NAME}</span>
  </div>
)

function Thumb({ t, big, thumbRef, pressed, onClick }) {
  return (
    <button
      ref={thumbRef}
      className={`bt-card ${t.hero ? 'hero' : ''} ${pressed ? 'pressed' : ''}`}
      onClick={t.hero ? onClick : undefined}
      tabIndex={t.hero ? 0 : -1}
      aria-label={t.title}
    >
      <div className="bt-thumb" style={{ background: `linear-gradient(135deg, ${t.g[0]}, ${t.g[1]})` }}>
        <svg viewBox="0 0 24 24" className="bt-play" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="#fff" />
        </svg>
        <span className="bt-dur">{t.hero ? 'LIVE' : '8:24'}</span>
      </div>
      <div className="bt-meta">
        <span className="bt-av" style={{ background: t.g[1] }} />
        <span>
          <b>{t.title}</b>
          <i>
            {t.channel} · {t.meta}
          </i>
        </span>
      </div>
    </button>
  )
}

function Watch({ origin, onBack, video }) {
  const holder = useRef(null)
  const [state, setState] = useState(video ? 'loading' : 'missing') // loading | playing | tap | ended | missing
  const [muted, setMuted] = useState(false)

  const start = useCallback(() => {
    const v = video
    if (!v) return
    v.muted = false
    const p = v.play()
    if (!p) return
    p.then(() => {
      setMuted(false)
      setState('playing')
    }).catch(() => {
      // browser refused sound -> start muted so it still plays automatically
      v.muted = true
      setMuted(true)
      v.play().then(() => setState('playing')).catch(() => setState('tap'))
    })
  }, [video])

  // the <video> element is created (and unlocked) in App during your tap on the laptop,
  // which is what lets phones autoplay it with sound. Here we just mount it.
  useEffect(() => {
    const v = video
    const box = holder.current
    if (!v || !box) return
    const onEnded = () => setState('ended')
    const onPlay = () => setState((s) => (s === 'loading' || s === 'tap' || s === 'ended' ? 'playing' : s))
    const onError = () => setState('missing')
    v.addEventListener('ended', onEnded)
    v.addEventListener('play', onPlay)
    v.addEventListener('error', onError)
    box.appendChild(v)
    v.dataset.live = '1'
    try {
      v.currentTime = 0
    } catch (e) {
      /* not loaded yet */
    }
    start()
    return () => {
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('error', onError)
      delete v.dataset.live
      v.pause()
      v.remove()
    }
  }, [video, start])

  const unmute = () => {
    if (!video) return
    video.muted = false
    setMuted(false)
    if (video.paused) video.play().then(() => setState('playing')).catch(() => {})
  }

  const replay = () => {
    if (!video) return
    video.currentTime = 0
    start()
  }

  return (
    <div className="bt-watch" style={{ '--ox': origin.x, '--oy': origin.y }}>
      <div className="bt-main">
        <div className="bt-player">
          <div className="bt-videoholder" ref={holder} />

          {state === 'missing' && (
            <div className="bt-missing">
              <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="#ff7aa2" />
              </svg>
              <h3>video-01 not found</h3>
              <p>
                Put your clip at <code>assets/videos/video-01.mp4</code> and rebuild.
              </p>
            </div>
          )}
          {state === 'tap' && (
            <button className="bt-center-btn bt-tap" onClick={start}>
              ▶ Play
            </button>
          )}
          {state === 'ended' && (
            <div className="bt-end">
              <button className="bt-center-btn" onClick={replay}>
                ↺ Replay
              </button>
              <button className="bt-center-btn alt" onClick={onBack}>
                Back to the room
              </button>
            </div>
          )}
          {muted && state === 'playing' && (
            <button className="bt-unmute" onClick={unmute}>
              🔇 Tap to unmute
            </button>
          )}
        </div>

        <h2 className="bt-title">video-01</h2>
        <div className="bt-row">
          <div className="bt-chan">
            <span className="bt-av big" style={{ background: 'linear-gradient(135deg,#ff7aa2,#7b4bd6)' }} />
            <span>
              <b>You</b>
              <i>1 subscriber</i>
            </span>
            <button className="bt-sub">Subscribe</button>
          </div>
          <div className="bt-acts">
            <button>♥ 1</button>
            <button>↗ Share</button>
          </div>
        </div>
        <div className="bt-desc">
          <b>Just now</b> · Recorded in the bedroom. Press play, sit back, and enjoy.
        </div>
      </div>

      <aside className="bt-side">
        {SIDE.map((t) => (
          <div className="bt-rec" key={t.id}>
            <div className="bt-thumb sm" style={{ background: `linear-gradient(135deg, ${t.g[0]}, ${t.g[1]})` }} />
            <span>
              <b>{t.title}</b>
              <i>
                {t.channel}
                <br />
                {t.meta}
              </i>
            </span>
          </div>
        ))}
      </aside>
    </div>
  )
}

export default function Tube({ onClose, video }) {
  const [phase, setPhase] = useState('home') // home | watch
  const [cursor, setCursor] = useState({ x: 88, y: 92, show: false, click: false })
  const [pressed, setPressed] = useState(false)
  const [origin, setOrigin] = useState({ x: '50%', y: '50%' })
  const heroRef = useRef(null)
  const rootRef = useRef(null) // the page area under the top bar (home + watch share this box)
  const timers = useRef([])

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  const openVideo = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const root = rootRef.current
    const hero = heroRef.current
    if (root && hero) {
      const rr = root.getBoundingClientRect()
      const hr = hero.getBoundingClientRect()
      setOrigin({
        x: `${((hr.left + hr.width / 2 - rr.left) / rr.width) * 100}%`,
        y: `${((hr.top + hr.height / 2 - rr.top) / rr.height) * 100}%`,
      })
    }
    setPhase('watch')
  }, [])

  // the automatic "someone clicks the video" sequence
  useEffect(() => {
    later(() => setCursor((c) => ({ ...c, show: true })), 450)
    later(() => {
      const root = rootRef.current
      const hero = heroRef.current
      if (!root || !hero) return
      const rr = root.getBoundingClientRect()
      const hr = hero.getBoundingClientRect()
      setCursor((c) => ({
        ...c,
        x: ((hr.left + hr.width * 0.55 - rr.left) / rr.width) * 100,
        y: ((hr.top + hr.height * 0.45 - rr.top) / rr.height) * 100,
      }))
    }, 800)
    later(() => {
      setCursor((c) => ({ ...c, click: true }))
      setPressed(true)
    }, 2100)
    later(openVideo, 2400)
    return () => timers.current.forEach(clearTimeout)
  }, [openVideo])

  return (
    <div className="bt" role="dialog" aria-label={`${LOGO_NAME} player`}>
      <div className="bt-flash" />
      <header className="bt-top">
        <Logo />
        <div className="bt-search">
          <span>Search</span>
          <span className="bt-glass">⌕</span>
        </div>
        <button className="bt-back" onClick={onClose} aria-label="Back to room">
          <span className="bt-back-arrow">←</span>
          <span className="bt-back-text"> Back to room</span>
        </button>
      </header>

      {phase === 'home' ? (
        <div className="bt-home" ref={rootRef}>
          <nav className="bt-nav" aria-hidden="true">
            {['Home', 'Shorts', 'Subscriptions', 'Library', 'History'].map((n, i) => (
              <span key={n} className={i === 0 ? 'on' : ''}>
                {n}
              </span>
            ))}
          </nav>
          <div className="bt-chips" aria-hidden="true">
            {['All', 'Makeup', 'Music', 'Live', 'Cosy', 'Recently uploaded'].map((c, i) => (
              <span key={c} className={i === 0 ? 'on' : ''}>
                {c}
              </span>
            ))}
          </div>
          <div className="bt-grid">
            {THUMBS.map((t) => (
              <Thumb key={t.id} t={t} thumbRef={t.hero ? heroRef : undefined} pressed={t.hero && pressed} onClick={openVideo} />
            ))}
          </div>
          {(
            <svg
              className={`bt-cursor ${cursor.show ? 'show' : ''} ${cursor.click ? 'click' : ''}`}
              style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
              viewBox="0 0 24 24"
              width="28"
              height="28"
              aria-hidden="true"
            >
              <circle className="bt-finger" cx="12" cy="12" r="9" />
              <path d="M5 3l14 8-6 1.5L16 20l-3 1.2-3-7.5L5 18z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ) : (
        <Watch origin={origin} onBack={onClose} video={video} />
      )}
    </div>
  )
}