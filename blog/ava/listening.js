const assets = new URL('../../assets/ava-gallery/', import.meta.url);
const byId = id => document.getElementById(id);
const status = byId('demo-status');
const controlNames = ['gain', 'mix', 'detune_cents', 'noise_mix', 'cutoff_octaves', 'q', 'lfo_rate', 'lfo_depth', 'drive', 'attack', 'decay', 'sustain', 'release'];
const controlLabels = ['Gain', 'Mix', 'Detune B', 'Noise', 'Cutoff', 'Resonance', 'LFO rate', 'LFO depth', 'Drive', 'Attack', 'Decay', 'Sustain', 'Release'];
const keyCodes = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
const waveforms = ['Sine', 'Square', 'Sawtooth', 'Triangle'];
let examples = [], selected, controls = {}, oscillator = 0, oscillatorB = 0;
let context, node, volume, starting;
let keyboardBase = 48;
const heldKeys = new Map();
const knobs = new Map();

function text(tag, content, className) {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function formatValue(name, value) {
  if (name === 'gain') return value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dB` : '−∞ dB';
  if (['mix', 'noise_mix', 'sustain'].includes(name)) return `${(100 * value).toFixed(1)}%`;
  if (name === 'detune_cents') return `${value.toFixed(1)} ct`;
  if (name === 'cutoff_octaves' || name === 'lfo_depth') return `${value.toFixed(2)} oct`;
  if (name === 'q') return `Q ${value.toFixed(2)}`;
  if (name === 'lfo_rate') return `${value.toFixed(2)} Hz`;
  if (['attack', 'decay', 'release'].includes(name)) return value < 1 ? `${(value * 1000).toFixed(1)} ms` : `${value.toFixed(2)} s`;
  return value.toFixed(2);
}

function updateKnob(name, physical) {
  const {input, dial, output} = knobs.get(name);
  input.value = controls[name];
  const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  dial.style.setProperty('--sweep', `${fraction * 270}deg`);
  dial.style.setProperty('--rotation', `${-135 + fraction * 270}deg`);
  if (physical !== undefined) {
    output.textContent = formatValue(name, physical);
    input.setAttribute('aria-valuetext', output.textContent);
  }
}

function buildKnobs() {
  for (const group of document.querySelectorAll('[data-controls]')) {
    for (const name of group.dataset.controls.split(' ')) {
      const index = controlNames.indexOf(name);
      const label = text('label', '', 'synth-control');
      label.append(text('span', controlLabels[index]));
      const dial = text('span', '', 'demo-knob'); dial.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.0001;
      if (name === 'gain') input.max = 0.5;
      if (['attack', 'decay', 'release'].includes(name)) {
        input.min = 0.001 / 0.101;
        const seconds = name === 'attack' ? 5 : 10;
        input.max = seconds / (seconds + 0.1);
      }
      input.disabled = true;
      input.setAttribute('aria-label', controlLabels[index]);
      const output = text('output', '—');
      label.append(dial, input, output); group.append(label);
      knobs.set(name, {input, dial, output});
      input.addEventListener('input', () => {
        controls[name] = Number(input.value); updateKnob(name); sendPreset(false);
      });
      // Vertical dragging feels like a plugin knob; keyboard arrows still use
      // the native accessible range input.
      let drag;
      input.addEventListener('pointerdown', event => {
        event.preventDefault(); input.focus(); input.setPointerCapture(event.pointerId);
        drag = {y: event.clientY, value: Number(input.value)};
      });
      input.addEventListener('pointermove', event => {
        if (!drag) return;
        input.value = drag.value + (drag.y - event.clientY) / 180 * (Number(input.max) - Number(input.min));
        input.dispatchEvent(new Event('input'));
      });
      input.addEventListener('pointerup', () => { drag = null; });
      input.addEventListener('pointercancel', () => { drag = null; });
      input.addEventListener('dblclick', () => {
        input.value = selected.preset.controls[name]; input.dispatchEvent(new Event('input'));
      });
    }
  }
}

function sendPreset(reset) {
  node?.port.postMessage({type: 'preset', controls: controlNames.map(name => controls[name]),
    oscillator, oscillatorB, frequency: selected.frequency, reset});
}

async function startAudio() {
  if (starting) return starting;
  if (node) { await context.resume(); return; }
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio || !window.AudioWorkletNode) throw new Error('This browser does not support the interactive synth. The audio examples still work.');
  try { context = new Audio({sampleRate: 24000}); } catch { context = new Audio(); }
  context.resume(); // Called from the click gesture, before loading assets.
  status.textContent = 'Starting the synth…';
  starting = (async () => {
    await context.audioWorklet.addModule(new URL('ava-worklet.js', import.meta.url));
    const response = await fetch(new URL('ava.wasm', assets));
    if (!response.ok) throw new Error('Could not load the synth. Please refresh and try again.');
    const module = await WebAssembly.compile(await response.arrayBuffer());
    const synth = new AudioWorkletNode(context, 'ava-synth', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: {module}
    });
    volume = context.createGain(); volume.gain.value = Number(byId('demo-volume').value);
    // Playback protection for chords/high resonance; the C++ synth is unchanged.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.1;
    synth.connect(volume).connect(limiter).connect(context.destination);
    await new Promise((resolve, reject) => {
      synth.onprocessorerror = () => {
        const error = new Error('The browser synth stopped unexpectedly. Please refresh.');
        showError(error); reject(error);
      };
      synth.port.onmessage = ({data}) => {
        if (data.type === 'ready') resolve();
        if (data.type === 'values') data.values.forEach((value, i) => updateKnob(controlNames[i], value));
        if (data.type === 'meter') byId('demo-meter').style.setProperty('--level', `${Math.min(1, data.peak) * 100}%`);
        if (data.type === 'preview-ended') byId('demo-preview').textContent = 'Preview note';
      };
    });
    node = synth;
    sendPreset(true);
    for (const {input} of knobs.values()) input.disabled = false;
    byId('demo-wave-a').disabled = byId('demo-wave-b').disabled = false;
    buildKeyboard();
    byId('demo-enable').hidden = true;
    status.textContent = 'Ready. Play the keys below, or use A W S E D F T G Y H U J K.';
  })();
  try { await starting; } catch (error) {
    await context.close(); node = undefined; throw error;
  } finally { starting = undefined; }
}

function showError(error) { status.textContent = error.message; }
function stop() {
  node?.port.postMessage({type: 'stop'});
  heldKeys.clear();
  for (const key of document.querySelectorAll('.demo-key.pressed')) key.classList.remove('pressed');
  byId('demo-preview').textContent = 'Preview note';
}
function noteOn(note) {
  if (!node) return;
  node.port.postMessage({type: 'on', note});
  document.querySelector(`.demo-key[data-note="${note}"]`)?.classList.add('pressed');
}
function noteOff(note) {
  node?.port.postMessage({type: 'off', note});
  document.querySelector(`.demo-key[data-note="${note}"]`)?.classList.remove('pressed');
}

function buildKeyboard() {
  const keyboard = byId('demo-keyboard'); keyboard.replaceChildren();
  let whites = 0;
  for (let offset = 0; offset <= 24; offset++) {
    const note = keyboardBase + offset;
    const black = [1, 3, 6, 8, 10].includes(note % 12);
    const key = text('button', '', `demo-key ${black ? 'black' : 'white'}`);
    key.type = 'button'; key.dataset.note = note; key.disabled = !node;
    const name = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12] + (Math.floor(note / 12) - 1);
    key.setAttribute('aria-label', `Play ${name}`);
    if (black) key.style.left = `${(whites - 0.32) * 100 / 15}%`;
    else { key.style.left = `${whites * 100 / 15}%`; whites++; }
    const shortcut = keyCodes[offset]?.replace('Key', '').replace('Semicolon', ';') || '';
    key.append(text('span', note % 12 === 0 ? name : shortcut));
    key.addEventListener('pointerdown', event => {
      event.preventDefault(); key.setPointerCapture(event.pointerId); noteOn(note);
    });
    key.addEventListener('pointerup', () => noteOff(note));
    key.addEventListener('pointercancel', () => noteOff(note));
    // Enter/space also play the focused key without a mouse.
    key.addEventListener('keydown', event => {
      if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); if (!event.repeat) noteOn(note); }
    });
    key.addEventListener('keyup', event => { if (['Space', 'Enter'].includes(event.code)) noteOff(note); });
    keyboard.append(key);
  }
  byId('demo-register').textContent = `C${Math.floor(keyboardBase / 12) - 1}–C${Math.floor(keyboardBase / 12) + 1}`;
}

function loadPreset(item) {
  stop(); selected = item;
  controls = {...item.preset.controls};
  oscillator = item.preset.oscillator; oscillatorB = item.preset.oscillator_b;
  byId('demo-preset').value = item.id;
  byId('demo-instrument').value = item.family;
  byId('demo-description').value = item.description;
  byId('demo-wave-a').value = oscillator; byId('demo-wave-b').value = oscillatorB;
  for (const name of controlNames) updateKnob(name, item.physical[name]);
  keyboardBase = Math.max(12, Math.min(84, 12 * Math.floor(item.preset.preview_midi / 12) - 12));
  buildKeyboard(); sendPreset(true);
}

async function preview() {
  await startAudio();
  for (const audio of document.querySelectorAll('audio')) audio.pause();
  node.port.postMessage({type: 'preview', frequency: selected.frequency});
  byId('demo-preview').textContent = 'Playing preview…';
}

function showFamily(family) {
  for (const button of byId('instrument-tabs').children) button.setAttribute('aria-pressed', String(button.textContent === family));
  const cards = byId('sound-gallery');
  for (const audio of cards.querySelectorAll('audio')) audio.pause();
  cards.replaceChildren();
  for (const item of examples.filter(example => example.family === family)) {
    const card = text('div', '', 'sound-card');
    const heading = text('div', '', 'sound-card-heading');
    heading.append(text('h4', item.title), text('span', item.note, 'note-badge'));
    card.append(heading, text('p', `“${item.description}.”`, 'sound-prompt'));
    for (const [field, label] of [['reference', 'Generated reference'], ['reconstruction', 'Ava']]) {
      const player = text('div', '', 'sound-player');
      const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none';
      audio.src = new URL(item[field], assets); audio.setAttribute('aria-label', `${item.title}: ${label}`);
      player.append(text('p', label), audio); card.append(player);
    }
    const full = document.createElement('details'); full.className = 'full-prompt';
    full.append(text('summary', 'Full prompt'), text('p', item.prompt)); card.append(full);
    const footer = text('div', '', 'sound-card-footer');
    const tryButton = text('button', 'Try this preset'); tryButton.type = 'button';
    tryButton.addEventListener('click', async () => {
      loadPreset(item); byId('browser-synth').scrollIntoView({behavior: 'smooth', block: 'start'});
      try { await preview(); } catch (error) { showError(error); }
    });
    footer.append(tryButton); card.append(footer); cards.append(card);
  }
}

async function main() {
  buildKnobs();
  for (const select of [byId('demo-wave-a'), byId('demo-wave-b')]) {
    waveforms.forEach((name, i) => { const option = text('option', name); option.value = i; select.append(option); });
    select.addEventListener('change', () => {
      oscillator = Number(byId('demo-wave-a').value); oscillatorB = Number(byId('demo-wave-b').value); sendPreset(false);
    });
  }
  const response = await fetch(new URL('gallery.json', assets));
  if (!response.ok) throw new Error('Could not load the presets. Please refresh and try again.');
  examples = (await response.json()).examples;
  for (const family of [...new Set(examples.map(item => item.family))]) {
    const button = text('button', family); button.type = 'button';
    button.addEventListener('click', () => showFamily(family)); byId('instrument-tabs').append(button);
    const group = document.createElement('optgroup'); group.label = family;
    for (const item of examples.filter(item => item.family === family)) { const option = text('option', item.title); option.value = item.id; group.append(option); }
    byId('demo-preset').append(group);
  }
  showFamily('Piano'); loadPreset(examples.find(item => item.id === '033'));
  byId('gallery-loading').hidden = true;
  status.textContent = 'Enable audio to play. Text generation is available in the desktop plugin.';
  byId('demo-preset').addEventListener('change', event => loadPreset(examples.find(item => item.id === event.target.value)));
  byId('demo-enable').addEventListener('click', () => startAudio().catch(showError));
  byId('demo-preview').addEventListener('click', () => preview().catch(showError));
  byId('demo-stop').addEventListener('click', () => {
    stop(); for (const audio of document.querySelectorAll('audio')) audio.pause();
  });
  byId('demo-reset').addEventListener('click', () => loadPreset(selected));
  byId('demo-volume').addEventListener('input', event => { if (volume) volume.gain.setTargetAtTime(Number(event.target.value), context.currentTime, 0.02); });
  for (const [id, direction] of [['demo-octave-down', -1], ['demo-octave-up', 1]]) byId(id).addEventListener('click', () => {
    stop(); keyboardBase = Math.max(12, Math.min(84, keyboardBase + direction * 12)); buildKeyboard();
  });
  document.addEventListener('keydown', event => {
    if (!node || event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.target.closest('input, textarea, select')) return;
    const offset = keyCodes.indexOf(event.code); if (offset < 0) return;
    event.preventDefault(); const note = keyboardBase + offset; heldKeys.set(event.code, note); noteOn(note);
  });
  document.addEventListener('keyup', event => {
    if (!heldKeys.has(event.code)) return;
    noteOff(heldKeys.get(event.code)); heldKeys.delete(event.code);
  });
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement)) return;
    stop(); for (const audio of document.querySelectorAll('audio')) if (audio !== event.target) audio.pause();
  }, true);
}
main().catch(error => { showError(error); byId('gallery-loading').textContent = error.message; });
