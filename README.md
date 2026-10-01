# Play and Learn

A gentle learning game for children, made for kids with cerebral palsy. It runs in the browser, installs like an app, and works offline.

## Put it online with Netlify (5 minutes)

1. Run `python make-site.py` in this folder. It creates a `dist` folder.
2. Open https://app.netlify.com/drop and drag the `dist` folder onto the page.
3. Netlify gives you a link. Open it on the tablet, then choose "Install" or "Add to Home Screen".

To update later, run `python make-site.py` again and drag the new `dist` folder onto the same site (Deploys tab). Children's saved progress stays, because it lives on their device.

### Optional: make it work fully offline from the first visit

Without this, the first visit needs internet to download the two hand and face models (about 11 MB). After that they are saved on the device.

1. Run `python get-models.py` once.
2. Run `python make-site.py` again and upload the new `dist` folder.

## How a child plays

Grown ups choose the input under "For grown ups" (PIN protected):

| Input | What the child does |
|---|---|
| Touch | Taps a picture |
| Hand pointer | Moves the index finger, holds it on a picture |
| Head pointer | Moves the head, holds on a picture (or opens the mouth to choose) |
| Single switch | Pictures light up one by one. Any key press, Space, Enter or a tap chooses |

Games: **Bubble Pop** (steady pointing, easiest), **Pick & Learn** (numbers, colours, animals), **Finger Quest** (show fingers, needs the camera).

## What is saved on the device

Child profiles, settings, stars, stickers, levels, a history of rounds and where a round was left. Nothing goes to a server and camera pictures are never stored. "Download backup" in the grown-up area saves everything to a file, and "Restore backup" loads it on another device.

## Change the content

Questions, words and pictures are in `js/games/content.js` and `js/i18n.js`. Add a word there and it shows up in the games.

## Test it

```
node tests/unit.mjs                 # logic tests
python3 tests/serve.py 8123 &       # local server
python3 tests/e2e.py                # full run in a headless browser (needs playwright)
```

Add `?mock=3` to the address to pretend a hand with 3 fingers is shown, or `?mock=head` for a moving head. This lets you try everything without a camera.

## Notes

- The camera needs HTTPS. Netlify provides it. Locally use `localhost`.
- iPhone and iPad: install through Safari, Share, "Add to Home Screen". Test the camera on a real device.
- Spoken Hindi needs a Hindi voice on the device. The text always shows.
- The hand and face models are Google MediaPipe models. Check their license terms before you publish a study or product.
