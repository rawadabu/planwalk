import Experience from './Experience'
import type { Viewer, ViewerEvents, ViewerOptions } from './types'

export type * from './types'

/**
 * Create a viewer on a canvas. One viewer per page (the engine is a singleton);
 * call destroy() before creating another (React StrictMode mounts twice in dev — handled by the hook).
 */
export function createViewer(options: ViewerOptions): Viewer {
  const exp = new Experience(options)
  const subs: Array<() => void> = []
  const on = <K extends keyof ViewerEvents>(event: K, handler: ViewerEvents[K]) => {
    exp.on(event, handler as (...a: unknown[]) => void)
    const off = () => exp.off(event, handler as (...a: unknown[]) => void)
    subs.push(off)
    return off
  }
  // bridge internal events to the public ones
  exp.resources.on('progress', (a: number, b: number) => exp.trigger('progress', a, b))
  exp.on('worldReady', (house: unknown) => exp.trigger('ready', house))

  return {
    on,
    get state() { return exp.state },
    setFloor: f => exp.player.setFloor(f, exp.world.house?.floors[f].start),
    setMode: m => { if (m !== exp.state.mode) exp.player.setMode(m) },
    setTime: t => exp.world.environment?.setTime(t),
    setQuality: q => exp.renderer.setQuality(q),
    setLights: on => exp.world.environment?.setLights(on),
    setHeadBob: on => { exp.state.headBob = on },
    climb: dir => exp.player.startClimb(dir),
    teleport: (x, y) => exp.player.teleportTo(x, y),
    setJoystick: (x, y) => { exp.player.jv = { x, y } },
    setMeasuring: on => exp.measure.setActive(on),
    resetView: () => { const h = exp.world.house; if (!h) return; exp.player.setFloor(1, h.floors[1].start); if (exp.state.mode !== 'walk') exp.player.setMode('walk') },
    stats: () => { const i = exp.renderer.instance.info; return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0 } },
    requestRender: () => { exp.renderer.renderRequested = true },
    destroy: () => { subs.forEach(off => off()); exp.destroy() },
  }
}
