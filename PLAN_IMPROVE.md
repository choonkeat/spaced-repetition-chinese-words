# Implementation Plan: Adaptive Difficulty System

This document provides step-by-step instructions for implementing an adaptive difficulty system for the spaced repetition flashcard app. The implementation must maintain **100% backward compatibility** with existing user data.

## Overview

The current system uses binary feedback (correct/wrong). The new system measures **three implicit signals** to adapt intervals per-card:

1. **Response Time** - Fast recall indicates strong memory
2. **Hint Usage** - Using hints indicates incomplete recall
3. **Outcome** - Correct or wrong answer

## Current vs New Data Model

### Current Data Model (per mode)
```javascript
{
  intervalIndex: number,    // 0-7, determines interval
  nextReview: number,       // Unix timestamp (ms)
  successCount: number,     // Total correct answers
  failCount: number         // Total wrong answers
}
```

### New Data Model (per mode)
```javascript
{
  // EXISTING - preserve exactly
  intervalIndex: number,    // 0-9 (extended from 0-7)
  nextReview: number,       // Unix timestamp (ms)
  successCount: number,     // Total correct answers
  failCount: number,        // Total wrong answers

  // NEW - add these fields
  lapseCount: number,       // Failures after reaching level 2+
  avgResponseTime: number | null,  // Rolling average in ms
  lastResponseTime: number | null, // Most recent response time
  hintUseCount: number,     // Times hint was used
  difficultyScore: number   // 0.5 (easy) to 2.0 (hard), default 1.0
}
```

## Extended Intervals

Update the `INTERVALS` array from 8 levels to 10:

```javascript
const INTERVALS = [
  1 * 60 * 1000,              // 0: 1 minute
  10 * 60 * 1000,             // 1: 10 minutes
  60 * 60 * 1000,             // 2: 1 hour
  24 * 60 * 60 * 1000,        // 3: 1 day
  3 * 24 * 60 * 60 * 1000,    // 4: 3 days (mastered threshold)
  7 * 24 * 60 * 60 * 1000,    // 5: 7 days
  14 * 24 * 60 * 60 * 1000,   // 6: 14 days
  30 * 24 * 60 * 60 * 1000,   // 7: 30 days
  60 * 24 * 60 * 60 * 1000,   // 8: 60 days (NEW)
  90 * 24 * 60 * 60 * 1000    // 9: 90 days (NEW)
];
```

---

## CRITICAL: Backward Compatibility

### Requirement
Existing users must NOT lose any data. The app must work seamlessly whether:
- User has old localStorage data (missing new fields)
- User imports an old backup file (missing new fields)
- User imports a new backup file (has all fields)
- User has never used the app before

### Strategy: Lazy Defaults with Light Inference

When reading progress data, supply defaults for any missing fields. Do NOT require a migration step.

### Implementation: `getModeProgress()` Function

Create or update a function that normalizes mode progress data:

```javascript
/**
 * Normalizes mode progress, adding default values for missing fields.
 * This ensures backward compatibility with old data formats.
 *
 * @param {Object} rawProgress - The raw progress object (may be missing fields)
 * @returns {Object} - Complete progress object with all fields
 */
function getModeProgress(rawProgress) {
  // Handle null/undefined input
  if (!rawProgress || typeof rawProgress !== 'object') {
    return getDefaultModeProgress();
  }

  // Check if this is already new format (has difficultyScore)
  const isNewFormat = rawProgress.difficultyScore !== undefined;

  // Infer difficulty from history for old format data
  const inferredDifficulty = isNewFormat
    ? rawProgress.difficultyScore
    : inferDifficultyFromHistory(rawProgress);

  return {
    // EXISTING fields - preserve exactly, with safe defaults
    intervalIndex: rawProgress.intervalIndex ?? 0,
    nextReview: rawProgress.nextReview ?? 0,
    successCount: rawProgress.successCount ?? 0,
    failCount: rawProgress.failCount ?? 0,

    // NEW fields - use existing value or default
    lapseCount: rawProgress.lapseCount ?? 0,
    avgResponseTime: rawProgress.avgResponseTime ?? null,
    lastResponseTime: rawProgress.lastResponseTime ?? null,
    hintUseCount: rawProgress.hintUseCount ?? 0,
    difficultyScore: inferredDifficulty
  };
}

/**
 * Returns default progress for a mode that has never been attempted.
 */
function getDefaultModeProgress() {
  return {
    intervalIndex: 0,
    nextReview: 0,
    successCount: 0,
    failCount: 0,
    lapseCount: 0,
    avgResponseTime: null,
    lastResponseTime: null,
    hintUseCount: 0,
    difficultyScore: 1.0
  };
}

/**
 * Infers a starting difficulty score from historical success/fail data.
 * Used only for legacy data that lacks difficultyScore.
 *
 * Conservative inference - doesn't swing far from neutral (1.0).
 */
function inferDifficultyFromHistory(progress) {
  const { successCount = 0, failCount = 0, intervalIndex = 0 } = progress;
  const total = successCount + failCount;

  // Not enough data to infer - use neutral
  if (total < 4) return 1.0;

  const failRate = failCount / total;

  // High fail rate suggests harder card
  if (failRate > 0.5) return 1.3;

  // Low fail rate + high level suggests easier card
  if (failRate < 0.15 && intervalIndex >= 5) return 0.8;

  // Default to neutral
  return 1.0;
}
```

### Where to Apply `getModeProgress()`

Apply this function whenever reading progress data:

1. **Loading from localStorage:**
```javascript
// When loading files from localStorage
const files = JSON.parse(localStorage.getItem('flashcard_files') || '[]');
for (const file of files) {
  for (const word in file.progress || {}) {
    file.progress[word] = {
      read: getModeProgress(file.progress[word]?.read),
      write: getModeProgress(file.progress[word]?.write)
    };
  }
}
```

2. **Importing backup files:**
```javascript
// When importing a backup JSON file
function importBackupFile(backup) {
  const progress = {};

  if (backup.progress) {
    for (const word in backup.progress) {
      progress[word] = {
        read: getModeProgress(backup.progress[word]?.read),
        write: getModeProgress(backup.progress[word]?.write)
      };
    }
  }

  return {
    id: generateUniqueId(),
    name: backup.name,
    flashcards: backup.flashcards,
    progress: progress,
    // ... other fields
  };
}
```

3. **Accessing a card's progress during review:**
```javascript
// When getting progress for a specific card
function getCardProgress(file, word) {
  const existing = file.progress[word] || {};
  return {
    read: getModeProgress(existing.read),
    write: getModeProgress(existing.write)
  };
}
```

---

## Recording Results: The Core Algorithm

### Response Time Tracking

Start a timer when the card is ready for response:

**READ Mode:**
- Timer starts: After sentence TTS finishes playing
- Timer ends: When speech recognition matches OR "I don't know" is clicked

**WRITE Mode:**
- Timer starts: When card is displayed (or after "Say it" TTS finishes)
- Timer ends: When "I wrote correctly" or "I wrote wrong" is clicked

```javascript
// Global variable to track when timer started
let responseTimerStart = null;

// Call when card is ready for response
function startResponseTimer() {
  responseTimerStart = Date.now();
}

// Call when getting response time
function getResponseTime() {
  if (responseTimerStart === null) return null;
  return Date.now() - responseTimerStart;
}
```

### Hint Usage Tracking

Track whether hint was used for current card:

```javascript
// Reset at start of each card
let currentCardUsedHint = false;

// Set when hint button is clicked (READ: "Show hanyupinyin", WRITE: "Show hint")
function markHintUsed() {
  currentCardUsedHint = true;
}

// Note: "Show English" in READ mode does NOT count as hint usage
```

### The `recordResult()` Function

Replace the existing result recording logic with this new algorithm:

```javascript
/**
 * Records a review result and returns updated progress.
 *
 * @param {boolean} correct - Whether the answer was correct
 * @param {number|null} responseTime - Time taken to respond (ms), or null
 * @param {boolean} usedHint - Whether hint was used for this card
 * @param {Object} modeProgress - Current progress for this mode
 * @returns {Object} - Updated progress object
 */
function recordResult(correct, responseTime, usedHint, modeProgress) {
  const {
    intervalIndex,
    avgResponseTime,
    difficultyScore,
    lapseCount,
    successCount,
    failCount,
    hintUseCount
  } = modeProgress;

  const wasLearned = intervalIndex >= 2;

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Classify response time
  // ═══════════════════════════════════════════════════════════════
  let timeCategory = 'normal';

  if (responseTime !== null && avgResponseTime !== null) {
    if (responseTime < avgResponseTime * 0.7) {
      timeCategory = 'fast';    // 30% faster than average
    } else if (responseTime > avgResponseTime * 1.5) {
      timeCategory = 'slow';    // 50% slower than average
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Calculate level advancement
  // ═══════════════════════════════════════════════════════════════
  let levelDelta;
  let newLapseCount = lapseCount;

  if (!correct) {
    // WRONG: Reset to level 0
    levelDelta = -intervalIndex;
    if (wasLearned) newLapseCount++;
  } else if (usedHint) {
    // CORRECT WITH HINT: No advancement
    levelDelta = 0;
  } else if (timeCategory === 'fast') {
    // FAST CORRECT: Skip ahead +2 levels
    levelDelta = 2;
  } else {
    // NORMAL/SLOW CORRECT: Standard +1 level
    levelDelta = 1;
  }

  const newIntervalIndex = Math.max(0, Math.min(9, intervalIndex + levelDelta));

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Update difficulty score
  // ═══════════════════════════════════════════════════════════════
  let newDifficultyScore = difficultyScore;

  if (!correct) {
    newDifficultyScore *= 1.2;         // Failed → harder
  } else if (usedHint) {
    newDifficultyScore *= 1.1;         // Needed help → harder
  } else if (timeCategory === 'fast') {
    newDifficultyScore *= 0.9;         // Fast recall → easier
  } else if (timeCategory === 'slow') {
    newDifficultyScore *= 1.05;        // Slow recall → slightly harder
  }
  // Normal speed correct: no change to difficulty

  // Clamp difficulty to valid range
  newDifficultyScore = Math.max(0.5, Math.min(2.0, newDifficultyScore));

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Calculate next review time
  // ═══════════════════════════════════════════════════════════════
  const baseInterval = INTERVALS[newIntervalIndex];
  const adjustedInterval = baseInterval / newDifficultyScore;

  // Add fuzz factor (±5%) to prevent review clustering
  const fuzz = 0.95 + Math.random() * 0.1;
  const finalInterval = adjustedInterval * fuzz;

  const nextReview = Date.now() + finalInterval;

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Update rolling average response time
  // ═══════════════════════════════════════════════════════════════
  let newAvgResponseTime = avgResponseTime;

  if (responseTime !== null) {
    if (avgResponseTime === null) {
      newAvgResponseTime = responseTime;
    } else {
      // Exponential moving average: 80% old, 20% new
      newAvgResponseTime = avgResponseTime * 0.8 + responseTime * 0.2;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Return updated progress
  // ═══════════════════════════════════════════════════════════════
  return {
    intervalIndex: newIntervalIndex,
    nextReview: nextReview,
    successCount: correct ? successCount + 1 : successCount,
    failCount: correct ? failCount : failCount + 1,
    lapseCount: newLapseCount,
    avgResponseTime: newAvgResponseTime,
    lastResponseTime: responseTime,
    hintUseCount: usedHint ? hintUseCount + 1 : hintUseCount,
    difficultyScore: newDifficultyScore
  };
}
```

---

## Leech Detection

A "leech" is a card that consumes review time without being learned.

```javascript
/**
 * Checks if a card is a leech (needs special attention).
 *
 * @param {Object} modeProgress - Progress for one mode (read or write)
 * @returns {boolean} - True if card is a leech
 */
function isLeech(modeProgress) {
  const { lapseCount, difficultyScore, successCount } = modeProgress;

  // Condition 1: Failed 4+ times after previously learning
  if (lapseCount >= 4) return true;

  // Condition 2: Persistently difficult despite many attempts
  if (difficultyScore >= 1.8 && successCount >= 6) return true;

  return false;
}
```

### Leech UI Indicators (Optional for Initial Implementation)

When a card is a leech, consider showing:
- Warning icon in card list
- Subtle border/badge during review
- "X cards need attention" in stats

---

## Implementation Checklist

### Phase 1: Data Layer (Do First)

- [ ] Add `getModeProgress()`, `getDefaultModeProgress()`, `inferDifficultyFromHistory()` functions
- [ ] Update `INTERVALS` array to include levels 8 and 9
- [ ] Apply `getModeProgress()` when loading from localStorage
- [ ] Apply `getModeProgress()` when importing backup files
- [ ] Apply `getModeProgress()` when accessing card progress during review
- [ ] Verify existing localStorage data loads correctly (no errors, no data loss)
- [ ] Verify old backup files import correctly

### Phase 2: Timer and Hint Tracking

- [ ] Add `responseTimerStart` variable
- [ ] Add `startResponseTimer()` function
- [ ] Add `getResponseTime()` function
- [ ] Call `startResponseTimer()` at appropriate times:
  - READ mode: After sentence TTS `onend` callback
  - WRITE mode: When card is displayed
- [ ] Add `currentCardUsedHint` variable, reset per card
- [ ] Add `markHintUsed()` function
- [ ] Call `markHintUsed()` when "Show hanyupinyin" clicked (READ mode)
- [ ] Call `markHintUsed()` when "Show hint" clicked (WRITE mode)
- [ ] Do NOT call `markHintUsed()` for "Show English" (that's acceptable lookup)

### Phase 3: Recording Results

- [ ] Implement new `recordResult()` function
- [ ] Update all places that record correct/wrong to use new function
- [ ] Pass `responseTime` (from `getResponseTime()`) to `recordResult()`
- [ ] Pass `usedHint` (from `currentCardUsedHint`) to `recordResult()`
- [ ] Verify progress is saved correctly to localStorage

### Phase 4: Leech Detection (Optional)

- [ ] Add `isLeech()` function
- [ ] Add visual indicator for leech cards (can be minimal)

### Phase 5: Testing

- [ ] Test with fresh localStorage (new user)
- [ ] Test with existing localStorage (simulate by removing new fields)
- [ ] Test importing old backup file (without new fields)
- [ ] Test importing new backup file (with new fields)
- [ ] Test that intervals adjust based on difficulty score
- [ ] Test that hint usage prevents level advancement
- [ ] Test that fast responses give +2 level advancement
- [ ] Run existing Playwright tests to ensure no regressions

---

## Quick Reference: Outcome Matrix

| Scenario | Level Δ | Difficulty Δ | Lapse? |
|----------|---------|--------------|--------|
| Fast + No hint + Correct | +2 | × 0.9 | No |
| Normal + No hint + Correct | +1 | × 1.0 | No |
| Slow + No hint + Correct | +1 | × 1.05 | No |
| Any + Hint + Correct | +0 | × 1.1 | No |
| Any + Any + Wrong | → 0 | × 1.2 | If level ≥ 2 |

---

## Files to Modify

1. **index.html** - Main application file containing:
   - `INTERVALS` array (extend to 10 levels)
   - Progress loading/saving logic
   - Import/export logic
   - Result recording logic
   - Timer implementation
   - Hint tracking

2. **tests/flashcards.spec.ts** - Add tests for:
   - Backward compatibility with old data
   - New recording algorithm
   - Leech detection

---

## Notes for Implementer

1. **Do not break existing functionality.** The app must work exactly as before for users who don't trigger new features.

2. **The `??` operator is your friend.** Use nullish coalescing to provide defaults for missing fields.

3. **Test backward compatibility thoroughly.** Create test data without new fields and verify it loads correctly.

4. **Preserve unknown fields.** When updating progress, spread existing fields to preserve any fields you don't explicitly handle: `{ ...existingProgress, ...updates }`.

5. **The difficulty score range is 0.5 to 2.0.** Always clamp after adjustments.

6. **Response time can be null.** Handle this gracefully - it just means we can't classify speed yet.

7. **Hint usage is binary per card.** Even multiple hint clicks count as single "used hint".
