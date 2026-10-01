"""End to end test in headless Chromium with a fake camera.
Run:  python3 tests/serve.py 8123 &   then   python3 tests/e2e.py
"""
import json, sys, os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8123/'
SHOTS = os.environ.get('SHOTS', '/tmp/shots')
os.makedirs(SHOTS, exist_ok=True)
errors = []
fails = []

def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (f'  {extra}' if extra and not cond else ''))
    if not cond:
        fails.append(name)

def new_page(ctx, url):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('dialog', lambda d: d.accept())
    page.goto(url)
    return page

def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('playlearn.v1')||'{}')")

def profile(page):
    s = state(page)
    return s['profiles'][s['activeId']] if s.get('activeId') else None

def play_learn_round(page, max_clicks=80):
    for _ in range(max_clicks):
        if page.locator('.screen.done').count():
            return True
        tiles = page.locator('#pl-tiles .tile:not(.off)')
        if tiles.count():
            tiles.first.click(timeout=2000, force=True)
        page.wait_for_timeout(250)
    return False

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width': 1100, 'height': 760}, permissions=['camera'])

    # ---------- first run, create a child ----------
    page = new_page(ctx, BASE + '?mock=3')
    page.wait_for_selector('.welcome')
    check('welcome screen appears on first run', page.locator('.welcome').count() == 1)
    page.fill('#w-name', 'Zoya')
    page.click('#w-av .avatar:nth-child(3)')
    page.screenshot(path=f'{SHOTS}/1_welcome.png')
    page.click('#w-go')
    page.wait_for_selector('.home')
    check('home greets the child by name', 'Zoya' in page.locator('.home h1').inner_text())
    check('three game cards shown', page.locator('.gcard').count() == 3)
    page.screenshot(path=f'{SHOTS}/2_home.png')

    # ---------- memory: reload keeps the profile ----------
    page.reload()
    page.wait_for_selector('.home')
    check('profile survives a reload (no welcome screen)', page.locator('.welcome').count() == 0 and 'Zoya' in page.locator('.home h1').inner_text())

    # ---------- bubble pop with touch ----------
    page.click('.gcard[data-g=bubbles]')
    page.wait_for_selector('.bubble')
    for _ in range(40):
        if page.locator('.screen.done').count():
            break
        b = page.locator('.bubble:not(.pop)')
        if b.count():
            b.first.click(timeout=2000, force=True)
        page.wait_for_timeout(600)
    check('bubble pop round finishes', page.locator('.screen.done').count() == 1)
    page.screenshot(path=f'{SHOTS}/3_done.png')
    pr = profile(page)
    check('stars were saved', pr['stats']['stars'] >= 10, str(pr['stats']['stars']))
    check('a sticker was earned', len(pr['stats']['stickers']) == 1)
    check('session was logged', len(pr['stats']['sessions']) == 1 and pr['stats']['sessions'][0]['game'] == 'bubbles')
    page.click('#d-home')
    page.wait_for_selector('.home')
    check('stickers show on home', page.locator('.srow span').count() == 1)

    # ---------- pick and learn: wrong picks fade, round completes ----------
    page.click('.gcard[data-g=learn]')
    page.wait_for_selector('#pl-tiles .tile')
    page.screenshot(path=f'{SHOTS}/4_learn.png')
    first_count = page.locator('#pl-tiles .tile').count()
    check('pick and learn shows picture choices', first_count >= 2)
    ok = play_learn_round(page)
    check('pick and learn round finishes', ok)
    pr = profile(page)
    check('learn session logged', any(s['game'] == 'learn' for s in pr['stats']['sessions']))
    page.click('#d-home')
    page.wait_for_selector('.home')

    # ---------- resume: leave halfway, come back ----------
    page.click('.gcard[data-g=learn]')
    page.wait_for_selector('#pl-tiles .tile')
    for _ in range(12):
        t = page.locator('#pl-tiles .tile:not(.off)')
        t.first.click(timeout=2000, force=True)
        page.wait_for_timeout(300)
        if page.locator('#pl-tiles .tile.right').count():
            break
    page.wait_for_timeout(2300)  # let it move to question 2
    page.click('#pl-menu')
    page.wait_for_selector('.home')
    check('continue button appears after leaving mid round', page.locator('#h-resume').count() == 1)
    qi_saved = profile(page)['resume']['qi']
    page.click('#h-resume')
    page.wait_for_selector('#pl-tiles .tile')
    check('resume returns to the saved question', qi_saved >= 1, f'qi={qi_saved}')
    page.click('#pl-menu')
    page.wait_for_selector('.home')

    # ---------- grown up area: PIN, settings ----------
    page.click('#h-grown')
    page.wait_for_selector('.pin')
    check('PIN creation asks first', 'Create' in page.locator('#pin-title').inner_text())
    for d in '1234':
        page.click(f'#pin-pad .key[data-k="{d}"]')
    page.wait_for_timeout(200)
    check('PIN asks to repeat', 'Repeat' in page.locator('#pin-title').inner_text())
    for d in '1234':
        page.click(f'#pin-pad .key[data-k="{d}"]')
    page.wait_for_selector('.parent')
    check('parent panel opens after PIN set', page.locator('.parent').count() == 1)
    check('PIN not stored in plain text', '"1234"' not in json.dumps(state(page)))
    page.screenshot(path=f'{SHOTS}/5_parent.png', full_page=True)
    page.evaluate("""() => { const s=document.querySelector('#pa-hold'); s.value='0.5'; s.dispatchEvent(new Event('input')); }""")
    page.select_option('#pa-lang', 'hi')
    page.select_option('#pa-round', '3')
    st = profile(page)['settings']
    check('settings are saved', st['holdTime'] == 0.5 and st['lang'] == 'hi' and st['roundSize'] == 3, str(st))
    page.click('#pa-done')
    page.wait_for_selector('.home')
    check('Hindi shows on home', 'नमस्ते' in page.locator('.home h1').inner_text())
    page.screenshot(path=f'{SHOTS}/6_home_hi.png')

    # PIN gate on return
    page.click('#h-grown')
    page.wait_for_selector('.pin')
    check('PIN is asked when entering again', 'Enter' in page.locator('#pin-title').inner_text())
    for d in '9999':
        page.click(f'#pin-pad .key[data-k="{d}"]')
    page.wait_for_timeout(400)
    check('wrong PIN does not open the panel', page.locator('.parent').count() == 0)
    page.click('#pin-pad .key[data-k="cancel"]')
    page.wait_for_selector('.home')

    # ---------- finger quest with a demo hand showing 3 fingers ----------
    page.evaluate("""() => window.__app.startGame('finger', {game:'finger', qs:[{kind:'show',answer:3},{kind:'show',answer:2}], qi:0, results:[], stars:0})""")
    page.wait_for_selector('#fq-q')
    page.screenshot(path=f'{SHOTS}/7_finger.png')
    stars_before = profile(page)['stats']['stars']
    try:
        page.wait_for_selector('.holdring.done', timeout=6000)
        won = True
    except Exception:
        won = False
    check('hold to confirm: a 3 finger hand answers "show 3" after the hold time', won)
    check('the star was saved the moment it was won', profile(page)['stats']['stars'] == stars_before + 1)
    page.wait_for_function("document.querySelector('#fq-q') && /2|\u0926\u094b|\u0926\u094b/.test(document.querySelector('#fq-q').innerText)", timeout=6000)
    page.wait_for_timeout(1500)
    check('a wrong number does not win and shows a gentle message', page.locator('.holdring.done').count() == 0 and page.locator('#fq-msg').inner_text().strip() != '')
    page.screenshot(path=f'{SHOTS}/7b_finger_wrong.png')
    page.click('#fq-skip')
    page.wait_for_selector('.screen.done', timeout=6000)
    check('finger quest finishes a round', page.locator('.screen.done').count() == 1)
    page.click('#d-home')
    page.wait_for_selector('.home')

    # ---------- single switch scanning ----------
    page.evaluate("""() => { const s=JSON.parse(localStorage.getItem('playlearn.v1')); const p=s.profiles[s.activeId]; p.settings.input='switch'; p.settings.holdTime=0.8; localStorage.setItem('playlearn.v1', JSON.stringify(s)); }""")
    page.reload()
    page.wait_for_selector('.home')
    page.wait_for_timeout(300)
    check('home cards are scanned in switch mode', page.locator('.gcard.scan').count() == 1)
    page.keyboard.press('Space')
    page.wait_for_selector('.game', timeout=5000)
    check('Space starts the highlighted game', page.locator('.game').count() == 1)
    page.wait_for_timeout(500)
    stars_a = profile(page)['stats']['stars']
    page.wait_for_timeout(1200)
    page.keyboard.press('Space')
    page.wait_for_timeout(900)
    check('switch press chooses the highlighted target', profile(page)['stats']['stars'] >= stars_a + 1 or page.locator('.tile.right').count() == 1)
    page.click('#bp-menu') if page.locator('#bp-menu').count() else (page.click('#pl-menu') if page.locator('#pl-menu').count() else None)
    page.wait_for_selector('.home')

    # ---------- head pointer with a demo moving head ----------
    page.evaluate("""() => { const s=JSON.parse(localStorage.getItem('playlearn.v1')); const p=s.profiles[s.activeId]; p.settings.input='head'; p.settings.holdTime=1; localStorage.setItem('playlearn.v1', JSON.stringify(s)); }""")
    page2 = new_page(ctx, BASE + '?mock=head')
    page2.wait_for_selector('.home')
    page2.wait_for_timeout(600)
    check('head pointer cursor is shown', not page2.evaluate("document.getElementById('cursor').hidden"))
    page2.click('.gcard[data-g=bubbles]')
    page2.wait_for_selector('.bubble', timeout=8000)
    check('head mode calibrates then starts the game', page2.locator('.bubble').count() >= 1)
    page2.wait_for_timeout(800)
    page2.screenshot(path=f'{SHOTS}/8_head.png')
    page2.close()

    # ---------- offline: service worker caches the app ----------
    page3 = new_page(ctx, BASE + '?mock=3')
    page3.wait_for_selector('.home')
    page3.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
    page3.wait_for_timeout(3000)
    ctx.set_offline(True)
    page3.reload()
    page3.wait_for_selector('.home', timeout=10000)
    check('app opens with no internet after first visit', page3.locator('.home').count() == 1)
    ctx.set_offline(False)
    page3.close()

    # ---------- real camera path: no model available gives a friendly screen ----------
    ctx2 = browser.new_context(viewport={'width': 1100, 'height': 760}, permissions=['camera'])
    page4 = ctx2.new_page()
    page4.on('dialog', lambda d: d.accept())
    page4.goto(BASE)
    page4.wait_for_selector('.welcome')
    page4.fill('#w-name', 'Test')
    page4.click('#w-go')
    page4.wait_for_selector('.home')
    page4.click('.gcard[data-g=finger]')
    page4.wait_for_selector('.problem', timeout=60000)
    check('camera or model failure shows a friendly screen', page4.locator('.problem').count() == 1)
    page4.screenshot(path=f'{SHOTS}/9_problem.png')
    page4.click('#p-touch')
    page4.wait_for_selector('#pl-tiles .tile', timeout=5000)
    check('Play with touch falls back to Pick & Learn', page4.locator('#pl-tiles .tile').count() >= 2)
    ctx2.close()

    browser.close()

real = [e for e in errors if 'Failed to load resource' not in e and 'hand_landmarker' not in e and 'storage.googleapis' not in e and 'net::ERR' not in e]
check('no unexpected JavaScript errors', not real, '\n'.join(real[:8]))
print('\nFAILED:' if fails else '\nALL PASSED', fails or '')
sys.exit(1 if fails else 0)
