import { loadHowler } from "./howlerRuntime";

type SoundKind = "tap" | "deal" | "score" | "danger";

const tones: Record<SoundKind, string> = {
  tap: makeTone(294, 0.13),
  deal: makeTone(392, 0.22),
  score: makeTone(523, 0.2),
  danger: makeTone(146, 0.24),
};

const sounds = new Map<SoundKind, { play: () => void; stop: () => void }>();

export function playSound(kind: SoundKind = "tap") {
  void loadHowler()
    .then(({ Howler }) => {
      Howler.volume(0.42);
      const sound = getSound(kind);
      sound.stop();
      sound.play();
    })
    .catch(() => {
      // Audio feedback should never block the game flow.
    });
}

function getSound(kind: SoundKind): { play: () => void; stop: () => void } {
  const cached = sounds.get(kind);
  if (cached) {
    return cached;
  }

  const HowlCtor = window.Howl;
  if (!HowlCtor) {
    throw new Error("Howler runtime is unavailable");
  }

  const sound = new HowlCtor({ src: [tones[kind]], volume: kind === "danger" ? 0.28 : 0.22, html5: false });
  sounds.set(kind, sound);
  return sound;
}

function makeTone(frequency: number, duration: number) {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * duration);
  const data = new Uint8Array(44 + samples * 2);
  const view = new DataView(data.buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples * 2, true);

  for (let index = 0; index < samples; index += 1) {
    const progress = index / samples;
    const envelope = Math.sin(Math.PI * progress);
    const wave = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    view.setInt16(44 + index * 2, wave * envelope * 9000, true);
  }

  let binary = "";
  for (let index = 0; index < data.length; index += 1) {
    binary += String.fromCharCode(data[index]!);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
