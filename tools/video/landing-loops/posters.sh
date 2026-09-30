# $1 name $2 capKB(decimal)
O=/home/claude/repo/frontend/public/media/landing; n=$1; p=master/$n-first.png; cap=$(( $2*1000 ))
for q in 82 76 70 64 58 50 42; do ffmpeg -y -loglevel error -i $p -c:v libwebp -quality $q -compression_level 6 $O/$n-poster.webp; [ $(stat -c%s $O/$n-poster.webp) -le $cap ] && break; done
for q in 3 4 5 6 7 8 10 12 14 17 20 24; do ffmpeg -y -loglevel error -i $p -q:v $q $O/$n-poster.jpg; [ $(stat -c%s $O/$n-poster.jpg) -le $cap ] && break; done
echo "$n webp=$(stat -c%s $O/$n-poster.webp) jpg=$(stat -c%s $O/$n-poster.jpg) q=$q"
