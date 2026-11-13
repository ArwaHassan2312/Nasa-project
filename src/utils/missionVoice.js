const FEMALE_VOICE_HINTS = /female|samantha|victoria|aria|jenny|ava|zira|susan|karen|moira|tessa|siri|google us english|emma|amy|libby|natasha|sonia|olivia|aria online/i;

function findFriendlyEnglishVoice(voices) {
  const englishVoices = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  return englishVoices.find((voice) => FEMALE_VOICE_HINTS.test(voice.name))
    ?? voices.find((voice) => FEMALE_VOICE_HINTS.test(voice.name))
    ?? englishVoices[0];
}

export function createNoorSpeech(text) {
  const speech = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const friendlyVoice = findFriendlyEnglishVoice(voices);
  if (friendlyVoice) speech.voice = friendlyVoice;
  speech.rate = 0.9;
  speech.pitch = 1.16;
  speech.volume = 1;
  return speech;
}
