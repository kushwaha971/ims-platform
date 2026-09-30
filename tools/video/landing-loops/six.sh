#!/bin/bash
# six evenly spaced frames from final output, tiled 3x2 (desktop) or 6x1 (mobile)
f=$1; n=$(basename $f); N=$(ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 $f)
s=$(( N/6 )); sel=""; for i in 0 1 2 3 4 5; do sel="$sel+eq(n\,$(( i*s + s/2 )))"; done; sel=${sel:1}
case $n in *mobile*) tile=6x1; sc=390:-1;; *) tile=3x2; sc=800:-1;; esac
ffmpeg -y -loglevel error -i $f -vf "select='$sel',scale=$sc,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=20:fontcolor=red:box=1,tile=$tile:padding=4" -vsync 0 -frames:v 1 -q:v 3 check/six-$n.jpg; echo check/six-$n.jpg
