"""Overture Maps Places für Deutschland: Paketshops, Paketstationen, Postfilialen, Geldautomaten, Toiletten.

Schreibt work/overture.json (Orte) und work/overture_meta.json (Kennzahlen für die Fehlersuche).
Nur Einträge, deren Quellen alle eine klare offene Lizenz haben (Meta, Microsoft: CDLA-Permissive-2.0;
Foursquare: Apache 2.0). AllThePlaces & Co. bleiben vorerst draußen.
"""
import json, re, sys, urllib.request
import duckdb

ALLOWED = {"meta", "microsoft", "foursquare"}
BBOX = (5.86, 47.27, 15.05, 55.06)  # Deutschland
PARCEL_RE = r"(?i)(paket ?-?shop|packstation|poststation|postfiliale|deutsche post|dhl|hermes|\bdpd\b|pickup|\bgls\b|\bups\b|access point|amazon (hub|locker|counter)|myflexbox|deinfach|paketbox|paketstation)"

meta = {"release": None, "columns": [], "error": None, "by_category": {}, "by_source": {}, "kept": {}}


def latest_release():
    try:
        with urllib.request.urlopen("https://labs.overturemaps.org/data/releases.json", timeout=60) as r:
            d = json.load(r)
        rel = d.get("latest") or (d.get("releases") or [None])[0]
        if isinstance(rel, dict):
            rel = rel.get("release") or rel.get("version") or rel.get("name")
        return rel
    except Exception as e:  # noqa: BLE001
        meta["error"] = f"releases.json: {e}"
        return None


def main():
    rel = latest_release()
    meta["release"] = rel
    if not rel:
        raise SystemExit("Kein Overture-Release gefunden")
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    path = f"s3://overturemaps-us-west-2/release/{rel}/theme=places/type=place/*"
    src = f"read_parquet('{path}', hive_partitioning=1)"
    cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {src} LIMIT 1").fetchall()]
    meta["columns"] = cols
    has_basic = "basic_category" in cols
    has_cats = "categories" in cols
    cat_expr = "basic_category" if has_basic else ("categories.primary" if has_cats else "NULL")
    brand_expr = "brand.names.primary" if "brand" in cols else "NULL"
    xmin, ymin, xmax, ymax = BBOX
    q = f"""
      SELECT id, names.primary AS name, {cat_expr} AS cat, {brand_expr} AS brand, confidence,
             (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat,
             addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS zip,
             addresses[1].country AS country,
             list_transform(sources, lambda s: lower(s.dataset)) AS ds,
             {"operating_status" if "operating_status" in cols else "NULL"} AS status
      FROM {src}
      WHERE bbox.xmin BETWEEN {xmin} AND {xmax} AND bbox.ymin BETWEEN {ymin} AND {ymax}
    """
    rows = con.execute(f"""
      SELECT * FROM ({q}) WHERE (country = 'DE' OR country IS NULL)
        AND (regexp_matches(coalesce(name,'') || ' ' || coalesce(brand,''), '{PARCEL_RE}')
             OR lower(coalesce(cat,'')) SIMILAR TO '.*(atm|post_office|shipping|courier|toilet|restroom|parcel|package|locker|mail).*')
    """).fetchall()
    names = ["id", "name", "cat", "brand", "confidence", "lon", "lat", "street", "city", "zip", "country", "ds", "status"]
    out = []
    for r in rows:
        d = dict(zip(names, r))
        cat = (d["cat"] or "").lower()
        meta["by_category"][cat] = meta["by_category"].get(cat, 0) + 1
        ds = set(d["ds"] or [])
        for s in ds:
            meta["by_source"][s] = meta["by_source"].get(s, 0) + 1
        if not ds or not ds <= ALLOWED:
            continue
        if (d["confidence"] or 0) < 0.6 or (d["status"] and str(d["status"]).lower() not in ("open", "none")):
            continue
        text = f"{d['name'] or ''} {d['brand'] or ''}"
        if re.search(r"(?i)\batm\b", cat) or "atm" == cat:
            c = "geldautomat"
        elif re.search(r"toilet|restroom", cat):
            c = "toilette"
        elif re.search(r"(?i)packstation|poststation|locker|paketbox|myflexbox|deinfach|paketstation", text):
            c = "packstation"
        elif re.search(PARCEL_RE, text) or re.search(r"post_office|shipping|courier|parcel|package|mail", cat):
            c = "paketshop"
        else:
            continue
        meta["kept"][c] = meta["kept"].get(c, 0) + 1
        out.append({
            "id": d["id"], "c": c, "lat": round(d["lat"], 6), "lon": round(d["lon"], 6),
            "name": d["name"], "brand": d["brand"], "cat": cat,
            "street": d["street"], "city": " ".join(x for x in [d["zip"], d["city"]] if x) or None,
        })
    json.dump(out, open("work/overture.json", "w"))
    print(f"Overture {rel}: {len(out)} Orte übernommen", meta["kept"])


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:  # noqa: BLE001
        meta["error"] = (meta["error"] or "") + f" {type(e).__name__}: {e}"
        print("Overture übersprungen:", meta["error"], file=sys.stderr)
    finally:
        meta["by_category"] = dict(sorted(meta["by_category"].items(), key=lambda x: -x[1])[:60])
        json.dump(meta, open("work/overture_meta.json", "w"))
