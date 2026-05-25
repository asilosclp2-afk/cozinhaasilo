// Central Audio Service for the Arraiá Application
// Handles synthesized Web Audio patterns (offline-ready, zero latency)
// and network audio presets with user customizable sound URLs stored in LocalStorage.

export type SoundOption = {
  id: string;
  name: string;
  url?: string;
  isSynth?: boolean;
};

export const EXTERNAL_ALERTS: SoundOption[] = [
  { id: 'uploaded-ext', name: '🎵 [Arquivo Carregado] Som Customizado', isSynth: false },
  { id: 'mcdonalds-double', name: 'McDonald\'s Duplo (Sintetizador)', isSynth: true },
  { id: 'mcdonalds-triple', name: 'McDonald\'s Triplo (Sintetizador)', isSynth: true },
  { id: 'dingdong-synth', name: 'Campainha Ding-Dong (Sintetizador)', isSynth: true },
  { id: 'mixkit-ring', name: 'Campainha de Painel (Mixkit)', url: 'https://assets.mixkit.co/active_storage/sfx/2216/2216-preview.mp3' },
  { id: 'mixkit-bell', name: 'Sino de Balcão (Mixkit)', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-preview.mp3' },
  { id: 'mixkit-success', name: 'Chime Triunfante (Mixkit)', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3' },
  { id: 'custom', name: 'Som Customizado (URL)', isSynth: false },
];

export const INTERNAL_ALERTS: SoundOption[] = [
  { id: 'uploaded-int', name: '🎵 [Arquivo Carregado] Som Customizado', isSynth: false },
  { id: 'mixkit-bell', name: 'Sino de Balcão (Mixkit - Convencional)', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-preview.mp3' },
  { id: 'chirp-synth', name: 'Chirp Suave (Sintetizador)', isSynth: true },
  { id: 'double-beep-synth', name: 'Bi-Bip Digital (Sintetizador)', isSynth: true },
  { id: 'scanner-beep-synth', name: 'Apito de Scanner (Sintetizador)', isSynth: true },
  { id: 'mixkit-soft', name: 'Notificação Suave (Mixkit)', url: 'https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3' },
  { id: 'mixkit-scan', name: 'Bip Metálico de Scanner (Mixkit)', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3' },
  { id: 'custom', name: 'Som Customizado (URL)', isSynth: false },
];

const DB_NAME = 'ArraiaAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audios';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeUploadedAudio(key: string, base64Data: string, fileName: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ base64Data, fileName }, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getUploadedAudio(key: string): Promise<{ base64Data: string, fileName: string } | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('getUploadedAudio error:', err);
    return null;
  }
}

class AudioService {
  private getAudioContext(): AudioContext | null {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      return AudioCtx ? new AudioCtx() : null;
    } catch (e) {
      console.warn('Web Audio API not supported', e);
      return null;
    }
  }

  // Gets user layout keys
  getSettings() {
    const defaultExternal = 'mcdonalds-double';
    const defaultInternal = 'mixkit-bell';
    const extId = localStorage.getItem('audio_ext_id') || defaultExternal;
    const intId = localStorage.getItem('audio_int_id') || defaultInternal;
    const extUrl = localStorage.getItem('audio_ext_url') || '';
    const intUrl = localStorage.getItem('audio_int_url') || '';
    const extVol = Number(localStorage.getItem('audio_ext_vol') ?? '1.0');
    const intVol = Number(localStorage.getItem('audio_int_vol') ?? '1.0');

    return { extId, intId, extUrl, intUrl, extVol, intVol };
  }

  saveSettings(settings: {
    extId?: string;
    intId?: string;
    extUrl?: string;
    intUrl?: string;
    extVol?: number;
    intVol?: number;
  }) {
    if (settings.extId !== undefined) localStorage.setItem('audio_ext_id', settings.extId);
    if (settings.intId !== undefined) localStorage.setItem('audio_int_id', settings.intId);
    if (settings.extUrl !== undefined) localStorage.setItem('audio_ext_url', settings.extUrl);
    if (settings.intUrl !== undefined) localStorage.setItem('audio_int_url', settings.intUrl);
    if (settings.extVol !== undefined) localStorage.setItem('audio_ext_vol', settings.extVol.toString());
    if (settings.intVol !== undefined) localStorage.setItem('audio_int_vol', settings.intVol.toString());
  }

  // Web Audio Synth Sounds
  private synthBeep(frequency: number, duration: number, type: OscillatorType, volume: number, startTimeOffset = 0, ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTimeOffset);

    // Apply envelope for pleasant/clean transition (no clicks)
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime + startTimeOffset);
    gainNode.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + startTimeOffset + 0.02);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime + startTimeOffset + duration - 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimeOffset + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime + startTimeOffset);
    osc.stop(ctx.currentTime + startTimeOffset + duration);
  }

  // McDonald's Beep-Beep (Typical high Fryer/Chamber Double Beep, identical to older systems)
  private playMcdonaldsDouble(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    
    // McDonalds timer is 1050Hz, very piercing and loud
    const frequency = 1050; 
    const beepDuration = 0.15;
    const gap = 0.1;

    this.synthBeep(frequency, beepDuration, 'sine', volume, 0, ctx);
    this.synthBeep(frequency, beepDuration, 'sine', volume, beepDuration + gap, ctx);
  }

  // McDonald's Triple alert (Beep-Beep-Beep)
  private playMcdonaldsTriple(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    
    const frequency = 1100; 
    const beepDuration = 0.12;
    const gap = 0.08;

    this.synthBeep(frequency, beepDuration, 'sine', volume, 0, ctx);
    this.synthBeep(frequency, beepDuration, 'sine', volume, beepDuration + gap, ctx);
    this.synthBeep(frequency, beepDuration, 'sine', volume, (beepDuration + gap) * 2, ctx);
  }

  // Authentic synthesized "Ding-Dong" (Double Tone Chime with elegant harmonic decay)
  private playDingDongSynth(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const dingTime = 0;
    const dongTime = 0.6;

    // Ding (C5, 523.25Hz) with decay
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime + dingTime);
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.001, ctx.currentTime + dingTime);
    gain1.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + dingTime + 0.05);
    gain1.gain.setValueAtTime(volume, ctx.currentTime + dingTime + 0.2);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dingTime + 0.55);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime + dingTime);
    osc1.stop(ctx.currentTime + dingTime + 0.6);

    // Dong (A4, 440.00Hz) with decay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.setValueAtTime(440.00, ctx.currentTime + dongTime);
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.001, ctx.currentTime + dongTime);
    gain2.gain.exponentialRampToValueAtTime(volume * 0.9, ctx.currentTime + dongTime + 0.05);
    gain2.gain.setValueAtTime(volume * 0.9, ctx.currentTime + dongTime + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dongTime + 0.85);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + dongTime);
    osc2.stop(ctx.currentTime + dongTime + 0.9);
  }

  // Chirp Suave Synth
  private playChirpSynth(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    // Sweep frequency upwards quickly
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  // Digital Bi-Bip (ideal for scanner inside)
  private playDoubleBeepSynth(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.synthBeep(880, 0.06, 'square', volume * 0.3, 0, ctx); // softer square beep
    this.synthBeep(880, 0.06, 'square', volume * 0.3, 0.1, ctx);
  }

  // Scanner Sharp beep
  private playScannerBeepSynth(volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.synthBeep(1400, 0.08, 'sine', volume, 0, ctx);
  }

  // --- PLAY TRIGGERS ---

  // Trigger External Ready sound
  playExternalReadySound() {
    const { extId, extUrl, extVol } = this.getSettings();

    if (extId === 'uploaded-ext') {
      getUploadedAudio('uploaded-ext').then(ret => {
        if (ret && ret.base64Data) {
          try {
            const audio = new Audio(ret.base64Data);
            audio.volume = extVol;
            audio.play().catch(e => console.warn('Playback of uploaded external audio failed:', e));
          } catch (err) {
            console.error('Uploaded audio playback error, falling back to synth.');
            this.playMcdonaldsDouble(extVol);
          }
        } else {
          this.playMcdonaldsDouble(extVol);
        }
      }).catch(() => {
        this.playMcdonaldsDouble(extVol);
      });
      return;
    }

    // Synth alert check
    if (extId === 'mcdonalds-double') {
      this.playMcdonaldsDouble(extVol);
      return;
    }
    if (extId === 'mcdonalds-triple') {
      this.playMcdonaldsTriple(extVol);
      return;
    }
    if (extId === 'dingdong-synth') {
      this.playDingDongSynth(extVol);
      return;
    }

    // URL alert check
    let urlToPlay = '';
    if (extId === 'custom' && extUrl) {
      urlToPlay = extUrl;
    } else {
      const option = EXTERNAL_ALERTS.find(o => o.id === extId);
      if (option && option.url) urlToPlay = option.url;
    }

    if (urlToPlay) {
      try {
        const audio = new Audio(urlToPlay);
        audio.volume = extVol;
        audio.play().catch(e => console.warn('CORS or playback issue playing external URL, falling back to synth beep.', e));
      } catch (err) {
        console.error('Audio play URL error:', err);
        this.playMcdonaldsDouble(extVol); // Safe fallback
      }
    } else {
      this.playMcdonaldsDouble(extVol);
    }
  }

  // Trigger Internal Order Input Arrival sound
  playInternalOrderSound() {
    const { intId, intUrl, intVol } = this.getSettings();

    if (intId === 'uploaded-int') {
      getUploadedAudio('uploaded-int').then(ret => {
        if (ret && ret.base64Data) {
          try {
            const audio = new Audio(ret.base64Data);
            audio.volume = intVol;
            audio.play().catch(e => console.warn('Playback of uploaded internal audio failed:', e));
          } catch (err) {
            this.playChirpSynth(intVol);
          }
        } else {
          this.playChirpSynth(intVol);
        }
      }).catch(() => {
        this.playChirpSynth(intVol);
      });
      return;
    }

    // Synth checks
    if (intId === 'chirp-synth') {
      this.playChirpSynth(intVol);
      return;
    }
    if (intId === 'double-beep-synth') {
      this.playDoubleBeepSynth(intVol);
      return;
    }
    if (intId === 'scanner-beep-synth') {
      this.playScannerBeepSynth(intVol);
      return;
    }

    // URL check
    let urlToPlay = '';
    if (intId === 'custom' && intUrl) {
      urlToPlay = intUrl;
    } else {
      const option = INTERNAL_ALERTS.find(o => o.id === intId);
      if (option && option.url) urlToPlay = option.url;
    }

    if (urlToPlay) {
      try {
        const audio = new Audio(urlToPlay);
        audio.volume = intVol;
        audio.play().catch(e => console.warn('CORS or playback issue playing internal URL.', e));
      } catch (err) {
        console.error('Audio play URL error:', err);
        this.playChirpSynth(intVol); // fallback
      }
    } else {
      this.playChirpSynth(intVol);
    }
  }

  // Standard utility sounds for scan successes/errors in kitchen
  playKitchenSuccessReady() {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  // Play direct external ready sound for specific manual actions if needed
  playKitchenSuccessDelivered() {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  playKitchenError() {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3');
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  // Sound triggering triggers with sound IDs for testing
  testSound(id: string, isExternal: boolean, customUrl = '', volume = 1.0) {
    console.log('Testing sound:', id, 'isExternal:', isExternal, 'customUrl:', customUrl);

    if (id === 'uploaded-ext' || id === 'uploaded-int') {
      getUploadedAudio(id).then(ret => {
        if (ret && ret.base64Data) {
          try {
            const audio = new Audio(ret.base64Data);
            audio.volume = volume;
            audio.play().catch(e => {
              alert('Erro ao reproduzir o som carregado. Verifique se o arquivo é um áudio válido (como .mp3 ou .wav) e tente recarregá-lo.');
            });
          } catch (err) {
            alert('Erro ao carregar o arquivo de áudio local.');
          }
        } else {
          alert('Nenhum arquivo de áudio foi carregado para essa opção ainda neste navegador. Arraste ou selecione um arquivo de som no uploader correspondente abaixo para testá-lo!');
        }
      }).catch(err => {
        alert('Erro ao acessar o banco de dados IndexedDB: ' + err);
      });
      return;
    }

    if (id === 'custom' && customUrl) {
      try {
        const audio = new Audio(customUrl);
        audio.volume = volume;
        audio.play().catch(e => {
          alert('Erro ao reproduzir link customizado. Verifique se o link é válido, de áudio direto (ex: terminando em .mp3) e permite acessos externos (HTTP CORS).');
        });
      } catch (e) {
        alert('Erro ao carregar o link de áudio informado.');
      }
      return;
    }

    // Test specific synth/preset sounds
    const ctx = this.getAudioContext();
    if (id === 'mcdonalds-double') {
      this.playMcdonaldsDouble(volume);
    } else if (id === 'mcdonalds-triple') {
      this.playMcdonaldsTriple(volume);
    } else if (id === 'dingdong-synth') {
      this.playDingDongSynth(volume);
    } else if (id === 'chirp-synth') {
      this.playChirpSynth(volume);
    } else if (id === 'double-beep-synth') {
      this.playDoubleBeepSynth(volume);
    } else if (id === 'scanner-beep-synth') {
      this.playScannerBeepSynth(volume);
    } else {
      // Find preset URL
      const alertList = isExternal ? EXTERNAL_ALERTS : INTERNAL_ALERTS;
      const option = alertList.find(o => o.id === id);
      if (option && option.url) {
        try {
          const audio = new Audio(option.url);
          audio.volume = volume;
          audio.play().catch(e => {
            console.error('Audio play test failed:', e);
          });
        } catch (e) {}
      }
    }
  }
}

export const audioService = new AudioService();
