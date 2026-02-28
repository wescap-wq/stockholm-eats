import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ── Leaflet via CDN ──────────────────────────────────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["Food", "Vibe", "Service", "Price"];
const NEIGHBORHOODS = [
  "Södermalm", "Östermalm", "Vasastan", "Kungsholmen", "Gamla Stan",
  "Norrmalm", "Other",
];
const CUISINES = [
  "Swedish", "Italian", "Japanese", "Thai", "Indian", "Mexican",
  "French", "Middle Eastern", "American", "Chinese", "Korean", "Other",
];

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function fetchAll() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => row.data);
}

async function upsertRestaurant(restaurant) {
  const { error } = await supabase
    .from("restaurants")
    .upsert({ id: restaurant.id, data: restaurant }, { onConflict: "id" });
  if (error) throw error;
}

async function deleteRestaurant(id) {
  const { error } = await supabase.from("restaurants").delete().eq("id", id);
  if (error) throw error;
}

// ── Star Rating ──────────────────────────────────────────────────────────────
function Stars({ value, onChange, size = 20 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => onChange && onChange(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{
            fontSize: size,
            cursor: onChange ? "pointer" : "default",
            color: n <= (hover || value) ? "#e8a020" : "#ddd",
            transition: "color 0.15s",
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ── Toast notification ───────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "#1a1a1a", color: "#fff", padding: "10px 20px",
      borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 2000,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      animation: "fadeInUp 0.2s ease",
    }}>
      {message}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ onClose, children, title }) {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,12,9,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid #f0ede8",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              border: "none", background: "#f5f2ee", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Restaurant Form ──────────────────────────────────────────────────────────
function RestaurantForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(
    initial || {
      name: "", neighborhood: "Södermalm", cuisine: "Swedish",
      address: "", notes: "", visited: false, wantToTry: false,
      ratings: { Food: 0, Vibe: 0, Service: 0, Price: 0 },
      lat: 59.3293, lng: 18.0686, photos: [],
    }
  );
  const [pickingLocation, setPickingLocation] = useState(false);
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set("photos", [...(form.photos || []), ev.target.result]);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!pickingLocation || !mapRef.current) return;
    loadLeaflet().then((L) => {
      if (leafletMap.current) leafletMap.current.remove();
      const map = L.map(mapRef.current).setView([form.lat || 59.3293, form.lng || 18.0686], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      const marker = L.marker([form.lat || 59.3293, form.lng || 18.0686], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        set("lat", lat); set("lng", lng);
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        set("lat", e.latlng.lat); set("lng", e.latlng.lng);
      });
      leafletMap.current = map;
    });
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, [pickingLocation]);

  const inp = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1.5px solid #e8e4de", fontSize: 14, outline: "none",
    fontFamily: "inherit", background: "#faf8f5", boxSizing: "border-box", marginTop: 4,
  };
  const lbl = { fontSize: 12, fontWeight: 600, color: "#888", letterSpacing: "0.05em", textTransform: "uppercase" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={lbl}>Restaurant Name *</div>
        <input style={inp} value={form.name} onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Fotografiska Matsalen" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={lbl}>Neighborhood</div>
          <select style={inp} value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)}>
            {NEIGHBORHOODS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Cuisine</div>
          <select style={inp} value={form.cuisine} onChange={(e) => set("cuisine", e.target.value)}>
            {CUISINES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div style={lbl}>Address (optional)</div>
        <input style={inp} value={form.address} onChange={(e) => set("address", e.target.value)}
          placeholder="e.g. Stadsgårdshamnen 22" />
      </div>
      <div>
        <div style={lbl}>Status</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {[["visited", "✅ Been there"], ["wantToTry", "🔖 Want to try"]].map(([k, l]) => (
            <button key={k}
              onClick={() => { set("visited", k === "visited"); set("wantToTry", k === "wantToTry"); }}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1.5px solid",
                borderColor: form[k] ? "#2a7a4b" : "#e0dbd4",
                background: form[k] ? "#edf7f1" : "#faf8f5",
                color: form[k] ? "#2a7a4b" : "#888",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>{l}</button>
          ))}
        </div>
      </div>
      {form.visited && (
        <div>
          <div style={lbl}>Ratings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {CATEGORIES.map((cat) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 500, width: 60 }}>{cat}</span>
                <Stars value={form.ratings[cat]}
                  onChange={(v) => set("ratings", { ...form.ratings, [cat]: v })} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={lbl}>Notes</div>
        <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }}
          value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="What did you think? Any dishes to remember?" />
      </div>
      {form.visited && (
        <div>
          <div style={lbl}>Photos</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {(form.photos || []).map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} alt="" />
                <button
                  onClick={() => set("photos", form.photos.filter((_, j) => j !== i))}
                  style={{
                    position: "absolute", top: -4, right: -4, background: "#e53",
                    color: "#fff", border: "none", borderRadius: "50%",
                    width: 20, height: 20, fontSize: 11, cursor: "pointer",
                  }}>×</button>
              </div>
            ))}
            <label style={{
              width: 72, height: 72, border: "2px dashed #d0cbc3", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#aaa", fontSize: 24,
            }}>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />+
            </label>
          </div>
        </div>
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={lbl}>Location on Map</div>
          <button onClick={() => setPickingLocation((p) => !p)} style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1.5px solid #c8c0b4",
            background: pickingLocation ? "#fff3e0" : "#faf8f5", cursor: "pointer",
          }}>{pickingLocation ? "Done" : "📍 Pick on map"}</button>
        </div>
        {pickingLocation && (
          <div ref={mapRef} style={{
            height: 220, borderRadius: 10, marginTop: 8,
            overflow: "hidden", border: "1.5px solid #e0dbd4",
          }} />
        )}
        {!pickingLocation && (
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
            {form.lat ? `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : "Default: Stockholm center"}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #e0dbd4",
          background: "#faf8f5", cursor: "pointer", fontWeight: 600,
        }}>Cancel</button>
        <button
          onClick={() => form.name.trim() && !saving && onSave(form)}
          disabled={!form.name.trim() || saving}
          style={{
            flex: 2, padding: "10px 0", borderRadius: 10, border: "none",
            background: form.name.trim() && !saving ? "#1a1a1a" : "#ccc",
            color: "#fff", cursor: form.name.trim() && !saving ? "pointer" : "default",
            fontWeight: 700, fontSize: 15,
          }}>{saving ? "Saving…" : "Save Restaurant"}</button>
      </div>
    </div>
  );
}

// ── Restaurant Card ──────────────────────────────────────────────────────────
function RestaurantCard({ r, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const avg = r.visited
    ? (Object.values(r.ratings).reduce((a, b) => a + b, 0) / CATEGORIES.length).toFixed(1)
    : null;
  return (
    <div
      style={{
        background: "#fff", borderRadius: 14, overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)", border: "1px solid #f0ede8",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; }}
    >
      {r.photos?.length > 0 && (
        <img src={r.photos[0]} style={{ width: "100%", height: 160, objectFit: "cover" }} alt="" />
      )}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{r.cuisine} · {r.neighborhood}</div>
          </div>
          <span style={{
            padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: r.visited ? "#edf7f1" : "#fff8ee",
            color: r.visited ? "#2a7a4b" : "#b07020",
            whiteSpace: "nowrap", marginLeft: 8,
          }}>{r.visited ? "✅ Visited" : "🔖 Want to try"}</span>
        </div>
        {r.visited && avg && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Stars value={Math.round(parseFloat(avg))} size={14} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e8a020" }}>{avg}</span>
            </div>
            {expanded && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {CATEGORIES.map((cat) => (
                  <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#888" }}>{cat}</span>
                    <Stars value={r.ratings[cat]} size={12} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {r.notes && (
          <div style={{
            marginTop: 8, fontSize: 13, color: "#666", fontStyle: "italic",
            display: expanded ? "block" : "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>"{r.notes}"</div>
        )}
        {expanded && r.photos?.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {r.photos.slice(1).map((p, i) => (
              <img key={i} src={p} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} alt="" />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setExpanded((e) => !e)} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #e8e4de",
            background: "#faf8f5", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#666",
          }}>{expanded ? "Show less" : "Show more"}</button>
          <button onClick={() => onEdit(r)} style={{
            padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e8e4de",
            background: "#faf8f5", cursor: "pointer", fontSize: 12,
          }}>✏️</button>
          <button onClick={() => onDelete(r.id)} style={{
            padding: "6px 14px", borderRadius: 8, border: "1.5px solid #fde8e8",
            background: "#fff5f5", cursor: "pointer", fontSize: 12,
          }}>🗑️</button>
        </div>
      </div>
    </div>
  );
}

// ── Map View ─────────────────────────────────────────────────────────────────
function MapView({ restaurants, filter }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const filtered = restaurants.filter((r) => {
    if (filter === "visited") return r.visited;
    if (filter === "wantToTry") return !r.visited;
    return true;
  });

  useEffect(() => {
    loadLeaflet().then((L) => {
      if (!mapRef.current) return;
      if (!mapInstance.current) {
        mapInstance.current = L.map(mapRef.current).setView([59.3293, 18.0686], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(mapInstance.current);
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      filtered.forEach((r) => {
        if (!r.lat || !r.lng) return;
        const color = r.visited ? "#2ecc71" : "#f39c12";
        const icon = L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.3);transform:rotate(-45deg)"></div>`,
          iconSize: [28, 28], iconAnchor: [14, 28], className: "",
        });
        const avg = r.visited
          ? (Object.values(r.ratings).reduce((a, b) => a + b, 0) / CATEGORIES.length).toFixed(1)
          : null;
        const popup = `
          <div style="font-family:'Playfair Display',serif;min-width:160px">
            ${r.photos?.[0] ? `<img src="${r.photos[0]}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px"/>` : ""}
            <strong style="font-size:15px">${r.name}</strong><br/>
            <span style="font-size:12px;color:#888">${r.cuisine} · ${r.neighborhood}</span><br/>
            ${r.visited && avg ? `<span style="color:#e8a020;font-weight:700">★ ${avg}</span><br/>` : ""}
            ${r.notes ? `<em style="font-size:12px;color:#666">"${r.notes.substring(0, 80)}${r.notes.length > 80 ? "…" : ""}"</em>` : ""}
          </div>`;
        const marker = L.marker([r.lat, r.lng], { icon })
          .addTo(mapInstance.current)
          .bindPopup(popup);
        markersRef.current.push(marker);
      });
    });
  }, [filtered.length, filter, restaurants]);

  return <div ref={mapRef} style={{ height: "100%", width: "100%", borderRadius: 14 }} />;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [restaurants, setRestaurants] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingR, setEditingR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | live | error

  // Load Google Fonts
  useEffect(() => {
    if (!document.head.querySelector('[href*="Playfair"]')) {
      const link = document.createElement("link");
      link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAll()
      .then((data) => { setRestaurants(data); setLoading(false); })
      .catch(() => { setLoading(false); setToast("⚠️ Failed to load — check your connection"); });
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("restaurants-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurants" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setRestaurants((prev) => {
              const exists = prev.find((r) => r.id === payload.new.data.id);
              if (exists) return prev.map((r) => r.id === payload.new.data.id ? payload.new.data : r);
              return [payload.new.data, ...prev];
            });
          }
          if (payload.eventType === "DELETE") {
            setRestaurants((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setSyncStatus("live");
        if (status === "CLOSED" || status === "CHANNEL_ERROR") setSyncStatus("error");
      });

    return () => supabase.removeChannel(channel);
  }, []);

  const saveRestaurant = async (form) => {
    setSaving(true);
    try {
      const restaurant = editingR
        ? { ...form, id: editingR.id }
        : { ...form, id: Date.now().toString() };
      await upsertRestaurant(restaurant);
      // Optimistic update (real-time will also fire but this feels snappier)
      setRestaurants((prev) =>
        editingR
          ? prev.map((r) => r.id === editingR.id ? restaurant : r)
          : [restaurant, ...prev]
      );
      setToast(editingR ? "✅ Updated!" : "✅ Restaurant added!");
      setShowForm(false);
      setEditingR(null);
    } catch {
      setToast("⚠️ Failed to save — try again");
    } finally {
      setSaving(false);
    }
  };

  const deleteR = async (id) => {
    if (!window.confirm("Remove this restaurant?")) return;
    try {
      await deleteRestaurant(id);
      setRestaurants((prev) => prev.filter((r) => r.id !== id));
      setToast("🗑️ Removed");
    } catch {
      setToast("⚠️ Failed to delete — try again");
    }
  };

  const filtered = restaurants.filter((r) => {
    const matchFilter =
      filter === "all" ||
      (filter === "visited" && r.visited) ||
      (filter === "wantToTry" && !r.visited);
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(q) ||
      r.neighborhood.toLowerCase().includes(q) ||
      r.cuisine.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const visitedCount = restaurants.filter((r) => r.visited).length;
  const wantCount = restaurants.filter((r) => !r.visited).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f4f0", fontFamily: "'DM Sans', sans-serif", color: "#1a1a1a" }}>
      {/* CSS animations */}
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>

      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #ede9e3",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: "100%", margin: "0 auto", padding: "0 24px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 16, paddingBottom: 16,
          }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                🍽 Stockholm Eats
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{visitedCount} visited · {wantCount} on the list</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 600,
                  color: syncStatus === "live" ? "#2a7a4b" : syncStatus === "error" ? "#c0392b" : "#888",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                    background: syncStatus === "live" ? "#2ecc71" : syncStatus === "error" ? "#e74c3c" : "#bbb",
                  }} />
                  {syncStatus === "live" ? "Live" : syncStatus === "error" ? "Offline" : "Connecting…"}
                </span>
              </div>
            </div>
            <button
              onClick={() => { setEditingR(null); setShowForm(true); }}
              style={{
                background: "#1a1a1a", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 10, fontWeight: 700,
                fontSize: 14, cursor: "pointer", fontFamily: "inherit",
              }}
            >+ Add Restaurant</button>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: "100%", margin: 0, padding: "20px 24px", boxSizing: "border-box" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants, neighborhoods, cuisines…"
            style={{
              flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 10,
              border: "1.5px solid #e0dbd4", background: "#fff", fontSize: 14,
              fontFamily: "inherit", outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {[["all", "All"], ["visited", "🟢 Visited"], ["wantToTry", "🟠 Want to try"]].map(([f, l]) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "8px 14px", borderRadius: 10, border: "1.5px solid",
                borderColor: filter === f ? "#1a1a1a" : "#e0dbd4",
                background: filter === f ? "#1a1a1a" : "#fff",
                color: filter === f ? "#fff" : "#666",
                fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Map (left) + List (right) side by side */}
        <div style={{
          display: "flex", gap: 24, minHeight: "calc(100vh - 220px)",
          alignItems: "stretch",
        }}>
          {/* Map - left */}
          <div style={{
            flex: "1 1 50%", minWidth: 0, display: "flex", flexDirection: "column",
          }}>
            <div style={{
              flex: 1, minHeight: 400, borderRadius: 14, overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)", background: "#e8e4de",
            }}>
              <MapView restaurants={restaurants} filter={filter} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666" }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#2ecc71" }} /> Visited
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666" }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#f39c12" }} /> Want to try
              </div>
            </div>
          </div>

          {/* List - right */}
          <div style={{
            flex: "1 1 50%", minWidth: 0, overflowY: "auto",
          }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "#aaa", paddingTop: 48, fontSize: 14 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", paddingTop: 64 }}>
                <div style={{ fontSize: 48 }}>🍜</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, marginTop: 12 }}>
                  {restaurants.length === 0 ? "No restaurants yet!" : "Nothing matches your filter"}
                </div>
                <div style={{ color: "#aaa", marginTop: 6, fontSize: 14 }}>
                  {restaurants.length === 0 ? "Add your first Stockholm gem" : "Try a different search or filter"}
                </div>
                {restaurants.length === 0 && (
                  <button onClick={() => { setEditingR(null); setShowForm(true); }} style={{
                    marginTop: 20, background: "#1a1a1a", color: "#fff", border: "none",
                    padding: "12px 24px", borderRadius: 10, fontWeight: 700,
                    fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                  }}>+ Add your first restaurant</button>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {filtered.map((r) => (
                  <RestaurantCard key={r.id} r={r}
                    onEdit={(r) => { setEditingR(r); setShowForm(true); }}
                    onDelete={deleteR} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal
          title={editingR ? `Edit: ${editingR.name}` : "Add a Restaurant"}
          onClose={() => { setShowForm(false); setEditingR(null); }}
        >
          <RestaurantForm
            initial={editingR}
            onSave={saveRestaurant}
            onCancel={() => { setShowForm(false); setEditingR(null); }}
            saving={saving}
          />
        </Modal>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
