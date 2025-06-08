// ——— State & Selectors ———
const state = {
  ctx: new (window.AudioContext||window.webkitAudioContext)(),
  currentInstrument: 'piano',
  currentOctave: '3',
  isPlaying: false, 
  isRecording: false,
  volume: 0.8, 
  tempo: 120,
  animationId: null,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  dragOffset: { x: 0, y: 0 }
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const refs = {
  keys: $$('.white-key, .black-key'),
  instruments: $$('.instrument'),
  beatCells: $$('.beat-cell'),
  playBtn: $('#playBtn'),
  stopBtn: $('#stopBtn'),
  recordBtn: $('#recordBtn'),
  recIndicator: $('#recIndicator'),
  volumeSlider: $('#volumeSlider'),
  tempoSlider: $('#tempoSlider'),
  tempoValue: $('#tempoValue'),
  visualizerBars: $$('#visualizer .bar'),
  composerName: $('#composerName'),
  trackTitle: $('#trackTitle'),
  octaveNavBtns: $$('.octave-nav-btn'),
  keyboardOctaves: $$('.keyboard-octave'),
  keyboardContainer: $('#keyboardContainer')
};

// ——— Enhanced Key Mappings ———
const keyMap = {
  // Main row (white keys)
  z:'C', x:'D', c:'E', v:'F', b:'G', n:'A', m:'B',
  // Top row for sharps/flats
  s:'C#', d:'D#', g:'F#', h:'G#', j:'A#'
};

// ——— Initialization ———
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  setupTouchHandling();
  startVisualizer();
  loadUserPreferences();
});

function initializeApp() {
  // Set initial octave
  updateKeyboardDisplay();
  
  // Randomize track title
  const prefixes = ['Midnight','Sunset','Ocean','Mountain','City','Desert','Forest','Space'];
  const suffixes = ['Dreams','Journey','Echoes','Waves','Horizon','Reflections','Memories','Serenity'];
  refs.trackTitle.textContent = `${prefixes[Math.floor(Math.random()*prefixes.length)]} ${suffixes[Math.floor(Math.random()*suffixes.length)]}`;
}

function setupEventListeners() {
  // Instrument selection
  refs.instruments.forEach(el => el.addEventListener('click', () => {
    refs.instruments.forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    state.currentInstrument = el.dataset.instrument;
  }));

  // Octave navigation
  refs.octaveNavBtns.forEach(btn => btn.addEventListener('click', () => {
    refs.octaveNavBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentOctave = btn.dataset.octave;
    updateKeyboardDisplay();
  }));

  // Piano keys - Updated to work with new structure
  updateKeyEventListeners();

  // Beat sequencer
  refs.beatCells.forEach(cell => {
    cell.addEventListener('click', () => cell.classList.toggle('active'));
  });

  // Transport controls
  refs.playBtn.addEventListener('click', togglePlay);
  refs.stopBtn.addEventListener('click', stopPlay);
  refs.recordBtn.addEventListener('click', toggleRecord);

  // Sliders
  refs.volumeSlider.addEventListener('input', () => {
    state.volume = refs.volumeSlider.value / 100;
  });
  
  refs.tempoSlider.addEventListener('input', () => {
    state.tempo = +refs.tempoSlider.value;
    refs.tempoValue.textContent = state.tempo;
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  // User preferences
  refs.composerName.addEventListener('input', () => {
    localStorage.setItem('composerName', refs.composerName.value);
  });
}

function updateKeyboardDisplay() {
  // Hide all octaves
  refs.keyboardOctaves.forEach(octave => octave.classList.remove('active'));
  
  // Show current octave
  const currentOctave = $(`.keyboard-octave[data-octave="${state.currentOctave}"]`);
  if (currentOctave) {
    currentOctave.classList.add('active');
  }
  
  // Update key event listeners
  updateKeyEventListeners();
}

function updateKeyEventListeners() {
  // Remove old listeners and add new ones for current octave
  const currentKeys = $$('.keyboard-octave.active .white-key, .keyboard-octave.active .black-key');
  
  currentKeys.forEach(key => {
    // Remove existing listeners by cloning the element
    const newKey = key.cloneNode(true);
    key.parentNode.replaceChild(newKey, key);
    
    // Add new listeners
    newKey.addEventListener('mousedown', (e) => {
      e.preventDefault();
      playNote(newKey.dataset.note);
    });
    
    newKey.addEventListener('touchstart', (e) => {
      e.preventDefault();
      playNote(newKey.dataset.note);
    });
    
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(event => {
      newKey.addEventListener(event, () => {
        newKey.classList.remove('playing');
      });
    });
  });
  
  // Update refs.keys to current active keys
  refs.keys = currentKeys;
}

function setupTouchHandling() {
  // Prevent default touch behaviors that might interfere
  refs.keyboardContainer.addEventListener('touchstart', (e) => {
    // Allow touch on keys, prevent on container
    if (!e.target.classList.contains('white-key') && !e.target.classList.contains('black-key')) {
      e.preventDefault();
    }
  }, { passive: false });

  // Handle multiple touches for chords
  refs.keyboardContainer.addEventListener('touchstart', handleMultiTouch, { passive: false });
  refs.keyboardContainer.addEventListener('touchmove', handleMultiTouch, { passive: false });
  refs.keyboardContainer.addEventListener('touchend', handleMultiTouch, { passive: false });
}

function handleMultiTouch(e) {
  // Handle multiple simultaneous touches for playing chords
  Array.from(e.touches).forEach(touch => {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element && (element.classList.contains('white-key') || element.classList.contains('black-key'))) {
      if (e.type === 'touchstart') {
        playNote(element.dataset.note);
      }
    }
  });
}

// ——— Audio Functions ———
function playNote(note) {
  if (!note) return;
  
  const keyEl = $(`.keyboard-octave.active [data-note="${note}"]`);
  if (keyEl) {
    keyEl.classList.add('playing');
    setTimeout(() => keyEl.classList.remove('playing'), 150);
  }

  // Handle drums separately
  if (state.currentInstrument === 'drums') {
    playDrum();
    return;
  }

  const osc = state.ctx.createOscillator();
  const gain = state.ctx.createGain();
  
  // Set oscillator type based on instrument
  const waveTypes = {
    piano: 'sine',
    guitar: 'sawtooth', 
    synth: 'square',
    bass: 'triangle',
    strings: 'sine'
  };
  
  osc.type = waveTypes[state.currentInstrument] || 'sine';
  osc.frequency.value = FREQUENCIES[note] || 440;
  
  osc.connect(gain);
  gain.connect(state.ctx.destination);
  
  gain.gain.setValueAtTime(state.volume * 0.3, state.ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, state.ctx.currentTime + 1);
  
  osc.start();
  setTimeout(() => {
    try {
      osc.stop();
      osc.disconnect();
    } catch(e) {
      // Handle already stopped oscillators
    }
  }, 1000);
}

function playDrum() {
  const bufferSize = state.ctx.sampleRate * 0.1;
  const buffer = state.ctx.createBuffer(1, bufferSize, state.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  // Generate drum sound
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  
  const source = state.ctx.createBufferSource();
  const filter = state.ctx.createBiquadFilter();
  const gain = state.ctx.createGain();
  
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = 200;
  gain.gain.value = state.volume * 0.5;
  
  source.connect(filter);
  filter.connect(gain);
  gain.connect(state.ctx.destination);
  
  source.start();
  gain.gain.exponentialRampToValueAtTime(0.001, state.ctx.currentTime + 0.3);
  
  setTimeout(() => {
    try {
      source.stop();
      source.disconnect();
    } catch(e) {
      // Handle already stopped sources
    }
  }, 300);
}

// ——— Transport Controls ———
function togglePlay() {
  state.isPlaying = !state.isPlaying;
  refs.playBtn.innerHTML = state.isPlaying 
    ? '<i class="fas fa-pause"></i> Pause'
    : '<i class="fas fa-play"></i> Play';
    
  if (state.isPlaying) {
    runBeatLoop();
  } else {
    cancelAnimationFrame(state.animationId);
  }
}

function stopPlay() {
  state.isPlaying = false;
  refs.playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
  cancelAnimationFrame(state.animationId);
  refs.beatCells.forEach(cell => cell.classList.remove('highlight'));
}

function toggleRecord() {
  state.isRecording = !state.isRecording;
  refs.recordBtn.innerHTML = state.isRecording
    ? '<i class="fas fa-stop"></i> Stop Recording'
    : '<i class="fas fa-record-vinyl"></i> Record';
  refs.recIndicator.classList.toggle('active', state.isRecording);
}

function runBeatLoop() {
  const interval = (60000 / state.tempo) / 4; // 16th notes
  let currentBeat = 0;
  let lastTime = 0;
  
  function step(timestamp) {
    if (!lastTime) lastTime = timestamp;
    
    if (timestamp - lastTime >= interval) {
      // Remove highlight from previous beat
      const prevBeat = (currentBeat + 7) % 8;
      refs.beatCells[prevBeat].classList.remove('highlight');
      
      // Highlight current beat
      const currentCell = refs.beatCells[currentBeat];
      currentCell.classList.add('highlight');
      
      // Play sound if beat is active
      if (currentCell.classList.contains('active')) {
        if (currentCell.classList.contains('drum')) {
          playDrum();
        } else if (currentCell.classList.contains('snare')) {
          playNote(`D${state.currentOctave}`);
        } else if (currentCell.classList.contains('hihat')) {
          playNote(`F${state.currentOctave}`);
        } else {
          // Play a random note from current octave
          const notes = [`C${state.currentOctave}`, `E${state.currentOctave}`, `G${state.currentOctave}`, `A${state.currentOctave}`];
          playNote(notes[Math.floor(Math.random() * notes.length)]);
        }
      }
      
      currentBeat = (currentBeat + 1) % 8;
      lastTime = timestamp;
    }
    
    if (state.isPlaying) {
      state.animationId = requestAnimationFrame(step);
    }
  }
  
  state.animationId = requestAnimationFrame(step);
}

// ——— Visualizer ———
function startVisualizer() {
  function animate() {
    refs.visualizerBars.forEach(bar => {
      const height = 20 + Math.random() * 80;
      bar.style.height = height + 'px';
    });
    requestAnimationFrame(animate);
  }
  animate();
}

// ——— Keyboard Input ———
function handleKeyDown(e) {
  if (e.repeat) return;
  
  const noteBase = keyMap[e.key.toLowerCase()];
  if (!noteBase) return;
  
  const fullNote = noteBase + state.currentOctave;
  playNote(fullNote);
}

function handleKeyUp(e) {
  const noteBase = keyMap[e.key.toLowerCase()];
  if (!noteBase) return;
  
  const fullNote = noteBase + state.currentOctave;
  const keyEl = $(`.keyboard-octave.active [data-note="${fullNote}"]`);
  if (keyEl) {
    keyEl.classList.remove('playing');
  }
}

// ——— User Preferences ———
function loadUserPreferences() {
  const savedName = localStorage.getItem('composerName');
  if (savedName) {
    refs.composerName.value = savedName;
  }
}

// ——— Frequency Lookup ———
const FREQUENCIES = {
  // Octave 3
  C3: 130.81, 'C#3': 138.59, D3: 146.83, 'D#3': 155.56, E3: 164.81,
  F3: 174.61, 'F#3': 185.00, G3: 196.00, 'G#3': 207.65, A3: 220.00,
  'A#3': 233.08, B3: 246.94,
  
  // Octave 4  
  C4: 261.63, 'C#4': 277.18, D4: 293.66, 'D#4': 311.13, E4: 329.63,
  F4: 349.23, 'F#4': 369.99, G4: 392.00, 'G#4': 415.30, A4: 440.00,
  'A#4': 466.16, B4: 493.88,
  
  // Octave 5
  C5: 523.25, 'C#5': 554.37, D5: 587.33, 'D#5': 622.25, E5: 659.25,
  F5: 698.46, 'F#5': 739.99, G5: 783.99, 'G#5': 830.61, A5: 880.00,
  'A#5': 932.33, B5: 987.77
};