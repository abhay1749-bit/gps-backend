import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Supabase environment variables are not configured yet.");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

app.get("/", (req, res) => {
  res.json({ ok: true, service: "GPS Backend", status: "online" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, database: !!supabase });
});

app.post("/api/location", async (req, res) => {
  try {
    const { device_id, latitude, longitude, accuracy, speed, heading, battery, recorded_at } = req.body;

    if (!device_id || typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        ok: false,
        error: "device_id, latitude and longitude are required"
      });
    }

    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: "Database is not configured"
      });
    }

    const { data, error } = await supabase
      .from("gps_locations")
      .insert([{
        device_id,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        heading: heading ?? null,
        battery: battery ?? null,
        recorded_at: recorded_at || new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({ ok: true, location: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/location/:device_id/latest", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Database is not configured" });
    }

    const { data, error } = await supabase
      .from("gps_locations")
      .select("*")
      .eq("device_id", req.params.device_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, location: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`GPS backend listening on port ${PORT}`);
});
