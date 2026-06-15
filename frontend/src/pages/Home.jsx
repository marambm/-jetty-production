import { useState, useEffect } from "react";
import axios from "axios";

function Home() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get("/api/health")
      .then((res) => setHealth(res.data))
      .catch(() => setHealth({ status: "Backend not reachable" }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Home</h1>
      <p className="text-gray-600 mb-6">
        Welcome to the monorepo starter. This frontend talks to a Node/Express
        backend and a Python FastAPI AI service.
      </p>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold text-lg mb-2">Backend Health</h2>
        {loading ? (
          <p className="text-gray-400">Checking...</p>
        ) : (
          <pre className="bg-gray-100 rounded p-3 text-sm overflow-auto">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export default Home;
