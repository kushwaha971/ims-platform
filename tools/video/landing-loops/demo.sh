O=/home/claude/repo/frontend/public/media/landing
while ! grep -q DONE enc/all2.txt; do sleep 10; done
ffmpeg -y -loglevel error -i /home/claude/video/out/desktop.mp4 -vf "scale=1280:720:flags=lanczos" -c:v libx264 -profile:v main -preset medium -crf 30 -maxrate 160k -bufsize 1200k -pix_fmt yuv420p -g 300 -c:a aac -b:a 96k -ac 2 -movflags +faststart $O/demo-desktop-720.mp4
ffmpeg -y -loglevel error -ss 3 -i /home/claude/video/out/desktop.mp4 -frames:v 1 -vf scale=1280:720:flags=lanczos -q:v 5 $O/demo-desktop-720-poster.jpg
ffmpeg -y -loglevel error -ss 3 -i /home/claude/video/out/desktop.mp4 -frames:v 1 -vf scale=1280:720:flags=lanczos -c:v libwebp -quality 78 $O/demo-desktop-720-poster.webp
ffmpeg -y -loglevel error -i /home/claude/video/out/mobile.mp4 -vf "scale=540:960:flags=lanczos" -c:v libx264 -profile:v main -preset medium -crf 30 -maxrate 150k -bufsize 1000k -pix_fmt yuv420p -g 300 -c:a aac -b:a 96k -ac 2 -movflags +faststart $O/demo-mobile.mp4
ffmpeg -y -loglevel error -ss 3 -i /home/claude/video/out/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -q:v 5 $O/demo-mobile-poster.jpg
ffmpeg -y -loglevel error -ss 3 -i /home/claude/video/out/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -c:v libwebp -quality 78 $O/demo-mobile-poster.webp
ls -la $O/demo*; echo DEMODONE
