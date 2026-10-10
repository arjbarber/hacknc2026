import * as THREE from 'three'

/**
 * Finds the hinge opening segment by reading the clip's real keyframes.
 * Nothing here is hardcoded to a clip name, node name, or time range.
 *
 * Method:
 *  1. Candidates = quaternion tracks that swing > 45° from their first key (hinge, antenna, ...).
 *  2. The hinge is the candidate whose node carries the most geometry (the lid is half the phone;
 *     the antenna is a sliver). Angle alone is ambiguous: the antenna sweeps ~175° too.
 *  3. Its first run of keys rotating away from the start pose is the opening segment.
 */
export interface HingeInfo {
  trackName: string
  nodeName: string
  /** clip time (s) where the opening motion begins */
  start: number
  /** clip time (s) where the hinge reaches its fully-open pose */
  end: number
  /** total angle swept during the opening segment, in degrees */
  sweepDeg: number
  clipDuration: number
}

const MOVING_EPS_DEG = 0.05

const angleBetween = (v: ArrayLike<number>, a: number, b: number): number => {
  const dot = Math.abs(v[a] * v[b] + v[a + 1] * v[b + 1] + v[a + 2] * v[b + 2] + v[a + 3] * v[b + 3])
  return THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, dot)))
}

const subtreeVolume = (root: THREE.Object3D, nodeName: string): number => {
  const node = THREE.PropertyBinding.findNode(root, nodeName) as THREE.Object3D | undefined
  if (!node) return 0
  const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3())
  return size.x * size.y * size.z
}

export function discoverHinge(clip: THREE.AnimationClip, root: THREE.Object3D): HingeInfo {
  let best: { track: THREE.QuaternionKeyframeTrack; travel: number; volume: number } | null = null
  root.updateWorldMatrix(true, true)

  for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue
    let travel = 0
    for (let i = 1; i < track.times.length; i++) travel = Math.max(travel, angleBetween(track.values, 0, i * 4))
    if (travel < 45) continue
    const volume = subtreeVolume(root, track.name.split('.')[0])
    if (!best || volume > best.volume) best = { track, travel, volume }
  }
  if (!best) throw new Error('No hinge-like rotation found in animation clip')

  const { times, values } = best.track
  // consecutive-key runs that are actually rotating
  let runStart = -1
  for (let i = 1; i < times.length; i++) {
    const moving = angleBetween(values, (i - 1) * 4, i * 4) > MOVING_EPS_DEG
    if (moving && runStart < 0) runStart = i - 1
    const last = i === times.length - 1
    if (runStart >= 0 && (!moving || last)) {
      const endIdx = moving ? i : i - 1
      const sweep = angleBetween(values, runStart * 4, endIdx * 4)
      // "opening" = first run that carries most of the total travel away from the start pose
      if (angleBetween(values, 0, endIdx * 4) >= best.travel * 0.9 && sweep > 45) {
        return {
          trackName: best.track.name,
          nodeName: best.track.name.split('.')[0],
          start: times[runStart],
          end: times[endIdx],
          sweepDeg: sweep,
          clipDuration: clip.duration,
        }
      }
      runStart = -1
    }
  }
  throw new Error('Could not isolate hinge opening segment')
}
