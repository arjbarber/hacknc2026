import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import { discoverHinge, type HingeInfo } from '../../lib/hingeDiscovery'
import { styleShellMaterials } from './phoneMaterials'

export type PhoneState = 'closed' | 'opening' | 'open' | 'closing'

export interface PhoneHandle {
  open: () => Promise<void>
  close: () => Promise<void>
  readonly state: PhoneState
}

export interface PhoneReadyInfo extends HingeInfo {
  openDuration: number
}

interface Props {
  ref?: Ref<PhoneHandle>
  onStateChange?: (s: PhoneState) => void
  onReady?: (info: PhoneReadyInfo) => void
  onError?: (e: Error) => void
  /** seconds for the hinge opening move (target 0.5–0.8) */
  openDuration?: number
  closeDuration?: number
}

export const MODEL_URL = '/models/naviphone.glb'
// Base orientation so the screen faces the camera (verified visually against the model).
const BASE_ROT = new THREE.Euler(0, -Math.PI / 2, 0)
const CLOSED_FIT_HEIGHT = 5.0
const OPEN_FIT_HEIGHT = 5.5
const LIFT_Y = 0.4 // sit above the button row

/** Box of visible meshes only (Box3.setFromObject would also count hidden ones). */
const visibleBox = (root: THREE.Object3D) => {
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) box.union(tmp.setFromObject(o))
  })
  return box
}

interface Rig {
  mixer: THREE.AnimationMixer
  hinge: HingeInfo
  closed: { s: number; p: THREE.Vector3 }
  opened: { s: number; p: THREE.Vector3 }
}

export function Phone({ ref, onStateChange, onReady, onError, openDuration = 0.7, closeDuration = 0.55 }: Props) {
  const gltf = useGLTF(MODEL_URL)
  const floatRef = useRef<THREE.Group>(null)
  const normRef = useRef<THREE.Group>(null)
  const orientRef = useRef<THREE.Group>(null)

  const rig = useRef<Rig | null>(null)
  const prog = useRef({ p: 0 })
  const tween = useRef<gsap.core.Tween | null>(null)
  const state = useRef<PhoneState>('closed')
  const cb = useRef({ onStateChange, onReady, onError })
  cb.current = { onStateChange, onReady, onError }

  const setState = (s: PhoneState) => {
    if (state.current === s) return
    state.current = s
    cb.current.onStateChange?.(s)
  }

  const apply = (p: number) => {
    const r = rig.current
    const norm = normRef.current
    if (!r || !norm) return
    r.mixer.setTime(THREE.MathUtils.lerp(r.hinge.start, r.hinge.end, p))
    norm.scale.setScalar(THREE.MathUtils.lerp(r.closed.s, r.opened.s, p))
    norm.position.lerpVectors(r.closed.p, r.opened.p, p)
  }

  // one-time setup: inspect clip, discover hinge, measure closed/open framing
  useEffect(() => {
    const scene = gltf.scene
    try {
      styleShellMaterials(scene)
      const clip = gltf.animations[0]
      if (!clip) throw new Error('GLB has no animation clips')
      const hinge = discoverHinge(clip, scene)
      const mixer = new THREE.AnimationMixer(scene)
      mixer.clipAction(clip).play()

      // In the file the SD card rests "ejected" beside the phone and only slides in at ~4.8s.
      // It isn't part of the open/close move, so keep it out of the hero shot.
      const sd = scene.getObjectByName('SD_Card')
      if (sd) sd.visible = false

      const orient = orientRef.current!
      const norm = normRef.current!
      norm.scale.setScalar(1)
      norm.position.set(0, 0, 0)

      const measure = (t: number, fitH: number) => {
        mixer.setTime(t)
        orient.updateWorldMatrix(true, true)
        const box = visibleBox(orient)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const s = fitH / size.y
        return { s, p: center.multiplyScalar(-s).add(new THREE.Vector3(0, LIFT_Y, 0)) }
      }
      const closed = measure(hinge.start, CLOSED_FIT_HEIGHT)
      const opened = measure(hinge.end, OPEN_FIT_HEIGHT)
      rig.current = { mixer, hinge, closed, opened }
      prog.current.p = 0
      apply(0)
      cb.current.onReady?.({ ...hinge, openDuration })
    } catch (e) {
      cb.current.onError?.(e instanceof Error ? e : new Error(String(e)))
    }
    return () => {
      tween.current?.kill()
      rig.current?.mixer.stopAllAction()
      rig.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf])

  /** Idempotent: always tweens from wherever the hinge currently is toward `target`. */
  const goTo = (target: 0 | 1): Promise<void> => {
    if (!rig.current) return Promise.resolve()
    const want: PhoneState = target === 1 ? 'opening' : 'closing'
    const done: PhoneState = target === 1 ? 'open' : 'closed'
    if (state.current === want || state.current === done) return Promise.resolve()
    tween.current?.kill()
    setState(want)
    const dist = Math.abs(target - prog.current.p)
    const dur = (target === 1 ? openDuration : closeDuration) * Math.max(dist, 0.15)
    return new Promise<void>((resolve) => {
      tween.current = gsap.to(prog.current, {
        p: target,
        duration: dur,
        ease: target === 1 ? 'power3.out' : 'power2.inOut',
        onUpdate: () => apply(prog.current.p),
        onComplete: () => {
          apply(target)
          setState(done)
          const g = floatRef.current
          // tiny settle "pop" on the outer rig only (never touches hinge/model properties)
          if (g && target === 1)
            gsap.fromTo(g.scale, { x: 1.035, y: 1.035, z: 1.035 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'elastic.out(1,0.5)' })
          resolve()
        },
        onInterrupt: () => resolve(),
      })
    })
  }

  useImperativeHandle(ref, () => ({
    open: () => goTo(1),
    close: () => goTo(0),
    get state() {
      return state.current
    },
  }))

  // idle float / tilt / pointer reaction (outer group only)
  useFrame((st, dt) => {
    const g = floatRef.current
    if (!g) return
    const t = st.clock.elapsedTime
    const k = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1
    g.position.y = Math.sin(t * 0.9) * 0.2 * k
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, Math.sin(t * 0.35) * 0.22 * k + st.pointer.x * 0.35 * k, 4, dt)
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, Math.sin(t * 0.5) * 0.05 * k - st.pointer.y * 0.18 * k, 4, dt)
    g.rotation.z = Math.sin(t * 0.55) * 0.04 * k
  })

  return (
    <group ref={floatRef}>
      <group ref={normRef}>
        <group ref={orientRef} rotation={BASE_ROT}>
          <primitive object={gltf.scene} />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
