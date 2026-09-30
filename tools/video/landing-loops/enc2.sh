#!/bin/bash
cd /home/claude/video/work/landing
nice -n 5 python3 render.py specs.json hero-desktop hero-mobile feat-khata-mobile feat-bill-desktop feat-bill-mobile feat-purchase-mobile > enc/render5.txt 2>&1
./encode.sh hero-desktop 36 28 1229 1843 80
./encode.sh hero-mobile 38 28 921 1433 60
for f in khata reminder bill stock purchase reports; do
 ./encode.sh feat-$f-desktop 36 28 700 1024 80
 ./encode.sh feat-$f-mobile 36 28 700 1024 60
done
echo ENCDONE
