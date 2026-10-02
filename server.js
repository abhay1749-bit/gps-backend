import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ITRACK_ACCOUNT = process.env.ITRACK_ACCOUNT;
const ITRACK_PASSWORD = process.env.ITRACK_PASSWORD;

const ITRACK_BASE_URL = "http://api.itrackcare.com";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

let cachedToken = null;
let tokenExpiresAt = 0;

// ---------------- HOME ----------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "GPS Backend",
    status: "online"
  });
});

// ---------------- HEALTH ----------------

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    database: !!supabase,
    itrack: !!(ITRACK_ACCOUNT && ITRACK_PASSWORD)
  });
});

// ---------------- ITRACK TOKEN ----------------

async function getItrackToken() {
  if (
    cachedToken &&
    Date.now() < tokenExpiresAt
  ) {
    return cachedToken;
  }

  if (!ITRACK_ACCOUNT || !ITRACK_PASSWORD) {
    throw new Error("iTrack credentials are not configured");
  }

  const time = Math.floor(Date.now() / 1000).toString();

  const passwordMd5 = crypto
    .createHash("md5")
    .update(ITRACK_PASSWORD)
    .digest("hex");

  const signature = crypto
    .createHash("md5")
    .update(passwordMd5 + time)
    .digest("hex");

  const params = new URLSearchParams({
    time,
    account: ITRACK_ACCOUNT,
    signature
  });

  const response = await fetch(
    `${ITRACK_BASE_URL}/api/authorization?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0 || !data.record?.access_token) {
    throw new Error(
      data.message || `iTrack authorization failed (code ${data.code})`
    );
  }

  cachedToken = data.record.access_token;

  // Refresh before the official 2-hour expiry.
  tokenExpiresAt = Date.now() + 90 * 60 * 1000;

  return cachedToken;
}

// ---------------- REAL GPS ----------------

app.get("/api/track", async (req, res) => {
  try {
    const imeis =
      req.query.imeis ||
      req.query.imei ||
      req.query.device_id;

    if (!imeis) {
      return res.status(400).json({
        ok: false,
        error: "IMEI is required"
      });
    }

    const token = await getItrackToken();

    const params = new URLSearchParams({
      access_token: token,
      imeis: String(imeis)
    });

    const response = await fetch(
      `${ITRACK_BASE_URL}/api/track?${params.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "iTrack API request failed",
        details: data
      });
    }

    if (data.code !== 0) {
      return res.status(502).json({
        ok: false,
        error: data.message || "iTrack returned an error",
        code: data.code
      });
    }

    const record = Array.isArray(data.record)
      ? data.record[0]
      : null;

    if (!record) {
      return res.json({
        ok: true,
        record: [],
        location: null
      });
    }

    res.json({
      ...data,

      // Easy-to-use normalized location for our app
      location: {
        imei: record.imei,
        latitude: Number(record.latitude),
        longitude: Number(record.longitude),
        speed: Number(record.speed || 0),
        heading: Number(record.course || 0),
        gps_time: record.gpstime,
        server_time: record.servertime,
        heart_time: record.hearttime,
        data_status: record.datastatus,
        battery: record.battery
      }
    });

  } catch (err) {
    console.error("TRACK ERROR:", err);

    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ---------------- SAVE GPS ----------------

app.post("/api/location", async (req, res) => {
  try {
    const {
      device_id,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      battery,
      recorded_at
    } = req.body;

    if (
      !device_id ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
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
      .insert([
        {
          device_id,
          latitude,
          longitude,
          accuracy: accuracy ?? null,
          speed: speed ?? null,
          heading: heading ?? null,
          battery: battery ?? null,
          recorded_at:
            recorded_at || new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    res.json({
      ok: true,
      location: data
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ---------------- LATEST SAVED GPS ----------------

app.get("/api/location/:device_id/latest", async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: "Database is not configured"
      });
    }

    const { data, error } = await supabase
      .from("gps_locations")
      .select("*")
      .eq("device_id", req.params.device_id)
      .order("recorded_at", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    res.json({
      ok: true,
      location: data
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ---------------- START ----------------

app.listen(PORT, () => {
  console.log(
    `GPS backend listening on port ${PORT}`
  );
});
