// The equations are typeset separately from the interactive envelope.
if (window.katex) {
  for (const equation of document.querySelectorAll('.math')) {
    katex.render(equation.textContent, equation, {
      displayMode: equation.classList.contains('display-math'),
      throwOnError: false,
    });
  }
}

// Match ADSREnvelope's normalized exponential, including its fixed curvature.
function curve(progress) {
  progress = Math.max(0, Math.min(1, progress));
  return -Math.expm1(-4 * progress) / -Math.expm1(-4);
}

function heldLevel(time, attack, decay, sustain) {
  if (time < attack) return curve(time / attack);
  return 1 - (1 - sustain) * curve((time - attack) / decay);
}

function envelopeLevel(time, { attack, decay, sustain, release, hold }) {
  if (time < hold) return heldLevel(time, attack, decay, sustain);
  const levelAtRelease = heldLevel(hold, attack, decay, sustain);
  return levelAtRelease * (1 - curve((time - hold) / release));
}

const envelopeFigure = document.getElementById('envelope-figure');
const envelopePath = document.getElementById('envelope-curve');
const noteOffLine = document.getElementById('envelope-note-off');

function drawEnvelope() {
  const values = {};
  for (const input of envelopeFigure.querySelectorAll('input')) {
    const value = Number(input.value);
    values[input.name] = value;
    const unit = input.dataset.unit ? ` ${input.dataset.unit}` : '';
    document.getElementById(`value-${input.name}`).value = value.toFixed(2) + unit;
  }
  const points = [];
  for (let sample = 0; sample <= 600; sample++) {
    const time = sample / 100;
    const x = 34 + 582 * time / 6;
    const y = 176 - 160 * envelopeLevel(time, values);
    points.push(`${sample === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  envelopePath.setAttribute('d', points.join(' '));
  const noteOffX = 34 + 582 * values.hold / 6;
  noteOffLine.setAttribute('x1', noteOffX);
  noteOffLine.setAttribute('x2', noteOffX);
}

envelopeFigure.addEventListener('input', drawEnvelope);
drawEnvelope();
