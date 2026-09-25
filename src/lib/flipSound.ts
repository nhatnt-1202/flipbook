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

// Trình duyệt chặn phát âm thanh cho tới khi người dùng thao tác trên trang, và chỉ một số sự kiện được tính:
// click, keydown, mousedown, pointerup/touchend (trên cảm ứng, pointerdown KHÔNG được tính). AudioContext tạo
// trước đó sẽ bị treo (suspended) và phải resume() ngay trong một sự kiện như vậy — Safari iOS còn đòi làm
// đồng bộ trong handler. Vì thế: chỉ tải trước dữ liệu mp3, còn AudioContext tạo/mở khóa trong các sự kiện đó.
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown", "mousedown"] as const;

let raw: Promise<(ArrayBuffer | null)[]> | null = null;
let decoded: Promise<void> | null = null;

function audio() {
  if (!ctx) {
    const ac = new AudioContext();
    ctx = ac;
    decoded = preload().then((list) =>
      Promise.all(list.map((data) => (data ? ac.decodeAudioData(data.slice(0)).catch(() => null) : null))).then(
        (bufs) => {
          buffers = bufs.filter((b): b is AudioBuffer => b !== null);
        },
      ),
    );
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function preload() {
  raw ??= Promise.all(
    SOUND_URLS.map((url) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .catch(() => null),
    ),
  );
  return raw;
}

function unlock() {
  let ac: AudioContext;
  try {
    ac = audio();
  } catch {
    return;
  }
  // Mẹo cho iOS: phát 1 mẫu im lặng ngay trong sự kiện để "mở khóa" hẳn đường âm thanh
  const silent = ac.createBufferSource();
  silent.buffer = ac.createBuffer(1, 1, ac.sampleRate);
  silent.connect(ac.destination);
  silent.start();
  if (ac.state === "running") stopListening();
  else ac.resume().then(() => ac.state === "running" && stopListening(), () => {});
}

let listening = false;
function stopListening() {
  if (!listening) return;
  listening = false;
  UNLOCK_EVENTS.forEach((type) => window.removeEventListener(type, unlock, true));
}

// Gọi khi mở sách: tải trước file âm thanh và chờ thao tác đầu tiên của người dùng để mở khóa.
// Nghe ở pha capture trên window để thư viện lật trang không chặn được sự kiện.
export function prepareFlipSound() {
  preload();
  if (listening || ctx?.state === "running") return;
  listening = true;
  UNLOCK_EVENTS.forEach((type) => window.addEventListener(type, unlock, true));
}

// soft: cùng đoạn ghi âm nhưng chậm, trầm và nhỏ hơn (giấy dày / bìa mềm)
export function playFlipSound(variant: "paper" | "soft" = "paper") {
  let ac: AudioContext;
  try {
    ac = audio();
  } catch {
    return;
  }
  if (!buffers.length) {
    // Lần lật đầu tiên ngay sau khi mở khóa: dữ liệu có thể chưa giải mã xong, chờ một chút rồi phát
    const at = Date.now();
    decoded?.then(() => buffers.length && Date.now() - at < 400 && playFlipSound(variant));
    return;
  }

  // Chọn đoạn khác lần trước để nghe không bị lặp
  let v = Math.floor(Math.random() * buffers.length);
  if (buffers.length > 1 && v === lastVariant) v = (v + 1) % buffers.length;
  lastVariant = v;

  const src = ac.createBufferSource();
  src.buffer = buffers[v];
  const soft = variant === "soft";
  src.playbackRate.value = (soft ? 0.8 : 0.96) + Math.random() * 0.08;

  const gain = ac.createGain();
  gain.gain.value = soft ? 0.5 : 0.7;

  if (soft) {
    const lowpass = ac.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1600;
    src.connect(lowpass).connect(gain).connect(ac.destination);
  } else {
    src.connect(gain).connect(ac.destination);
  }
  src.start();
}
