import { useState, useEffect, useRef } from "react";

function GynecologistMapModal({ show, onClose }) {
  const [userLocation, setUserLocation] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const mapInitialized = useRef(false);
  const routeControlRef = useRef(null);

  const DEFAULT_LOCATION = {
    lat: 33.6844,
    lng: 73.0479,
    name: "Islamabad, Pakistan",
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!show) {
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      mapInitialized.current = false;
      setUserLocation(null);
      setHospitals([]);
      setLoading(true);
      setError(null);
      markersRef.current = [];
      routeControlRef.current = null;
    }
  }, [show]);

  // Get user location
  useEffect(() => {
    if (show && !userLocation) {
      getUserLocation();
    }
  }, [show]);

  // Initialize map when location is ready
  useEffect(() => {
    if (show && userLocation && !mapInitialized.current) {
      initializeMap();
    }
  }, [show, userLocation]);

  const getUserLocation = () => {
    setLoading(true);
    setError(null);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            name: "Your Location",
          });
        },
        (err) => {
          console.warn("Geolocation failed, using default:", err.message);
          setUserLocation(DEFAULT_LOCATION);
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    } else {
      setUserLocation(DEFAULT_LOCATION);
    }
  };

  const loadLeaflet = async () => {
    // Load CSS
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load JS
    if (!window.L) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Load Leaflet Routing Machine
    if (!window.L.Routing) {
      await new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href =
          "https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src =
          "https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
  };

  const initializeMap = async () => {
    if (!userLocation) return;

    try {
      await loadLeaflet();

      const mapContainer = document.getElementById("map-container");
      if (!mapContainer) throw new Error("Map container not found");

      // Clear previous map
      if (mapRef.current) mapRef.current.remove();
      mapContainer.innerHTML = "";

      const map = window.L.map("map-container", {
        center: [userLocation.lat, userLocation.lng],
        zoom: 13,
        scrollWheelZoom: true,
      });

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // User marker
      const userIcon = window.L.icon({
        iconUrl:
          "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      window.L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup(`<b>${userLocation.name}</b>`)
        .openPopup();

      mapRef.current = map;
      mapInitialized.current = true;

      fetchNearbyHospitals();
    } catch (err) {
      console.error("Map initialization failed:", err);
      setError("Failed to load map.");
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyHospitals = async () => {
    if (!mapRef.current || !userLocation) return;

    setLoading(true);
    setError(null);

    try {
      const radius = 5000;
      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="hospital"](around:${radius},${userLocation.lat},${userLocation.lng});
          way["amenity"="hospital"](around:${radius},${userLocation.lat},${userLocation.lng});
          node["amenity"="clinic"](around:${radius},${userLocation.lat},${userLocation.lng});
          way["amenity"="clinic"](around:${radius},${userLocation.lat},${userLocation.lng});
        );
        out center;
      `;

      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });

      if (!response.ok) throw new Error("Failed to fetch data");

      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        const hospitalData = data.elements
          .map((el) => {
            const lat = el.lat || el.center?.lat;
            const lon = el.lon || el.center?.lon;
            return lat && lon
              ? {
                  id: el.id,
                  name: el.tags?.name || "Medical Facility",
                  lat,
                  lon,
                  type: el.tags?.amenity || "healthcare",
                  address: el.tags?.["addr:street"] || "",
                  phone: el.tags?.phone || "",
                }
              : null;
          })
          .filter(Boolean);

        setHospitals(hospitalData);
        addHospitalMarkers(hospitalData);
      } else {
        setError("No hospitals or clinics found nearby.");
      }
    } catch (err) {
      console.error("Fetch hospitals error:", err);
      setError("Failed to fetch nearby facilities.");
    } finally {
      setLoading(false);
    }
  };

  const addHospitalMarkers = (hospitalData) => {
    if (!mapRef.current) return;

    // Clear previous markers
    markersRef.current.forEach((m) => mapRef.current.removeLayer(m));
    markersRef.current = [];

    const hospitalIcon = window.L.icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    hospitalData.forEach((h) => {
      const marker = window.L.marker([h.lat, h.lon], {
        icon: hospitalIcon,
      }).addTo(mapRef.current);

  const popup = `
  <div style="font-family: Arial, sans-serif; max-width: 250px;">
    <h3 style="margin:0 0 4px 0;color:#2c3e50;font-size:16px;">${h.name}</h3>
    <p style="margin:0;font-size:13px;"><strong>Type:</strong> ${h.type}</p>
    ${
      h.address
        ? `<p style="margin:0;font-size:13px;"><strong>Address:</strong> ${h.address}</p>`
        : ""
    }
    ${
      h.phone
        ? `<p style="margin:0;font-size:13px;"><strong>Phone:</strong> ${h.phone}</p>`
        : ""
    }
    <a href="https://www.google.com/maps/dir/?api=1&origin=${
      userLocation.lat
    },${userLocation.lng}&destination=${h.lat},${h.lon}" 
       target="_blank" rel="noopener noreferrer"
       style="display:inline-block;margin-top:4px;padding:4px 8px;background:#3498db;color:white;text-decoration:none;border-radius:4px;font-size:13px;">
       Get Directions
    </a>
  </div>
`;

  marker.bindPopup(popup, { autoPan: false });


      marker.on("popupopen", () => {
        const btn = document.getElementById(`route-btn-${h.id}`);
        if (btn) {
          btn.onclick = () => {
            // Remove previous route
            if (routeControlRef.current) {
              mapRef.current.removeControl(routeControlRef.current);
            }

            // Add new route
            routeControlRef.current = window.L.Routing.control({
              waypoints: [
                window.L.latLng(userLocation.lat, userLocation.lng),
                window.L.latLng(h.lat, h.lon),
              ],
              lineOptions: { styles: [{ color: "#3498db", weight: 5 }] },
              addWaypoints: false,
              draggableWaypoints: false,
              fitSelectedRoutes: true,
              show: false,
            }).addTo(mapRef.current);
          };
        }
      });

      markersRef.current.push(marker);
    });
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          width: "100%",
          maxWidth: 900,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 20,
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, color: "#2c3e50", fontSize: 24 }}>
            Nearby Gynecologists & Hospitals
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 32,
              cursor: "pointer",
              color: "#7f8c8d",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ position: "relative", height: 500, flex: 1 }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "white",
                padding: 20,
                borderRadius: 8,
                textAlign: "center",
                zIndex: 10,
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  border: "4px solid #f3f3f3",
                  borderTop: "4px solid #3498db",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto",
                }}
              ></div>
              <p style={{ marginTop: 10, color: "#7f8c8d" }}>Loading map...</p>
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "#ffe6e6",
                padding: 20,
                borderRadius: 8,
                color: "#c92a2a",
                maxWidth: "80%",
                zIndex: 10,
                textAlign: "center",
              }}
            >
              <p>{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  getUserLocation();
                }}
                style={{
                  marginTop: 10,
                  padding: "6px 12px",
                  background: "#3498db",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}

          <div style={{ position: "relative", height: "60vh", minHeight: 400 }}>
            <div
              id="map-container"
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "0 0 12px 12px",
              }}
            ></div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 20px",
            backgroundColor: "#f8f9fa",
            borderTop: "1px solid #e0e0e0",
            borderRadius: "0 0 12px 12px",
            fontSize: 14,
            color: "#7f8c8d",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong style={{ color: "#e74c3c" }}>Red markers:</strong> Hospitals
            & Clinics |
            <strong style={{ color: "#3498db", marginLeft: 10 }}>
              Blue marker:
            </strong>{" "}
            Your Location
          </p>
          <p style={{ margin: 5, fontSize: 12 }}>
            Click any marker and then "Show Route" to see directions on the map
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default GynecologistMapModal;
