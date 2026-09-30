#!/bin/bash
# $1 name  $2 webm-crf $3 mp4-crf  $4 webmcapKB $5 mp4capKB $6 posterKB
set -e
n=$1; OUTD=/home/claude/repo/frontend/public/media/landing; mkdir -p $OUTD enc
m=master/$n.mkv
wc=$2; xc=$3
ffmpeg -y -loglevel error -i $m -an -c:v libvpx-vp9 -b:v 0 -crf $wc -pix_fmt yuv420p -row-mt 1 -tile-columns 1 -g 240 -deadline good -cpu-used 4 -pass 1 -passlogfile enc/$n -f null /dev/null
ffmpeg -y -loglevel error -i $m -an -c:v libvpx-vp9 -b:v 0 -crf $wc -pix_fmt yuv420p -row-mt 1 -tile-columns 1 -g 240 -deadline good -cpu-used 2 -pass 2 -passlogfile enc/$n -r 30 $OUTD/$n.webm
ffmpeg -y -loglevel error -i $m -an -c:v libx264 -profile:v main -preset slow -crf $xc -pix_fmt yuv420p -tune stillimage -g 240 -movflags +faststart -r 30 $OUTD/$n.mp4
# posters = exact first frame of the loop
p=master/$n-first.png; cap=$(( $6*1024 ))
for q in 82 76 70 64 58 50 42; do ffmpeg -y -loglevel error -i $p -c:v libwebp -quality $q -compression_level 6 $OUTD/$n-poster.webp; [ $(stat -c%s $OUTD/$n-poster.webp) -le $cap ] && break; done
for q in 3 4 5 6 7 8 10 12 14 17 20 24; do ffmpeg -y -loglevel error -i $p -q:v $q $OUTD/$n-poster.jpg; [ $(stat -c%s $OUTD/$n-poster.jpg) -le $cap ] && break; done
printf "%s webm=%dKB/%s mp4=%dKB/%s webp=%dKB jpg=%dKB (cap %s)\n" $n $(( $(stat -c%s $OUTD/$n.webm)/1024 )) $4 $(( $(stat -c%s $OUTD/$n.mp4)/1024 )) $5 $(( $(stat -c%s $OUTD/$n-poster.webp)/1024 )) $(( $(stat -c%s $OUTD/$n-poster.jpg)/1024 )) $6
