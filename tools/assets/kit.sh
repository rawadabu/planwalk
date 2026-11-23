#!/bin/bash
# Turn finished generations into library models. Usage: tools/assets/kit.sh <kit.log> <workdir>
# kit.log lines: "<name> completed <glb url>" (written by the generation loop); already-processed names are skipped.
set -e
LOG="$1"; WORK="$2"; PY="${PLANWALK_PYTHON:-python3}"; HERE="$(cd "$(dirname "$0")" && pwd)"; OUT="$HERE/../../storage/library/models"
declare -A FILE=( [houseA]=nb_house_a [houseB]=nb_house_b [houseC]=nb_house_c [treeOlive]=nb_tree_olive [treeFicus]=nb_tree_ficus [treeCypress]=nb_tree_cypress [carSuv]=nb_car_suv [carSedan]=nb_car_sedan [lamp]=nb_lamp )
declare -A TRIS=( [houseA]=30000 [houseB]=30000 [houseC]=30000 [treeOlive]=22000 [treeFicus]=22000 [treeCypress]=14000 [carSuv]=16000 [carSedan]=16000 [lamp]=4000 )
declare -A TEX=( [houseA]=1024 [houseB]=1024 [houseC]=1024 [treeOlive]=1024 [treeFicus]=1024 [treeCypress]=1024 [carSuv]=512 [carSedan]=512 [lamp]=256 )
while read -r name status url; do
  [ "$status" = completed ] && [ -n "${FILE[$name]}" ] || continue
  dst="$OUT/${FILE[$name]}.b64.json"; [ -s "$dst" ] && continue
  curl -s --max-time 300 -o "$WORK/$name.glb" "$url"
  "$PY" "$HERE/optimize.py" "$WORK/$name.glb" "$dst" "${TRIS[$name]}" "${TEX[$name]}" 2>&1 | grep "^optimized" || echo "failed: $name"
done < "$LOG"
