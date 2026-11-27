class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        this.ctx = new AudioCtor();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    gainVal = 0.055,
    slideTo?: number
  ): void {
    const ac = this.ensureContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  placeBomb(): void {
    this.tone(240, 0.08, 'triangle', 0.07, 130);
  }

  explode(): void {
    this.tone(130, 0.28, 'sawtooth', 0.1, 34);
  }

  powerup(): void {
    this.tone(523, 0.08, 'square', 0.05, 784);
    setTimeout(() => this.tone(784, 0.12, 'square', 0.05, 1046), 60);
  }

  doorFound(): void {
    this.tone(440, 0.09, 'triangle', 0.07);
    setTimeout(() => this.tone(660, 0.14, 'triangle', 0.07), 70);
  }

  enemyDefeat(): void {
    this.tone(360, 0.08, 'square', 0.05, 620);
  }

  shieldHit(): void {
    this.tone(460, 0.16, 'triangle', 0.08, 200);
  }

  die(): void {
    [392, 349, 311, 261].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.13, 'sawtooth', 0.06), i * 95);
    });
  }

  stageClear(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.14, 'triangle', 0.07), i * 85);
    });
  }

  victoryFanfare(): void {
    const notes = [523, 659, 784, 659, 784, 1046, 1175, 1318];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.18, 'triangle', 0.07), i * 110);
    });
  }
}

export const sound = new SoundEngine();
