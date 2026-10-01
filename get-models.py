"""Downloads the two Google MediaPipe model files into vendor/ so the app can work fully offline.

    python get-models.py

Run it once on a computer with internet, then run  python make-site.py.
"""
import os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {
    'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}
os.makedirs(os.path.join(HERE, 'vendor'), exist_ok=True)
for name, url in FILES.items():
    dest = os.path.join(HERE, 'vendor', name)
    print('Downloading', name, '...')
    urllib.request.urlretrieve(url, dest)
    size = os.path.getsize(dest)
    if size < 100_000:
        raise SystemExit(f'{name} looks too small ({size} bytes). Try again.')
    print(f'  saved {size / 1e6:.1f} MB')
print('Done. Now run: python make-site.py')
