export {}
// Off-main-thread asset decoding: fetch a base64-wrapped GLB (.json, because the host serves no .glb),
// decode it to an ArrayBuffer and transfer it back without copying.
self.onmessage = async ({ data: { id, url } }) => {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.status + ' ' + url)
    const { glb } = await res.json()
    const bin = atob(glb), bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const post = (self as any).postMessage.bind(self)
    post({ id, buffer: bytes.buffer }, [bytes.buffer])
  } catch (e) {
    const post = (self as any).postMessage.bind(self)
    post({ id, error: String(e) })
  }
}
