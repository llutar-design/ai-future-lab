/**
 * 한국어 음성 안내. 운영체제에 설치된 음성(예: Windows 'Microsoft Heami')을 사용하므로 인터넷이 필요 없습니다.
 * 온라인 전용 음성(Google 등)은 일부러 제외합니다.
 * 한국어 음성이 없으면 화면 자막만 표시하고, 관리자 화면에 상태를 보여줍니다.
 */
let enabled = true;
let rate = 1.05;
let volume = 0.8;
let voice: SpeechSynthesisVoice | null = null;
let lastText = '';

function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return;
  const voices = speechSynthesis.getVoices();
  const ko = voices.filter((v) => v.lang.toLowerCase().startsWith('ko'));
  voice = ko.find((v) => v.localService) ?? null;
}

if (typeof speechSynthesis !== 'undefined') {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function setSpeechOptions(o: { enabled?: boolean; rate?: number; volume?: number }) {
  if (o.enabled !== undefined) enabled = o.enabled;
  if (o.rate !== undefined) rate = o.rate;
  if (o.volume !== undefined) volume = o.volume;
  if (!enabled) stopSpeech();
}

export function speechStatus(): { supported: boolean; voiceName: string | null } {
  if (typeof speechSynthesis === 'undefined') return { supported: false, voiceName: null };
  if (!voice) pickVoice();
  return { supported: true, voiceName: voice ? voice.name : null };
}

export function speak(text: string) {
  lastText = text;
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  if (!voice) pickVoice();
  if (!voice) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.volume = volume;
    speechSynthesis.speak(u);
  } catch (e) {
    console.warn('음성 안내 실패', e);
  }
}

export function repeatLastSpeech() {
  if (lastText) speak(lastText);
}

export function stopSpeech() {
  try {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}
