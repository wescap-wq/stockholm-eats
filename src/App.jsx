import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => resolve(window.L);
    document.head.appendChild(script);
  });
}

const CATEGORIES = ["Food", "Vibe", "Service", "Price"];
const NEIGHBORHOODS = [
  "Södermalm","Östermalm","Vasastan","Kungsholmen","Gamla Stan",
  "Norrmalm","Lidingö","Djurgården","Nacka","Solna","Other",
];
const CUISINES = [
  "Swedish","Italian","Japanese","Thai","Indian","Mexican",
  "French","Middle Eastern","American","Chinese","Korean","Other",
];

async function fetchAll() {
  const { data, error } = await supabase.from("restaurants").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((r) => r.data);
}
async function upsertRestaurant(r) {
  const { error } = await supabase.from("restaurants").upsert({ id: r.id, data: r }, { onConflict: "id" });
  if (error) throw error;
}
async function deleteRestaurant(id) {
  const { error } = await supabase.from("restaurants").delete().eq("id", id);
  if (error) throw error;
}

function Stars({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize: size, cursor: onChange ? "pointer" : "default",
            color: n <= (hover || value) ? "#e8a020" : "#e0dbd4",
            transition: "color 0.12s", lineHeight: 1 }}>★</span>
      ))}
    </div>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      background: "#1c2b1e", color: "#a8d5a2", padding: "10px 22px",
      borderRadius: 100, fontSize: 13, fontWeight: 600, zIndex: 3000,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)", border: "1px solid rgba(168,213,162,0.3)",
      animation: "toastIn 0.2s ease", whiteSpace: "nowrap",
    }}>{message}</div>
  );
}

function Modal({ onClose, children, title }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(10,18,11,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000, padding: 16, backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 540,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "22px 26px 18px", borderBottom: "1px solid #f0ede8",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{
            border: "none", background: "#f5f2ee", borderRadius: "50%",
            width: 34, height: 34, cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#666",
          }}>×</button>
        </div>
        <div style={{ padding: "22px 26px 28px" }}>{children}</div>
      </div>
    </div>
  );
}

function RestaurantForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || {
    name: "", neighborhood: "Södermalm", cuisine: "Swedish",
    address: "", notes: "", visited: false, wantToTry: false,
    ratings: { Food: 0, Vibe: 0, Service: 0, Price: 0 },
    lat: 59.3293, lng: 18.0686, photos: [],
  });
  const [pickingLocation, setPickingLocation] = useState(false);
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set("photos", [...(form.photos || []), ev.target.result]);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!pickingLocation || !mapRef.current) return;
    loadLeaflet().then(L => {
      if (leafletMap.current) leafletMap.current.remove();
      const map = L.map(mapRef.current).setView([form.lat || 59.3293, form.lng || 18.0686], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      const marker = L.marker([form.lat || 59.3293, form.lng || 18.0686], { draggable: true }).addTo(map);
      marker.on("dragend", () => { const { lat, lng } = marker.getLatLng(); set("lat", lat); set("lng", lng); });
      map.on("click", e => { marker.setLatLng(e.latlng); set("lat", e.latlng.lat); set("lng", e.latlng.lng); });
      leafletMap.current = map;
    });
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, [pickingLocation]);

  const inp = {
    width: "100%", padding: "9px 13px", borderRadius: 10,
    border: "1.5px solid #e8e4de", fontSize: 14, outline: "none",
    fontFamily: "inherit", background: "#faf8f5", boxSizing: "border-box", marginTop: 5,
  };
  const lbl = { fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: "0.08em", textTransform: "uppercase" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={lbl}>Restaurant Name *</div>
        <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Fotografiska Matsalen" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={lbl}>Neighborhood</div>
          <select style={inp} value={form.neighborhood} onChange={e => set("neighborhood", e.target.value)}>
            {NEIGHBORHOODS.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Cuisine</div>
          <select style={inp} value={form.cuisine} onChange={e => set("cuisine", e.target.value)}>
            {CUISINES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div style={lbl}>Address</div>
        <input style={inp} value={form.address} onChange={e => set("address", e.target.value)} placeholder="e.g. Stadsgårdshamnen 22" />
      </div>
      <div>
        <div style={lbl}>Status</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {[["visited","✅ Been there"],["wantToTry","🔖 Want to try"]].map(([k,l]) => (
            <button key={k} onClick={() => { set("visited", k==="visited"); set("wantToTry", k==="wantToTry"); }} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px solid",
              borderColor: form[k] ? "#2a5c34" : "#e0dbd4",
              background: form[k] ? "#edf7f1" : "#faf8f5",
              color: form[k] ? "#2a5c34" : "#888",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>
      </div>
      {form.visited && (
        <div>
          <div style={lbl}>Ratings</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {CATEGORIES.map(cat => (
              <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#555", width: 60 }}>{cat}</span>
                <Stars value={form.ratings[cat]} onChange={v => set("ratings", { ...form.ratings, [cat]: v })} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={lbl}>Notes</div>
        <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }}
          value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Standout dishes, ambiance, would you go back?" />
      </div>
      {form.visited && (
        <div>
          <div style={lbl}>Photos</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {(form.photos || []).map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 10 }} alt="" />
                <button onClick={() => set("photos", form.photos.filter((_,j)=>j!==i))} style={{
                  position: "absolute", top: -5, right: -5, background: "#e53",
                  color: "#fff", border: "2px solid #fff", borderRadius: "50%",
                  width: 22, height: 22, fontSize: 11, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>×</button>
              </div>
            ))}
            <label style={{
              width: 70, height: 70, border: "2px dashed #d0cbc3", borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#bbb", fontSize: 26,
            }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />+
            </label>
          </div>
        </div>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={lbl}>Map Location</div>
          <button onClick={() => setPickingLocation(p => !p)} style={{
            fontSize: 12, padding: "4px 12px", borderRadius: 20, border: "1.5px solid #c8c0b4",
            background: pickingLocation ? "#fff3e0" : "#faf8f5", cursor: "pointer", fontWeight: 600,
          }}>{pickingLocation ? "✓ Done" : "📍 Pick location"}</button>
        </div>
        {pickingLocation && <div ref={mapRef} style={{ height: 200, borderRadius: 12, marginTop: 8, overflow: "hidden", border: "1.5px solid #e0dbd4" }} />}
        {!pickingLocation && <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>{form.lat?.toFixed(4)}, {form.lng?.toFixed(4)}</div>}
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "11px 0", borderRadius: 12, border: "1.5px solid #e0dbd4",
          background: "#faf8f5", cursor: "pointer", fontWeight: 600, fontSize: 14,
        }}>Cancel</button>
        <button onClick={() => form.name.trim() && !saving && onSave(form)}
          disabled={!form.name.trim() || saving}
          style={{
            flex: 2, padding: "11px 0", borderRadius: 12, border: "none",
            background: form.name.trim() && !saving ? "#1c2b1e" : "#ccc",
            color: "#fff", cursor: form.name.trim() && !saving ? "pointer" : "default",
            fontWeight: 700, fontSize: 15,
          }}>{saving ? "Saving…" : "Save Restaurant"}</button>
      </div>
    </div>
  );
}

function MapBackground({ restaurants, filter }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const filtered = restaurants.filter(r =>
    filter === "all" ? true : filter === "visited" ? r.visited : !r.visited
  );

  useEffect(() => {
    loadLeaflet().then(L => {
      if (!mapRef.current) return;
      if (!mapInstance.current) {
        mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([59.3293, 18.0686], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(mapInstance.current);
        L.control.zoom({ position: "bottomright" }).addTo(mapInstance.current);
      }
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      filtered.forEach(r => {
        if (!r.lat || !r.lng) return;
        const color = r.visited ? "#3d8b5e" : "#e8a020";
        const border = r.visited ? "#2a5c34" : "#b07020";
        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${color};border:3px solid ${border};box-shadow:0 4px 14px rgba(0,0,0,0.35);transform:rotate(-45deg)"></div>`,
          iconSize: [32,32], iconAnchor: [16,32], className: "",
        });
        const avg = r.visited ? (Object.values(r.ratings).reduce((a,b)=>a+b,0)/CATEGORIES.length).toFixed(1) : null;
        const marker = L.marker([r.lat, r.lng], { icon }).addTo(mapInstance.current).bindPopup(`
          <div style="font-family:'Cormorant Garamond',serif;min-width:180px;padding:4px">
            ${r.photos?.[0] ? `<img src="${r.photos[0]}" style="width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:10px"/>` : ""}
            <div style="font-size:17px;font-weight:700;line-height:1.2">${r.name}</div>
            <div style="font-size:12px;color:#888;margin-top:3px;font-family:sans-serif">${r.cuisine} · ${r.neighborhood}</div>
            ${avg ? `<div style="color:#e8a020;font-weight:700;margin-top:6px;font-family:sans-serif">★ ${avg}</div>` : `<div style="color:#e8a020;margin-top:6px;font-family:sans-serif">🔖 Want to try</div>`}
            ${r.notes ? `<div style="font-size:12px;color:#666;margin-top:6px;font-style:italic;font-family:sans-serif">"${r.notes.substring(0,90)}${r.notes.length>90?"…":""}"</div>` : ""}
          </div>`
        );
        markersRef.current.push(marker);
      });
    });
  }, [restaurants, filter]);

  return <div ref={mapRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} />;
}

function ListCard({ r, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const avg = r.visited ? (Object.values(r.ratings).reduce((a,b)=>a+b,0)/CATEGORIES.length).toFixed(1) : null;
  return (
    <div style={{
      background: "rgba(255,255,255,0.97)", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 2px 16px rgba(0,0,0,0.07)", border: "1px solid rgba(0,0,0,0.05)",
      transition: "transform 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseLeave={e => e.currentTarget.style.transform = ""}
    >
      {r.photos?.[0] && <img src={r.photos[0]} style={{ width: "100%", height: 140, objectFit: "cover" }} alt="" />}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>{r.cuisine} · {r.neighborhood}</div>
          </div>
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            background: r.visited ? "#edf7f1" : "#fff8ee",
            color: r.visited ? "#2a5c34" : "#b07020",
          }}>{r.visited ? "✅ Visited" : "🔖 Want to try"}</span>
        </div>
        {r.visited && avg && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Stars value={Math.round(parseFloat(avg))} size={13} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e8a020" }}>{avg}</span>
            </div>
            {expanded && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {CATEGORIES.map(cat => (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#999" }}>{cat}</span>
                    <Stars value={r.ratings[cat]} size={12} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {r.notes && (
          <div style={{
            marginTop: 8, fontSize: 13, color: "#777", fontStyle: "italic",
            display: expanded ? "block" : "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>"{r.notes}"</div>
        )}
        {expanded && r.photos?.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {r.photos.slice(1).map((p,i) => <img key={i} src={p} style={{ width:60,height:60,objectFit:"cover",borderRadius:8 }} alt="" />)}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button onClick={() => setExpanded(e => !e)} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, border: "1px solid #e8e4de",
            background: "#faf8f5", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#666",
          }}>{expanded ? "Less" : "More"}</button>
          <button onClick={() => onEdit(r)} style={{
            padding: "6px 12px", borderRadius: 8, border: "1px solid #e8e4de",
            background: "#faf8f5", cursor: "pointer", fontSize: 12,
          }}>✏️</button>
          <button onClick={() => onDelete(r.id)} style={{
            padding: "6px 12px", borderRadius: 8, border: "1px solid #fde8e8",
            background: "#fff5f5", cursor: "pointer", fontSize: 12,
          }}>🗑️</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [restaurants, setRestaurants] = useState([]);
  const [tab, setTab] = useState("map");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingR, setEditingR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [syncStatus, setSyncStatus] = useState("connecting");

  useEffect(() => {
    if (!document.head.querySelector('[href*="Cormorant"]')) {
      const link = document.createElement("link");
      link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    fetchAll().then(data => { setRestaurants(data); setLoading(false); })
      .catch(() => { setLoading(false); setToast("⚠️ Could not load restaurants"); });
  }, []);

  useEffect(() => {
    const channel = supabase.channel("restaurants-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, payload => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          setRestaurants(prev => {
            const exists = prev.find(r => r.id === payload.new.data.id);
            return exists ? prev.map(r => r.id === payload.new.data.id ? payload.new.data : r) : [payload.new.data, ...prev];
          });
        }
        if (payload.eventType === "DELETE") setRestaurants(prev => prev.filter(r => r.id !== payload.old.id));
      })
      .subscribe(s => {
        if (s === "SUBSCRIBED") setSyncStatus("live");
        if (s === "CLOSED" || s === "CHANNEL_ERROR") setSyncStatus("error");
      });
    return () => supabase.removeChannel(channel);
  }, []);

  const saveRestaurant = async (form) => {
    setSaving(true);
    try {
      const restaurant = editingR ? { ...form, id: editingR.id } : { ...form, id: Date.now().toString() };
      await upsertRestaurant(restaurant);
      setRestaurants(prev => editingR ? prev.map(r => r.id === editingR.id ? restaurant : r) : [restaurant, ...prev]);
      setToast(editingR ? "✅ Updated!" : "✅ Added!");
      setShowForm(false); setEditingR(null);
    } catch { setToast("⚠️ Failed to save"); }
    finally { setSaving(false); }
  };

  const deleteR = async (id) => {
    if (!window.confirm("Remove this restaurant?")) return;
    try {
      await deleteRestaurant(id);
      setRestaurants(prev => prev.filter(r => r.id !== id));
      setToast("🗑️ Removed");
    } catch { setToast("⚠️ Failed to delete"); }
  };

  const filtered = restaurants.filter(r => {
    const mf = filter === "all" || (filter === "visited" && r.visited) || (filter === "wantToTry" && !r.visited);
    const q = search.toLowerCase();
    const ms = !search || r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q);
    return mf && ms;
  });

  const visitedCount = restaurants.filter(r => r.visited).length;
  const wantCount = restaurants.filter(r => !r.visited).length;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: "#1a1a1a" }}>
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
      `}</style>

      {/* Full-screen map always behind everything */}
      <MapBackground restaurants={restaurants} filter={filter} />

      {/* Floating top header */}
      <div style={{
        position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
        zIndex: 100, display: "flex", alignItems: "center", gap: 10,
        background: "rgba(28,43,30,0.93)", backdropFilter: "blur(20px)",
        borderRadius: 100, padding: "7px 7px 7px 20px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07)",
      }}>
        <span style={{ fontSize: 17 }}>🍽</span>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 19,
          color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap", marginRight: 6,
        }}>Stockholm Eats</span>

        {/* Map / List toggle */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: 100, padding: 3 }}>
          {[["map","🗺 Map"],["list","☰ List"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 16px", borderRadius: 100, border: "none",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "#1c2b1e" : "rgba(255,255,255,0.65)",
              fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.18s",
            }}>{l}</button>
          ))}
        </div>

        {/* Live indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: syncStatus === "live" ? "#4ade80" : syncStatus === "error" ? "#f87171" : "#777",
          boxShadow: syncStatus === "live" ? "0 0 8px #4ade80" : "none",
        }} />

        {/* Add button */}
        <button onClick={() => { setEditingR(null); setShowForm(true); }} style={{
          background: "#4ade80", color: "#1c2b1e", border: "none",
          padding: "9px 20px", borderRadius: 100, fontWeight: 800,
          fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 2px 16px rgba(74,222,128,0.45)",
          whiteSpace: "nowrap", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
          onMouseLeave={e => e.currentTarget.style.transform = ""}
        >+ Add</button>
      </div>

      {/* Map filter bar (only in map view) */}
      {tab === "map" && (
        <div style={{
          position: "fixed", bottom: 36, left: "50%", transform: "translateX(-50%)",
          zIndex: 100, display: "flex", alignItems: "center", gap: 4,
          background: "rgba(28,43,30,0.9)", backdropFilter: "blur(16px)",
          borderRadius: 100, padding: "8px 16px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.07)",
          flexWrap: "wrap", justifyContent: "center",
        }}>
          {[["all","All"],["visited","Visited"],["wantToTry","Want to try"]].map(([f,l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 14px", borderRadius: 100, border: "none",
              background: filter === f ? "rgba(255,255,255,0.18)" : "transparent",
              color: filter === f ? "#fff" : "rgba(255,255,255,0.45)",
              fontWeight: filter === f ? 700 : 400, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}>{l}</button>
          ))}
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#3d8b5e" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{visitedCount}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#e8a020" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{wantCount}</span>
          </div>
        </div>
      )}

      {/* List side panel */}
      {tab === "list" && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(460px, 100vw)",
          background: "rgba(247,244,240,0.98)", backdropFilter: "blur(24px)",
          zIndex: 90, overflowY: "auto",
          boxShadow: "-12px 0 48px rgba(0,0,0,0.18)",
          animation: "slideIn 0.22s ease",
          borderLeft: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{ padding: "88px 20px 32px" }}>
            {/* Search */}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Search restaurants, neighborhoods…"
              style={{
                width: "100%", padding: "11px 16px", borderRadius: 12,
                border: "1.5px solid #e0dbd4", background: "#fff", fontSize: 14,
                fontFamily: "inherit", outline: "none", marginBottom: 10,
              }}
            />
            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {[["all","All"],["visited","✅ Visited"],["wantToTry","🔖 Want to try"]].map(([f,l]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "1.5px solid",
                  borderColor: filter === f ? "#1c2b1e" : "#e0dbd4",
                  background: filter === f ? "#1c2b1e" : "#fff",
                  color: filter === f ? "#fff" : "#777",
                  fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}>{l}</button>
              ))}
            </div>
            {/* Stats row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
              {[["🍽", visitedCount, "visited"],["🔖", wantCount, "to try"]].map(([icon,count,label]) => (
                <div key={label} style={{
                  flex: 1, background: "#fff", borderRadius: 14, padding: "14px 16px",
                  border: "1px solid #f0ede8", textAlign: "center",
                  boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{count}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
            {/* Cards */}
            {loading ? (
              <div style={{ textAlign: "center", color: "#bbb", paddingTop: 40, fontSize: 14 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 48 }}>
                <div style={{ fontSize: 44 }}>🍜</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, marginTop: 12 }}>
                  {restaurants.length === 0 ? "No restaurants yet!" : "Nothing matches"}
                </div>
                <div style={{ color: "#bbb", fontSize: 13, marginTop: 6 }}>
                  {restaurants.length === 0 ? "Hit + Add to get started" : "Try a different filter"}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filtered.map(r => (
                  <ListCard key={r.id} r={r}
                    onEdit={r => { setEditingR(r); setShowForm(true); }}
                    onDelete={deleteR} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <Modal title={editingR ? `Edit: ${editingR.name}` : "Add a Restaurant"}
          onClose={() => { setShowForm(false); setEditingR(null); }}>
          <RestaurantForm initial={editingR} onSave={saveRestaurant}
            onCancel={() => { setShowForm(false); setEditingR(null); }} saving={saving} />
        </Modal>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
