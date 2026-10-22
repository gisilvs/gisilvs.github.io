// The C++ engine runs at its training sample rate. This adapter only handles
// messages and output-rate conversion; it contains no oscillator/filter DSP.
class AvaProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine = new WebAssembly.Instance(options.processorOptions.module).exports;
    this.engine._initialize();
    this.controls = new Float32Array(this.engine.memory.buffer, this.engine.ava_controls(), 13);
    this.buffer = new Float32Array(this.engine.memory.buffer, this.engine.ava_render(0), 512);
    this.position = 1;
    this.previous = 0;
    this.current = 0;
    this.ratio = 24000 / sampleRate;
    this.blocks = 0;
    this.previewing = false;
    this.port.onmessage = ({data}) => {
      const e = this.engine;
      if (data.type === 'preset') {
        if (data.reset) { e.ava_reset(); this.previous = this.current = 0; }
        this.controls.set(data.controls);
        e.ava_set_controls(data.oscillator, data.oscillatorB, data.frequency);
        this.port.postMessage({type: 'values', values: Array.from({length: 13}, (_, i) => e.ava_value(i))});
      } else if (data.type === 'on') {
        e.ava_note_on(data.note, 0.8);
      } else if (data.type === 'off') {
        e.ava_note_off(data.note);
      } else if (data.type === 'preview') {
        this.previous = this.current = 0;
        e.ava_preview(data.frequency);
        this.previewing = true;
      } else if (data.type === 'stop') {
        e.ava_reset(); this.previous = this.current = 0;
        this.previewing = false;
      }
    };
    this.port.postMessage({type: 'ready'});
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    // Count how many new 24 kHz samples this output block needs, without
    // rendering ahead of the next note/control message.
    let position = this.position;
    let needed = 0;
    for (let i = 0; i < output.length; i++) {
      while (position >= 1) { needed++; position--; }
      position += this.ratio;
    }
    this.engine.ava_render(needed);
    let read = 0;
    let peak = 0;
    for (let i = 0; i < output.length; i++) {
      while (this.position >= 1) {
        this.previous = this.current;
        this.current = this.buffer[read++];
        this.position--;
      }
      output[i] = this.previous + (this.current - this.previous) * this.position;
      this.position += this.ratio;
      peak = Math.max(peak, Math.abs(output[i]));
    }
    if (++this.blocks % 16 === 0) this.port.postMessage({type: 'meter', peak});
    if (this.previewing && !this.engine.ava_preview_active()) {
      this.previewing = false;
      this.port.postMessage({type: 'preview-ended'});
    }
    return true;
  }
}
registerProcessor('ava-synth', AvaProcessor);
