"""Builds the folder and zip you upload to Netlify.

    python make-site.py

Creates  dist/  (drag this folder onto Netlify Drop)  and  play-and-learn-site.zip.
Every build gets a new version stamp, so people who already installed the app get the update.
Run  python get-models.py  first if you want the hand and face models stored inside the app.
"""
import os, re, shutil, time, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')
SKIP_DIRS = {'tests', 'dist', '.git', '__pycache__', 'node_modules'}
SKIP_FILES = {'make-site.py', 'get-models.py', 'README.md', 'play-and-learn-site.zip'}

if os.path.isdir(DIST):
    shutil.rmtree(DIST)
for folder, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in files:
        if name in SKIP_FILES or name.endswith('.pyc'):
            continue
        src = os.path.join(folder, name)
        dst = os.path.join(DIST, os.path.relpath(src, ROOT))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)

# version stamp for the service worker
sw_path = os.path.join(DIST, 'sw.js')
build = time.strftime('%Y%m%d-%H%M%S')
sw = open(sw_path, encoding='utf-8').read().replace('__BUILD__', build)
open(sw_path, 'w', encoding='utf-8').write(sw)

# every file the app caches for offline use must exist
core = re.search(r'const CORE = \[(.*?)\];', sw, re.S).group(1)
missing = [f for f in re.findall(r"'([^']+)'", core) if f != './' and not os.path.exists(os.path.join(DIST, f))]
if missing:
    raise SystemExit('Missing files listed in sw.js: ' + ', '.join(missing))

zip_path = os.path.join(ROOT, 'play-and-learn-site.zip')
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(DIST):
        for name in files:
            full = os.path.join(folder, name)
            z.write(full, os.path.relpath(full, DIST))

has_models = all(os.path.exists(os.path.join(DIST, 'vendor', f)) for f in ('hand_landmarker.task', 'face_landmarker.task'))
size = sum(os.path.getsize(os.path.join(f, n)) for f, _, ns in os.walk(DIST) for n in ns) / 1e6
print(f'Built version {build}: {size:.1f} MB')
print('Models inside the app: ' + ('yes (works fully offline from the first visit)' if has_models else 'no (the first visit needs internet, then it is saved)'))
print('Upload the dist folder to https://app.netlify.com/drop')
