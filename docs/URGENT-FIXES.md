# Urgent fixes (do these before anything else in the backlog)

## 1. Read lines aloud (beta) is silent on the owner's phone (reported 2026-11-15, v47)
The owner turned the setting on and hears no voices. Fix in `ttsSay` / `ttsStop` / the Settings toggle and radio check:
1. Chrome on Android drops `speechSynthesis.speak()` called right after `cancel()`. Only cancel when `speechSynthesis.speaking || speechSynthesis.pending`, and after a cancel wait about 60 ms before `speak()`.
2. Call `speechSynthesis.resume()` before `speak()`; Chrome can get stuck paused.
3. Voices load late: listen for `voiceschanged` and cache the list. Never block speaking on it; with no English voice, use the default voice and keep `lang = "en-US"`.
4. Unlock speech inside a real tap: when the toggle is switched on, and on the first Play/Launch tap, call `speak()` synchronously in that handler (no timers or awaits before it). iOS and Chrome only allow speech that starts from a user gesture; later lines then work.
5. Keep each utterance referenced until `onend` so it isn't garbage-collected mid-speech.
6. Settings radio check:
   - If speech isn't supported, show "Spoken lines aren't supported in this browser" and disable the toggle.
   - If the check doesn't fire `onstart` within 2 s, show: "No sound? Turn up media volume. On iPhone, also switch off silent mode. On Android, make sure a text-to-speech engine (Google Speech Services) is installed."
7. Test with Playwright by stubbing `window.speechSynthesis` to record calls. Confirm that the toggle tap, the radio check and each briefing line call `speak()` with text, and that `speak()` never directly follows `cancel()` without the delay.

In the round's message, tell the owner how to test it: Settings > Read lines aloud > radio check. Then mark it done in AUDIT-PROGRESS.md.

### The owner's phone is an iPhone (Safari / home-screen app). iPhone specifics for this fix
- iOS only allows speech that starts inside a `click` or `touchend` handler. A `pointerdown` handler doesn't count. Do the unlock `speak()` (a short line, or a single space at volume 0.01 if nothing should be heard) inside the click handler of the toggle, the radio check and the Play/Launch buttons.
- iOS often drops the next `speak()` after `cancel()`. Avoid `cancel()` between lines; let a line finish, or queue the next one in `onend`. Cancel only when the player skips.
- The game's Web Audio music shares the audio session. If speech is still silent with music playing, briefly duck the music gain during speech instead of suspending the AudioContext.
- Don't filter voices by `localService` on iOS. Prefer `lang` starting with "en", else no `u.voice` at all (the system default works).
- Hint text for iPhone users in the radio check: "No sound? Turn off silent mode (switch on the side), turn up the volume, and check Settings > Accessibility > Spoken Content > Voices has an English voice."
- Test the iOS path in Playwright with WebKit (`p.webkit.launch()`) and a stubbed `speechSynthesis` as well as Chromium.
