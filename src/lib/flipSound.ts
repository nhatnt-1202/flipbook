// Tiếng lật trang: 3 đoạn ghi âm thật cắt từ file foley, phát ngẫu nhiên qua Web Audio
// (Web Audio phát tức thì và chồng được nhiều tiếng khi lật nhanh, khác với thẻ <audio>).
const SOUND_URLS = ["/sounds/page-flip-1.mp3", "/sounds/page-flip-2.mp3", "/sounds/page-flip-3.mp3"];

let ctx: AudioContext | null = null;
let buffers: AudioBuffer[] = [];
let lastVariant = -1;

// Trạng thái tắt tiếng, lưu localStorage; dùng với useSyncExternalStore
const MUTE_KEY = "flipbook:muted";
const listeners = new Set<() => void>();
let muted: boolean | null = null;

export function isFlipSoundMuted() {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setFlipSoundMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

export function subscribeFlipSoundMuted(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function audio() {
  if (!ctx) {
    const ac = new AudioContext();
    ctx = ac;
    Promise.all(
      SOUND_URLS.map((url) =>
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((data) => ac.decodeAudioData(data))
          .catch(() => null),
      ),
    ).then((list) => {
      buffers = list.filter((b): b is AudioBuffer => b !== null);
    });
  }
  // Trình duyệt chỉ cho phát âm thanh sau thao tác của người dùng; gọi resume() mỗi lần cho chắc
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Gọi sớm (khi mở sách, và trong sự kiện click/phím) để tải trước âm thanh và "mở khóa" phát tiếng
export function unlockFlipSound() {
  try {
    audio();
  } catch {}
}

export function playFlipSound() {
  let ac: AudioContext;
  try {
    ac = audio();
  } catch {
    return;
  }
  if (!buffers.length) return; // chưa tải xong

  // Chọn đoạn khác lần trước để nghe không bị lặp
  let v = Math.floor(Math.random() * buffers.length);
  if (buffers.length > 1 && v === lastVariant) v = (v + 1) % buffers.length;
  lastVariant = v;

  const src = ac.createBufferSource();
  src.buffer = buffers[v];
  src.playbackRate.value = 0.96 + Math.random() * 0.08;

  const gain = ac.createGain();
  gain.gain.value = 0.7;

  src.connect(gain).connect(ac.destination);
  src.start();
}
