import axios from "axios";

const client = axios.create({
  baseURL: "",
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("jetty-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function fetchDashboard(date) {
  return client.get("/api/dashboard", { params: { date } }).then((r) => r.data);
}
export function fetchAlerts(date) {
  return client.get("/api/alerts", { params: { date } }).then((r) => r.data);
}
export function fetchProduction(params) {
  return client.get("/api/production", { params }).then((r) => r.data);
}
export function createProduction(data) {
  return client.post("/api/production", data).then((r) => r.data);
}
export function updateProduction(id, data) {
  return client.put(`/api/production/${id}`, data).then((r) => r.data);
}
export function deleteProduction(id) {
  return client.delete(`/api/production/${id}`).then((r) => r.data);
}
export function fetchWorkUnits() {
  return client.get("/api/work-units").then((r) => r.data);
}
export function fetchKpis(params) {
  return client.get("/api/kpis", { params }).then((r) => r.data);
}
export function fetchForecast(params) {
  return client.get("/api/forecast", { params }).then((r) => r.data);
}

export async function downloadExport(type, date, from, to, workUnit) {
  try {
    const token = localStorage.getItem("jetty-token");

    let url;
    if (from && to) {
      url = `/api/export/${type}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      if (workUnit) url += `&workUnit=${encodeURIComponent(workUnit)}`;
    } else {
      url = `/api/export/${type}?date=${encodeURIComponent(date)}`;
    }

    console.log("Export URL:", url);

    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Export failed:", res.status, text);
      alert(`Export échoué: ${res.status} - ${text}`);
      return;
    }

    const blob = await res.blob();
    const ext = type === "excel" ? "xlsx" : "pdf";
    const filename =
      from && to
        ? `JETTY_KPIs_${from}_${to}.${ext}`
        : `JETTY_Production_${date}.${ext}`;

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

  } catch (err) {
    console.error("downloadExport error:", err);
    alert(`Erreur export: ${err.message}`);
  }
}

export default client;