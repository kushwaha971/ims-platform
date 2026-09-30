./encode.sh hero-mobile 36 28 921 1433 60
for f in khata reminder bill stock purchase reports; do
 ./encode.sh feat-$f-desktop 36 28 700 1024 80
 ./encode.sh feat-$f-mobile 36 28 700 1024 60
done
