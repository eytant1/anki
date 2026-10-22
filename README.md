# Anki

A small web app (PWA) for studying flashcards on your phone, Anki style.

- Create decks. When you create a deck you name its two fields, e.g. **Song name** and **Author**.
- Add cards to a deck: each card has a title and a description. Tap a card to edit it, ✕ to delete it.
- **Study**: the cards come in random order. You see the title; tap to show the description.
  Then tap **Again** to see that card again a few cards later, or **Got it** to drop it from this round.
- Decks are saved on your device (localStorage) and are never uploaded anywhere.
- Works offline once loaded.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it on your phone (GitHub Pages)

1. Push this repo to GitHub.
2. On GitHub, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`, and save.
3. After about a minute it's live at `https://<your-username>.github.io/<repo-name>/`.
4. Open that link on your phone and install it:
   - **Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*.
   - **iPhone (Safari):** Share → *Add to Home Screen*.

Decks are saved per device and per browser.

## Updating

After you change any file, bump `VERSION` in `sw.js` so phones pick up the new version. You may need to open the app twice.
