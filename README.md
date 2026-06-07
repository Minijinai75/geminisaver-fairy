# GeminiSaver Fairy

GeminiSaver Fairy is a Chrome extension for people who use Gemini heavily and want a local-first way to back up, organize, and revisit conversations.

This open-source build focuses on safe, reviewable maintainer features:

- Local conversation backup on `gemini.google.com`
- Export to TXT and Markdown
- Backup dashboard for search, preview, and bulk export
- Folder-style organization for Gemini conversations
- Custom Gem icon replacement
- Prompt clipboard utilities

## Project links

- GitHub repository: <https://github.com/Minijinai75/geminisaver-fairy>
- Chrome Web Store: <https://chromewebstore.google.com/detail/gemini-%E8%87%AA%E5%8B%95%E5%82%99%E4%BB%BD%E5%B0%8F%E7%B2%BE%E9%9D%88-%E2%80%94-geminisa/hnoghbaehghopbjcbdgcnipbggkdhmgj?hl=zh-TW>

## Open-source scope

This repository is the public OSS-safe build.

- The main build does not include image watermark-removal behavior.
- Experimental excluded code is kept out of version control by `.gitignore`.
- The published repository should only contain the maintainable backup, organization, and export workflows.

## Why this project exists

Gemini users often lose track of useful conversations, prompts, and project context. GeminiSaver Fairy helps by keeping user-controlled backups on the local machine, making conversations easier to revisit, search, export, and organize without relying on an external server.

## Privacy model

- Local-first: data is stored in the browser / local machine
- No external backend required for core features
- No user conversation upload to a developer-owned server

More details: see [PRIVACY.md](./PRIVACY.md).

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder.

## Permissions

- `storage`: save settings and backup metadata
- `downloads`: export backups to local files
- `activeTab` and `tabs`: interact with the current Gemini tab and open project pages
- `alarms`: scheduled backup-related automation
- `unlimitedStorage`: retain a larger local backup set

## Project status

The extension is actively maintained by the primary author.

Known usage signal for the Chrome Web Store listing, provided by the maintainer on 2026-06-07:

- 607 installs in the last 90 days
- 742 Chrome Web Store listing views in the last 90 days

The store listing also showed 353 users and a 5.0 rating at the time this OSS package was prepared.

## Repository hygiene before publishing

Before pushing to GitHub:

1. Review screenshots and branding assets.
2. Confirm the public repo excludes `experimental_excluded/`.
3. Add a few screenshots to the repository front page if desired.
4. Create a fresh Git history for the public repo.

## Contributing

Small fixes and documentation improvements are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is released under the [MIT License](./LICENSE).

## Third-party code

This repository includes `jszip.min.js`. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
