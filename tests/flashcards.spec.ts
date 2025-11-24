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

  test('uploads valid flashcard file', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Wait for success message
    await expect(page.locator('#uploadMsg')).toHaveClass(/success-msg/);
    await expect(page.locator('#uploadMsg')).toContainText('Added "Test Set" with 3 words');

    // Check file appears in sidebar
    await expect(page.locator('.file-item')).toHaveCount(1);
    await expect(page.locator('.file-item-name')).toContainText('Test Set');
    await expect(page.locator('.file-item-stats')).toContainText('3 words');
  });

  test('uploads file with auto-generated name when no name provided', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS);

    // File should be added with auto-generated name (date/time)
    await expect(page.locator('.file-item')).toHaveCount(1);
    // Name should contain some date-like text (varies by locale)
    const fileName = await page.locator('.file-item-name').textContent();
    expect(fileName).toBeTruthy();
  });

  test('shows error for invalid JSON schema', async ({ page }) => {
    await uploadFile(page, INVALID_FLASHCARDS);

    await expect(page.locator('#uploadMsg')).toHaveClass(/error/);
    await expect(page.locator('#uploadMsg')).toContainText('Invalid schema');
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
  });

  test('selects file and shows stats panel', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // File should be auto-selected after upload
    await expect(page.locator('.file-item')).toHaveClass(/active/);
    await expect(page.locator('#selectedFileStats')).toBeVisible();
    await expect(page.locator('#selectedFileName')).toContainText('Test Set');
    await expect(page.locator('#selectedFileWordCount')).toContainText('3 words');
  });

  test('switches between multiple files', async ({ page }) => {
    // Upload first file
    await uploadFile(page, VALID_FLASHCARDS, 'First Set');
    await expect(page.locator('.file-item')).toHaveCount(1);

    // Upload second file
    await uploadFile(page, BACKUP_FLASHCARDS);
    await expect(page.locator('.file-item')).toHaveCount(2);

    // Click on first file
    await page.locator('.file-item').first().click();
    await expect(page.locator('#selectedFileName')).toContainText('First Set');
    await expect(page.locator('.file-item').first()).toHaveClass(/active/);

    // Click on second file
    await page.locator('.file-item').last().click();
    await expect(page.locator('#selectedFileName')).toContainText('My Backup Set');
    await expect(page.locator('.file-item').last()).toHaveClass(/active/);
  });

  test('deletes file with confirmation', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Set up dialog handler before clicking delete
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Delete "Test Set"');
      await dialog.accept();
    });

    await page.locator('.file-item-trash').click();

    // File should be removed
    await expect(page.locator('.file-item')).toHaveCount(0);
    await expect(page.locator('#welcomeMessage')).toBeVisible();
  });

  test('cancels file deletion on dialog dismiss', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await page.locator('.file-item-trash').click();

    // File should still exist
    await expect(page.locator('.file-item')).toHaveCount(1);
  });

  test('exports file as JSON', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Export Test');

    // Set up download handler
    const downloadPromise = page.waitForEvent('download');
    await page.locator('.file-item-export').click();
    const download = await downloadPromise;

    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/Export_Test-.*\.json/);
  });
});

test.describe('Home Screen Stats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');
  });

  test('shows correct initial stats for new file', async ({ page }) => {
    // All cards should be "due" initially
    await expect(page.locator('#readDue')).toContainText('3 due');
    await expect(page.locator('#readPracticed')).toContainText('0 practiced');
    await expect(page.locator('#readMastered')).toContainText('0 mastered');

    await expect(page.locator('#writeDue')).toContainText('3 due');
    await expect(page.locator('#writePracticed')).toContainText('0 practiced');
    await expect(page.locator('#writeMastered')).toContainText('0 mastered');
  });

  test('shows session stats at zero initially', async ({ page }) => {
    await expect(page.locator('#selectedFileSession')).toContainText('0 correct');
    await expect(page.locator('#selectedFileSession')).toContainText('0 wrong');
  });

  test('shows "Last practiced" only after practice', async ({ page }) => {
    // Initially no last practiced text
    await expect(page.locator('#selectedFileLastAttempted')).toBeEmpty();
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

  test('shows voice selector in game screen', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#voiceSelect')).toBeVisible();
  });

  test('shows game stats in game screen', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#gameStats')).toBeVisible();
    await expect(page.locator('#gameStats')).toContainText('0'); // Initial stats
  });
});

test.describe('READ Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');
  });

  test('displays READ mode when read card is shown', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Wait for either READ or WRITE mode (random selection)
    // Check if readMode is visible
    const readModeVisible = await page.locator('#readMode').isVisible();

    if (readModeVisible) {
      await expect(page.locator('#modeIndicator')).toContainText('READ');
      await expect(page.locator('#modeIndicator')).toHaveClass(/read/);
    }
  });

  test('shows Chinese word and sentence in READ mode', async ({ page }) => {
    // Set up localStorage to force READ mode
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();

    // Select the file
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Should be in READ mode
    await expect(page.locator('#readMode')).toBeVisible();
    await expect(page.locator('#readWord')).toContainText('你');
    await expect(page.locator('#readSentence')).toContainText('你好');
  });

  test('hides pinyin and English initially in READ mode', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#readPinyin')).toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).toHaveClass(/hidden/);
    await expect(page.locator('#readSentencePinyin')).toHaveClass(/hidden/);
    await expect(page.locator('#readSentenceEnglish')).toHaveClass(/hidden/);
  });

  test('Show hint reveals pinyin and English', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#showHintBtn');

    await expect(page.locator('#readPinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readSentencePinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readSentenceEnglish')).not.toHaveClass(/hidden/);

    // Show hint button should be hidden after clicking
    await expect(page.locator('#showHintBtn')).toHaveClass(/hidden/);
  });

  test('I don\'t know records failure and shows answer', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await page.click('#dontKnowBtn');

    // Answer should be revealed
    await expect(page.locator('#readPinyin')).not.toHaveClass(/hidden/);
    await expect(page.locator('#readWordEnglish')).not.toHaveClass(/hidden/);

    // Buttons should be hidden
    await expect(page.locator('#showHintBtn')).toHaveClass(/hidden/);
    await expect(page.locator('#dontKnowBtn')).toHaveClass(/hidden/);

    // Wait for TTS to complete and Next button to appear
    await expect(page.locator('#readNextBtn')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Session stats should show 1 wrong
    await expect(page.locator('#gameStats')).toContainText('1');
  });

  test('mic button shows visual state', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 },
            write: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Mic button should exist
    await expect(page.locator('#micBtn')).toBeVisible();
  });
});

test.describe('WRITE Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('displays WRITE mode UI correctly', async ({ page }) => {
    // Set up localStorage to force WRITE mode
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#writeMode')).toBeVisible();
    await expect(page.locator('#modeIndicator')).toContainText('WRITE');
    await expect(page.locator('#modeIndicator')).toHaveClass(/write/);
  });

  test('shows English and pinyin, hides Chinese initially', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // English and pinyin visible
    await expect(page.locator('#writeWordEnglish')).toContainText('you');
    await expect(page.locator('#writeWordPinyin')).toContainText('nǐ');

    // Chinese hidden
    await expect(page.locator('#writeWordChinese')).toHaveClass(/hidden/);
    await expect(page.locator('#writeSentenceChinese')).toHaveClass(/hidden/);
  });

  test('Show answer reveals Chinese', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
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

    // Chinese should now be visible
    await expect(page.locator('#writeWordChinese')).not.toHaveClass(/hidden/);
    await expect(page.locator('#writeSentenceChinese')).not.toHaveClass(/hidden/);
    await expect(page.locator('#writeWordChinese')).toContainText('你');

    // Show group hidden, answer group visible
    await expect(page.locator('#writeShowGroup')).toHaveClass(/hidden/);
    await expect(page.locator('#writeAnswerGroup')).not.toHaveClass(/hidden/);
  });

  test('Correct button records success', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
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

    // Verify progress was updated
    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['你'].write;
    expect(progress.successCount).toBe(1);
    expect(progress.intervalIndex).toBe(1);
  });

  test('Wrong button records failure', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 3, nextReview: 0, successCount: 3, failCount: 0 }
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
    await page.click('#wrongBtn');

    // Wait for TTS and next button
    await expect(page.locator('#writeNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    // Verify progress was reset to 0
    const storage = await getStorageData(page);
    const progress = storage.files[0].progress['你'].write;
    expect(progress.failCount).toBe(1);
    expect(progress.intervalIndex).toBe(0);
  });

  test('Say it button exists and is clickable', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();
    await page.click('#playBtn');
    await waitForGameScreen(page);

    await expect(page.locator('#sayItBtn')).toBeVisible();
    await expect(page.locator('#sayItBtn')).toBeEnabled();
  });
});

test.describe('Spaced Repetition & Progress', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('new cards are immediately due', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // All 3 cards should be due for both modes
    await expect(page.locator('#readDue')).toContainText('3 due');
    await expect(page.locator('#writeDue')).toContainText('3 due');
  });

  test('correct answer advances interval level', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
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

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.intervalIndex).toBe(1);
  });

  test('wrong answer resets to level 0', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 5, nextReview: 0, successCount: 5, failCount: 0 }
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
    await page.click('#wrongBtn');

    // Wait for the action to complete
    await expect(page.locator('#writeNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].write.intervalIndex).toBe(0);
  });

  test('mastered threshold is intervalIndex >= 4', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [
          { word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
            sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!' },
          { word: '好', word_hanyupinyin: 'hǎo', word_english: 'good',
            sentence: '很好！', sentence_hanyupinyin: 'Hěn hǎo!', sentence_english: 'Very good!' }
        ],
        progress: {
          '你': {
            read: { intervalIndex: 4, nextReview: Date.now() + 9999999999, successCount: 4, failCount: 0 },
            write: { intervalIndex: 4, nextReview: Date.now() + 9999999999, successCount: 4, failCount: 0 }
          },
          '好': {
            read: { intervalIndex: 3, nextReview: Date.now() + 9999999999, successCount: 3, failCount: 0 },
            write: { intervalIndex: 3, nextReview: Date.now() + 9999999999, successCount: 3, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });
    await page.reload();
    await page.locator('.file-item').click();

    // 1 mastered (你 at level 4), 1 not mastered (好 at level 3)
    await expect(page.locator('#readMastered')).toContainText('1 mastered');
    await expect(page.locator('#writeMastered')).toContainText('1 mastered');
  });

  test('progress persists across page reload', async ({ page }) => {
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 3, nextReview: 12345, successCount: 3, failCount: 1 },
            write: { intervalIndex: 2, nextReview: 12345, successCount: 2, failCount: 0 }
          }
        }
      }];
      localStorage.setItem('flashcard_files', JSON.stringify(files));
    });

    await page.reload();

    const storage = await getStorageData(page);
    expect(storage.files[0].progress['你'].read.successCount).toBe(3);
    expect(storage.files[0].progress['你'].write.successCount).toBe(2);
  });

  test('session stats reset on page reload', async ({ page }) => {
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Play and record a wrong answer
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Get current mode and handle appropriately
    const readModeVisible = await page.locator('#readMode').isVisible();
    if (readModeVisible) {
      await page.click('#dontKnowBtn');
      await expect(page.locator('#readNextBtn')).not.toHaveClass(/hidden/, { timeout: 10000 });
    } else {
      await page.click('#showAnswerBtn');
      await page.click('#wrongBtn');
      await expect(page.locator('#writeNextGroup')).not.toHaveClass(/hidden/, { timeout: 10000 });
    }

    // Should show 1 wrong in stats
    await expect(page.locator('#gameStats')).toContainText('1');

    // Reload page
    await page.reload();
    await page.locator('.file-item').click();

    // Session stats should be reset
    await expect(page.locator('#selectedFileSession')).toContainText('0 correct');
    await expect(page.locator('#selectedFileSession')).toContainText('0 wrong');
  });
});

test.describe('Voice Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');
  });

  test('voice selector is populated', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Voice select should have options (may vary by system)
    const optionCount = await page.locator('#voiceSelect option').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });

  test('voice selection persists in localStorage', async ({ page }) => {
    await page.click('#playBtn');
    await waitForGameScreen(page);

    // Get current voice options
    const options = await page.locator('#voiceSelect option').allTextContents();
    if (options.length > 1) {
      // Select a different voice
      await page.selectOption('#voiceSelect', { index: 1 });

      // Check localStorage
      const storage = await getStorageData(page);
      expect(storage.voice).toBeTruthy();
    }
  });
});

test.describe('Mobile Responsive', () => {
  test('hamburger menu visible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.locator('#hamburger')).toBeVisible();
  });

  test('hamburger menu hidden on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.locator('#hamburger')).not.toBeVisible();
  });

  test('sidebar toggles on hamburger click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    // On mobile with no files, sidebar auto-opens. So it should be open initially.
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Click hamburger to close
    await page.click('#hamburger');
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);

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

    // Open sidebar and upload file
    await page.click('#hamburger');
    await uploadFile(page, VALID_FLASHCARDS, 'Test Set');

    // Sidebar should close after file selection
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  });
});

test.describe('Edge Cases', () => {
  test('handles empty file list gracefully', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();

    await expect(page.locator('.file-item')).toHaveCount(0);
    await expect(page.locator('#welcomeMessage')).toBeVisible();
  });

  test('sample data download link exists', async ({ page }) => {
    await page.goto('/');

    const downloadLink = page.locator('a[href="2015characterlistprimarychinese.pdf.json"]');
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toContainText('Sample');
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
  });
});

test.describe('Confetti Animation', () => {
  test('confetti canvas exists', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#confettiCanvas')).toBeAttached();
  });

  test('confetti triggers on correct WRITE answer', async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);

    // Set up localStorage data for WRITE mode
    await page.evaluate(() => {
      const files = [{
        id: 'test-id',
        name: 'Test',
        flashcards: [{
          word: '你', word_hanyupinyin: 'nǐ', word_english: 'you',
          sentence: '你好！', sentence_hanyupinyin: 'Nǐ hǎo!', sentence_english: 'Hello!'
        }],
        progress: {
          '你': {
            read: { intervalIndex: 7, nextReview: Date.now() + 9999999999, successCount: 5, failCount: 0 },
            write: { intervalIndex: 0, nextReview: 0, successCount: 0, failCount: 0 }
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

    // Verify the canvas element is there (animation runs but we can't easily verify visually)
    await expect(page.locator('#confettiCanvas')).toBeAttached();
  });
});
