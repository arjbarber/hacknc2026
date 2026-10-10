import * as THREE from 'three'

/** Materials that carry the shell / buttons / baked screen (inspected from the GLB). */
const SHELL = new Set(['naviPhoneUDIM1001', 'naviPhoneUDIM1002', 'NaviPhoneUDIM1012', 'anviPhoneUDIM1011'])

/**
 * The body colour itself is already pearl-pink in the (pre-recoloured) textures.
 * Here we only add the glossy layer: clearcoat + thin-film iridescence on the shell materials.
 * Lens, glass, dark surfaces, and the metal ring are left untouched.
 */
export function styleShellMaterials(root: THREE.Object3D) {
  const cache = new Map<THREE.Material, THREE.Material>()

  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
    const next = mats.map((m) => {
      const hit = cache.get(m)
      if (hit) return hit
      let out: THREE.Material = m
      if (m instanceof THREE.MeshStandardMaterial && SHELL.has(m.name)) {
        const p = new THREE.MeshPhysicalMaterial()
        THREE.MeshStandardMaterial.prototype.copy.call(p, m) // copy only the standard fields
        p.name = m.name
        p.clearcoat = 1
        p.clearcoatRoughness = 0.07
        p.iridescence = 0.85
        p.iridescenceIOR = 1.35
        p.iridescenceThicknessRange = [140, 520]
        p.envMapIntensity = 1.25
        out = p
      } else if (m.name === 'antennaLight' && m instanceof THREE.MeshStandardMaterial) {
        // the little red indicator LED -> aqua
        const c = m.clone()
        c.color.set('#0a3a40')
        c.emissive.set('#8DECF1')
        c.emissiveIntensity = 1.6
        out = c
      }
      cache.set(m, out)
      return out
    })
    o.material = Array.isArray(o.material) ? next : next[0]
  })
}
