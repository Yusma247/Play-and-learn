# Play and Learn

Built by Yusma. A browser-based learning game for children with cerebral palsy. Works offline, installs like an app, and supports touch, hand pointer, head pointer, or a single switch as input so a child can play without needing fine motor control.

**Live:** https://childrenlearninggame.netlify.app/

Four games: **Magic Touch** (touch and see, the easiest start), **Bubble Pop** (steady pointing), **Pick & Learn** (numbers, colours, animals), **Finger Quest** (show fingers to the camera).

Everything is saved on the device only, no server, no account, camera pictures never stored.

## Status

In production

## How a child plays

Grown ups choose the input under "For grown ups" (PIN protected):

| Input | What the child does |
|---|---|
| Touch | Taps a picture |
| Hand pointer | Moves the index finger, holds it on a picture |
| Head pointer | Moves the head, holds on a picture (or opens the mouth to choose) |
| Single switch | Pictures light up one by one. Any key press, Space, Enter or a tap chooses |

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

- The camera needs HTTPS. Locally use `localhost`.
- iPhone and iPad: install through Safari, Share, "Add to Home Screen". Test the camera on a real device.
- Spoken Hindi needs a Hindi voice on the device. The text always shows.
- The hand and face models are Google MediaPipe models. Check their license terms before you publish a study or product.
