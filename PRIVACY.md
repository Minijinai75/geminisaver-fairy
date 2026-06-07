# Privacy

GeminiSaver Fairy is designed as a local-first extension.

## What the extension stores

- Backup content from Gemini conversations
- Backup metadata such as timestamps, titles, and identifiers
- User settings for export, folders, icons, and UI preferences

## Where data is stored

- Chrome extension local storage
- User-initiated local file exports

## What this open-source build does not do

- It does not require a developer-run backend for core features.
- It does not intentionally upload Gemini conversation content to a developer-owned server.
- It does not include the excluded experimental watermark-removal workflow in the main OSS build.

## User responsibility

Backups may contain personal, confidential, or sensitive text. Users should protect exported files appropriately and avoid using the extension on shared machines without understanding local storage implications.
