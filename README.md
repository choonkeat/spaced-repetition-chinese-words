# Spaced Repetition Chinese Words

A static web app for learning Chinese characters using spaced repetition.

**Live Demo:** https://spaced-repetition-chinese-words.netlify.app/

## Features

- **Two test modes**: READ (speech recognition) and WRITE (self-grading)
- **Spaced repetition**: Cards scheduled at increasing intervals (1 min to 30 days)
- **Multi-file support**: Upload multiple flashcard sets, each with independent progress
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
    "sentence_english": "Hello!"
  }
]
```

## Documentation

- [How it works](https://spaced-repetition-chinese-words.netlify.app/spaced_repetition) - Spaced repetition algorithm
- [Developer Guide](https://spaced-repetition-chinese-words.netlify.app/developer) - Technical details

## Browser & OS Support

**Recommended:** Chrome on macOS, Windows, or Android

| Feature | Chrome | Safari | Firefox |
|---------|--------|--------|---------|
| Speech Recognition (READ mode) | Full | Limited | No |
| Text-to-Speech (Chinese) | Full | Full | Full |
| localStorage | Full | Full | Full |

**Why Chrome?** The Web Speech API (`SpeechRecognition`) for Chinese speech-to-text is fully supported only in Chrome. Safari has limited support, and Firefox does not support it at all.

**Mobile:** Works on Android Chrome. iOS Safari has limited speech recognition support.

## Privacy

No data is sent to any server. All flashcard data and learning progress is stored entirely in your browser's localStorage. Your data stays on your device.
