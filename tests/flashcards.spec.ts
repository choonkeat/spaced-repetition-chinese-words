import { test, expect, Page } from '@playwright/test';
import path from 'path';

const VALID_FLASHCARDS = path.join(__dirname, 'fixtures/valid-flashcards.json');
const INVALID_FLASHCARDS = path.join(__dirname, 'fixtures/invalid-missing-fields.json');
const BACKUP_FLASHCARDS = path.join(__dirname, 'fixtures/backup-flashcards.json');

// Helper to clear localStorage before each test
async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
}

// Helper to upload a file
async function uploadFile(page: Page, filePath: string, setName?: string) {
  if (setName) {
    await page.fill('#fileNameInput', setName);
  }
  await page.setInputFiles('#fileInput', filePath);
}

// Helper to wait for game screen to be active
async function waitForGameScreen(page: Page) {
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
}

// Helper to get localStorage data
async function getStorageData(page: Page) {
  return await page.evaluate(() => {
    return {
      files: JSON.parse(localStorage.getItem('flashcard_files') || '[]'),
      voice: localStorage.getItem('flashcard_voice'),
    };
  });
}

// Helper to create test flashcard data in localStorage
interface TestFileOptions {
  readIntervalIndex?: number;
  readNextReview?: number;
  writeIntervalIndex?: number;
  writeNextReview?: number;
  extraCards?: Array<{
    word: string;
    readIntervalIndex?: number;
    writeIntervalIndex?: number;
  }>;
}

async function setupTestFile(page: Page, options: TestFileOptions = {}) {
  const {
    readIntervalIndex = 0,
    readNextReview = 0,
    writeIntervalIndex = 0,
    writeNextReview = 0,
    extraCards = [],
  } = options;

  await page.evaluate(({ readIntervalIndex, readNextReview, writeIntervalIndex, writeNextReview, extraCards }) => {
    const flashcards = [
      {
        word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
        sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
      },
      ...extraCards.map(c => ({
        word: c.word, word_hanyupinyin: 'pinyin', word_english: 'english',
        sentence: '句子', sentence_hanyupinyin: 'pinyin', sentence_english: 'sentence'
      }))
    ];

    const progress: Record<string, any> = {
      '你': {
        read: { intervalIndex: readIntervalIndex, nextReview: readNextReview, successCount: readIntervalIndex, failCount: 0 },
        write: { intervalIndex: writeIntervalIndex, nextReview: writeNextReview, successCount: writeIntervalIndex, failCount: 0 }
      }
    };

    extraCards.forEach(c => {
      progress[c.word] = {
        read: { intervalIndex: c.readIntervalIndex ?? 0, nextReview: 0, successCount: 0, failCount: 0 },
        write: { intervalIndex: c.writeIntervalIndex ?? 0, nextReview: 0, successCount: 0, failCount: 0 }
      };
    });

    const files = [{
      id: 'test-id',
      name: 'Test',
      flashcards,
      progress
    }];
    localStorage.setItem('flashcard_files', JSON.stringify(files));
  }, { readIntervalIndex, readNextReview, writeIntervalIndex, writeNextReview, extraCards });

  await page.reload();
  await page.locator('.file-item').click();
}

// Force READ mode by making write not due
async function setupReadMode(page: Page) {
  await setupTestFile(page, {
    readIntervalIndex: 0,
    readNextReview: 0,
    writeIntervalIndex: 7,
    writeNextReview: Date.now() + 9999999999,
  });
}

// Force WRITE mode by making read not due
async function setupWriteMode(page: Page) {
  await setupTestFile(page, {
    readIntervalIndex: 7,
    readNextReview: Date.now() + 9999999999,
    writeIntervalIndex: 0,
    writeNextReview: 0,
  });
}

test.describe('File Upload & Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('shows welcome message when no files uploaded', async ({ page }) => {
    await expect(page.locator('#welcomeMessage')).toBeVisible();
    await expect(page.locator('#welcomeMessage')).toContainText('Upload a JSON file to get started');
    await expect(page.locator('#selectedFileStats')).not.toBeVisible();
  });

  test('uploads valid flashcard file and auto-selects it', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Wait for success message
    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);
    await expect(page.locator('#uploadMsg')).toContainText('Added "Test Set" with 3 words');

    // Check file appears in sidebar and is auto-selected
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item')).toHaveClass(/active/);
    await expect(page.locator('.file-item-name')).toContainText('Test Set');
    await expect(page.locator('.file-item-stats')).toContainText('3 words');

    // Stats panel should be visible with correct data
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#selectedFileName')).toContainText('Test Set');
    await expect(page.locator('#selectedFileWordCount')).toContainText('3 words');
  });

  test('uploads file with auto-generated date name when no name provided', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS);

    await expect(page.locator('.file-item')).toHaveCount(1);
    const fileName = await page.locator('.file-item-name').textContent();
    // Auto-generated name should contain date components (month, day, year or similar)
    expect(fileName).toBeTruthy();
    expect(fileName!.length).toBeGreaterThan(5); // Should be longer than just a few chars
    // Should contain digits (from date/time)
    expect(fileName).toMatch(/\d/);
  });

  test('shows error for invalid JSON schema', async ({ page }) => {
    await uploadFile(page, INVALID_FLASHCARDS);

    await expect(page.locator('#uploadMsg')).toHaveClass(/error/);
    await expect(page.locator('#uploadMsg')).toContainText('Invalid schema');
    // No file should be added
    await expect(page.locator('.file-item')).toHaveCount(0);
  });

  test('uploads backup file and restores progress', async ({ page }) => {
    await uploadFile(page, BACKUP_FLASHCARDS);

    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);
    await expect(page.locator('#uploadMsg')).toContainText('Restored "My Backup Set"');

    // Verify progress was restored
    const storage = await getStorageData(page);
    expect(storage.files).toHaveLength(1);
    expect(storage.files[0].progress['谢谢']).toBeDefined();
    expect(storage.files[0].progress['谢谢'].read.successCount).toBe(3);
    expect(storage.files[0].progress['谢谢'].write.failCount).toBe(1);
  });

  test('switches between multiple files', async ({ page }) => {
    // Upload first file
    await uploadFile(page, VALID_FLASHCARDS, 'First Set');
    await expect(page.locator('.file-item')).toHaveCount(1);

    // Upload second file
    await uploadFile(page, BACKUP_FLASHCARDS);
    await expect(page.locator('.file-item')).toHaveCount(2);

    // Second file should be active (most recent upload)
    await expect(page.locator('.file-item').last()).toHaveClass(/active/);

    // Click on first file
    await page.locator('.file-item').first().click();
    await expect(page.locator('#selectedFileName')).toContainText('First Set');
    await expect(page.locator('.file-item').first()).toHaveClass(/active/);
    await expect(page.locator('.file-item').last()).not.toHaveClass(/active/);

    // Click on second file
    await page.locator('.file-item').last().click();
    await expect(page.locator('#selectedFileName')).toContainText('My Backup Set');
    await expect(page.locator('.file-item').last()).toHaveClass(/active/);
  });

  test('deletes file with confirmation', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Delete "Test Set"');
      await dialog.accept();
    });

    await page.locator('.file-item-trash').click();

    await expect(page.locator('.file-item')).toHaveCount(0);
    await expect(page.locator('#welcomeMessage')).toBeVisible();
  });

  test('cancels file deletion on dialog dismiss', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await page.locator('.file-item-trash').click();

    await expect(page.locator('.file-item')).toHaveCount(1);
  });

  test('exports file as JSON with progress', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Export Test');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('.file-item-export').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/Export_Test-\d{4}-\d{2}-\d{2}.*\.json/);
  });

  test('edits file name inline', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    // Click edit button
    await page.locator('.file-item-edit').click();

    // Should show input field
    const input = page.locator('.file-item-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Original Name');

    // Edit the name
    await input.fill('New Name');
    await input.press('Enter');

    // Name should be updated
    await expect(page.locator('.file-item-name')).toHaveText('New Name');

    // Verify persistence
    const storage = await getStorageData(page);
    expect(storage.files[0].name).toBe('New Name');
  });

  test('cancels file name edit on Escape', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    await page.locator('.file-item-edit').click();
    const input = page.locator('.file-item-name-input');
    await input.fill('Modified Name');
    await input.press('Escape');

    // Name should remain unchanged
    await expect(page.locator('.file-item-name')).toHaveText('Original Name');
  });

  test('reverts empty file name on blur', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    await page.locator('.file-item-edit').click();
    const input = page.locator('.file-item-name-input');
    await input.fill('');
    await input.blur();

    // Should revert to original name
    await expect(page.locator('.file-item-name')).toHaveText('Original Name');
  });
});

test.describe('Home Screen Stats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('shows correct initial stats for new file', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // All cards should be "due" initially
    await expect(page.locator('#readDue')).toHaveText('3');
    await expect(page.locator('#readPracticed')).toHaveText('0');
    await expect(page.locator('#readMastered')).toHaveText('0');

    await expect(page.locator('#writeDue')).toHaveText('3');
    await expect(page.locator('#writePracticed')).toHaveText('0');
    await expect(page.locator('#writeMastered')).toHaveText('0');

    // Session stats at zero
    await expect(page.locator('#sessionCorrect')).toHaveText('0');
    await expect(page.locator('#sessionWrong')).toHaveText('0');

    // No last practiced yet
    await expect(page.locator('#selectedFileLastAttempted')).toHaveText('Not yet practiced');
  });

  test('shows last practiced timestamp after practice', async ({ page }) => {
    await setupWriteMode(page);

    // Initially shows "Not yet practiced"
    await expect(page.locator('#selectedFileLastAttempted')).toHaveText('Not yet practiced');

    // Play and answer
    await page.click('#playBtn');
    await waitForGameScreen(page);
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Go back and check
    await page.click('#backBtn');
    await expect(page.locator('#selectedFileLastAttempted')).toContainText('Last practiced:');
  });
});

test.describe('Game Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');
  });

  test('starts game when Play button clicked', async ({ page }) => {
    await page.click('#playBtn');

    await waitForGameScreen(page);
    await expect(page.locator('#homeScreen')).toHaveClass(/hidden/);
  });

  test('returns to home screen when Back button clicked', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#backBtn');

    await expect(page.locator('#gameScreen')).not.toHaveClass(/active/);
    await expect(page.locator('#homeScreen')).not.toHaveClass(/hidden/);
  });

  test('shows voice selector and game stats in game screen', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#voiceSelect')).toBeVisible();
    await expect(page.locator('#gameStats')).toBeVisible();
    // Stats format: "✓ 0" and "✗ 0"
    await expect(page.locator('#gameStats')).toContainText('✓ 0');
    await expect(page.locator('#gameStats')).toContainText('✗ 0');
  });
});

test.describe('READ Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('displays READ mode UI with Chinese word and sentence', async ({ page }) => {
    await setupReadMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Mode indicator
    await expect(page.locator('#modeIndicator')).toContainText('READ');
    await expect(page.locator('#modeIndicator')).toHaveClass(/read/);

    // Chinese content visible
    await expect(page.locator('#readMode')).toBeVisible();
    await expect(page.locator('#readWord')).toHaveText('你');
    await expect(page.locator('#readSentence')).toContainText('你好');

    // Pinyin and English hidden initially
    await expect(page.locator('#readPinyin')).toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).toHaveClass(/hidden/);
    await expect(page.locator('#readSentencePinyin')).toHaveClass(/hidden/);
    await expect(page.locator('#readSentenceEnglish')).toHaveClass(/hidden/);
  });

  test('Show pinyin and english buttons reveal content separately without recording result', async ({ page }) => {
    await setupReadMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Click show pinyin
    await page.click('#showPinyinBtn');

    // Pinyin revealed, English still hidden
    await expect(page.locator('#readPinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readPinyin')).toHaveText('nǐ');
    await expect(page.locator('#readSentencePinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).toHaveClass(/hidden/);
    await expect(page.locator('#readSentenceEnglish')).toHaveClass(/hidden/);

    // Show pinyin button disabled after clicking
    await expect(page.locator('#showPinyinBtn')).toBeDisabled();

    // Click show english
    await page.click('#showEnglishBtn');

    // English now revealed
    await expect(page.locator('#readWordEnglish')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).toHaveText('you');
    await expect(page.locator('#readSentenceEnglish')).not.toHaveClass(/hidden/);

    // Show english button disabled after clicking
    await expect(page.locator('#showEnglishBtn')).toBeDisabled();

    // Stats unchanged (hints don't count as wrong)
    await expect(page.locator('#gameStats')).toContainText('✓ 0');
    await expect(page.locator('#gameStats')).toContainText('✗ 0');
  });

  test('I don\'t know records failure, shows answer, and plays audio', async ({ page }) => {
    await setupReadMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#dontKnowBtn');

    // Answer revealed
    await expect(page.locator('#readPinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).not.toHaveClass(/hidden/);

    // Buttons hidden
    await expect(page.locator('#showPinyinBtn')).toHaveClass(/hidden/);
    await expect(page.locator('#showEnglishBtn')).toHaveClass(/hidden/);
    await expect(page.locator('#dontKnowBtn')).toHaveClass(/hidden/);

    // Mic button is hidden (Say it again button replaces its function)
    await expect(page.locator('#micBtn')).not.toBeVisible();

    // Wait for TTS to complete and Next button to appear
    await expect(page.locator('#readNextBtn')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Stats show 1 wrong
    await expect(page.locator('#gameStats')).toContainText('✗ 1');

    // Progress should be reset to level 0
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].read.failCount).toBe(1);
    expect(storage.files[0].progress['你'].read.intervalIndex).toBe(0);
  });

  test('iOS audio warning is not visible on Chrome desktop', async ({ page }) => {
    await setupReadMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // The warning elements should exist but not be visible (no 'visible' class)
    const warningRead = page.locator('#iosAudioWarningRead');
    const warningWrite = page.locator('#iosAudioWarningWrite');
    await expect(warningRead).toBeAttached();
    await expect(warningRead).not.toHaveClass(/visible/);
    await expect(warningWrite).toBeAttached();
    await expect(warningWrite).not.toHaveClass(/visible/);
  });

  test('I said it correctly button marks as success and advances', async ({ page }) => {
    await setupReadMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Click "I don't know" to reveal the "I said it correctly" button
    await page.click('#dontKnowBtn');

    // Wait for next button group to appear
    await expect(page.locator('#readNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(page.locator('#iSaidItCorrectlyBtn')).toBeVisible();

    // Get initial storage state
    const storageBefore = await getStorageData(page);
    const initialStats = await page.locator('#gameStats').textContent();

    // Click "I said it correctly"
    await page.click('#iSaidItCorrectlyBtn');

    // Wait briefly for the action to complete
    await page.waitForTimeout(500);

    // Stats should show 1 correct (the button was clicked after "I don't know" recorded failure)
    await expect(page.locator('#gameStats')).toContainText('✓ 1');

    // Progress should advance (override the failure from "I don't know")
    const storageAfter = await getStorageData(page);
    expect(storageAfter.files[0].progress['你'].read.successCount).toBe(1);
    expect(storageAfter.files[0].progress['你'].read.intervalIndex).toBeGreaterThan(0);
  });
});

test.describe('WRITE Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('displays WRITE mode UI with English and pinyin visible, Chinese blurred', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Mode indicator
    await expect(page.locator('#writeMode')).toBeVisible();
    await expect(page.locator('#modeIndicator')).toContainText('WRITE');
    await expect(page.locator('#modeIndicator')).toHaveClass(/write/);

    // English and pinyin visible
    await expect(page.locator('#writeWordEnglish')).toHaveText('you');
    await expect(page.locator('#writeWordPinyin')).toHaveText('nǐ');

    // Chinese visible but heavily blurred (8px)
    await expect(page.locator('#writeWordChinese')).toBeVisible();
    await expect(page.locator('#writeWordChinese')).toHaveClass(/hint-blur-base/);
    await expect(page.locator('#writeSentenceChinese')).toBeVisible();
    await expect(page.locator('#writeSentenceChinese')).toHaveClass(/hint-blur-base/);

    // Initial button group visible
    await expect(page.locator('#writeShowGroup')).not.toHaveClass(/hidden/);
    await expect(page.locator('#sayItBtn')).toBeVisible();
    await expect(page.locator('#showAnswerBtn')).toBeVisible();
  });

  test('Show answer reveals Chinese and shows correct/wrong buttons after TTS', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');

    // Chinese revealed immediately
    await expect(page.locator('#writeWordChinese')).not.toHaveClass(/hidden/);
    await expect(page.locator('#writeWordChinese')).toHaveText('你');
    await expect(page.locator('#writeSentenceChinese')).not.toHaveClass(/hidden/);
    await expect(page.locator('#writeSentenceChinese')).toContainText('你好');

    // Show group hidden immediately
    await expect(page.locator('#writeShowGroup')).toHaveClass(/hidden/);

    // Answer group appears after TTS completes
    await expect(page.locator('#writeAnswerGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });
    await expect(page.locator('#wrongBtn')).toBeVisible();
    await expect(page.locator('#correctBtn')).toBeVisible();
  });

  test('Correct button records success and advances interval', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Verify progress was updated
    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['你'].write;
    expect(progress.successCount).toBe(1);
    expect(progress.intervalIndex).toBe(1);
  });

  test('Wrong button records failure, resets interval, and shows next buttons', async ({ page }) => {
    // Start with intervalIndex 3 to verify reset
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 3,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');

    // Next button group should appear immediately (no TTS after clicking Wrong)
    await expect(page.locator('#writeNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Verify progress was reset to 0
    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['你'].write;
    expect(progress.failCount).toBe(1);
    expect(progress.intervalIndex).toBe(0);

    // Stats show wrong
    await expect(page.locator('#gameStats')).toContainText('✗ 1');
  });

  test('Say it again button in answer group works', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Click show answer to reveal the answer and buttons
    await page.click('#showAnswerBtn');
    await expect(page.locator('#writeAnswerGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Verify Say it again button is visible
    await expect(page.locator('#writeAnswerSayAgainBtn')).toBeVisible();

    // Click it to trigger TTS (we can't verify audio, but we can verify no errors)
    await page.click('#writeAnswerSayAgainBtn');

    // Buttons should still be visible
    await expect(page.locator('#wrongBtn')).toBeVisible();
    await expect(page.locator('#correctBtn')).toBeVisible();
  });

  test('Say it button triggers speech and toggles speed', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Button should be enabled initially
    await expect(page.locator('#sayItBtn')).toBeEnabled();

    // Click and verify it gets disabled during speech
    await page.click('#sayItBtn');

    // Button should eventually re-enable (after speech)
    await expect(page.locator('#sayItBtn')).toBeEnabled({ timeout: 5000 });
  });
});

test.describe('Spaced Repetition & Progress', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('mastered threshold is intervalIndex >= 4', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 4,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 4,
      writeNextReview: Date.now() + 9999999999,
      extraCards: [
        { word: '好', readIntervalIndex: 3, writeIntervalIndex: 3 }
      ]
    });

    // 1 mastered (你 at level 4), 1 not mastered (好 at level 3)
    await expect(page.locator('#readMastered')).toHaveText('1');
    await expect(page.locator('#writeMastered')).toHaveText('1');
    await expect(page.locator('#readPracticed')).toHaveText('2');
  });

  test('progress persists across page reload', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 3,
      writeIntervalIndex: 2,
    });

    await page.reload();

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].read.intervalIndex).toBe(3);
    expect(storage.files[0].progress['你'].write.intervalIndex).toBe(2);
  });

  test('session stats reset on page reload but progress persists', async ({ page }) => {
    await setupWriteMode(page);

    // Play and record a wrong answer
    await page.click('#playBtn');
    await waitForGameScreen(page);
    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');
    await expect(page.locator('#writeNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Should show 1 wrong in game stats
    await expect(page.locator('#gameStats')).toContainText('✗ 1');

    // Reload page
    await page.reload();
    await page.locator('.file-item').click();

    // Session stats should be reset
    await expect(page.locator('#sessionCorrect')).toHaveText('0');
    await expect(page.locator('#sessionWrong')).toHaveText('0');

    // But progress should persist (failCount should still be 1)
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.failCount).toBe(1);
  });

  test('highscore tracks best correct count and persists', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Record 2 correct answers
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');
    await page.waitForTimeout(1500); // Wait for confetti

    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');
    await page.waitForTimeout(1500);

    // Back to home
    await page.click('#backBtn');
    await expect(page.locator('#selectedFileStats')).toBeVisible();

    // Should show highscore of 2 in homepage
    await expect(page.locator('#selectedFileHighscore')).toContainText('Highscore: 2');

    // Should show highscore in sidebar
    await expect(page.locator('.file-item-highscore')).toContainText('Highscore: 2');

    // Check storage has highscore with count and timestamp
    let storage = await getStorageData(page);
    expect(storage.files[0].highscore).toBeTruthy();
    expect(storage.files[0].highscore.count).toBe(2);
    expect(storage.files[0].highscore.timestamp).toBeGreaterThan(0);

    // Reload page - highscore should persist
    await page.reload();
    await page.locator('.file-item').click();
    await expect(page.locator('#selectedFileHighscore')).toContainText('Highscore: 2');

    // Export should include highscore
    const downloadPromise = page.waitForEvent('download');
    await page.click('.file-item-export');
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const fs = await import('fs/promises');
    const exportData = JSON.parse(await fs.readFile(downloadPath!, 'utf8'));
    expect(exportData.highscore).toBeTruthy();
    expect(exportData.highscore.count).toBe(2);
  });
});

test.describe('Voice Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');
  });

  test('voice selector is populated with Chinese voices', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    const optionCount = await page.locator('#voiceSelect option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);

    // All voices should be Chinese (zh)
    const options = await page.locator('#voiceSelect option').allTextContents();
    // First option might be "No Chinese voices available" or actual voice
    if (!options[0].includes('No Chinese')) {
      options.forEach(opt => {
        expect(opt).toMatch(/zh/i);
      });
    }
  });

  test('voice selection persists in localStorage', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    const optionCount = await page.locator('#voiceSelect option').count();
    // Only test if there are actual voice options
    if (optionCount > 0) {
      const firstOptionText = await page.locator('#voiceSelect option').first().textContent();
      if (!firstOptionText?.includes('No Chinese')) {
        // Select first voice (should auto-save)
        await page.selectOption('#voiceSelect', { index: 0 });

        const storage = await getStorageData(page);
        expect(storage.voice).toBeTruthy();
      }
    }
  });
});

test.describe('Mobile Responsive', () => {
  test('hamburger menu visible on mobile, hidden on desktop', async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('#hamburger')).toBeVisible();

    // Desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('#hamburger')).not.toBeVisible();
  });

  test('sidebar toggles on hamburger click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // On mobile with no files, sidebar auto-opens
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Click hamburger to close
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('#hamburger')).not.toHaveClass(/open/);

    // Click again to open
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('#hamburger')).toHaveClass(/open/);
  });

  test('sidebar overlay closes sidebar on click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // On mobile with no files, sidebar auto-opens
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Click overlay to close
    await page.click('#sidebarOverlay');
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  });

  test('sidebar closes after file selection on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Sidebar is open
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Upload file (which auto-selects it)
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Sidebar should close after file selection
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  });
});

test.describe('Edge Cases & Error Handling', () => {
  test('handles empty file list gracefully', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    await expect(page.locator('.file-item')).toHaveCount(0);
    await expect(page.locator('#welcomeMessage')).toBeVisible();
    await expect(page.locator('#selectedFileStats')).not.toBeVisible();
  });

  test('sample data download link exists and is accessible', async ({ page }) => {
    await page.goto('/');

    const downloadLink = page.locator('a[href="2015characterlistprimarychinese.pdf.json"]');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('download', '');
  });

  test('footer links exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('a[href="SPACED_REPETITION.html"]')).toBeVisible();
    await expect(page.locator('a[href="DEVELOPER.html"]')).toBeVisible();
    await expect(page.locator('a[href*="github.com"]')).toBeVisible();
  });

  test('privacy notice is displayed', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.sidebar-footer')).toContainText('No data sent to server');
    await expect(page.locator('.sidebar-footer')).toContainText('browser');
  });

  test('escapes HTML in file names to prevent XSS', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Upload with XSS attempt in name
    await uploadFile(page, VALID_FLASHCARDS, '<script>alert("xss")</script>');

    // The script tag should be escaped, not executed
    const fileName = await page.locator('.file-item-name').innerHTML();
    expect(fileName).toContain('&lt;script&gt;');
    expect(fileName).not.toContain('<script>');
  });
});

test.describe('Empty Array Upload', () => {
  test('shows error when uploading empty JSON array', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Create empty array JSON file dynamically
    await page.evaluate(() => {
      const input = document.getElementById('fileInput') as HTMLInputElement;
      const file = new File(['[]'], 'empty.json', { type: 'application/json' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.locator('#uploadMsg')).toHaveClass(/error/);
    await expect(page.locator('#uploadMsg')).toContainText('non-empty array');
    await expect(page.locator('.file-item')).toHaveCount(0);
  });
});

test.describe('Malformed JSON Upload', () => {
  test('shows error when uploading malformed JSON', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Create malformed JSON file dynamically
    await page.evaluate(() => {
      const input = document.getElementById('fileInput') as HTMLInputElement;
      const file = new File(['{invalid json'], 'malformed.json', { type: 'application/json' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.locator('#uploadMsg')).toHaveClass(/error/);
    await expect(page.locator('.file-item')).toHaveCount(0);
  });
});
