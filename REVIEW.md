# Code Review: Chinese Flashcards App

Date: 2024-11-24
File reviewed: `index.html`

---

## Summary

The app is generally well-structured for a vanilla JS single-file application. The recent `cardCompleted` flag fix addresses the main race condition issue. However, several other issues remain that could cause bugs or security concerns.

**Severity Legend:**
- **Critical**: Security vulnerability or data loss risk
- **High**: Bug that affects core functionality
- **Medium**: Bug or issue that could cause confusion
- **Low**: Minor issue or code smell
- **Info**: Observation, not necessarily a problem

---

## Race Conditions

### 1. [FIXED] Speech recognition double-recording
**Severity:** High (Already Fixed)

The `cardCompleted` flag at line 1292 properly prevents multiple `recordResult()` calls when speech recognition fires multiple `onresult` events before `stopSpeechRecognition()` takes effect.

### 2. Speech synthesis queue buildup
**Severity:** Medium

**Location:** Lines 1357-1372, 1374-1393

**Problem:** `speakScore()` is called at the start of every card without canceling previous utterances. If a user quickly navigates through cards (e.g., marking multiple as wrong), speech utterances queue up and play sequentially.

**Proposed Fix:**
```javascript
function speakScore() {
  speechSynthesis.cancel(); // Cancel any pending speech
  const file = getCurrentFile();
  // ... rest of function
}
```

### 3. Recognition restart race
**Severity:** Low

**Location:** Lines 1132-1136

**Problem:** The `onend` handler checks if `micBtn` still has the `listening` class to decide whether to restart. If `stopSpeechRecognition()` is called but `onend` fires before the class is removed, it could restart unexpectedly.

**Current mitigation:** The class removal happens synchronously after `recognition.stop()`, so this should rarely occur.

---

## Security Issues

### 1. XSS via flashcard content
**Severity:** Critical

**Location:** Line 1289

```javascript
sentenceEl.innerHTML = `<span class="match-correct">${matched}</span>...`;
```

**Problem:** The `matched` and `remaining` variables come from `currentCard.sentence`, which is user-uploaded JSON. A malicious flashcard file could contain:
```json
{ "sentence": "<img src=x onerror=alert('XSS')>" }
```

This would execute arbitrary JavaScript when the sentence is highlighted.

**Proposed Fix:**
```javascript
function escapeHtmlContent(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// In updateSentenceHighlight:
sentenceEl.innerHTML = `<span class="match-correct">${escapeHtmlContent(matched)}</span><span class="match-pending">${escapeHtmlContent(remaining)}</span>`;
```

### 2. Missing `rel="noopener"` on external link
**Severity:** Low

**Location:** Line 457

```html
<a href="https://github.com/choonkeat/spaced-repetition-chinese-words">GitHub</a>
```

**Proposed Fix:**
```html
<a href="https://github.com/choonkeat/spaced-repetition-chinese-words" rel="noopener noreferrer">GitHub</a>
```

### 3. No localStorage quota handling
**Severity:** Medium

**Location:** Line 627

**Problem:** `localStorage.setItem()` can throw `QuotaExceededError` if storage is full, which would crash the app silently.

**Proposed Fix:**
```javascript
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Storage full! Cannot save progress. Try deleting some flashcard sets.');
    }
    console.error('Failed to save:', e);
  }
}
```

---

## Logic Issues

### 1. Game screen visibility check is broken
**Severity:** High

**Location:** Line 685

```javascript
if (gameScreen.style.display !== 'none') {
```

**Problem:** The game screen visibility is controlled via the `.active` class (line 182), not inline `style.display`. This check will always fail because `gameScreen.style.display` is an empty string when using CSS classes.

**Proposed Fix:**
```javascript
if (gameScreen.classList.contains('active')) {
```

### 2. Dead code: `replayMode` and `handleMicClick`
**Severity:** Low

**Location:** Lines 839-848, 1336

**Problem:** `replayMode` is set in `handleDontKnow()`, but `handleMicClick()` that uses it is never called because the mic button has `pointer-events: none` (line 307). This code does nothing.

**Proposed Fix:** Either:
- Remove `replayMode`, `handleMicClick()` entirely, or
- Make the mic button clickable in replay mode to allow re-listening

### 3. Saved voice not found handling
**Severity:** Medium

**Location:** Lines 1157-1171

**Problem:** If the user's saved voice is no longer available (e.g., system update, different device), `selectedVoice` remains `null` even though the dropdown shows a voice selected.

**Proposed Fix:**
```javascript
// After the forEach loop:
if (!selectedVoice && chineseVoices.length > 0) {
  selectedVoice = chineseVoices[0];
  voiceSelect.value = selectedVoice.name;
  localStorage.setItem(VOICE_KEY, selectedVoice.name);
}
```

### 4. Progress key collision
**Severity:** Info

**Location:** Lines 1462-1463

**Problem:** Progress is keyed by `currentCard.word`. If two flashcard sets contain the same word, or if a single set has duplicate words, they share progress.

**Impact:** Likely intentional - if you learn "你" in one set, it should be "learned" in another. But could surprise users.

### 5. Global state not reset between cards
**Severity:** Low

**Location:** Lines 1234-1235

`lastMatchLen` and `showingOops` are reset in `recognition.onstart`, but if speech recognition fails to start, these values remain stale from the previous card.

**Proposed Fix:** Reset them in `resetCardUI()`:
```javascript
function resetCardUI() {
  cardCompleted = false;
  lastMatchLen = 0;      // Add
  showingOops = false;   // Add
  replayMode = false;
  // ...
}
```

---

## Off-by-1 Errors

### None found

The following were checked and found correct:
- Fisher-Yates shuffle (lines 903-906): Loop bounds and random range are correct
- INTERVALS indexing (lines 1478, 1481, 1484): `Math.min` correctly caps at `INTERVALS.length - 1`
- Substring operations in highlight mapping (lines 1279-1288): Index tracking is correct

---

## Other Issues

### 1. Memory/resource leaks

**a) Confetti canvas alpha not reset**
**Location:** Line 1530

After confetti animation, `ctx.globalAlpha` remains at a low value. Next confetti animation starts fresh, so this is benign but sloppy.

**b) URL blob not properly released**
**Location:** Lines 795-799

`URL.revokeObjectURL(url)` is called immediately after `a.click()`, but the download may not have started yet. Should use a small delay:
```javascript
a.click();
setTimeout(() => URL.revokeObjectURL(url), 100);
```

**c) `speechSynthesis.onvoiceschanged` never removed**
**Location:** Line 1176

If `setupVoiceSelector()` were called multiple times, handlers would stack. Currently only called once in `init()`, so benign.

### 2. Error handling gaps

**Location:** Lines 928-932

```javascript
} catch (err) {
  uploadMsg.textContent = err.message;
```

If `err` is not an Error object (e.g., a string was thrown), `err.message` would be `undefined`.

**Proposed Fix:**
```javascript
uploadMsg.textContent = err instanceof Error ? err.message : String(err);
```

### 3. Accessibility concerns
**Severity:** Medium

- No ARIA labels on interactive elements
- Confetti canvas covers the screen but has no `aria-hidden`
- Color-only indicators (green/red) may be hard to distinguish for colorblind users

### 4. No validation of flashcard array length
**Severity:** Low

**Location:** Lines 893-895

An empty array `[]` passes validation and creates a file with 0 words, which shows "0 words" in the UI and "No cards to review!" when played.

**Proposed Fix:**
```javascript
if (!Array.isArray(data) || data.length === 0) {
  throw new Error('JSON must be a non-empty array of flashcards');
}
```

---

## Recommendations Summary

### Must Fix (Security/Critical)
1. Escape HTML in `updateSentenceHighlight()` to prevent XSS

### Should Fix (High/Medium)
2. Fix game screen visibility check (line 685)
3. Add `speechSynthesis.cancel()` before `speakScore()`
4. Handle localStorage quota exceeded
5. Handle case when saved voice no longer exists

### Nice to Have (Low/Info)
6. Remove dead `replayMode` code or make it functional
7. Reset `lastMatchLen`/`showingOops` in `resetCardUI()`
8. Add `rel="noopener noreferrer"` to external link
9. Validate non-empty flashcard array
10. Improve error message handling for non-Error exceptions
