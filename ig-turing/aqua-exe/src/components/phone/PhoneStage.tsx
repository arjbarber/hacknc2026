import { Suspense, useMemo, useRef, type Ref } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { Phone, type PhoneHandle, type PhoneReadyInfo, type PhoneState } from './Phone'

/** Soft radial blob used as a fake contact shadow under the floating phone. */
function useShadowTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    r.addColorStop(0, 'rgba(20,90,140,0.55)')
    r.addColorStop(0.5, 'rgba(40,130,180,0.22)')
    r.addColorStop(1, 'rgba(60,160,210,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

function Shadow() {
  const tex = useShadowTexture()
  const ref = useRef<THREE.Mesh>(null)
  useFrame((st) => {
    const m = ref.current
    if (!m) return
    const f = Math.sin(st.clock.elapsedTime * 0.9) // matches phone float
    m.scale.set(5.2 - f * 0.25, 1.5 - f * 0.08, 1)
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.85 - f * 0.1
  })
  return (
    <mesh ref={ref} position={[0, -4.55, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}

/** Slow sweeping coloured lights so the clearcoat + iridescence shimmer. */
function SweepLights() {
  const a = useRef<THREE.PointLight>(null)
  const b = useRef<THREE.PointLight>(null)
  useFrame((st) => {
    const t = st.clock.elapsedTime
    if (a.current) a.current.position.set(Math.cos(t * 0.6) * 6, 2 + Math.sin(t * 0.4) * 2, 5)
    if (b.current) b.current.position.set(Math.cos(t * 0.5 + 3) * 6, -1 + Math.sin(t * 0.7) * 2, 5)
  })
  return (
    <>
      <pointLight ref={a} color="#8DECF1" intensity={90} distance={22} />
      <pointLight ref={b} color="#F4B8D4" intensity={80} distance={22} />
    </>
  )
}

interface Props {
  phoneRef: Ref<PhoneHandle>
  onStateChange: (s: PhoneState) => void
  onReady: (i: PhoneReadyInfo) => void
  onError: (e: Error) => void
}

export function PhoneStage({ phoneRef, onStateChange, onReady, onError }: Props) {
  return (
    <Canvas
      className="phone-canvas"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.3, 17], fov: 27 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.setClearColor(0x000000, 0)
      }}
    >
      {/* fully local environment: no HDR download needed on hackathon wifi */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#7fbfe0']} />
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 6, 5]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#8DECF1" position={[-7, 1, 3]} scale={[3, 9, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#F4B8D4" position={[7, 0, 3]} scale={[3, 9, 1]} />
        <Lightformer form="circle" intensity={2.4} color="#CDBAF7" position={[0, -5, 4]} scale={6} />
        <Lightformer form="ring" intensity={2} color="#A5E8C3" position={[0, 2, -6]} scale={8} />
      </Environment>
      <ambientLight intensity={0.35} color="#dff6ff" />
      <directionalLight position={[3, 6, 8]} intensity={1.4} color="#ffffff" />
      <SweepLights />
      <Suspense fallback={null}>
        <Phone ref={phoneRef} onStateChange={onStateChange} onReady={onReady} onError={onError} />
        <Shadow />
      </Suspense>
    </Canvas>
  )
}
