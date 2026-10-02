const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const api = async (path, params) => {
  const r = await fetch(path + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error(r.status);
  return r.json();
};
const IC = [[/engineer/, "⚙️"], [/medic|nurs|pharm|dental|ayur|homeo|unani|physio|health/, "🩺"], [/educat/, "📚"], [/law/, "⚖️"], [/agri|horti|veter|fish|dairy/, "🌾"], [/manag/, "📊"], [/sci/, "🔬"], [/art|design|fine|music|dance|journal/, "🎨"], [/comm/, "💼"]];
const icon = t => { t = t.toLowerCase(); for (const [r, i] of IC) if (r.test(t)) return i; return "🎓"; };

let META, page = 0, total = 0, busy = false, saved = new Set(), CACHE = {}, gen = 0;
const FIL = { fs: "state", fd: "district", fp: "spec", fm: "mgmt", fc: "ctype", fl: "loc" };
const fill = (id, label, arr) => $(id).innerHTML = `<option value="">${label}</option>` + arr.map(v => `<option>${esc(v)}</option>`).join("");

function params() {
  const p = { q: $("q").value.trim(), sort: $("so").value, page };
  for (const [id, k] of Object.entries(FIL)) p[k] = $(id).value;
  return p;
}
async function load(reset) {
  if (busy) return;
  if (reset) { page = 0; gen++; $("grid").innerHTML = ""; }
  busy = true; const g = gen;
  try {
    const d = await api("/api/colleges", params());
    if (g !== gen) return;
    total = d.total;
    $("count").textContent = total.toLocaleString("en-IN") + " college" + (total == 1 ? "" : "s") + " found";
    if (!total) $("grid").innerHTML = '<div class="empty">😕 No colleges match. Try loosening your filters.</div>';
    $("grid").insertAdjacentHTML("beforeend", d.items.map((x, k) => card(x, k)).join(""));
    page++;
  } catch (e) { $("grid").innerHTML = '<div class="empty">⚠️ Could not reach the server.</div>'; }
  busy = false;
  if (document.body.getBoundingClientRect().height < innerHeight && page * 24 < total) load();
}
function card(x, k) {
  CACHE[x.id] = x;
  const show = !/^(General|Not specified)$/.test(x.spec), q = encodeURIComponent(`${x.name}, ${x.district}, ${x.state}`);
  return `<article class="card" style="animation-delay:${k * 40}ms"><div class="top"><div class="ico">${icon(x.spec)}</div>${x.year ? `<span class="yr">Est. ${x.year}</span>` : ""}</div>
  <h3>${esc(x.name)}</h3><div class="loc">📍 ${esc(x.district)}, ${esc(x.state)}</div>${x.addr ? `<div class="adr">${esc(x.addr)}</div>` : ""}
  <div class="tags">${show ? `<span>${esc(x.spec)}</span>` : ""}${x.mgmt != "Not specified" ? `<span>${esc(x.mgmt)}</span>` : ""}<span>${esc(x.ctype)}</span>${x.loc != "Not specified" ? `<span>${esc(x.loc)}</span>` : ""}</div>
  <div class="foot"><span class="u">🏛 ${esc(x.univ)}</span><button class="mapb" data-i="${x.id}">🏠 Hostels</button>
  <a class="m" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">🗺 Map</a><a class="m" href="https://www.google.com/maps/dir/?api=1&destination=${q}" target="_blank" rel="noopener">🧭 Route</a>
  ${x.web ? `<a href="${esc(x.web)}" target="_blank" rel="noopener">Website ↗</a>` : ""}<button class="save${saved.has(x.id) ? " on" : ""}" data-i="${x.id}" aria-label="Save">${saved.has(x.id) ? "❤️" : "🤍"}</button></div></article>`;
}
$("grid").onclick = e => {
  const mb = e.target.closest(".mapb"); if (mb) return openMap(CACHE[mb.dataset.i]);
  const b = e.target.closest(".save"); if (!b) return;
  const i = +b.dataset.i; saved.has(i) ? saved.delete(i) : saved.add(i);
  b.classList.toggle("on", saved.has(i)); b.textContent = saved.has(i) ? "❤️" : "🤍";
  $("saved").textContent = "♥ " + saved.size + " saved"; toast((saved.has(i) ? "Saved " : "Removed ") + CACHE[i].name);
};
$("grid").onmousemove = e => { const c = e.target.closest(".card"); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty("--x", e.clientX - r.left + "px"); c.style.setProperty("--y", e.clientY - r.top + "px"); };
let tm; function toast(m) { const b = $("bar"); b.textContent = m; b.classList.add("show"); clearTimeout(tm); tm = setTimeout(() => b.classList.remove("show"), 1800); }
new IntersectionObserver(e => { if (e[0].isIntersecting && page * 24 < total) load(); }, { rootMargin: "600px" }).observe($("more"));

// ---------- filters ----------
let dq; $("q").addEventListener("input", () => { clearTimeout(dq); dq = setTimeout(() => load(true), 250); });
["fd", "fp", "fm", "fc", "fl", "so"].forEach(i => $(i).addEventListener("change", () => load(true)));
function fillD() { const s = $("fs").value; fill("fd", "All districts", s ? META.districts[s] : [...new Set(Object.values(META.districts).flat())].sort()); }
$("fs").addEventListener("change", () => { fillD(); load(true); });
$("clr").onclick = () => { $("q").value = ""; Object.keys(FIL).forEach(i => $(i).value = ""); $("so").value = "name"; fillD(); load(true); };
$("theme").onclick = () => { const r = document.documentElement, d = r.dataset.theme ? r.dataset.theme == "dark" : matchMedia("(prefers-color-scheme:dark)").matches; r.dataset.theme = d ? "light" : "dark"; };
function cnt(id, n) { const el = $(id); let v = 0; const st = Math.max(1, Math.ceil(n / 50)), t = setInterval(() => { v = Math.min(n, v + st); el.textContent = v.toLocaleString("en-IN"); if (v >= n) clearInterval(t); }, 25); }

// ---------- side map: college, hostels, live tracking ----------
let MAP, LG, HG, ME, MEC, CP = null, WID = null, TK = 0, CUR = null;
const say = t => $("stat").textContent = t;
const pin = h => L.divIcon({ html: '<div class="pin">' + h + "</div>", className: "", iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] });
const hav = (a, b, c, d) => { const r = Math.PI / 180, k = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(k)); };
async function openMap(x) {
  const tok = ++TK; CUR = x;
  $("side").classList.add("open"); $("sT").textContent = x.name; $("sA").textContent = x.district + ", " + x.state;
  if (!MAP) { MAP = L.map("map"); L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(MAP); LG = L.layerGroup().addTo(MAP); HG = L.layerGroup().addTo(MAP); MAP.setView([22.5, 79], 5); }
  setTimeout(() => MAP.invalidateSize(), 480);
  LG.clearLayers(); HG.clearLayers(); $("hl").innerHTML = ""; CP = null; say("Finding the college on the map…");
  let g;
  try { g = await api("/api/geocode", { name: x.name, district: x.district, state: x.state }); } catch (e) { }
  if (tok !== TK) return;
  if (!g) return say("Could not locate this college. Check your internet connection and try again.");
  CP = [g.lat, g.lon]; MAP.setView(CP, g.approx ? 12 : 15);
  L.marker(CP, { icon: pin("🎓") }).addTo(LG).bindPopup("<b>" + esc(x.name) + "</b>" + (g.approx ? "<br><small>Approximate (district centre)</small>" : "")).openPopup();
  hostels(g.approx);
}
const TI = { government: "🏛", pg: "🛏", college: "🏫", hostel: "🏠" }, TL = { government: "Government hostel", pg: "PG", college: "College hostel", hostel: "Hostel" };
let HS = [], HF = "all", HAP = false;
async function hostels(approx) {
  if (!CP) return;
  const tok = TK, km = +$("rad").value; HAP = approx; HF = "all"; HS = [];
  HG.clearLayers(); $("hl").innerHTML = ""; $("tchips").innerHTML = ""; say("Searching hostels, PGs and government hostels…");
  const nm = encodeURIComponent(CUR.name + ", " + CUR.district + ", " + CUR.state);
  $("gl").innerHTML = "<span>Search more on Google Maps:</span>" + [["Hostels", "hostel"], ["PGs", "PG"], ["Govt hostels", "government hostel"]].map(([l, q]) => `<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent(q)}+near+${nm}">${l} ↗</a>`).join("");
  try {
    HS = (await api("/api/hostels", { lat: CP[0], lon: CP[1], km })).items;
    if (tok !== TK) return;
    drawH();
  } catch (e) { if (tok === TK) say("Hostel search failed (server busy or offline). Try again in a moment."); }
}
function drawH() {
  HG.clearLayers();
  const c = { all: HS.length }; HS.forEach(h => c[h.type] = (c[h.type] || 0) + 1);
  $("tchips").innerHTML = ["all", "government", "pg", "hostel", "college"].filter(t => c[t]).map(t => `<button class="${t == HF ? "on" : ""}" data-t="${t}">${t == "all" ? "All" : TI[t] + " " + TL[t]} (${c[t]})</button>`).join("");
  const hs = HS.filter(h => HF == "all" || h.type == HF);
  hs.forEach(h => h.m = L.marker([h.lat, h.lon], { icon: pin(TI[h.type]) }).addTo(HG).bindPopup(`<b>${esc(h.name)}</b><br>${TL[h.type]}${h.gender ? " · " + h.gender : ""}<br>${h.km} km from college${h.phone ? `<br>📞 <a href="tel:${esc(h.phone)}">${esc(h.phone)}</a>` : ""}<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}">🧭 Directions</a>`));
  $("hl").innerHTML = hs.map((h, k) => `<div class="hi" data-k="${k}"><div><b>${TI[h.type]} ${esc(h.name)}</b><br><small>${TL[h.type]}${h.gender ? " · " + h.gender : ""}${h.addr ? " · " + esc(h.addr) : ""}</small>${h.phone ? `<br><small>📞 <a href="tel:${esc(h.phone)}">${esc(h.phone)}</a></small>` : ""}</div><b>${h.km} km</b></div>`).join("");
  $("hl").onclick = e => { const el = e.target.closest(".hi"); if (!el || e.target.closest("a")) return; const h = hs[+el.dataset.k]; MAP.flyTo([h.lat, h.lon], 17); h.m.openPopup(); };
  const km = $("rad").value;
  say(HS.length ? HS.length + " hostels / PGs found within " + km + " km" + (HAP ? " of the district centre (college location is approximate)" : "") + ". Map data may be incomplete." : "Nothing listed on OpenStreetMap within " + km + " km. Try a wider radius or the Google Maps links below.");
}
$("tchips").onclick = e => { const b = e.target.closest("button"); if (!b) return; HF = b.dataset.t; drawH(); };
$("rad").onchange = () => hostels();
$("cx").onclick = () => $("side").classList.remove("open");
document.addEventListener("keydown", e => { if (e.key == "Escape") $("side").classList.remove("open"); });
$("live").onclick = () => {
  if (WID != null) { navigator.geolocation.clearWatch(WID); WID = null; $("live").textContent = "📡 Start live tracking"; if (ME) { MAP.removeLayer(ME); MAP.removeLayer(MEC); ME = MEC = null; } return say("Live tracking stopped."); }
  if (!navigator.geolocation || !MAP) return say("Location is not supported here.");
  $("live").textContent = "⏹ Stop tracking"; say("Waiting for your location…"); let first = true;
  WID = navigator.geolocation.watchPosition(p => {
    const u = [p.coords.latitude, p.coords.longitude];
    if (!ME) { ME = L.marker(u, { icon: L.divIcon({ html: '<div class="me"></div>', className: "", iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(MAP); MEC = L.circle(u, { radius: p.coords.accuracy, weight: 1 }).addTo(MAP); }
    else { ME.setLatLng(u); MEC.setLatLng(u); MEC.setRadius(p.coords.accuracy); }
    const km = CP ? hav(u[0], u[1], CP[0], CP[1]) : null;
    say("📡 Live · " + (km != null ? km.toFixed(2) + " km from college · " : "") + "±" + Math.round(p.coords.accuracy) + " m");
    if (first && CP) { MAP.fitBounds([u, CP], { padding: [40, 40] }); first = false; } else if ($("fol").checked) MAP.panTo(u);
  }, () => say("Location blocked. Allow location access for this site in your browser."), { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
};

// ---------- start ----------
(async () => {
  META = await api("/api/meta", {});
  fill("fs", "All states", META.states); fillD(); fill("fp", "All streams", META.specs); fill("fm", "All management", META.mgmts); fill("fc", "All types", META.ctypes); fill("fl", "Urban & rural", META.locs);
  cnt("s1", META.total); cnt("s2", META.states.length); cnt("s3", META.district_total);
  load(true);
})();
