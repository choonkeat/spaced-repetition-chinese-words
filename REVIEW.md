# Code Review: Chinese Flashcards App

Date: 2024-11-24
File reviewed: `index.html`

---

## Summary

The app is generally well-structured for a vanilla JS single-file application. All identified issues have been fixed and tested.

**Severity Legend:**
- **Critical**: Security vulnerability or data loss risk
- **High**: Bug that affects core functionality
- **Medium**: Bug or issue that could cause confusion
- **Low**: Minor issue or code smell
- **Info**: Observation, not necessarily a problem

---

## Race Conditions

### 1. [FIXED] Speech recognition double-recording
**Severity:** High

The `cardCompleted` flag properly prevents multiple `recordResult()` calls when speech recognition fires multiple `onresult` events before `stopSpeechRecognition()` takes effect.

### 2. [FIXED] Speech synthesis queue buildup
**Severity:** Medium

**Fix:** Added `speechSynthesis.cancel()` at the start of `speakScore()` to cancel any pending speech.

### 3. Recognition restart race
**Severity:** Low (No fix needed)

The class removal happens synchronously after `recognition.stop()`, so this should rarely occur.

---

## Security Issues

### 1. [FIXED] XSS via flashcard content
**Severity:** Critical

**Fix:** Used `escapeHtml()` function to escape `matched` and `remaining` in `updateSentenceHighlight()`.

### 2. [FIXED] Missing `rel="noopener"` on external link
**Severity:** Low

**Fix:** Added `rel="noopener noreferrer"` to the GitHub link.

### 3. [FIXED] No localStorage quota handling
**Severity:** Medium

**Fix:** Wrapped `localStorage.setItem()` in try-catch with user-friendly error message for `QuotaExceededError`.

---

## Logic Issues

### 1. [FIXED] Game screen visibility check is broken
**Severity:** High

**Fix:** Changed `gameScreen.style.display !== 'none'` to `gameScreen.classList.contains('active')`.

### 2. [FIXED] Dead code: `replayMode` and `handleMicClick`
**Severity:** Low

**Fix:** Removed dead `replayMode` variable and `handleMicClick()` function.

### 3. [FIXED] Saved voice not found handling
**Severity:** Medium

**Fix:** When saved voice is not found, select first available voice and update localStorage.

### 4. Progress key collision
**Severity:** Info (No fix needed)

Progress is keyed by `currentCard.word`. This is intentional - if you learn "你" in one set, it should be "learned" in another.

### 5. [FIXED] Global state not reset between cards
**Severity:** Low

**Fix:** Added `lastMatchLen = 0` and `showingOops = false` to `resetCardUI()`.

---

## Off-by-1 Errors

### None found

The following were checked and found correct:
- Fisher-Yates shuffle: Loop bounds and random range are correct
- INTERVALS indexing: `Math.min` correctly caps at `INTERVALS.length - 1`
- Substring operations in highlight mapping: Index tracking is correct

---

## Other Issues

### 1. Memory/resource leaks

**a) Confetti canvas alpha not reset** - Benign, next animation starts fresh.

**b) [FIXED] URL blob not properly released**

**Fix:** Added `setTimeout(() => URL.revokeObjectURL(url), 100)` to delay revocation.

**c) `speechSynthesis.onvoiceschanged` never removed** - Benign, only called once in `init()`.

### 2. [FIXED] Error handling gaps
**Severity:** Low

**Fix:** Changed to `err instanceof Error ? err.message : String(err)` for robust error display.

### 3. Accessibility concerns
**Severity:** Medium (Not fixed - future improvement)

- No ARIA labels on interactive elements
- Confetti canvas covers the screen but has no `aria-hidden`
- Color-only indicators (green/red) may be hard to distinguish for colorblind users

### 4. [FIXED] No validation of flashcard array length
**Severity:** Low

**Fix:** Added check for empty array with user-friendly error message.

---

## Fix Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | XSS via flashcard content | Critical | FIXED |
| 2 | Game screen visibility check | High | FIXED |
| 3 | Speech synthesis queue buildup | Medium | FIXED |
| 4 | localStorage quota handling | Medium | FIXED |
| 5 | Saved voice not found | Medium | FIXED |
| 6 | Dead replayMode code | Low | FIXED |
| 7 | Global state not reset | Low | FIXED |
| 8 | Missing rel="noopener" | Low | FIXED |
| 9 | Empty flashcard array | Low | FIXED |
| 10 | Error handling for non-Error | Low | FIXED |
| 11 | URL blob release timing | Low | FIXED |
| 12 | Accessibility concerns | Medium | Future |
| 13 | Progress key collision | Info | By Design |
| 14 | Recognition restart race | Low | Acceptable |
