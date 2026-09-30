#!/bin/bash
# $1 name  $2 every-n-frames  $3 thumb width  $4 cols
n=$1; e=${2:-10}; tw=${3:-480}; c=${4:-6}
f=master/$n.mkv; N=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 $f)
r=$(( (N/e + c - 1)/c ))
ffmpeg -y -loglevel error -i $f -vf "select='not(mod(n\,$e))',scale=$tw:-1,drawtext=text='%{n}':x=4:y=4:fontsize=18:fontcolor=red:box=1,tile=${c}x${r}" -frames:v 1 -q:v 4 check/$n-sheet.jpg && echo check/$n-sheet.jpg
