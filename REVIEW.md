# Code Review: Chinese Flashcards App

Date: 2024-11-24 (Updated)
File reviewed: `index.html`

---

## Summary

The app is generally well-structured for a vanilla JS single-file application. Most critical issues from the initial review have been fixed. This update identifies new issues found during re-review.

**Severity Legend:**
- **Critical**: Security vulnerability or data loss risk
- **High**: Bug that affects core functionality
- **Medium**: Bug or issue that could cause confusion
- **Low**: Minor issue or code smell
- **Info**: Observation, not necessarily a problem

---

## New Issues Found (2024-11-24 Update)

### 1. [FIXED] Unescaped file.id in HTML attributes
**Severity:** High
**Location:** Lines 700-701

**Issue:** While `file.name` is escaped, `file.id` was inserted directly into HTML attributes.

**Fix:** Wrapped `file.id` with `escapeHtml()` in data-id attributes.

**Status:** Fixed

### 2. Missing null check in checkSpeechMatch
**Severity:** Medium
**Location:** Lines ~1434-1444

```javascript
function checkSpeechMatch(transcript) {
  if (cardCompleted) return;
  const expected = normalizeForSpeechMatch(currentCard.sentence); // No null check
```

**Issue:** If `currentCard` is null when speech recognition fires a late event, this will throw an error.

**Status:** Open

### 3. Missing FileReader error handler
**Severity:** Medium
**Location:** Lines ~914-989

**Issue:** No `reader.onerror` handler is defined. If file reading fails (file deleted mid-read, permission denied), the failure is silent.

**Status:** Open

### 4. Memory leak in confetti animation
**Severity:** Medium
**Location:** Lines ~1691-1733

**Issue:** If `showConfetti()` is called rapidly, multiple animation loops can run simultaneously without cleanup. Each call creates new particles without canceling existing animations.

**Status:** Open

### 5. speechSynthesis.cancel() timing issue
**Severity:** Medium

**Issue:** `speechSynthesis.cancel()` is asynchronous in some browsers. Immediately calling `speak()` after `cancel()` can cause the new utterance to be canceled as well.

**Status:** Open (Low impact in practice)

### 6. Progress data structure not validated on import
**Severity:** Medium
**Location:** Lines ~923-934

**Issue:** The `progress` object from imported backups is used without validation. Malformed progress data could cause unexpected behavior.

**Status:** Open

### 7. Deprecated substr() usage
**Severity:** Low
**Location:** Line ~681

```javascript
return Date.now().toString(36) + Math.random().toString(36).substr(2);
```

**Issue:** `String.prototype.substr()` is deprecated. Should use `slice()` instead.

**Status:** Open

### 8. No rate limiting on speech recognition retries
**Severity:** Low

**Issue:** Rapid taps on the error state could spam the speech recognition API.

**Status:** Open

---

## Previously Fixed Issues

### Race Conditions

| Issue | Severity | Status |
|-------|----------|--------|
| Speech recognition double-recording | High | FIXED - `cardCompleted` flag prevents multiple recordings |
| Speech synthesis queue buildup | Medium | FIXED - Added `speechSynthesis.cancel()` at start |

### Security Issues

| Issue | Severity | Status |
|-------|----------|--------|
| XSS via flashcard content | Critical | FIXED - Using `escapeHtml()` in all innerHTML assignments |
| Missing `rel="noopener"` on external link | Low | FIXED |
| No localStorage quota handling | Medium | FIXED - Try-catch with user-friendly error |

### Logic Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Game screen visibility check broken | High | FIXED - Using classList check |
| Dead code: replayMode | Low | FIXED - Removed |
| Saved voice not found handling | Medium | FIXED - Falls back to first available |
| Global state not reset between cards | Low | FIXED - Reset in card setup |
| Empty flashcard array | Low | FIXED - Validation added |

### Other Issues

| Issue | Severity | Status |
|-------|----------|--------|
| URL blob not properly released | Low | FIXED - Delayed revocation |
| Error handling for non-Error objects | Low | FIXED - Robust error display |

---

## Accessibility Concerns (Future Improvement)

- No ARIA labels on interactive elements (hamburger, mic button)
- Confetti canvas covers screen without `aria-hidden`
- Color-only indicators (green/red) may be hard for colorblind users
- No `aria-live` regions for dynamic status updates

---

## Architecture Notes

### Recent Improvements (This Session)

1. **Arabic numeral to Chinese conversion** - Speech-to-text outputs "7" but flashcards have "七". Added `arabicToChinese()` converter in `normalizeForSpeechMatch()`.

2. **Mic state feedback** - Three distinct states:
   - Starting (gray spinner): `onstart` event, waiting for audio capture
   - Listening (red pulsing mic): `onaudiostart` event, actually recording
   - Error (gray with X): Recognition error, tap to retry

3. **Audio feedback for wrong answers** - `speakWordThenSentence()` highlights and speaks word, pauses 1s, then highlights and speaks sentence.

4. **UI improvements**:
   - Score display moved to top of card
   - Score highlighted while being spoken
   - Mode indicator and voice selector on same row
   - "Say it again" button replaces non-functional play button

---

## Fix Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| 1 | Escape file.id in HTML | Low |
| 2 | Add null check in checkSpeechMatch | Low |
| 3 | Add FileReader error handler | Low |
| 4 | Fix confetti animation leak | Medium |
| 5 | Validate progress on import | Medium |
| 6 | Replace deprecated substr | Low |
