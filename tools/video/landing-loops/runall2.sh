python3 render.py specs.json feat-khata-mobile feat-reminder-mobile feat-bill-mobile feat-stock-mobile feat-purchase-mobile feat-reports-mobile > enc/render2.txt 2>&1 &
RP=$!
./encode.sh hero-mobile 38 28 921 1433 60
for f in purchase reports; do ./encode.sh feat-$f-desktop 36 28 700 1024 80; done
wait $RP
for f in khata reminder bill stock purchase reports; do ./encode.sh feat-$f-mobile 36 28 700 1024 60; done
echo DONE
