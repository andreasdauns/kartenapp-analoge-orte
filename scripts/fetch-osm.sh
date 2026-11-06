#!/usr/bin/env bash
# Lädt die OSM-Extrakte der Bundesländer (Geofabrik), filtert die benötigten Objekte
# und exportiert sie als GeoJSON-Sequenz nach work/all.geojsonseq.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p work
i=0
for url in $(jq -r '.regions[].url' config.json); do
  i=$((i+1))
  echo "Lade $url"
  curl -sSfL --retry 3 -A "analoge-orte (github.com/andreasdauns/kartenapp-analoge-orte)" -o "work/r$i.pbf" "$url"
  osmium tags-filter "work/r$i.pbf" \
    nwr/amenity=post_box,post_office,recycling,waste_transfer_station,toilets,parcel_locker,vending_machine,atm,bank,charging_station,pharmacy,fuel,parking,car_pooling \
    nwr/highway=rest_area,services \
    nwr/recycling:batteries=yes nwr/recycling:small_electrical_appliances=yes nwr/recycling:small_appliances=yes nwr/recycling:electrical_appliances=yes nwr/recycling:electrical_items=yes nwr/recycling:electronics=yes nwr/recycling:computers=yes nwr/recycling:mobile_phones=yes nwr/recycling:low_energy_bulbs=yes nwr/recycling:fluorescent_tubes=yes nwr/recycling:light_bulbs=yes nwr/recycling:printer_cartridges=yes nwr/recycling:printer_toner_cartridges=yes nwr/recycling:cork=yes nwr/recycling:cooking_oil=yes nwr/recycling:engine_oil=yes nwr/recycling:green_waste=yes nwr/recycling:garden_waste=yes nwr/recycling:hazardous_waste=yes nwr/recycling:paint=yes \
    nwr/post_office nwr/post_office:type nwr/post_office:brand \
    nwr/changing_table nwr/amenity=changing_table nwr/diaper nwr/toilets:changing_table \
    n/place=city,town,village,suburb \
    -o "work/f$i.pbf" --overwrite
  rm "work/r$i.pbf"
done
osmium merge work/f*.pbf -o work/all.pbf --overwrite
osmium export work/all.pbf -f geojsonseq -a type,id -o work/all.geojsonseq --overwrite
ls -lh work/all.geojsonseq
