export type UISound = 'tap' | 'navigation' | 'confirm' | 'toggle' | 'destructive';

type Voice = {
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
  type?: OscillatorType;
};

const PROFILES: Record<UISound, Voice[]> = {
  tap: [{ from: 440, to: 520, duration: 0.045, gain: 0.036 }],
  navigation: [
    { from: 320, to: 430, duration: 0.065, gain: 0.03 },
    { from: 640, to: 780, duration: 0.06, gain: 0.012, delay: 0.006 },
  ],
  confirm: [
    { from: 440, to: 660, duration: 0.09, gain: 0.032 },
    { from: 660, to: 990, duration: 0.1, gain: 0.018, delay: 0.018 },
  ],
  toggle: [
    { from: 420, to: 560, duration: 0.055, gain: 0.027, type: 'triangle' },
    { from: 720, to: 840, duration: 0.05, gain: 0.013, delay: 0.012 },
  ],
  destructive: [
    { from: 260, to: 190, duration: 0.075, gain: 0.026, type: 'triangle' },
  ],
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext({ latencyHint: 'interactive' });
    }
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    return null;
  }
}

export function playUISound(sound: UISound, volume: number): void {
  const level = Math.max(0, Math.min(1, volume));
  if (level === 0) return;
  const context = getAudioContext();
  if (!context) return;

  const start = context.currentTime + 0.004;
  for (const voice of PROFILES[sound]) {
    const voiceStart = start + (voice.delay ?? 0);
    const voiceEnd = voiceStart + voice.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = voice.type ?? 'sine';
    oscillator.frequency.setValueAtTime(voice.from, voiceStart);
    oscillator.frequency.exponentialRampToValueAtTime(voice.to, voiceEnd);
    gain.gain.setValueAtTime(0.0001, voiceStart);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, voice.gain * level), voiceStart + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, voiceEnd);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    });
    oscillator.start(voiceStart);
    oscillator.stop(voiceEnd + 0.01);
  }
}

const DESTRUCTIVE = /\b(close|delete|remove|discard|abort|stop|kill|untrust|reset|trash|quit)\b/i;
const CONFIRM = /\b(open directory|initialize git|trust & start|update to|save|commit|apply|continue|confirm|create|install)\b/i;
const NAVIGATION = /\b(toggle|go to|terminal|settings|history|changes|github|tools|rescue|stack|panel|code editor)\b/i;

export function soundForButton(button: HTMLButtonElement): UISound | null {
  const explicit = button.dataset.uiSound;
  if (explicit === 'none') return null;
  if (
    explicit === 'tap' ||
    explicit === 'navigation' ||
    explicit === 'confirm' ||
    explicit === 'toggle' ||
    explicit === 'destructive'
  )
    return explicit;

  const label = [button.getAttribute('aria-label'), button.title, button.textContent]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (button.classList.contains('btn-danger') || DESTRUCTIVE.test(label)) return 'destructive';
  if (button.classList.contains('btn-primary') || CONFIRM.test(label)) return 'confirm';
  if (button.getAttribute('role') === 'switch' || button.hasAttribute('aria-pressed')) return 'toggle';
  if (button.closest('nav') || NAVIGATION.test(label)) return 'navigation';
  return 'tap';
}
