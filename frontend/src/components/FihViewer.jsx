import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei'

function FihModel() {
  const { scene } = useGLTF('/models/fih.glb')
  const modelRef = useRef(null)

  useFrame(({ clock }) => {
    if (!modelRef.current) return
    const time = clock.getElapsedTime()
    modelRef.current.rotation.y = Math.sin(time * 0.65) * 0.07
    modelRef.current.rotation.z = -0.08 + Math.sin(time * 0.5) * 0.025
  })

  return (
    <Bounds fit clip observe margin={1.12}>
      <Center>
        <group ref={modelRef}>
          <primitive object={scene} />
        </group>
      </Center>
    </Bounds>
  )
}

function FihViewer({ message, speech }) {
  const audioRef = useRef(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  useEffect(() => {
    if (!speech) return undefined
    const audio = new Audio(`data:audio/wav;base64,${speech}`)
    audioRef.current = audio
    let active = true
    audio.play().then(() => {
      if (active) setAutoplayBlocked(false)
    }).catch(() => {
      if (active) setAutoplayBlocked(true)
    })
    return () => {
      active = false
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      if (audioRef.current === audio) audioRef.current = null
    }
  }, [speech])

  function replaySpeech() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true))
  }

  return (
    <div className="fih-viewer">
      <div className="fih-speech" aria-live="polite" aria-atomic="true">
        <p key={message}>{message}</p>
        <button
          className="fih-speech-play"
          type="button"
          onClick={replaySpeech}
          disabled={!speech}
          aria-label={speech ? 'Replay Fih voice' : 'Fih voice unavailable'}
          title={!speech ? 'Gemini voice unavailable' : autoplayBlocked ? 'Autoplay blocked; replay voice' : 'Replay Fih voice'}
        >
          ▶
        </button>
      </div>
      <div className="fih-canvas" aria-label="Interactive 3D model of Fih">
        <Canvas
          camera={{ position: [0, 0, 4], fov: 32 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ambientLight intensity={1.8} />
          <directionalLight position={[4, 6, 5]} intensity={2.2} />
          <directionalLight position={[-4, 2, -3]} intensity={1.1} />
          <Suspense fallback={null}>
            <FihModel />
          </Suspense>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enableZoom={false}
            enablePan={false}
            rotateSpeed={0.75}
          />
        </Canvas>
      </div>
    </div>
  )
}

useGLTF.preload('/models/fih.glb')

export default FihViewer
