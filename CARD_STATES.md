# Card States Documentation

This document describes all UI states for READ and WRITE mode cards, and how they are managed.

## Global Variables

| Variable | Type | Purpose | Reset In |
|----------|------|---------|----------|
| `cardCompleted` | boolean | Prevents double recording of results for same card | `resetCardUI()` |
| `lastMatchLen` | number | Tracks previous speech match length for encouragement messages | `resetCardUI()` |
| `showingOops` | boolean | Tracks if "Oops" message is being shown | `resetCardUI()` |
| `sayItSpeed` | number | Toggle between 0.3 and 0.5 for WRITE mode "Say it" | `resetCardUI()` |
| `currentCard` | object | The current flashcard data | `nextCard()` |
| `currentMode` | string | `'read'` or `'write'` | `nextCard()` |
| `recognitionStarting` | boolean | Prevents multiple recognition.start() calls | `startSpeechRecognition()` |

---

## READ Mode States

### Mode Indicator
| Element | Attribute | Initial | After "I don't know" | After Success |
|---------|-----------|---------|---------------------|---------------|
| `#modeIndicator` | `textContent` | `'READ: Pronounce the sentence'` | `'READ: Listen again or continue'` | `'READ: Marked correct!'` |
| `#modeIndicator` | `className` | `'mode-indicator read'` | unchanged | unchanged |

### Display Elements
| Element | Attribute | Initial | After Hint/Don't Know |
|---------|-----------|---------|----------------------|
| `#readWord` | `textContent` | word text | unchanged |
| `#readWord` | `innerHTML` | plain text | may have `<span class="match-correct">` during TTS |
| `#readSentence` | `textContent` | sentence text | unchanged |
| `#readSentence` | `innerHTML` | plain text | `<span class="match-correct">` + `<span class="match-pending">` or `<span class="match-partial">` |
| `#readPinyin` | `classList.hidden` | `hidden` | removed (visible) |
| `#readSentencePinyin` | `classList.hidden` | `hidden` | removed (visible) |
| `#readWordEnglish` | `classList.hidden` | `hidden` | removed (visible) |
| `#readSentenceEnglish` | `classList.hidden` | `hidden` | removed (visible) |
| `#readCardLabel` | `textContent` | label or `''` | unchanged |
| `#readLevelInfo` | `innerHTML` | `'Level N'` or with "no hint" message | unchanged |

### Buttons - Initial Group
| Element | Attribute | Initial | After Click | Reset In |
|---------|-----------|---------|-------------|----------|
| `#showPinyinBtn` | `classList.hidden` | visible (or `hidden` if level >= 2) | `hidden` after click | `resetCardUI()` + `nextCard()` |
| `#showPinyinBtn` | `disabled` | `false` | `true` after click | `resetCardUI()` |
| `#showEnglishBtn` | `classList.hidden` | visible | `hidden` after "I don't know" | `resetCardUI()` |
| `#showEnglishBtn` | `disabled` | `false` | `true` after click | `resetCardUI()` |
| `#dontKnowBtn` | `classList.hidden` | visible | `hidden` after click | `resetCardUI()` |
| `#dontKnowBtn` | `disabled` | `false` | unchanged | `resetCardUI()` |

### Buttons - Next Group (shown after answer revealed)
| Element | Attribute | Initial | After "I don't know" |
|---------|-----------|---------|---------------------|
| `#readNextGroup` | `classList.hidden` | `hidden` | removed (visible) |
| `#iSaidItCorrectlyBtn` | `style.display` | `'block'` | `'block'` (visible) |
| `#readSayAgainBtn` | `disabled` | `false` | `true` during TTS, `false` after |
| `#readSayAgainBtn` | `style.opacity` | `'1'` | `'0.5'` during TTS, `'1'` after |
| `#readNextBtn` | - | in group | clickable |

### Microphone States
| Element | Attribute | Values | Meaning |
|---------|-----------|--------|---------|
| `#micBtn` | `style.display` | `'block'` / `'none'` | visible / hidden after "I don't know" |
| `#micBtn` | `disabled` | `true` / `false` | disabled during TTS |
| `#micBtn` | `style.opacity` | `'1'` / `'0.5'` | visual feedback for disabled |
| `#micBtn` | `innerHTML` | `'🎤'` / `'<span class="spinner">'` | mic icon or loading spinner |
| `#micBtn` | `classList.listening` | present/absent | green pulsing when active |
| `#micBtn` | `classList.error` | present/absent | red when mic error |
| `#micBtn` | `classList.retrying` | present/absent | retrying state |
| `#micBtn` | `classList.starting` | present/absent | starting up |

### Speech Recognition States
| Element | Attribute | Values | Meaning |
|---------|-----------|--------|---------|
| `#speechInput` | `value` | `''` / transcript / error msg | speech-to-text result |
| `#speechInput` | `style.display` | `'block'` / `'none'` | visible / hidden |
| `#speechInput` | `classList.listening` | present/absent | green border when listening |
| `#speechTip` | `classList.hidden` | present/absent | tip visibility |
| `#speechTip` | `textContent` | various | `'Starting...'`, `'Listening...'`, `'Good! Carry on...'`, `'Oops! Try again...'` |
| `#readMode` | `classList.mic-error` | present/absent | enables "tap anywhere to retry" |

---

## WRITE Mode States

### Mode Indicator
| Element | Attribute | Initial | After Show Answer |
|---------|-----------|---------|-------------------|
| `#modeIndicator` | `textContent` | `'WRITE: Can you write this in Chinese?'` | unchanged |
| `#modeIndicator` | `className` | `'mode-indicator write'` | unchanged |

### Display Elements
| Element | Attribute | Initial | After Show Answer |
|---------|-----------|---------|-------------------|
| `#writeWordEnglish` | `textContent` | english text | unchanged |
| `#writeWordPinyin` | `textContent` | pinyin text | unchanged |
| `#writeWordPinyin` | `innerHTML` | plain text | `<span class="match-correct">` during "Say it" TTS |
| `#writeWordChinese` | `textContent` | word text | unchanged |
| `#writeWordChinese` | `classList.hidden` | absent (visible) | absent (visible) |
| `#writeWordChinese` | `classList.hint-blur-base` | present (8px blur) | removed |
| `#writeWordChinese` | `classList.hint-blur-instant` | absent | present during hint animation |
| `#writeWordChinese` | `classList.hint-blur` | absent | present after hint (7px) |
| `#writeSentenceEnglish` | `textContent` | english text | unchanged |
| `#writeSentencePinyin` | `textContent` | pinyin text | unchanged |
| `#writeSentencePinyin` | `innerHTML` | plain text | `<span class="match-correct">` during "Say it" TTS |
| `#writeSentenceChinese` | `textContent` | sentence text | unchanged |
| `#writeSentenceChinese` | `classList.hidden` | absent (visible) | absent (visible) |
| `#writeSentenceChinese` | `classList.hint-blur-base` | present (8px blur) | removed |
| `#writeCardLabel` | `textContent` | label or `''` | unchanged |
| `#writeLevelInfo` | `innerHTML` | `'Level N'` or with "no hint" message | unchanged |

### Blur Classes (for Chinese text)
| Class | Blur Amount | When Applied |
|-------|-------------|--------------|
| `hint-blur-base` | 8px | Initial state |
| `hint-blur-instant` | 3px | During hint animation (instant) |
| `hint-blur` | 7px | After hint animation (200ms transition) |
| `hint-blur-full` | 8px | Full blur (rarely used) |

### Buttons - Show Group (initial)
| Element | Attribute | Initial | After Click | Reset In |
|---------|-----------|---------|-------------|----------|
| `#writeShowGroup` | `classList.hidden` | absent (visible) | `hidden` after "Show Answer" | `resetCardUI()` |
| `#sayItBtn` | `disabled` | `false` | `true` during TTS | `resetCardUI()` |
| `#sayItBtn` | `style.opacity` | `'1'` | `'0.5'` during TTS | `resetCardUI()` |
| `#showHintBtn` | `classList.hidden` | absent (or `hidden` if level >= 2) | unchanged | `resetCardUI()` + `nextCard()` |
| `#showHintBtn` | `disabled` | `false` | `true` after click | `resetCardUI()` |
| `#showAnswerBtn` | - | in group | triggers show answer |

### Buttons - Answer Group (after Show Answer)
| Element | Attribute | Initial | After Show Answer |
|---------|-----------|---------|-------------------|
| `#writeAnswerGroup` | `classList.hidden` | `hidden` | removed (visible) after TTS |
| `#wrongBtn` | - | in group | records failure |
| `#correctBtn` | - | in group | records success |
| `#writeAnswerSayAgainBtn` | `disabled` | `false` | `true` during TTS |
| `#writeAnswerSayAgainBtn` | `style.opacity` | `'1'` | `'0.5'` during TTS |

### Buttons - Next Group (after Wrong)
| Element | Attribute | Initial | After Wrong |
|---------|-----------|---------|-------------|
| `#writeNextGroup` | `classList.hidden` | `hidden` | removed (visible) |
| `#writeSayAgainBtn` | `disabled` | `false` | `true` during TTS |
| `#writeSayAgainBtn` | `style.opacity` | `'1'` | `'0.5'` during TTS |
| `#writeNextBtn` | - | in group | advances to next card |

---

## State Reset Functions

### `resetCardUI()`
Called at the start of each new card. Resets:

**Global Variables:**
- `cardCompleted = false`
- `lastMatchLen = 0`
- `showingOops = false`
- `sayItSpeed = 0.3`

**Mic Button:**
- `innerHTML` = mic icon
- `style.display` = `'block'`
- `classList.remove('listening', 'error', 'retrying', 'starting')`
- `disabled` = `false`
- `style.opacity` = `'1'`

**Speech Buttons (all):**
- `sayItBtn`, `readSayAgainBtn`, `writeSayAgainBtn`, `writeAnswerSayAgainBtn`
- `disabled` = `false`
- `style.opacity` = `'1'`

**READ Mode Elements:**
- `#readPinyin`, `#readSentencePinyin`, `#readWordEnglish`, `#readSentenceEnglish`, `#readNextGroup` → add `hidden`
- `#showPinyinBtn`, `#showEnglishBtn`, `#dontKnowBtn` → remove `hidden`, `disabled` = `false`
- `#iSaidItCorrectlyBtn` → `style.display` = `'block'`
- `#speechInput` → `value` = `''`, `style.display` = `'block'`, remove `listening`
- `#speechTip` → add `hidden`
- `#readMode` → remove `mic-error`
- `#modeIndicator` → `textContent` = `'READ: Pronounce the sentence'`

**WRITE Mode Elements:**
- `#writeWordChinese`, `#writeSentenceChinese` → remove `hint-blur-instant`, `hint-blur`, `hint-blur-full`
- `#writeShowGroup`, `#showHintBtn` → remove `hidden`, `disabled` = `false`
- `#writeAnswerGroup`, `#writeNextGroup` → add `hidden`

**Also:**
- `speechSynthesis.cancel()` - cancel ongoing speech

### `showReadMode()`
Sets up READ mode display:
- Sets `#modeIndicator` text and class
- Shows `#readMode`, hides `#writeMode`
- Populates all text content from `currentCard`
- Calls `restartSpeechRecognition()`

### `showWriteMode()`
Sets up WRITE mode display:
- Sets `#modeIndicator` text and class
- Hides `#readMode`, shows `#writeMode`
- Populates all text content from `currentCard`
- Adds `hint-blur-base` to Chinese text elements

### `nextCard()`
Called to advance to next card:
- Checks if session complete (shows modal if so)
- Gets next scheduled card
- Sets `currentCard` and `currentMode`
- Calls `resetCardUI()`
- Calls `speakScore()`
- Conditionally hides hint buttons based on level
- Calls `showReadMode()` or `showWriteMode()`

---

## Highlight CSS Classes

| Class | Style | Used For |
|-------|-------|----------|
| `match-correct` | dark background (#333), white text | Consecutive matches from beginning |
| `match-pending` | gray text (#666) | Remaining unmatched text |
| `match-partial` | light gray background (#ddd) | Non-consecutive character matches |

---

## State Flow Diagrams

### READ Mode Flow
```
[Card Start]
    ↓
resetCardUI() → showReadMode()
    ↓
[User speaks] → updateSentenceHighlight()
    ↓
[Match complete] ──────────────────→ recordResult(true) → nextCard()
    ↓
[Show Pinyin clicked] → reveal pinyin, disable button
    ↓
[Show English clicked] → reveal english, disable button
    ↓
[I don't know clicked] → recordResult(false) → reveal all → show next group
    ↓
[I said it correctly] → undo failure, recordResult(true) → nextCard()
    ↓
[Next card clicked] → nextCard()
```

### WRITE Mode Flow
```
[Card Start]
    ↓
resetCardUI() → showWriteMode()
    ↓
[Say it clicked] → TTS word then sentence with highlights
    ↓
[Show hint clicked] → animate blur reduction, disable button
    ↓
[Show answer clicked] → reveal Chinese, TTS, show answer group
    ↓
[Correct clicked] → recordResult(true) → nextCard()
    ↓
[Wrong clicked] → recordResult(false) → show next group
    ↓
[Next card clicked] → nextCard()
```
