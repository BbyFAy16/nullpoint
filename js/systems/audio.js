export class SoundEffects {
  constructor() {
    this.context = null;
    this.noiseBuffer = null;
    this.musicGain = null;
    this.ambientGain = null;
    this.musicMode = 'quiet';
    this.musicStep = 0;
    this.master = null;
    this.masterVolume = 0.8;
    this.musicVolume = 0.6;
    this.sfxVolume = 0.9;
  }

  /** Apply 0..1 volumes from settings. Safe before the context exists. */
  setVolumes({ master, music, sfx }) {
    if (master !== undefined) this.masterVolume = master;
    if (music !== undefined) this.musicVolume = music;
    if (sfx !== undefined) this.sfxVolume = sfx;
    if (this.master) this.master.gain.value = this.masterVolume;
    this.setMusicMode(this.musicMode);
  }

  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.context.destination);
    const buffer = this.context.createBuffer(
      1,
      Math.floor(this.context.sampleRate * 0.12),
      this.context.sampleRate
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    if (this.context.state === 'suspended') this.context.resume();
    this.startSoundscape();
  }

  startSoundscape() {
    if (!this.context || this.musicGain) return;

    const context = this.context;
    const musicBus = context.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(this.master);
    this.musicGain = musicBus;

    for (const [frequency, type, volume] of [
      [55, 'sine', 0.045],
      [82.41, 'triangle', 0.018],
      [110, 'sine', 0.012],
    ]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(musicBus);
      oscillator.start();
    }

    const ambientBus = context.createGain();
    ambientBus.gain.value = 0.022;
    ambientBus.connect(this.master);
    this.ambientGain = ambientBus;

    const length = Math.floor(context.sampleRate * 3);
    const ambience = context.createBuffer(1, length, context.sampleRate);
    const samples = ambience.getChannelData(0);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * 0.35;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    source.buffer = ambience;
    source.loop = true;
    source.connect(filter);
    filter.connect(ambientBus);
    source.start();
    window.setInterval(() => this.playMusicNote(), 420);
    this.setMusicMode(this.musicMode);
  }

  playMusicNote() {
    if (
      !this.context ||
      this.context.state !== 'running' ||
      this.musicMode === 'quiet'
    ) return;

    const combatNotes = [110, 164.81, 220, 164.81, 130.81, 196, 261.63, 196];
    const menuNotes = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61];
    const notes = this.musicMode === 'combat' ? combatNotes : menuNotes;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const duration = this.musicMode === 'combat' ? 0.32 : 0.5;
    oscillator.type = this.musicMode === 'combat' ? 'triangle' : 'sine';
    oscillator.frequency.value = notes[this.musicStep % notes.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.musicGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    this.musicStep++;
  }

  setMusicMode(mode) {
    this.musicMode = mode;
    if (!this.context || !this.musicGain || !this.ambientGain) return;
    const now = this.context.currentTime;
    const musicVolume = (mode === 'combat' ? 0.72 : mode === 'menu' ? 0.42 : 0) * this.musicVolume;
    const ambientVolume = (mode === 'combat' ? 0.014 : 0.022) * this.musicVolume;
    this.musicGain.gain.setTargetAtTime(musicVolume, now, 0.8);
    this.ambientGain.gain.setTargetAtTime(ambientVolume, now, 0.8);
  }

  play(name, volume = 1) {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const master = this.context.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * this.sfxVolume;
    master.connect(this.master);

    if (name === 'gunshot') {
      this.playNoise(master, now, 0.08, 0.18);
      this.playTone(master, now, 105, 48, 0.075, 0.28, 'sawtooth');
    } else if (name === 'hit') {
      this.playTone(master, now, 920, 420, 0.075, 0.16, 'triangle');
    } else if (name === 'kill') {
      this.playTone(master, now, 540, 760, 0.12, 0.18, 'sine');
      this.playTone(master, now + 0.08, 760, 1040, 0.15, 0.14, 'sine');
    } else if (name === 'reload') {
      this.playTone(master, now, 480, 330, 0.06, 0.12, 'square');
      this.playTone(master, now + 0.11, 620, 460, 0.07, 0.1, 'square');
    } else if (name === 'bunkerHit') {
      this.playTone(master, now, 220, 130, 0.05, 0.14, 'square');
    } else if (name === 'explosion') {
      this.playNoise(master, now, 0.5, 0.5);
      this.playTone(master, now, 140, 38, 0.55, 0.5, 'sawtooth');
      this.playTone(master, now + 0.05, 70, 30, 0.6, 0.4, 'sine');
    } else if (name === 'roundStart') {
      this.playTone(master, now, 440, 660, 0.18, 0.18, 'sine');
    } else if (name === 'ui') {
      this.playTone(master, now, 620, 540, 0.04, 0.1, 'triangle');
    } else if (name === 'ability') {
      this.playTone(master, now, 260, 820, 0.22, 0.16, 'sine');
      this.playTone(master, now + 0.04, 520, 1040, 0.18, 0.08, 'triangle');
    }
  }

  playNoise(destination, startAt, duration, volume) {
    if (!this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, startAt);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(startAt);
    source.stop(startAt + duration);
  }

  playTone(destination, startAt, from, to, duration, volume, type) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(to, startAt + duration);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
  }
}
