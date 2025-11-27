import { test, expect, Page } from '@playwright/test';
import path from 'path';

const VALID_FLASHCARDS = path.join(__dirname, 'fixtures/valid-flashcards.json');
const INVALID_FLASHCARDS = path.join(__dirname, 'fixtures/invalid-missing-fields.json');
const BACKUP_FLASHCARDS = path.join(__dirname, 'fixtures/backup-flashcards.json');
const BACKUP_OLD_FORMAT = path.join(__dirname, 'fixtures/backup-old-format.json');
const BACKUP_NEW_FORMAT = path.join(__dirname, 'fixtures/backup-new-format.json');

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

  test('pre-populates Sample file when localStorage is empty', async ({ page }) => {
    // Sample file should be auto-created and auto-selected
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
    await expect(page.locator('.file-item-stats')).toContainText('50 words');

    // Sample is auto-selected, so stats panel is visible (not welcome message)
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#selectedFileName')).toContainText('Sample');
    await expect(page.locator('#welcomeMessage')).not.toBeVisible();
  });

  test('Sample file is playable', async ({ page }) => {
    // Click on Sample file
    await page.locator('.file-item').click();

    // Should show stats panel
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#selectedFileName')).toContainText('Sample');
    await expect(page.locator('#selectedFileWordCount')).toContainText('50 words');

    // Start practice should work
    await page.click('#playBtn');
    await waitForGameScreen(page);
  });

  test('uploads valid flashcard file and auto-selects it', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Wait for success message
    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);
    await expect(page.locator('#uploadMsg')).toContainText('Added "Test Set" with 3 words');

    // Check file appears in sidebar and is auto-selected (now 2 files: Sample + uploaded)
    await expect(page.locator('.file-item')).toHaveCount(2);
    await expect(page.locator('.file-item.active')).toHaveCount(1);
    await expect(page.locator('.file-item.active .file-item-name')).toContainText('Test Set');
    await expect(page.locator('.file-item.active .file-item-stats')).toContainText('3 words');

    // Stats panel should be visible with correct data
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#selectedFileName')).toContainText('Test Set');
    await expect(page.locator('#selectedFileWordCount')).toContainText('3 words');
  });

  test('uploads file with auto-generated date name when no name provided', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS);

    // Now 2 files: Sample + uploaded
    await expect(page.locator('.file-item')).toHaveCount(2);
    // The uploaded file should be active (selected) and have an auto-generated name
    const fileName = await page.locator('.file-item.active .file-item-name').textContent();
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
    // Only Sample file should exist (no new file added)
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
  });

  test('uploads backup file and restores progress', async ({ page }) => {
    await uploadFile(page, BACKUP_FLASHCARDS);

    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);
    await expect(page.locator('#uploadMsg')).toContainText('Restored "My Backup Set"');

    // Verify progress was restored (2 files: Sample + restored backup)
    const storage = await getStorageData(page);
    expect(storage.files).toHaveLength(2);
    const backupFile = storage.files.find((f: any) => f.name === 'My Backup Set');
    expect(backupFile).toBeDefined();
    expect(backupFile.progress['谢谢']).toBeDefined();
    expect(backupFile.progress['谢谢'].read.successCount).toBe(3);
    expect(backupFile.progress['谢谢'].write.failCount).toBe(1);
  });

  test('switches between multiple files', async ({ page }) => {
    // Upload first file (now 2 files total: Sample + uploaded)
    await uploadFile(page, VALID_FLASHCARDS, 'First Set');
    await expect(page.locator('.file-item')).toHaveCount(2);

    // Upload second file (now 3 files total)
    await uploadFile(page, BACKUP_FLASHCARDS);
    await expect(page.locator('.file-item')).toHaveCount(3);

    // Last uploaded file should be active (most recent upload)
    await expect(page.locator('.file-item').last()).toHaveClass(/active/);

    // Click on first file (Sample)
    await page.locator('.file-item').first().click();
    await expect(page.locator('#selectedFileName')).toContainText('Sample');
    await expect(page.locator('.file-item').first()).toHaveClass(/active/);
    await expect(page.locator('.file-item').last()).not.toHaveClass(/active/);

    // Click on last file (My Backup Set)
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

    // Delete the uploaded Test Set (the active one)
    await page.locator('.file-item.active .file-item-trash').click();

    // Should be back to just Sample file
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
  });

  test('cancels file deletion on dialog dismiss', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    // Try to delete but cancel
    await page.locator('.file-item.active .file-item-trash').click();

    // Should still have 2 files (Sample + Test Set)
    await expect(page.locator('.file-item')).toHaveCount(2);
  });

  test('exports file as JSON with progress', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Export Test');

    const downloadPromise = page.waitForEvent('download');
    // Export the active file (the one just uploaded)
    await page.locator('.file-item.active .file-item-export').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/Export_Test-\d{4}-\d{2}-\d{2}.*\.json/);
  });

  test('edits file name inline', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    // Click edit button on the active file
    await page.locator('.file-item.active .file-item-edit').click();

    // Should show input field
    const input = page.locator('.file-item-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Original Name');

    // Edit the name
    await input.fill('New Name');
    await input.press('Enter');

    // Name should be updated
    await expect(page.locator('.file-item.active .file-item-name')).toHaveText('New Name');

    // Verify persistence
    const storage = await getStorageData(page);
    const editedFile = storage.files.find((f: any) => f.name === 'New Name');
    expect(editedFile).toBeDefined();
  });

  test('cancels file name edit on Escape', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    await page.locator('.file-item.active .file-item-edit').click();
    const input = page.locator('.file-item-name-input');
    await input.fill('Modified Name');
    await input.press('Escape');

    // Name should remain unchanged
    await expect(page.locator('.file-item.active .file-item-name')).toHaveText('Original Name');
  });

  test('reverts empty file name on blur', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Original Name');

    await page.locator('.file-item.active .file-item-edit').click();
    const input = page.locator('.file-item-name-input');
    await input.fill('');
    await input.blur();

    // Should revert to original name
    await expect(page.locator('.file-item.active .file-item-name')).toHaveText('Original Name');
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

    // All cards should be "due" initially (3 cards × 2 modes = 6 total)
    await expect(page.locator('#totalDue')).toHaveText('6');
    await expect(page.locator('#totalPracticed')).toHaveText('0');
    await expect(page.locator('#totalMastered')).toHaveText('0');

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

  test('shows Show hanyupinyin button for level 0-1 cards', async ({ page }) => {
    // Level 1 card (intervalIndex = 1)
    await setupTestFile(page, {
      readIntervalIndex: 1,
      readNextReview: 0,
      writeIntervalIndex: 7,
      writeNextReview: Date.now() + 9999999999,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hanyupinyin button should be visible
    await expect(page.locator('#showPinyinBtn')).toBeVisible();
    await expect(page.locator('#showPinyinBtn')).not.toHaveClass(/hidden/);
  });

  test('hides Show hanyupinyin button for level 2+ cards', async ({ page }) => {
    // Level 2 card (intervalIndex = 2)
    await setupTestFile(page, {
      readIntervalIndex: 2,
      readNextReview: 0,
      writeIntervalIndex: 7,
      writeNextReview: Date.now() + 9999999999,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hanyupinyin button should be hidden
    await expect(page.locator('#showPinyinBtn')).toHaveClass(/hidden/);
  });

  test('hides Show hanyupinyin button for level 5 cards', async ({ page }) => {
    // Level 5 card (intervalIndex = 5)
    await setupTestFile(page, {
      readIntervalIndex: 5,
      readNextReview: 0,
      writeIntervalIndex: 7,
      writeNextReview: Date.now() + 9999999999,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hanyupinyin button should be hidden
    await expect(page.locator('#showPinyinBtn')).toHaveClass(/hidden/);
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

  test('Wrong button records failure, resets interval, and advances to next card', async ({ page }) => {
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

  test('shows Show hint button for level 0-1 cards', async ({ page }) => {
    // Level 1 card (intervalIndex = 1)
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 1,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hint button should be visible
    await expect(page.locator('#showHintBtn')).toBeVisible();
    await expect(page.locator('#showHintBtn')).not.toHaveClass(/hidden/);
  });

  test('hides Show hint button for level 2+ cards', async ({ page }) => {
    // Level 2 card (intervalIndex = 2)
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 2,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hint button should be hidden
    await expect(page.locator('#showHintBtn')).toHaveClass(/hidden/);
  });

  test('hides Show hint button for level 5 cards', async ({ page }) => {
    // Level 5 card (intervalIndex = 5)
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 5,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Show hint button should be hidden
    await expect(page.locator('#showHintBtn')).toHaveClass(/hidden/);
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

    // Combined stats: 你 at level 4 (mastered), 好 at level 3 (not mastered)
    // totalMastered = 1 (read) + 1 (write) = 2
    // totalPracticed = 2 (read) + 2 (write) = 4
    await expect(page.locator('#totalMastered')).toHaveText('2');
    await expect(page.locator('#totalPracticed')).toHaveText('4');
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

    // Should show highscore in sidebar (main area highscore was removed)
    await expect(page.locator('.file-item-highscore')).toContainText('Highscore: 2');

    // Check storage has highscore with count and timestamp
    let storage = await getStorageData(page);
    expect(storage.files[0].highscore).toBeTruthy();
    expect(storage.files[0].highscore.count).toBe(2);
    expect(storage.files[0].highscore.timestamp).toBeGreaterThan(0);

    // Reload page - highscore should persist in sidebar
    await page.reload();
    await page.locator('.file-item').click();
    await expect(page.locator('.file-item-highscore')).toContainText('Highscore: 2');

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

    // Sidebar starts closed (Sample is auto-selected, so no auto-open)
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);

    // Click hamburger to open
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('#hamburger')).toHaveClass(/open/);

    // Click again to close
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('#hamburger')).not.toHaveClass(/open/);
  });

  test('sidebar overlay closes sidebar on click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Open sidebar first
    await page.click('#hamburger');
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

    // Open sidebar first
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Upload file (which auto-selects it)
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Sidebar should close after file selection
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  });
});

test.describe('Edge Cases & Error Handling', () => {
  test('pre-populates Sample when localStorage is cleared', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Sample file should be auto-created and auto-selected when localStorage is empty
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#welcomeMessage')).not.toBeVisible();
  });

  test('sample data download link exists and is accessible', async ({ page }) => {
    await page.goto('/');

    const downloadLink = page.locator('a[href="2015characterlistprimarychinese.pdf.json"]');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('download', '');
  });

  test('footer links exist', async ({ page }) => {
    await page.goto('/');

    // Check main footer links specifically
    await expect(page.locator('.main-footer a[href="SPACED_REPETITION.html"]')).toBeVisible();
    await expect(page.locator('.main-footer a[href="DEVELOPER.html"]')).toBeVisible();
    await expect(page.locator('.main-footer a[href*="github.com"]')).toBeVisible();
  });

  test('privacy notice is displayed', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.main-footer')).toContainText('No data sent to server');
    await expect(page.locator('.main-footer')).toContainText('browser');
  });

  test('escapes HTML in file names to prevent XSS', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // Upload with XSS attempt in name
    await uploadFile(page, VALID_FLASHCARDS, '<script>alert("xss")</script>');

    // The script tag should be escaped, not executed (check the active file which is the uploaded one)
    const fileName = await page.locator('.file-item.active .file-item-name').innerHTML();
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
    // Only Sample file should exist (no new file added)
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
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
    // Only Sample file should exist (no new file added)
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Sample');
  });
});

test.describe('Session Goal Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('session goal dropdown defaults to recommended value based on reviews due', async ({ page }) => {
    // Setup file with 45 reviews due (should recommend 20)
    await page.evaluate(() => {
      const flashcards = Array.from({ length: 25 }, (_, i) => ({
        word: `字${i}`,
        word_hanyupinyin: 'pinyin',
        word_english: 'word',
        sentence: '句子',
        sentence_hanyupinyin: 'pinyin',
        sentence_english: 'sentence'
      }));
      const progress: Record<string, any> = {};
      flashcards.forEach(card => {
        progress[card.word] = {
          read: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 },
          write: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 }
        };
      });
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards,
        progress
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    // 25 cards × 2 modes = 50 due, should recommend 20
    await expect(page.locator('#sessionGoalSelect')).toHaveValue('20');
    await expect(page.locator('#sessionRecommendation')).toContainText('20 cards');
  });

  test('session progress bar displays and updates during game', async ({ page }) => {
    await setupWriteMode(page);

    // Manually set goal to 5 for testing
    await page.selectOption('#sessionGoalSelect', '5');
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Progress bar should be visible
    await expect(page.locator('#sessionProgress')).toBeVisible();
    await expect(page.locator('#sessionProgressText')).toHaveText('0/5 cards');

    // Check progress bar starts at 0%
    const progressBar = page.locator('#sessionProgressBar');
    const widthBefore = await progressBar.evaluate(el => el.style.width);
    expect(widthBefore).toBe('0%');

    // Answer one card
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');
    await page.waitForTimeout(500);

    // Progress should update
    await expect(page.locator('#sessionProgressText')).toHaveText('1/5 cards');
    const widthAfter = await progressBar.evaluate(el => el.style.width);
    expect(widthAfter).toBe('20%');
  });

  test('session complete modal appears when goal reached', async ({ page }) => {
    await setupWriteMode(page);

    // Set session goal to 1 for quick test
    await page.selectOption('#sessionGoalSelect', '5');
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Answer 5 cards
    for (let i = 0; i < 5; i++) {
      await page.click('#showAnswerBtn');
      await page.click('#correctBtn');
      await page.waitForTimeout(500);
    }

    // Modal should appear after slight delay
    await expect(page.locator('#sessionCompleteModal')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#sessionCompleteModal')).toContainText('Session Complete');
    await expect(page.locator('#modalCardsCompleted')).toHaveText('5');
  });

  test('End Session button resets session stats to 0/0', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Record some answers
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');
    await page.waitForTimeout(1500); // Wait for auto-advance

    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');
    await page.waitForTimeout(500); // Wait for stats update

    // Stats should show 1 correct, 1 wrong
    await expect(page.locator('#gameStats')).toContainText('✓ 1');
    await expect(page.locator('#gameStats')).toContainText('✗ 1');

    // Click Back to end session
    await page.click('#backBtn');

    // Return to home screen
    await expect(page.locator('#selectedFileStats')).toBeVisible();

    // Session stats should be reset to 0/0
    await expect(page.locator('#sessionCorrect')).toHaveText('0');
    await expect(page.locator('#sessionWrong')).toHaveText('0');
  });

  test('End Session from modal resets session stats to 0/0', async ({ page }) => {
    await setupWriteMode(page);

    // Set goal to 1
    await page.selectOption('#sessionGoalSelect', '5');
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Complete 5 cards
    for (let i = 0; i < 5; i++) {
      await page.click('#showAnswerBtn');
      await page.click('#correctBtn');
      await page.waitForTimeout(500);
    }

    // Modal appears
    await expect(page.locator('#sessionCompleteModal')).toBeVisible({ timeout: 3000 });

    // Click End Session
    await page.click('#endSessionBtn');

    // Should be back at home
    await expect(page.locator('#selectedFileStats')).toBeVisible();

    // Session stats should be reset
    await expect(page.locator('#sessionCorrect')).toHaveText('0');
    await expect(page.locator('#sessionWrong')).toHaveText('0');
  });

  test('Session complete modal shows continue options directly', async ({ page }) => {
    await setupWriteMode(page);

    await page.selectOption('#sessionGoalSelect', '5');
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Complete 5 cards
    for (let i = 0; i < 5; i++) {
      await page.click('#showAnswerBtn');
      await page.click('#correctBtn');
      await page.waitForTimeout(500);
    }

    await expect(page.locator('#sessionCompleteModal')).toBeVisible({ timeout: 3000 });

    // All continue options should be visible directly (no 2-step flow)
    await expect(page.locator('#endSessionBtn')).toBeVisible();
    await expect(page.locator('[data-continue="5"]')).toBeVisible();
    await expect(page.locator('[data-continue="10"]')).toBeVisible();
    await expect(page.locator('[data-continue="15"]')).toBeVisible();

    // Click "5 more"
    await page.click('[data-continue="5"]');

    // Modal should close and game should continue
    await expect(page.locator('#sessionCompleteModal')).not.toBeVisible();
    await expect(page.locator('#gameScreen')).toHaveClass(/active/);

    // Progress should now show 5/10 cards
    await expect(page.locator('#sessionProgressText')).toHaveText('5/10 cards');
  });

  test('No limit mode hides progress bar and never shows modal', async ({ page }) => {
    await setupWriteMode(page);

    await page.selectOption('#sessionGoalSelect', '999999');
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Progress bar should be hidden
    await expect(page.locator('#sessionProgress')).not.toBeVisible();

    // Answer one card (which would trigger modal if goal was 1)
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');
    await page.waitForTimeout(2000); // Wait longer than modal delay

    // Modal should never appear in no-limit mode
    await expect(page.locator('#sessionCompleteModal')).not.toBeVisible();
  });

  test('due count shows correct value in stats', async ({ page }) => {
    // Setup with 5 cards, all due
    await page.evaluate(() => {
      const flashcards = Array.from({ length: 5 }, (_, i) => ({
        word: `字${i}`,
        word_hanyupinyin: 'pinyin',
        word_english: 'word',
        sentence: '句子',
        sentence_hanyupinyin: 'pinyin',
        sentence_english: 'sentence'
      }));
      const progress: Record<string, any> = {};
      flashcards.forEach(card => {
        progress[card.word] = {
          read: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 },
          write: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 }
        };
      });
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards,
        progress
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    // 5 cards × 2 modes = 10 due (shown in combined stats)
    await expect(page.locator('#totalDue')).toHaveText('10');
  });

  test('recommendation text adjusts based on backlog size', async ({ page }) => {
    // Test 0 due - should recommend 10 cards
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 7,
      writeNextReview: Date.now() + 9999999999,
    });
    await expect(page.locator('#sessionRecommendation')).toContainText('Recommended: 10 cards');
    await expect(page.locator('#sessionGoalSelect')).toHaveValue('10');

    // Test high backlog (>50 due) by creating many cards
    await clearStorage(page);
    await page.evaluate(() => {
      const flashcards = Array.from({ length: 30 }, (_, i) => ({
        word: `字${i}`,
        word_hanyupinyin: 'pinyin',
        word_english: 'word',
        sentence: '句子',
        sentence_hanyupinyin: 'pinyin',
        sentence_english: 'sentence'
      }));
      const progress: Record<string, any> = {};
      flashcards.forEach(card => {
        progress[card.word] = {
          read: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 },
          write: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 0 }
        };
      });
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards,
        progress
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    // 30 cards × 2 modes = 60 due, should recommend 25 cards
    await expect(page.locator('#sessionRecommendation')).toContainText('Recommended: 25 cards');
    await expect(page.locator('#sessionGoalSelect')).toHaveValue('25');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE DIFFICULTY SYSTEM TESTS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Adaptive Difficulty System - Backward Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('loads old localStorage data without new fields', async ({ page }) => {
    // Setup old format data directly in localStorage
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Old Data',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 3, nextReview: 0, successCount: 5, failCount: 1 },
            write: { intervalIndex: 2, nextReview: 0, successCount: 3, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();

    // Select file and verify it loads without errors
    await page.locator('.file-item').click();
    await expect(page.locator('#selectedFileStats')).toBeVisible();

    // Verify original data is preserved
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['好'].read.intervalIndex).toBe(3);
    expect(storage.files[0].progress['好'].read.successCount).toBe(5);
    expect(storage.files[0].progress['好'].write.intervalIndex).toBe(2);

    // Start practice to verify game works
    await page.click('#playBtn');
    await waitForGameScreen(page);
  });

  test('imports old backup file and adds default new fields', async ({ page }) => {
    await uploadFile(page, BACKUP_OLD_FORMAT);

    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);

    // Verify progress was imported with defaults for new fields
    const storage = await getStorageData(page);
    const progress = storage.files.find((f: any) => f.name === 'Old Format Backup').progress['学习'];

    // Original fields preserved
    expect(progress.read.intervalIndex).toBe(3);
    expect(progress.read.successCount).toBe(5);
    expect(progress.read.failCount).toBe(1);

    // New fields should have defaults
    expect(progress.read.lapseCount).toBe(0);
    expect(progress.read.avgResponseTime).toBeNull();
    expect(progress.read.lastResponseTime).toBeNull();
    expect(progress.read.hintUseCount).toBe(0);
    expect(progress.read.difficultyScore).toBeDefined();
  });

  test('imports new backup file and preserves all fields', async ({ page }) => {
    await uploadFile(page, BACKUP_NEW_FORMAT);

    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);

    const storage = await getStorageData(page);
    const progress = storage.files.find((f: any) => f.name === 'New Format Backup').progress['学习'];

    // All new fields preserved
    expect(progress.read.lapseCount).toBe(1);
    expect(progress.read.avgResponseTime).toBe(2500);
    expect(progress.read.lastResponseTime).toBe(2200);
    expect(progress.read.hintUseCount).toBe(3);
    expect(progress.read.difficultyScore).toBe(1.15);
  });

  test('infers difficulty from high fail rate', async ({ page }) => {
    // Setup old data with high fail rate (>50%)
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'High Fail Rate',
        flashcards: [{
          word: '难', word_hanyupinyin: 'nán', word_english: 'difficult',
          sentence: '很难', sentence_hanyupinyin: 'hěn nán', sentence_english: 'very difficult'
        }],
        progress: {
          '难': {
            read: { intervalIndex: 2, nextReview: 0, successCount: 2, failCount: 5 },
            write: { intervalIndex: 1, nextReview: 0, successCount: 1, failCount: 4 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    const storage = await getStorageData(page);
    // High fail rate should infer harder difficulty (1.3)
    expect(storage.files[0].progress['难'].read.difficultyScore).toBe(1.3);
  });

  test('infers difficulty from low fail rate and high level', async ({ page }) => {
    // Setup old data with low fail rate (<15%) and high level (>=5)
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Easy Card',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 6, nextReview: 0, successCount: 20, failCount: 1 },
            write: { intervalIndex: 5, nextReview: 0, successCount: 15, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    const storage = await getStorageData(page);
    // Low fail rate + high level should infer easier difficulty (0.8)
    expect(storage.files[0].progress['好'].read.difficultyScore).toBe(0.8);
  });
});

test.describe('Adaptive Difficulty System - Extended Intervals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('allows intervalIndex up to 9', async ({ page }) => {
    // Setup card at level 8
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'High Level',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999 },
            write: { intervalIndex: 8, nextReview: 0, difficultyScore: 1.0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Answer correctly
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Verify level advanced to 9
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['好'].write.intervalIndex).toBe(9);
  });

  test('clamps intervalIndex at 9 maximum', async ({ page }) => {
    // Setup card already at level 9
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Max Level',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999 },
            write: { intervalIndex: 9, nextReview: 0, difficultyScore: 1.0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Level should stay at 9
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['好'].write.intervalIndex).toBe(9);
  });
});

test.describe('Adaptive Difficulty System - Hint Usage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('hint usage prevents level advancement (WRITE mode)', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 1,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Click show hint button
    await page.click('#showHintBtn');

    // Then answer correctly
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Level should NOT advance (stayed at 1)
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.intervalIndex).toBe(1);
    expect(storage.files[0].progress['你'].write.hintUseCount).toBe(1);
  });

  test('hint usage increases difficulty score', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 1,
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showHintBtn');
    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    // Difficulty should increase (× 1.1)
    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.difficultyScore).toBeCloseTo(1.1, 1);
  });
});

test.describe('Adaptive Difficulty System - Difficulty Score', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('wrong answer increases difficulty (×1.2)', async ({ page }) => {
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

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.difficultyScore).toBeCloseTo(1.2, 1);
  });

  test('difficulty score is clamped to 2.0 maximum', async ({ page }) => {
    // Start with difficulty already at 1.9
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999 },
            write: { intervalIndex: 3, nextReview: 0, difficultyScore: 1.9 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wrong answer would push to 2.28, but should clamp to 2.0
    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['好'].write.difficultyScore).toBe(2.0);
  });
});

test.describe('Adaptive Difficulty System - Lapse Count', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('lapse count increases on failure at level 2+', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 3,  // Level 3 = "learned"
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.lapseCount).toBe(1);
  });

  test('lapse count does NOT increase on failure at level 0-1', async ({ page }) => {
    await setupTestFile(page, {
      readIntervalIndex: 7,
      readNextReview: Date.now() + 9999999999,
      writeIntervalIndex: 1,  // Level 1 = not yet "learned"
      writeNextReview: 0,
    });
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showAnswerBtn');
    await page.click('#wrongBtn');

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.lapseCount).toBe(0);
  });
});

test.describe('Adaptive Difficulty System - Override Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('"I said it correctly" properly undoes wrong answer and records success', async ({ page }) => {
    // Setup card at level 3 (so lapse would be counted if wrong)
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: {
              intervalIndex: 3,
              nextReview: 0,
              successCount: 3,
              failCount: 0,
              lapseCount: 0,
              difficultyScore: 1.0,
              avgResponseTime: null,
              lastResponseTime: null,
              hintUseCount: 0
            },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wait a bit to accumulate response time
    await page.waitForTimeout(500);

    // Click "I don't know" (would normally record wrong)
    await page.click('#dontKnowBtn');

    // Wait for answer to be revealed and buttons to appear
    await expect(page.locator('#readNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Click "Actually, I said it correctly" to override
    await page.click('#iSaidItCorrectlyBtn');

    // Wait for next card transition
    await page.waitForTimeout(2000);

    // Verify the result
    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['好'].read;

    // Should have advanced level (3 -> 4), NOT reset to 0
    expect(progress.intervalIndex).toBe(4);

    // Should have 1 success, 0 fails (the wrong was undone)
    expect(progress.successCount).toBe(4); // was 3, +1 for success
    expect(progress.failCount).toBe(0);    // wrong was undone

    // Lapse count should NOT have been incremented (wrong was undone)
    expect(progress.lapseCount).toBe(0);

    // Difficulty should be ~1.0 (not 1.2 from wrong answer)
    expect(progress.difficultyScore).toBeCloseTo(1.0, 1);

    // Response time should have been recorded
    expect(progress.lastResponseTime).toBeGreaterThan(0);
  });

  test('"I said it correctly" uses response time from when "I don\'t know" was clicked', async ({ page }) => {
    // Setup with existing avgResponseTime to detect if response time is used correctly
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: {
              intervalIndex: 1,
              nextReview: 0,
              successCount: 1,
              failCount: 0,
              lapseCount: 0,
              difficultyScore: 1.0,
              avgResponseTime: 1000, // 1 second average
              lastResponseTime: 1000,
              hintUseCount: 0
            },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wait 500ms before clicking "I don't know"
    await page.waitForTimeout(500);

    // Click "I don't know" - response time should be ~500ms at this point
    await page.click('#dontKnowBtn');

    // Wait for answer to be revealed
    await expect(page.locator('#readNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Wait another 3 seconds (simulating user listening to TTS)
    await page.waitForTimeout(3000);

    // Click "Actually, I said it correctly"
    // The response time should be ~500ms (from when "I don't know" was clicked)
    // NOT ~3500ms (from now)
    await page.click('#iSaidItCorrectlyBtn');

    await page.waitForTimeout(2000);

    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['好'].read;

    // Response time should be close to 500ms, not 3500ms
    // Allow some tolerance for test execution time
    expect(progress.lastResponseTime).toBeLessThan(2000);
    expect(progress.lastResponseTime).toBeGreaterThan(200);
  });
});

test.describe('Adaptive Difficulty System - Response Time', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('records response time in progress', async ({ page }) => {
    await setupWriteMode(page);
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wait a moment to accumulate some response time
    await page.waitForTimeout(1000);

    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    const storage = await getStorageData(page);
    // Response time should be recorded (at least 1000ms from our wait)
    expect(storage.files[0].progress['你'].write.lastResponseTime).toBeGreaterThan(500);
    expect(storage.files[0].progress['你'].write.avgResponseTime).toBeGreaterThan(500);
  });

  test('rolling average updates with 80/20 weight', async ({ page }) => {
    // Setup with existing avgResponseTime
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
          sentence: '你好', sentence_hanyupinyin: 'nǐ hǎo', sentence_english: 'hello'
        }],
        progress: {
          '好': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999 },
            write: {
              intervalIndex: 1,
              nextReview: 0,
              avgResponseTime: 5000,  // Existing average: 5 seconds
              difficultyScore: 1.0
            }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wait exactly 1 second
    await page.waitForTimeout(1000);

    await page.click('#showAnswerBtn');
    await page.click('#correctBtn');

    const storage = await getStorageData(page);
    // New avg should be approximately: 5000 * 0.8 + 1000 * 0.2 = 4200
    // Allow some tolerance for timing variations
    expect(storage.files[0].progress['好'].write.avgResponseTime).toBeGreaterThan(3500);
    expect(storage.files[0].progress['好'].write.avgResponseTime).toBeLessThan(4800);
  });
});
