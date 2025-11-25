# [Spaced Repetition](https://en.wikipedia.org/wiki/Spaced_repetition) Chinese Words

A static web app for learning Chinese characters using [spaced repetition](https://en.wikipedia.org/wiki/Spaced_repetition).

**Live Demo:** https://spaced-repetition-chinese-words.netlify.app/

## Features

- **Two test modes**: READ (speech recognition) and WRITE (self-grading)
- **[Spaced repetition](https://en.wikipedia.org/wiki/Spaced_repetition)**: Cards scheduled at increasing intervals (1 min to 30 days)
- **Review priority**: Past due reviews take precedence over new cards ("Review First, Learn Second")
- **Multi-file support**: Upload multiple flashcard sets, each with independent progress
- **Highscore tracking**: Records your best correct streak per set
- **Voice selection**: Choose from available Chinese TTS voices
- **Export/Import**: Download progress as JSON backup, restore later
- **READ mode enhancements**: Auto-start mic, partial match highlighting, contextual hints
- **Mobile responsive**: Collapsible sidebar for small screens
- **Offline-capable**: All data stored in localStorage

## Usage

1. Upload a JSON file with flashcards
2. Click on a set to view stats
3. Press Play to start reviewing

## JSON Format

```json
[
  {
    "word": "你",
    "word_hanyupinyin": "nǐ",
    "word_english": "you",
    "sentence": "你好！",
    "sentence_hanyupinyin": "Nǐ hǎo!",
    "sentence_english": "Hello!",
    "label": "一上"
  }
]
```

The `label` field is optional and can be used to indicate grade level or category (e.g., "一上" for Primary 1 First Semester).

## Documentation

- [How it works](https://spaced-repetition-chinese-words.netlify.app/spaced_repetition) - Spaced repetition algorithm
- [Developer Guide](https://spaced-repetition-chinese-words.netlify.app/developer) - Technical details

## Browser & OS Support

**Recommended:** Chrome or Safari

| Feature | Chrome | Safari | Firefox |
|---------|--------|--------|---------|
| Speech Recognition (READ mode) | Full | Full | No |
| Text-to-Speech (Chinese) | Full | Full | Full |
| localStorage | Full | Full | Full |

**Desktop:** Chrome (macOS/Windows/Linux) and Safari (macOS) both work well.

**Mobile:** iOS Safari and Android Chrome both fully support all features including speech recognition.

**Firefox:** Does not implement the Web Speech API for speech recognition. WRITE mode still works, but READ mode will not function.

## Development

### Running Locally

```bash
python3 -m http.server 8765
# Open http://localhost:8765
```

### Running Tests

```bash
npm install                # Install dependencies
npx playwright install chromium  # Install browser

npm test                   # Run tests (headless)
npm run test:headed        # Run tests with browser visible
npm run test:ui            # Run tests with interactive UI
```

> **Note:** Tests run in parallel, so you may hear [overlapping speech synthesis voices](https://www.youtube.com/watch?v=atUUjSLMSiM&t=7s). This is normal.

## Privacy

No data is sent to any server. All flashcard data and learning progress is stored entirely in your browser's localStorage. Your data stays on your device.
