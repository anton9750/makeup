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

const clamp = THREE.MathUtils.clamp
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function camTargets(view, aspect) {
  if (view === 'face') {
    const k = Math.max(1, 0.9 / aspect)
    return {
      pos: HEAD.clone().addScaledVector(FWD, 1.5 * k).add(new THREE.Vector3(0, 0.02, 0)),
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
  const { view, boxOpen, shade, brushColor, onBoxClick, onHeadClick, clearKey } = props
  const { camera, gl, size } = useThree()

  const brush = useRef()
  const faceMesh = useRef()
  const paintApi = useRef({})
  const ptr = useRef({ x: 0, y: 0, inside: false })
  const live = useRef(props)
  live.current = props

  const cam = useRef({
    t: 1,
    par: 0,
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
    restPos: new THREE.Vector3(0.15, TY + 0.04, -0.5),
    tip: new THREE.Vector3(0.15, TY + 0.04, -0.5),
    dir: REST_DIR.clone(),
  })
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  // start a camera transition whenever the view changes
  useEffect(() => {
    const c = cam.current
    c.fromPos.copy(camera.position)
    c.fromTgt.copy(c.tgt)
    c.fromFov = camera.fov
    c.t = 0
    st.current.painting = false
    st.current.last = null
  }, [view, camera])

  useEffect(() => {
    paintApi.current.clear?.()
  }, [clearKey])

  // pointer tracking + brush drop
  useEffect(() => {
    const el = gl.domElement
    const s = st.current
    const track = (e) => {
      const r = el.getBoundingClientRect()
      ptr.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      // on touch, hold the tip a little above the fingertip so it stays visible
      ptr.current.y = -((e.clientY - r.top) / r.height) * 2 + 1 + (e.pointerType === 'touch' ? 0.14 : 0)
      ptr.current.inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    }
    const down = (e) => {
      track(e)
      if (live.current.view === 'face') {
        s.painting = true
        s.last = null
      }
    }
    const up = () => {
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
    window.addEventListener('pointermove', track)
    el.addEventListener('pointerdown', down)
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
    c.t = Math.min(1, c.t + dt / 1.6)
    const e = easeInOutCubic(c.t)
    const punch = Math.sin(Math.PI * c.t)
    camera.position.lerpVectors(c.fromPos, goal.pos, e)
    c.tgt.lerpVectors(c.fromTgt, goal.tgt, e)
    c.par = THREE.MathUtils.damp(c.par, p.view === 'table' && c.t >= 1 ? 1 : 0, 3, dt)
    camera.position.x += ptr.current.x * 0.3 * c.par
    camera.position.y += ptr.current.y * 0.1 * c.par
    camera.fov = THREE.MathUtils.lerp(c.fromFov, goal.fov, e) + 14 * punch
    camera.lookAt(c.tgt)
    camera.rotateZ(0.07 * punch * (p.view === 'face' ? 1 : -1))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    // --- brush target pose ---
    let tipT = s.restPos
    let dirT = REST_DIR
    const faceActive = p.view === 'face' && c.t > 0.85

    if (faceActive && ptr.current.inside && faceMesh.current) {
      ray.setFromCamera(ndc.set(ptr.current.x, ptr.current.y), camera)
      dirT = FACE_DIR
      const hit = ray.intersectObject(faceMesh.current, false)[0]
      if (hit) {
        const n = hit.face.normal
          .clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize()
        tipT = hit.point.clone().addScaledVector(n, 0.012)
        if (s.painting) {
          if (!p.brushColor) {
            const now = performance.now()
            if (now > s.needAt) {
              s.needAt = now + 2500
              p.onNeedColor()
            }
          } else {
            paintApi.current.stroke?.(hit.uv.x, hit.uv.y, s.last?.u, s.last?.v, p.brushColor)
            s.last = { u: hit.uv.x, v: hit.uv.y }
          }
        } else s.last = null
      } else {
        const out = new THREE.Vector3()
        if (ray.ray.intersectPlane(FACE_PLANE, out)) tipT = out
        s.last = null
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

    s.tip.lerp(tipT, 1 - Math.exp(-dt * 16))
    s.dir.lerp(dirT, 1 - Math.exp(-dt * 9)).normalize()
    if (brush.current) {
      brush.current.position.copy(s.tip)
      brush.current.quaternion.setFromUnitVectors(UP, s.dir)
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
  const W = 640
  const H = 800

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

    const R = 55
    apiRef.current = {
      stroke(u, v, pu, pv, hex) {
        const ctx = cv.paint.getContext('2d')
        const [r, g, b] = hexToRgb(hex)
        const dab = (x, y) => {
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
          const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (R * 0.25)))
          for (let i = 1; i <= n; i++) dab(px + ((x - px) * i) / n, py + ((y - py) * i) / n)
        }
        dirty.current = true
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
