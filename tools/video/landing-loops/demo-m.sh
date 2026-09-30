ffmpeg -y -loglevel error -i $V/mobile.mp4 -vf "scale=540:960:flags=lanczos" -c:v libx264 -profile:v main -preset medium -crf 30 -maxrate 150k -bufsize 1000k -pix_fmt yuv420p -g 300 -c:a aac -b:a 96k -ac 2 -movflags +faststart $O/demo-mobile.mp4
ffmpeg -y -loglevel error -ss 3 -i $V/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -q:v 5 $O/demo-mobile-poster.jpg
ffmpeg -y -loglevel error -ss 3 -i $V/mobile.mp4 -frames:v 1 -vf scale=540:960:flags=lanczos -c:v libwebp -quality 78 $O/demo-mobile-poster.webp
