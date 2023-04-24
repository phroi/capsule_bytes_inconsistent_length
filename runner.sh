#! /bin/bash

set -eux

trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

(cd ~/ckb/ && ckb run --indexer | grep -oP '(?<=DEBUG OUTPUT: ).*') &
sleep 1
(cd ~/ckb/ && ckb miner &>/dev/null) &

cd len_error_script/
capsule build --release --debug-output
mv ./build/release/* ../files/

cd ..
(cd ~/ckb && ckb list-hashes --format json) | (cd 0_create_config && node index.js) 
(cd 1_reproduce_error && node index.js)
