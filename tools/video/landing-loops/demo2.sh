#!/bin/bash
# Demo films for the landing page (git-ignored): 720p desktop + 540x960 mobile, posters, VTT.
set -e
O=/home/claude/repo/frontend/public/media/landing; V=/home/claude/video/out
ffmpeg -y -loglevel error -i $V/desktop.mp4 -vf "scale=1280:720:flags=lanczos" -c:v libx264 -profile:v main -preset medium -crf 30 -maxrate 160k -bufsize 1200k -pix_fmt yuv420p -g 300 -c:a aac -b:a 96k -ac 2 -movflags +faststart $O/demo-desktop-720.mp4
ffmpeg -y -loglevel error -ss 3 -i $V/desktop.mp4 -frames:v 1 -vf scale=1280:720:flags=lanczos -q:v 5 $O/demo-desktop-720-poster.jpg
ffmpeg -y -loglevel error -ss 3 -i $V/desktop.mp4 -frames:v 1 -vf scale=1280:720:flags=lanczos -c:v libwebp -quality 78 $O/demo-desktop-720-poster.webp
ffmpeg -y -loglevel error -i $V/mobile.mp4 -vf "scale=540:960:flags=lanczos" -c:v libx264 -profile:v main -preset medium -crf 30 -maxrate 150k -bufsize 1000k -pix_fmt yuv420p -g 300 -c:a aac -b:a 96k -ac 2 -movflags +faststart $O/demo-mobile.mp4
ffmpeg -y -loglevel error -ss 3 -i $V/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -q:v 5 $O/demo-mobile-poster.jpg
ffmpeg -y -loglevel error -ss 3 -i $V/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -c:v libwebp -quality 78 $O/demo-mobile-poster.webp
python3 - <<'PY'
import re
for src,dst in [('desktop','demo-desktop-720'),('mobile','demo-mobile')]:
    t=open(f'/home/claude/video/out/{src}.srt',encoding='utf-8').read().strip().split('\n\n')
    out=['WEBVTT','']
    for b in t:
        l=b.split('\n'); out+= [l[1].replace(',','.')]+l[2:]+['']
    open(f'/home/claude/repo/frontend/public/media/landing/{dst}.vtt','w',encoding='utf-8').write('\n'.join(out))
PY
ls -la $O/demo*; echo DEMODONE
