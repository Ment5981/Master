import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/v2/agent/pcm-worklet.js', import.meta.url), 'utf8')
describe('microphone PCM worklet', () => {
  for (const rate of [16000, 44100, 48000]) {
    it(`resamples ${rate} Hz to mono 16k little-endian PCM without audio feedback`, () => {
      const messages: Array<ArrayBuffer | { type: string }> = []
      let Processor: new () => { process: (input: Float32Array[][], output: Float32Array[][]) => boolean; port: { onmessage: (message: object) => void } }
      class Base { port = { postMessage: (value: ArrayBuffer | { type: string }) => messages.push(value), onmessage: (_value: object) => undefined } }
      runInNewContext(source, { sampleRate: rate, AudioWorkletProcessor: Base, ArrayBuffer, DataView, registerProcessor: (_name: string, value: typeof Processor) => { Processor = value } })
      const instance = new Processor!()
      const audio = new Float32Array(rate).fill(0.5)
      for (let offset = 0; offset < rate; offset += 128) {
        const output = new Float32Array(128).fill(1)
        instance.process([[audio.subarray(offset, offset + 128)]], [[output]])
        expect(output.every(v => v === 0)).toBe(true)
      }
      instance.port.onmessage({ data: { type: 'flush' } })
      const frames = messages.filter((x): x is ArrayBuffer => x instanceof ArrayBuffer)
      expect(frames.reduce((n, frame) => n + frame.byteLength, 0)).toBe(32000)
      for (const frame of frames) expect(new DataView(frame).getInt16(0, true)).toBe(16384)
      expect(messages.at(-1)).toEqual({ type: 'flushed' })
    })
  }
})
