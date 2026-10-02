"""Collegia - India college finder with hostel map and live tracking.
Run:  pip install -r requirements.txt  ->  python app.py  ->  open http://127.0.0.1:5000
"""
import csv, math, os, re, threading, time
from functools import lru_cache

import requests
from flask import Flask, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.environ.get("COLLEGE_CSV", os.path.join(BASE, "College.csv"))
UA = {"User-Agent": "CollegiaApp/1.0 (student project)"}  # required by Nominatim policy
PER_PAGE = 24

app = Flask(__name__)


def clean(t):
    t = re.sub(r"\s*\(Id:\s*[A-Z]-\d+\)", "", t or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t.title() if t.isupper() else t


def load():
    with open(CSV_PATH, encoding="utf-8-sig", errors="replace", newline="") as f:
        rows = list(csv.reader(f))[1:]
    out = []
    for r in rows:
        if len(r) < 12 or not r[0].strip():
            continue
        name = clean(r[4])
        if not name:
            continue
        spec = r[10].strip()
        spec = "Not specified" if not spec else ("General" if spec == "No" else spec)
        try:
            yr = int(re.sub(r"\D", "", r[9])[:4]) if r[9].strip() else 0
        except ValueError:
            yr = 0
        if yr and not 1000 <= yr <= 2026:
            yr = 0
        web = r[7].strip().lower().replace(" ", "")
        if "." not in web or len(web) < 5:
            web = ""
        elif not web.startswith("http"):
            web = "http://" + web
        c = dict(name=name, state=r[0].strip(), district=r[1].strip() or "Unknown",
                 univ=clean(r[3]) or "Not specified", ctype=r[5].strip() or "Other",
                 addr=re.sub(r"\s+", " ", r[6]).strip()[:90], web=web, year=yr,
                 mgmt=r[8].strip() or "Not specified", spec=spec,
                 loc=r[11].strip() or "Not specified")
        c["_s"] = f'{c["name"]} {c["district"]} {c["state"]} {c["univ"]}'.lower()
        out.append(c)
    for i, c in enumerate(out):
        c["id"] = i
    return out


DATA = load()
BY_NAME = sorted(DATA, key=lambda c: c["name"].lower())
BY_OLD = sorted(DATA, key=lambda c: c["year"] or 9999)
BY_NEW = sorted(DATA, key=lambda c: -c["year"])


def counts(key):
    d = {}
    for c in DATA:
        d[c[key]] = d.get(c[key], 0) + 1
    return d


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/meta")
def meta():
    dists = {}
    for c in DATA:
        dists.setdefault(c["state"], set()).add(c["district"])
    spec = counts("spec")
    return jsonify(
        total=len(DATA), states=sorted(dists), district_total=sum(len(v) for v in dists.values()),
        districts={s: sorted(v) for s, v in dists.items()},
        specs=sorted(spec, key=lambda k: -spec[k]), mgmts=sorted(counts("mgmt")),
        ctypes=sorted(counts("ctype")), locs=sorted(counts("loc")))


@app.get("/api/colleges")
def colleges():
    a = request.args
    words = a.get("q", "").lower().split()
    f = {k: a.get(k, "") for k in ("state", "district", "spec", "mgmt", "ctype", "loc")}
    order = {"old": BY_OLD, "new": BY_NEW}.get(a.get("sort"), BY_NAME)
    res = [c for c in order
           if all(not v or c[k] == v for k, v in f.items())
           and all(w in c["_s"] for w in words)]
    page = max(0, int(a.get("page", 0) or 0))
    items = [{k: v for k, v in c.items() if k != "_s"}
             for c in res[page * PER_PAGE:(page + 1) * PER_PAGE]]
    return jsonify(total=len(res), items=items)


# ---------- map helpers (server-side so we can send a proper User-Agent) ----------
_lock, _last = threading.Lock(), [0.0]


@lru_cache(maxsize=4096)
def nominatim(q):
    with _lock:  # Nominatim allows max 1 request/second
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
    r = requests.get("https://nominatim.openstreetmap.org/search", headers=UA, timeout=20,
                     params={"format": "json", "limit": 1, "countrycodes": "in", "q": q})
    j = r.json()
    return (float(j[0]["lat"]), float(j[0]["lon"])) if j else None


@app.get("/api/geocode")
def geocode():
    n, d, s = (request.args.get(k, "") for k in ("name", "district", "state"))
    try:
        for q, approx in ((f"{n}, {d}, {s}", False), (f"{n}, {s}", False), (f"{d}, {s}", True)):
            p = nominatim(q)
            if p:
                return jsonify(lat=p[0], lon=p[1], approx=approx)
    except requests.RequestException as e:
        return jsonify(error=str(e)), 502
    return jsonify(error="not found"), 404


def hav(a, b, c, d):
    r = math.pi / 180
    k = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(k))


NAME_RE = ("hostel|paying guest|(^|[^a-zA-Z])PG([^a-zA-Z]|$)|ladies|working women|girls home|boys home|"
           "dormitor|chhatra|vasati|vidyarthi")
GOV = re.compile(r"govt|government|social welfare|tribal|backward|sc/st|minority|samaj kalyan|welfare|municipal|"
                 r"ashram ?shala|navodaya|kendriya|sarkari", re.I)
PG = re.compile(r"(^|[^a-z])pg([^a-z]|$)|paying guest", re.I)
COLLEGE = re.compile(r"college|university|institute|campus|iit|nit|iim|aiims|school", re.I)
WOMEN = re.compile(r"women|ladies|girls?|female", re.I)
MEN = re.compile(r"(^|[^a-z])(boys?|gents?|men'?s?|males?)([^a-z]|$)", re.I)
NOT_STAY = {"school", "college", "university", "restaurant", "cafe", "fast_food", "bank", "hospital", "clinic",
            "pharmacy", "place_of_worship", "library", "bus_station", "kindergarten", "marketplace", "fuel", "atm"}


@lru_cache(maxsize=512)
def overpass(lat, lon, meters):
    a = f"(around:{meters},{lat},{lon})"
    q = ('[out:json][timeout:30];('
         f'nwr["tourism"="hostel"]{a};nwr["building"="dormitory"]{a};nwr["amenity"="student_accommodation"]{a};'
         f'nwr["name"~"{NAME_RE}",i]{a};);out center 200;')
    last = None
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            r = requests.post(url, data={"data": q}, headers=UA, timeout=45)
            r.raise_for_status()
            return r.json()["elements"]
        except (requests.RequestException, ValueError, KeyError) as e:
            last = e
    raise last


def classify(tg):
    """government / pg / college / hostel, plus who it is for."""
    name = tg.get("name", "")
    blob = " ".join(tg.get(k, "") for k in ("name", "operator", "owner", "operator:type"))
    if tg.get("operator:type") in ("government", "public") or GOV.search(blob):
        t = "government"
    elif PG.search(name):
        t = "pg"
    elif COLLEGE.search(blob):
        t = "college"
    else:
        t = "hostel"
    g = {"female": "Girls / Women", "male": "Boys / Men"}.get(tg.get("gender", ""), "")
    if not g:
        g = "Girls / Women" if WOMEN.search(name) else ("Boys / Men" if MEN.search(name) else "")
    return t, g


@app.get("/api/hostels")
def hostels():
    try:
        lat, lon = round(float(request.args["lat"]), 4), round(float(request.args["lon"]), 4)
        km = min(10, max(1, int(request.args.get("km", 3))))
        els = overpass(lat, lon, km * 1000)
    except (KeyError, ValueError):
        return jsonify(error="bad request"), 400
    except Exception as e:
        return jsonify(error=str(e)), 502
    out = []
    for e in els:
        tg = e.get("tags") or {}
        a = e.get("lat", (e.get("center") or {}).get("lat"))
        b = e.get("lon", (e.get("center") or {}).get("lon"))
        if a is None or b is None:
            continue
        strong = (tg.get("tourism") == "hostel" or tg.get("building") == "dormitory"
                  or tg.get("amenity") == "student_accommodation")
        if not strong and (tg.get("amenity") in NOT_STAY or "shop" in tg or "highway" in tg):
            continue
        t, g = classify(tg)
        phone = tg.get("phone") or tg.get("contact:phone") or tg.get("contact:mobile") or tg.get("mobile") or ""
        addr = tg.get("addr:full") or ", ".join(x for x in (tg.get("addr:street"), tg.get("addr:suburb") or tg.get("addr:city")) if x)
        out.append(dict(name=tg.get("name") or "Hostel / PG (name not listed)", lat=a, lon=b,
                        km=round(hav(lat, lon, a, b), 2), type=t, gender=g,
                        phone=phone.split(";")[0].strip(), addr=addr))
    out.sort(key=lambda h: h["km"])
    return jsonify(items=out[:120])


if __name__ == "__main__":
    print(f"Loaded {len(DATA):,} colleges from {CSV_PATH}")
    app.run(debug=True, port=5000)
