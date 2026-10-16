/* Served as a same-origin, non-inlined AudioWorklet asset; never on the UI thread. */
class MasterPCM16 extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.sum = 0
    this.weight = 0
    this.frame = new ArrayBuffer(3200)
    this.view = new DataView(this.frame)
    this.count = 0
    this.finished = false
    this.port.onmessage = event => {
      if (event.data?.type !== 'flush' || this.finished) return
      this.finished = true
      if (this.weight > 0) this.append(this.sum / this.weight)
      if (this.count) this.port.postMessage(this.frame.slice(0, this.count * 2))
      this.port.postMessage({ type: 'flushed' })
    }
  }
  append(value) {
    const clamped = Math.max(-1, Math.min(1, value))
    this.view.setInt16(this.count++ * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true)
    if (this.count === 1600) {
      this.port.postMessage(this.frame, [this.frame])
      this.frame = new ArrayBuffer(3200)
      this.view = new DataView(this.frame)
      this.count = 0
    }
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0)
    const channels = inputs[0]
    if (!this.finished && channels?.length) {
      for (let i = 0; i < channels[0].length; i++) {
        let sample = 0
        for (const channel of channels) sample += channel[i] / channels.length
        let remaining = 1
        while (remaining > 1e-8) {
          const take = Math.min(remaining, this.ratio - this.weight)
          this.sum += sample * take
          this.weight += take
          remaining -= take
          if (this.weight >= this.ratio - 1e-8) {
            this.append(this.sum / this.ratio)
            this.sum = 0
            this.weight = 0
          }
        }
      }
    }
    return true
  }
}
registerProcessor('master-pcm16', MasterPCM16)
