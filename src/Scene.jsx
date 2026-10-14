// @ts-nocheck
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { isMobile, isTouch } from './device.js'

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */
const TY = 0.8 // table top height
const HEAD = new THREE.Vector3(0.95, 1.55, -1.55)
const HEAD_R = [0.36, 0.48, 0.4]
const HEAD_YAW = -0.25
const FWD = new THREE.Vector3(Math.sin(HEAD_YAW), 0, Math.cos(HEAD_YAW))
const RIGHT = new THREE.Vector3(Math.cos(HEAD_YAW), 0, -Math.sin(HEAD_YAW))
const UP = new THREE.Vector3(0, 1, 0)

const BOX_POS = new THREE.Vector3(-1.05, TY, -1.15)
const PAN_Z = 0.05
const PAN_R = 0.18
const PANS = [
  { x: -0.4, hex: '#f2a1a8', name: 'Blush Rose' },
  { x: 0, hex: null, name: null }, // the middle pan shows the chosen shade
  { x: 0.4, hex: '#c95a78', name: 'Berry Kiss' },
]

const REST_DIR = new THREE.Vector3(1, 0, -0.12).normalize()
const HELD_DIR = new THREE.Vector3(0.45, 0.85, 0.55).normalize()
const FACE_DIR = FWD.clone()
  .multiplyScalar(0.8)
  .addScaledVector(RIGHT, 0.55)
  .addScaledVector(UP, 0.45)
  .normalize()

const HOVER_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TY + 0.38))
const PAN_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TY + 0.24))
const REST_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TY + 0.04))
const FACE_PLANE = new THREE.Plane().setFromNormalAndCoplanarPoint(
  FWD,
  HEAD.clone().addScaledVector(FWD, 0.6),
)

// Paint buffer. Laptop blush radius stays 55px on this map, so the desktop stroke looks the same.
const TEX_W = 640
const TEX_H = 800
const BRUSH_RADII = { pixel: 2, fine: 9, soft: 22, blush: 55 }
// Finger sits this many CSS pixels below the dab in Direct mode, so the tip stays visible.
const FINGER_LIFT = 112

// laptop lying on the bed (behind the table camera)
const LAP_POS = new THREE.Vector3(0, 0.695, 7.9)
const LAP_TILT = 0.22 // lid leans back this many radians
// centre of the laptop display + the direction it faces (towards the room)
const SCREEN_C = new THREE.Vector3(0, 0.915, 8.154)
const SCREEN_N = new THREE.Vector3(0, Math.sin(LAP_TILT), -Math.cos(LAP_TILT)).normalize()
const SCREEN_W = 0.56
const SCREEN_H = 0.35

const clamp = THREE.MathUtils.clamp
const wrapPi = (d) => ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function camTargets(view, aspect) {
  if (view === 'pc') {
    const fov = 35
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const d = Math.max((SCREEN_H * 1.1) / t, (SCREEN_W * 1.06) / (t * aspect))
    return { pos: SCREEN_C.clone().addScaledVector(SCREEN_N, d), tgt: SCREEN_C.clone(), fov }
  }
  if (view === 'bed') {
    const fov = aspect < 1.2 ? Math.min(66, 45 + (1.2 - aspect) * 32) : 45
    const tgt = new THREE.Vector3(0, 0.75, 8.0)
    const needed = 3.2 / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect)
    const dist = Math.max(3.1, needed)
    const dir = new THREE.Vector3(0, 0.55, -1).normalize()
    return { pos: tgt.clone().addScaledVector(dir, dist), tgt, fov }
  }
  if (view === 'face') {
    // Phones are tall, so the old fit pulled the head far away and a thumb covered
    // half a cheek. Touch frames the head a little tighter. Mouse math is unchanged.
    const k = Math.max(1, (isTouch ? 0.78 : 0.9) / aspect)
    const dist = (isTouch ? 1.38 : 1.5) * k
    return {
      pos: HEAD.clone().addScaledVector(FWD, dist).add(new THREE.Vector3(0, 0.02, 0)),
      tgt: HEAD.clone(),
      fov: 40,
    }
  }
  // portrait phones: widen the lens, then pull back only as far as the table still needs
  const fov = aspect < 1.2 ? Math.min(66, 45 + (1.2 - aspect) * 32) : 45
  const base = Math.hypot(1.65, 4.5)
  const needed = 4.2 / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect)
  const k = Math.max(1, needed / base)
  const tgt = new THREE.Vector3(0, 0.95, -1.3)
  return { pos: tgt.clone().add(new THREE.Vector3(0, 1.65 * k, 4.5 * k)), tgt, fov }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* small helper */
const Box = ({ p, s, c, r = 0.7, m = 0, ...rest }) => (
  <mesh position={p} castShadow receiveShadow {...rest}>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} />
  </mesh>
)

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
export default function Scene(props) {
  const { view, boxOpen, shade, brushColor, onBoxClick, onHeadClick, onLaptopClick, clearKey, playing, onRadioClick } = props
  const { camera, gl, size } = useThree()

  const brush = useRef()
  const faceMesh = useRef()
  const paintApi = useRef({})
  const ptr = useRef({ x: 0, y: 0, inside: false })
  const live = useRef(props)
  live.current = props
  // 'finger' = relative/direct precision. 'classic' = mouse, pen, and the laptop.
  const inputKind = useRef(isTouch ? 'finger' : 'classic')
  const aim = useRef({ x: 0, y: 0, ready: false, pid: null, lx: 0, ly: 0, down: false })
  const tmp = useRef({ a: new THREE.Vector3(), b: new THREE.Vector3() })

  const cam = useRef({
    t: 1,
    dur: 1.6,
    par: 0,
    view: 'table',
    rot: false,
    turn: 1,
    swing: 0,
    punch: 14,
    roll: 0.07,
    fromYaw: 0,
    fromPitch: 0,
    fromPos: new THREE.Vector3(),
    fromTgt: new THREE.Vector3(0, 0.95, -1.3),
    fromFov: 45,
    tgt: new THREE.Vector3(0, 0.95, -1.3),
  })
  const st = useRef({
    dragging: false,
    painting: false,
    last: null,
    lastPan: -1,
    needAt: 0,
    stamp: false,
    restPos: new THREE.Vector3(0.15, TY + 0.04, -0.5),
    tip: new THREE.Vector3(0.15, TY + 0.04, -0.5),
    dir: REST_DIR.clone(),
  })
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  // start a camera transition whenever the view changes
  useEffect(() => {
    const c = cam.current
    const prev = c.view
    c.view = view
    c.fromPos.copy(camera.position)
    c.fromTgt.copy(c.tgt)
    c.fromFov = camera.fov
    const dir = camera.getWorldDirection(new THREE.Vector3())
    c.fromYaw = Math.atan2(-dir.x, -dir.z)
    c.fromPitch = Math.asin(clamp(dir.y, -1, 1))
    const bedish = (v) => v === 'bed' || v === 'pc'
    // anything touching the bed / laptop turns the head (yaw) instead of sliding the look-at point
    c.rot = bedish(prev) || bedish(view)
    c.turn = view === 'bed' && prev === 'table' ? 1 : -1
    c.swing = view === 'pc' ? 1 : prev === 'pc' ? -1 : 0
    c.dur = view === 'pc' || prev === 'pc' ? 2.1 : c.rot ? 1.9 : 1.6
    c.punch = view === 'pc' ? -9 : prev === 'pc' ? -6 : 14
    c.roll = view === 'pc' ? 0.14 : prev === 'pc' ? 0.1 : 0.07
    c.t = 0
    st.current.painting = false
    st.current.last = null
  }, [view, camera])

  useEffect(() => {
    paintApi.current.clear?.()
  }, [clearKey])

  useEffect(() => {
    if (!props.stampKey) return
    st.current.stamp = true
  }, [props.stampKey])

  // pointer tracking + brush drop.
  // Laptop / mouse / pen: the cursor IS the brush (absolute), same as before.
  // Finger on a coarse pointer: the brush is a separate point you steer. Dragging
  // moves it by a fraction of your finger (clutch — lift and drag again to continue)
  // so you can park it on one texel. Direct mode is absolute, but the dab sits
  // FINGER_LIFT pixels above the finger so the finger never covers it.
  useEffect(() => {
    const el = gl.domElement
    const s = st.current
    const a = aim.current
    el.style.touchAction = 'none'

    const track = (e) => {
      const r = el.getBoundingClientRect()
      const fingerFace = isTouch && e.pointerType === 'touch' && live.current.view === 'face'
      if (fingerFace && a.down && e.pointerId === a.pid) {
        const precision = live.current.tool?.precision || 'x4'
        if (precision === 'direct') {
          a.x = clamp(e.clientX - r.left, 0, r.width)
          a.y = clamp(e.clientY - r.top - FINGER_LIFT, 0, r.height)
        } else {
          const gain = precision === 'x8' ? 0.125 : 0.25
          a.x = clamp(a.x + (e.clientX - a.lx) * gain, 0, r.width)
          a.y = clamp(a.y + (e.clientY - a.ly) * gain, 0, r.height)
        }
        a.lx = e.clientX
        a.ly = e.clientY
        a.ready = true
        if (e.cancelable) e.preventDefault()
        return
      }
      ptr.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      // Table dipping only: keep the old fingertip lift so the brush stays visible.
      ptr.current.y = -((e.clientY - r.top) / r.height) * 2 + 1 + (e.pointerType === 'touch' ? 0.14 : 0)
      ptr.current.inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (isTouch && live.current.view === 'face' && e.pointerType !== 'touch') {
        a.x = e.clientX - r.left
        a.y = e.clientY - r.top
        a.ready = true
      }
    }
    const down = (e) => {
      inputKind.current = e.pointerType === 'touch' ? 'finger' : 'classic'
      const fingerFace = isTouch && e.pointerType === 'touch' && live.current.view === 'face'
      if (fingerFace) {
        const r = el.getBoundingClientRect()
        if (!a.ready) {
          a.x = r.width * 0.5
          a.y = r.height * 0.42
          a.ready = true
        }
        a.pid = e.pointerId
        a.down = true
        a.lx = e.clientX
        a.ly = e.clientY
        if ((live.current.tool?.precision || 'x4') === 'direct') {
          a.x = clamp(e.clientX - r.left, 0, r.width)
          a.y = clamp(e.clientY - r.top - FINGER_LIFT, 0, r.height)
        }
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* already captured or unsupported */
        }
        s.painting = live.current.tool?.mode === 'paint'
        s.last = null
        if (e.cancelable) e.preventDefault()
        return
      }
      track(e)
      if (live.current.view === 'face') {
        s.painting = true
        s.last = null
      }
    }
    const up = (e) => {
      if (!e || e.pointerId == null || e.pointerId === a.pid) {
        a.down = false
        a.pid = null
      }
      s.painting = false
      s.last = null
      if (s.dragging) {
        s.dragging = false
        s.lastPan = -1
        document.body.style.cursor = ''
        ray.setFromCamera(ndc.set(ptr.current.x, ptr.current.y), camera)
        const hit = new THREE.Vector3()
        if (ray.ray.intersectPlane(REST_PLANE, hit)) {
          s.restPos.set(clamp(hit.x, -0.35, 0.8), TY + 0.04, clamp(hit.z, -0.7, -0.3))
        }
      }
    }
    window.addEventListener('pointermove', track, { passive: false })
    el.addEventListener('pointerdown', down, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', track)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl, camera, ray, ndc])

  /* ---------------- per-frame: camera, brush, painting ---------------- */
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const c = cam.current
    const p = live.current
    const s = st.current
    const aspect = size.width / size.height

    // --- camera: eased move + fov punch + roll = the "cool" zoom ---
    const goal = camTargets(p.view, aspect)
    c.t = Math.min(1, c.t + dt / c.dur)
    const e = easeInOutCubic(c.t)
    const punch = Math.sin(Math.PI * c.t)
    camera.position.lerpVectors(c.fromPos, goal.pos, e)
    c.tgt.lerpVectors(c.fromTgt, goal.tgt, e)
    const still = p.view === 'table' || p.view === 'bed'
    c.par = THREE.MathUtils.damp(c.par, still && c.t >= 1 ? 1 : 0, 3, dt)
    camera.position.x += ptr.current.x * (p.view === 'bed' ? 0.22 : 0.3) * c.par
    camera.position.y += ptr.current.y * 0.1 * c.par
    if (c.swing) {
      // curved fly-in towards (or away from) the laptop screen
      camera.position.x += c.swing * Math.sin(Math.PI * e) * 0.5
      camera.position.y += Math.sin(Math.PI * e) * 0.12
    }
    camera.fov = THREE.MathUtils.lerp(c.fromFov, goal.fov, e) + c.punch * punch
    const roll = c.roll * punch * (p.view === 'face' || p.view === 'pc' ? 1 : -1)
    if (c.rot && c.t < 1) {
      // turn the head: interpolate yaw/pitch so the 180 degree swing goes the right way round
      const fx = goal.tgt.x - goal.pos.x
      const fy = goal.tgt.y - goal.pos.y
      const fz = goal.tgt.z - goal.pos.z
      const gYaw = Math.atan2(-fx, -fz)
      const gPitch = Math.asin(clamp(fy / Math.hypot(fx, fy, fz), -1, 1))
      let dYaw = wrapPi(gYaw - c.fromYaw)
      if (Math.abs(dYaw) > 2.6) dYaw = c.turn * Math.abs(dYaw)
      camera.rotation.order = 'YXZ'
      camera.rotation.set(
        THREE.MathUtils.lerp(c.fromPitch, gPitch, e),
        c.fromYaw + dYaw * e,
        0,
      )
      camera.rotateZ(roll)
    } else {
      camera.lookAt(c.tgt)
      camera.rotateZ(roll)
    }
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    // --- brush target pose ---
    let tipT = s.restPos
    let dirT = REST_DIR
    const faceActive = p.view === 'face' && c.t > 0.85
    const fingerFace = faceActive && isTouch && inputKind.current === 'finger'
    const sizeName = isTouch ? p.tool?.size || 'fine' : 'blush'
    const radius = BRUSH_RADII[sizeName] || 55
    const hard = sizeName === 'pixel'

    let ndcX = ptr.current.x
    let ndcY = ptr.current.y
    let aiming = ptr.current.inside
    if (fingerFace) {
      const rect = gl.domElement.getBoundingClientRect()
      const a = aim.current
      if (!a.ready && rect.width > 2) {
        a.x = rect.width * 0.5
        a.y = rect.height * 0.42
        a.ready = true
      }
      const bag = p.overlayRef?.current
      const step = bag?.texel || 3
      if (bag?.nudge && (bag.nudge.x || bag.nudge.y)) {
        a.x += bag.nudge.x * step
        a.y += bag.nudge.y * step
        bag.nudge.x = 0
        bag.nudge.y = 0
        a.ready = true
      }
      a.x = clamp(a.x, 0, Math.max(0, rect.width))
      a.y = clamp(a.y, 0, Math.max(0, rect.height))
      if (rect.width > 2) {
        ndcX = (a.x / rect.width) * 2 - 1
        ndcY = -(a.y / rect.height) * 2 + 1
        aiming = true
      }
    }

    let hitUv = null
    let hitPoint = null

    if (faceActive && aiming && faceMesh.current) {
      ray.setFromCamera(ndc.set(ndcX, ndcY), camera)
      dirT = FACE_DIR
      const hit = ray.intersectObject(faceMesh.current, false)[0]
      if (hit) {
        const n = hit.face.normal
          .clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize()
        tipT = hit.point.clone().addScaledVector(n, 0.012)
        hitUv = { u: hit.uv.x, v: hit.uv.y }
        hitPoint = hit.point
        const doPaint = s.painting || s.stamp
        if (doPaint) {
          if (!p.brushColor) {
            const now = performance.now()
            if (now > s.needAt) {
              s.needAt = now + 2500
              p.onNeedColor()
            }
            s.stamp = false
          } else {
            paintApi.current.stroke?.(
              hit.uv.x,
              hit.uv.y,
              s.stamp ? undefined : s.last?.u,
              s.stamp ? undefined : s.last?.v,
              p.brushColor,
              isTouch ? radius : 55,
              isTouch && hard,
            )
            if (!s.stamp) s.last = { u: hit.uv.x, v: hit.uv.y }
            s.stamp = false
          }
        } else s.last = null
      } else {
        const out = new THREE.Vector3()
        if (ray.ray.intersectPlane(FACE_PLANE, out)) tipT = out
        s.last = null
        if (s.stamp) {
          s.stamp = false
          const now = performance.now()
          if (now > s.needAt) {
            s.needAt = now + 1600
            p.onBrushMiss?.()
          }
        }
      }
    } else if (p.view === 'table' && s.dragging) {
      ray.setFromCamera(ndc.set(ptr.current.x, ptr.current.y), camera)
      dirT = HELD_DIR
      const hover = new THREE.Vector3()
      if (ray.ray.intersectPlane(HOVER_PLANE, hover)) {
        tipT = new THREE.Vector3(clamp(hover.x, -1.75, 1.75), TY + 0.38, clamp(hover.z, -2.0, -0.3))
      }
      if (p.boxOpen) {
        const pt = new THREE.Vector3()
        let over = -1
        if (ray.ray.intersectPlane(PAN_PLANE, pt)) {
          PANS.forEach((pan, i) => {
            const d = Math.hypot(pt.x - (BOX_POS.x + pan.x), pt.z - (BOX_POS.z + PAN_Z))
            if (d < PAN_R + 0.03) over = i
          })
        }
        if (over >= 0) {
          tipT = new THREE.Vector3(pt.x, TY + 0.27, pt.z)
          if (s.lastPan !== over) {
            s.lastPan = over
            const hex = over === 1 ? p.shade.hex : PANS[over].hex
            const name = over === 1 ? p.shade.name : PANS[over].name
            p.onLoadColor(hex, name)
          }
        } else s.lastPan = -1
      }
    }

    // Touch face: the 3D brush should sit on the pixel you're aiming at, not lag behind it.
    const follow = fingerFace ? 42 : 16
    s.tip.lerp(tipT, 1 - Math.exp(-dt * follow))
    s.dir.lerp(dirT, 1 - Math.exp(-dt * (fingerFace ? 18 : 9))).normalize()
    if (brush.current) {
      brush.current.position.copy(s.tip)
      brush.current.quaternion.setFromUnitVectors(UP, s.dir)
    }

    if (isTouch && p.overlayRef?.current) {
      const o = p.overlayRef.current
      const rect = gl.domElement.getBoundingClientRect()
      const show = faceActive && (fingerFace || ptr.current.inside)
      if (typeof window !== 'undefined') {
        window.__brush = {
          t: Math.round(c.t * 1000) / 1000,
          view: p.view,
          faceActive,
          finger: inputKind.current,
          show,
          hasReticle: !!o.reticle,
          hasLoupe: !!o.loupe,
          inside: ptr.current.inside,
        }
      }
      if (o.reticle) {
        o.reticle.style.opacity = show ? '1' : '0'
        if (show && rect.width > 2) {
          const x = ((ndcX + 1) / 2) * rect.width
          const y = ((1 - ndcY) / 2) * rect.height
          o.reticle.style.transform = `translate3d(${x}px, ${y}px, 0)`
          if (o.loupe) {
            const clash = x < 176 && y < 300
            o.loupe.style.opacity = '1'
            o.loupe.style.top = clash ? '132px' : '108px'
            o.loupe.style.bottom = 'auto'
            o.loupe.style.left = clash ? 'auto' : '12px'
            o.loupe.style.right = clash ? '12px' : 'auto'
          }
          if (o.ring) {
            let screenR = hard ? 14 : 16
            if (hitPoint && !hard) {
              const v = tmp.current
              v.a.copy(hitPoint)
              v.b.copy(hitPoint)
              v.b.x += radius * (0.72 / TEX_W)
              v.a.project(camera)
              v.b.project(camera)
              screenR = Math.max(
                8,
                Math.hypot((v.b.x - v.a.x) * rect.width * 0.5, (v.b.y - v.a.y) * rect.height * 0.5),
              )
              // one texel, reused by the nudge pad
              v.a.copy(hitPoint)
              v.b.copy(hitPoint)
              v.b.x += 0.72 / TEX_W
              v.a.project(camera)
              v.b.project(camera)
              o.texel = Math.max(
                1.25,
                Math.hypot((v.b.x - v.a.x) * rect.width * 0.5, (v.b.y - v.a.y) * rect.height * 0.5),
              )
            }
            o.ring.style.width = `${screenR * 2}px`
            o.ring.style.height = `${screenR * 2}px`
          }
        }
      }
      if (o.loupe && !show) o.loupe.style.opacity = '0'
      if (show && hitUv && o.canvas) paintApi.current.loupe?.(o.canvas, hitUv.u, hitUv.v, radius, hard)
      if (o.readout) {
        if (!show) o.readout.textContent = ''
        else if (!hitUv) o.readout.textContent = 'off face'
        else o.readout.textContent = `${Math.floor(hitUv.u * TEX_W)} , ${Math.floor((1 - hitUv.v) * TEX_H)}`
      }
    }
  })

  const grabBrush = (e) => {
    e.stopPropagation()
    if (live.current.view !== 'table') return
    st.current.dragging = true
    st.current.lastPan = -1
    document.body.style.cursor = 'grabbing'
  }

  const pointerCursor = (on) => () => {
    if (live.current.view === 'table' && !st.current.dragging) document.body.style.cursor = on ? 'pointer' : ''
  }

  return (
    <>
      <hemisphereLight args={['#fff1f6', '#5a4a6a', 1.5]} />
      <directionalLight
        position={[2.5, 5, 3]}
        intensity={2.4}
        castShadow
        shadow-mapSize={isMobile ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 2.6, -0.2]} intensity={20} color="#ffdfe9" distance={9} decay={2} />

      <Room />
      <Mirror />
      <Table />
      <Laptop
        active={view === 'bed'}
        onClick={(e) => {
          e.stopPropagation()
          if (live.current.view === 'bed') {
            document.body.style.cursor = ''
            onLaptopClick()
          }
        }}
        onOver={() => {
          if (live.current.view === 'bed') document.body.style.cursor = 'pointer'
        }}
        onOut={() => {
          if (live.current.view === 'bed') document.body.style.cursor = ''
        }}
      />
      <Radio
        playing={playing}
        onClick={(e) => {
          e.stopPropagation()
          if (live.current.view === 'table') onRadioClick()
        }}
        onOver={pointerCursor(true)}
        onOut={pointerCursor(false)}
      />

      <MakeupBox
        open={boxOpen}
        shadeHex={shade.hex}
        onClick={(e) => {
          e.stopPropagation()
          onBoxClick()
        }}
        onOver={pointerCursor(true)}
        onOut={pointerCursor(false)}
      />

      <Head
        apiRef={paintApi}
        faceRef={faceMesh}
        onClick={(e) => {
          e.stopPropagation()
          onHeadClick()
        }}
        onOver={pointerCursor(true)}
        onOut={pointerCursor(false)}
      />

      {/* brush: origin = bristle tip, handle points along +Y */}
      <group
        ref={brush}
        position={[0.15, TY + 0.04, -0.5]}
        onPointerDown={grabBrush}
        onPointerOver={() => {
          if (live.current.view === 'table' && !st.current.dragging) document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          if (!st.current.dragging) document.body.style.cursor = ''
        }}
      >
        <mesh position={[0, 0.09, 0]} scale={[0.04, 0.09, 0.04]} castShadow>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#fffafa" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.05, 0]} scale={[0.0415, 0.052, 0.0415]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color={brushColor || '#fffafa'} roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.042, 0.14, 20]} />
          <meshStandardMaterial color="#d9d9e0" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.67, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.042, 0.7, 20]} />
          <meshStandardMaterial color="#f4b6c6" roughness={0.35} />
        </mesh>
        {/* generous invisible grab area */}
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[isTouch ? 0.17 : 0.1, isTouch ? 0.17 : 0.1, 1.0, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Room + mirror + table                                               */
/* ------------------------------------------------------------------ */
function Room() {
  return (
    <group>
      {/* shell */}
      <mesh position={[0, 2.1, 3]} receiveShadow>
        <boxGeometry args={[10, 4.2, 13]} />
        <meshStandardMaterial color="#eadce8" roughness={0.9} side={THREE.BackSide} />
      </mesh>
      {/* floor + rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 3]} receiveShadow>
        <planeGeometry args={[10, 13]} />
        <meshStandardMaterial color="#b88a64" roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 4.8]} receiveShadow>
        <circleGeometry args={[2.3, 48]} />
        <meshStandardMaterial color="#d6a5c0" roughness={0.95} />
      </mesh>

      {/* bed against the wall behind the camera (seen in the mirror) */}
      <Box p={[0, 0.175, 8.2]} s={[2.3, 0.35, 2.6]} c="#6d4a3a" />
      <Box p={[0, 0.49, 8.2]} s={[2.2, 0.28, 2.5]} c="#fbf3f6" r={0.95} />
      <Box p={[0, 0.66, 7.7]} s={[2.24, 0.07, 1.6]} c="#9b8bd0" r={0.95} />
      <Box p={[-0.55, 0.69, 9.0]} s={[0.8, 0.15, 0.45]} c="#ffffff" r={0.95} />
      <Box p={[0.55, 0.69, 9.0]} s={[0.8, 0.15, 0.45]} c="#ffd7e3" r={0.95} />
      <Box p={[0, 0.95, 9.44]} s={[2.5, 1.3, 0.12]} c="#5b3d31" />
      {[-1.6, 1.6].map((x) => (
        <group key={x}>
          <Box p={[x, 0.275, 9.2]} s={[0.6, 0.55, 0.5]} c="#7a5646" />
          <mesh position={[x, 0.7, 9.2]}>
            <cylinderGeometry args={[0.07, 0.1, 0.3, 16]} />
            <meshStandardMaterial color="#f1e6d8" />
          </mesh>
          <mesh position={[x, 1.0, 9.2]}>
            <coneGeometry args={[0.22, 0.3, 24, 1, true]} />
            <meshStandardMaterial color="#ffd9a8" emissive="#ffb866" emissiveIntensity={1.2} side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[x, 1.0, 9.0]} intensity={7} color="#ffc98f" distance={8} decay={2} />
        </group>
      ))}

      {/* wardrobe, window, frames */}
      <Box p={[-4.55, 1.4, 5.5]} s={[0.8, 2.8, 2.0]} c="#d9c7b8" />
      <mesh position={[4.97, 2.3, 3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.8, 1.9]} />
        <meshBasicMaterial color="#27305c" />
      </mesh>
      <mesh position={[4.96, 2.9, 3.4]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial color="#fff6d6" />
      </mesh>
      <Box p={[4.9, 2.3, 3]} s={[0.06, 0.06, 1.9]} c="#f3ece6" />
      <Box p={[4.9, 2.3, 3]} s={[0.06, 1.95, 0.06]} c="#f3ece6" />
      <Box p={[4.88, 2.35, 1.7]} s={[0.12, 2.6, 0.5]} c="#e58fa0" r={0.95} />
      <Box p={[4.88, 2.35, 4.3]} s={[0.12, 2.6, 0.5]} c="#e58fa0" r={0.95} />
      <Box p={[-3.6, 2.5, -3.46]} s={[0.9, 1.2, 0.05]} c="#c9a24a" m={0.5} r={0.4} />
      <Box p={[-3.6, 2.5, -3.43]} s={[0.76, 1.06, 0.02]} c="#f2b8c8" />
      <Box p={[3.6, 2.5, -3.46]} s={[0.9, 1.2, 0.05]} c="#c9a24a" m={0.5} r={0.4} />
      <Box p={[3.6, 2.5, -3.43]} s={[0.76, 1.06, 0.02]} c="#b9c8f2" />
    </group>
  )
}

function Mirror() {
  const mirror = useMemo(
    () =>
      new Reflector(new THREE.PlaneGeometry(2.6, 3.2), {
        textureWidth: isMobile ? 512 : 1024,
        textureHeight: isMobile ? 512 : 1024,
        color: 0xd0d0d0,
        clipBias: 0.003,
      }),
    [],
  )
  return (
    <>
      <primitive object={mirror} position={[0, 2.1, -3.41]} />
      <Box p={[0, 2.1, -3.47]} s={[2.9, 3.5, 0.1]} c="#c9a24a" r={0.35} m={0.7} />
    </>
  )
}

function Table() {
  return (
    <group position={[0, 0, -1.2]}>
      <Box p={[0, 0.75, 0]} s={[3.8, 0.1, 2.0]} c="#8a5a3c" r={0.5} />
      {[-1.75, 1.75].flatMap((x) =>
        [-0.9, 0.9].map((z) => <Box key={`${x}${z}`} p={[x, 0.375, z]} s={[0.12, 0.75, 0.12]} c="#6e452d" />),
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Makeup box with spring-animated lid                                 */
/* ------------------------------------------------------------------ */
function MakeupBox({ open, shadeHex, onClick, onOver, onOut }) {
  const lid = useRef()
  const spring = useRef({ v: 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.033)
    const target = open ? -1.95 : 0
    const sp = spring.current
    sp.v += ((target - lid.current.rotation.x) * 70 - sp.v * 9) * dt
    lid.current.rotation.x += sp.v * dt
  })

  return (
    <group position={BOX_POS} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      <Box p={[0, 0.11, 0]} s={[1.2, 0.22, 0.8]} c="#c9748a" r={0.4} />
      <Box p={[0, 0.02, 0]} s={[1.22, 0.04, 0.82]} c="#d8b25a" m={0.7} r={0.3} />
      <Box p={[0, 0.221, 0]} s={[1.1, 0.004, 0.7]} c="#3a2430" r={1} />
      {/* clasp */}
      <Box p={[0, 0.13, 0.405]} s={[0.12, 0.1, 0.02]} c="#d8b25a" m={0.8} r={0.25} />

      {PANS.map((pan, i) => (
        <group key={i} position={[pan.x, 0.225, PAN_Z]}>
          <mesh>
            <cylinderGeometry args={[0.17, 0.17, 0.03, 40]} />
            <meshStandardMaterial color={i === 1 ? shadeHex : pan.hex} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.012, 8, 40]} />
            <meshStandardMaterial color="#d8b25a" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* lid hinged on the back edge */}
      <group ref={lid} position={[0, 0.24, -0.4]}>
        <Box p={[0, 0.03, 0.4]} s={[1.2, 0.06, 0.8]} c="#c9748a" r={0.4} />
        <mesh position={[0, -0.001, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.1, 0.7]} />
          <meshStandardMaterial color="#e8e8f0" metalness={1} roughness={0.08} />
        </mesh>
        <mesh position={[0, 0.062, 0.4]}>
          <cylinderGeometry args={[0.13, 0.13, 0.012, 32]} />
          <meshStandardMaterial color="#d8b25a" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Statue head: your photo on the front, paintable canvas on top       */
/* ------------------------------------------------------------------ */
function Head({ apiRef, faceRef, onClick, onOver, onOut }) {
  const W = TEX_W
  const H = TEX_H

  const { cv, tex } = useMemo(() => {
    const mk = () => {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      return c
    }
    const cv = { base: mk(), paint: mk(), display: mk() }
    const tex = new THREE.CanvasTexture(cv.display)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return { cv, tex }
  }, [])

  const dirty = useRef(false)

  const geo = useMemo(() => {
    // front hemisphere with planar UVs so the photo maps straight on
    const g = new THREE.SphereGeometry(1, 96, 96, 0, Math.PI)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getY(i) * 0.5 + 0.5)
    return g
  }, [])

  useEffect(() => {
    const compose = () => {
      const ctx = cv.display.getContext('2d')
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(cv.base, 0, 0)
      ctx.globalCompositeOperation = 'source-atop' // paint only where the face is
      ctx.drawImage(cv.paint, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      tex.needsUpdate = true
    }

    const img = new Image()
    img.onload = () => {
      const ctx = cv.base.getContext('2d')
      ctx.drawImage(img, 0, 0, W, H)
      const d = ctx.getImageData(0, 0, W, H)
      const a = d.data
      // knock the white photo background out
      for (let i = 0; i < a.length; i += 4) {
        const lum = Math.min(a[i], a[i + 1], a[i + 2])
        if (lum >= 246) a[i + 3] = 0
        else if (lum >= 232) a[i + 3] = Math.min(a[i + 3], ((246 - lum) / 14) * 255)
      }
      ctx.putImageData(d, 0, 0)
      compose()
    }
    img.onerror = () => {
      const ctx = cv.base.getContext('2d')
      ctx.fillStyle = '#e2b9a4'
      ctx.beginPath()
      ctx.ellipse(W / 2, H / 2, W * 0.46, H * 0.48, 0, 0, Math.PI * 2)
      ctx.fill()
      compose()
    }
    img.src = import.meta.env.BASE_URL + 'face.png'

    apiRef.current = {
      stroke(u, v, pu, pv, hex, radius = 55, hard = false) {
        const ctx = cv.paint.getContext('2d')
        const [r, g, b] = hexToRgb(hex)
        const R = Math.max(1, radius)
        const dab = (x, y) => {
          if (hard) {
            ctx.fillStyle = `rgba(${r},${g},${b},0.98)`
            ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2)
            return
          }
          const gr = ctx.createRadialGradient(x, y, 0, x, y, R)
          gr.addColorStop(0, `rgba(${r},${g},${b},0.16)`)
          gr.addColorStop(0.5, `rgba(${r},${g},${b},0.08)`)
          gr.addColorStop(1, `rgba(${r},${g},${b},0)`)
          ctx.fillStyle = gr
          ctx.beginPath()
          ctx.arc(x, y, R, 0, Math.PI * 2)
          ctx.fill()
        }
        const x = u * W
        const y = (1 - v) * H
        if (pu == null) dab(x, y)
        else {
          const px = pu * W
          const py = (1 - pv) * H
          const step = hard ? 1.35 : R * 0.25
          const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / step))
          for (let i = 1; i <= n; i++) dab(px + ((x - px) * i) / n, py + ((y - py) * i) / n)
        }
        dirty.current = true
      },
      loupe(canvas, u, v, radius, hard) {
        if (dirty.current) {
          dirty.current = false
          compose()
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const zoom = hard ? 14 : radius <= 9 ? 8 : radius <= 22 ? 4.2 : 2.5
        const srcW = canvas.width / zoom
        const srcH = canvas.height / zoom
        const sx = u * W - srcW / 2
        const sy = (1 - v) * H - srcH / 2
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(cv.display, sx, sy, srcW, srcH, 0, 0, canvas.width, canvas.height)
        if (zoom >= 6) {
          ctx.beginPath()
          const x0 = Math.floor(sx)
          const x1 = Math.ceil(sx + srcW)
          const y0 = Math.floor(sy)
          const y1 = Math.ceil(sy + srcH)
          for (let i = x0; i <= x1; i++) {
            const x = (i - sx) * zoom
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height)
          }
          for (let j = y0; j <= y1; j++) {
            const y = (j - sy) * zoom
            ctx.moveTo(0, y)
            ctx.lineTo(canvas.width, y)
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.32)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        const cx = canvas.width / 2
        const cy = canvas.height / 2
        ctx.moveTo(cx - 12, cy)
        ctx.lineTo(cx - 4, cy)
        ctx.moveTo(cx + 4, cy)
        ctx.lineTo(cx + 12, cy)
        ctx.moveTo(cx, cy - 12)
        ctx.lineTo(cx, cy - 4)
        ctx.moveTo(cx, cy + 4)
        ctx.lineTo(cx, cy + 12)
        ctx.stroke()
        if (hard) {
          const tx = Math.floor(u * W)
          const ty = Math.floor((1 - v) * H)
          ctx.strokeStyle = '#ff3d78'
          ctx.lineWidth = 2
          ctx.strokeRect((tx - sx) * zoom + 0.5, (ty - sy) * zoom + 0.5, zoom * 2 - 1, zoom * 2 - 1)
        } else {
          ctx.beginPath()
          ctx.arc(cx, cy, Math.max(2, radius * zoom), 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255, 61, 120, 0.95)'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      },
      clear() {
        cv.paint.getContext('2d').clearRect(0, 0, W, H)
        dirty.current = true
      },
      compose,
    }
  }, [apiRef, cv, tex])

  useFrame(() => {
    if (dirty.current) {
      dirty.current = false
      apiRef.current.compose?.()
    }
  })

  const [rx, ry, rz] = HEAD_R
  const skin = '#dcb7a4'

  return (
    <group onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      {/* pedestal + neck */}
      <group position={[HEAD.x, TY, HEAD.z]}>
        <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.34, 0.36, 0.1, 40]} />
          <meshStandardMaterial color="#f1ece6" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.225, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.24, 0.25, 32]} />
          <meshStandardMaterial color="#f1ece6" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.17, 0.4, 32]} />
          <meshStandardMaterial color={skin} roughness={0.5} />
        </mesh>
      </group>

      <group position={HEAD} rotation={[0, HEAD_YAW, 0]}>
        <mesh scale={HEAD_R} castShadow receiveShadow>
          <sphereGeometry args={[1, 64, 48]} />
          <meshStandardMaterial color={skin} roughness={0.5} />
        </mesh>

        {/* photo face (paintable) */}
        <mesh ref={faceRef} geometry={geo} scale={[rx * 1.003, ry * 1.003, rz * 1.003]} castShadow>
          <meshStandardMaterial map={tex} alphaTest={0.5} roughness={0.55} />
        </mesh>

        {/* ears */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * rx * 0.97, -0.02, -0.03]} scale={[0.05, 0.09, 0.06]} castShadow>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color={skin} roughness={0.5} />
          </mesh>
        ))}

        {/* hair: back half + top cap, so the mirror shows a full head */}
        <mesh scale={[rx * 1.04, ry * 1.03, rz * 1.05]} position={[0, 0.01, -0.01]} castShadow>
          <sphereGeometry args={[1, 64, 48, Math.PI, Math.PI]} />
          <meshStandardMaterial color="#4a3328" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh scale={[rx * 1.04, ry * 1.03, rz * 1.05]} position={[0, 0.01, -0.01]} castShadow>
          <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.2]} />
          <meshStandardMaterial color="#4a3328" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Little retro radio: click to play / pause song-01                   */
/* ------------------------------------------------------------------ */
function Radio({ playing, onClick, onOver, onOut }) {
  const root = useRef()
  const grille = useRef()
  const dial = useRef()

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const k = playing ? 1 + Math.abs(Math.sin(t * 7)) * 0.06 : 1
    grille.current.scale.setScalar(THREE.MathUtils.damp(grille.current.scale.x, k, 25, dt))
    dial.current.emissiveIntensity = THREE.MathUtils.damp(dial.current.emissiveIntensity, playing ? 1.4 : 0.05, 6, dt)
    root.current.position.y = playing ? Math.abs(Math.sin(t * 14)) * 0.0025 : 0
  })

  return (
    <group position={[0.05, TY, -1.85]} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      <group ref={root}>
        <Box p={[0, 0.15, 0]} s={[0.56, 0.3, 0.2]} c="#f4e6d4" r={0.45} />
        <Box p={[0, 0.015, 0]} s={[0.58, 0.03, 0.22]} c="#d8b25a" m={0.7} r={0.3} />

        {/* speaker */}
        <group ref={grille} position={[-0.15, 0.15, 0.102]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.01, 32]} />
            <meshStandardMaterial color="#3a2430" roughness={0.9} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.09, 0.008, 8, 32]} />
            <meshStandardMaterial color="#d8b25a" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>

        {/* tuning dial */}
        <mesh position={[0.12, 0.19, 0.102]}>
          <boxGeometry args={[0.2, 0.07, 0.01]} />
          <meshStandardMaterial ref={dial} color="#f6e7b4" emissive="#ffd98a" emissiveIntensity={0.05} />
        </mesh>
        <Box p={[0.1, 0.19, 0.109]} s={[0.004, 0.06, 0.004]} c="#c0394f" />
        {[0.08, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.08, 0.11]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.03, 20]} />
            <meshStandardMaterial color="#d8b25a" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        {/* antenna */}
        <mesh position={[0.304, 0.454, -0.05]} rotation={[0, 0, -0.5]} castShadow>
          <cylinderGeometry args={[0.004, 0.004, 0.35, 8]} />
          <meshStandardMaterial color="#d9d9e0" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0.388, 0.608, -0.05]}>
          <sphereGeometry args={[0.014, 12, 8]} />
          <meshStandardMaterial color="#d9d9e0" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Laptop on the bed: glowing BlushTube home screen, click to enter    */
/* ------------------------------------------------------------------ */
function drawScreen(ctx, w, h) {
  if (!ctx.roundRect) ctx.roundRect = function (x, y, ww, hh) { this.rect(x, y, ww, hh) } // older browsers
  const rr = (x, y, ww, hh, r, fill) => {
    ctx.beginPath()
    ctx.roundRect(x, y, ww, hh, r)
    ctx.fillStyle = fill
    ctx.fill()
  }
  ctx.fillStyle = '#17101d'
  ctx.fillRect(0, 0, w, h)
  // top bar
  ctx.fillStyle = '#1f1527'
  ctx.fillRect(0, 0, w, 78)
  rr(34, 22, 62, 40, 11, '#ff2e63')
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(56, 31)
  ctx.lineTo(56, 53)
  ctx.lineTo(77, 42)
  ctx.fill()
  ctx.font = '700 34px system-ui, sans-serif'
  ctx.fillStyle = '#ffe9f1'
  ctx.fillText('BlushTube', 110, 55)
  rr(w / 2 - 190, 18, 380, 44, 22, '#2d2038')
  ctx.font = '22px system-ui, sans-serif'
  ctx.fillStyle = '#9c88a8'
  ctx.fillText('Search', w / 2 - 160, 48)
  // chips
  ;['All', 'Makeup', 'Music', 'Live', 'Cosy'].forEach((c, i) => {
    rr(34 + i * 130, 96, 112, 38, 19, i === 0 ? '#ffe9f1' : '#2d2038')
    ctx.font = '600 19px system-ui, sans-serif'
    ctx.fillStyle = i === 0 ? '#2a1a2e' : '#e9d8e4'
    ctx.fillText(c, 34 + i * 130 + 22, 122)
  })
  // thumbnails
  const g = [
    ['#ff7aa2', '#7b4bd6'],
    ['#ffb184', '#ff6b8b'],
    ['#c95a78', '#4b2a6b'],
    ['#ffd1a8', '#ff8e7a'],
    ['#7fb6ff', '#8f6bd8'],
    ['#d9a6d6', '#6a4b9a'],
  ]
  const cw = 300
  const ch = 168
  g.forEach((c, i) => {
    const x = 34 + (i % 3) * (cw + 22)
    const y = 156 + Math.floor(i / 3) * (ch + 78)
    const gr = ctx.createLinearGradient(x, y, x + cw, y + ch)
    gr.addColorStop(0, c[0])
    gr.addColorStop(1, c[1])
    rr(x, y, cw, ch, 16, gr)
    if (i === 0) {
      ctx.lineWidth = 6
      ctx.strokeStyle = '#fff'
      ctx.beginPath()
      ctx.roundRect(x - 3, y - 3, cw + 6, ch + 6, 18)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(x + cw / 2 - 16, y + ch / 2 - 22)
    ctx.lineTo(x + cw / 2 - 16, y + ch / 2 + 22)
    ctx.lineTo(x + cw / 2 + 24, y + ch / 2)
    ctx.fill()
    rr(x, y + ch + 14, cw * 0.8, 14, 7, '#3b2b48')
    rr(x, y + ch + 38, cw * 0.5, 12, 6, '#2d2038')
  })
}

function Laptop({ active, onClick, onOver, onOut }) {
  const arrow = useRef()
  const glow = useRef()
  const W = 1024
  const H = 640

  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    drawScreen(c.getContext('2d'), W, H)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (arrow.current) {
      arrow.current.visible = active
      arrow.current.position.y = 0.62 + Math.sin(t * 3) * 0.05
    }
    if (glow.current) glow.current.intensity = 2.2 + Math.sin(t * 2) * 0.35
  })

  const metal = { color: '#cfcfd8', metalness: 0.85, roughness: 0.3 }

  return (
    <group position={LAP_POS} rotation={[0, Math.PI, 0]} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
      {/* base + keyboard */}
      <mesh position={[0, 0.0125, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.025, 0.42]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <Box p={[0, 0.026, 0.02]} s={[0.54, 0.004, 0.2]} c="#2a2230" r={0.8} />
      <Box p={[0, 0.026, 0.15]} s={[0.2, 0.004, 0.1]} c="#bdbdc8" m={0.5} r={0.4} />

      {/* lid, hinged along the back edge */}
      <group position={[0, 0.025, -0.21]} rotation={[-LAP_TILT, 0, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.62, 0.4, 0.016]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        <mesh position={[0, 0.2, 0.0092]}>
          <planeGeometry args={[SCREEN_W, SCREEN_H]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        <pointLight ref={glow} position={[0, 0.2, 0.35]} intensity={2.2} color="#ff9fc0" distance={3.2} decay={2} />
      </group>

      {/* bobbing "click me" arrow, only while you're looking at the bed */}
      <group ref={arrow} position={[0, 0.62, 0.02]}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.07, 0.14, 24]} />
          <meshBasicMaterial color="#ff4f86" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.12, 16]} />
          <meshBasicMaterial color="#ff4f86" toneMapped={false} />
        </mesh>
      </group>

      {/* generous invisible click area */}
      <mesh position={[0, 0.22, 0.02]}>
        <boxGeometry args={[0.8, 0.6, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}