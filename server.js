const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;
const RDM_API_URL =
  process.env.RDM_API_URL ||
  "https://api.rdmtrack.com/Assets/getAllAssetsLiveData";
const DEFAULT_DEVICE_ID = process.env.RDM_DEVICE_ID || "9064";

function buildRdmForm(deviceId) {
  const body = new URLSearchParams();
  body.append("g", "0");
  body.append("status[]", "MOVING");
  body.append("status[]", "PARKED");
  body.append("status[]", "TOW");
  body.append("status[]", "IDEL");
  body.append("status[]", "Unreachable");
  body.append("distanceValue", "51");
  body.append("speedValue", "51");
  body.append("parkedValue", "13");
  body.append("deviceID", String(deviceId));
  return body;
}

async function fetchRdm(deviceId) {
  const response = await fetch(RDM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": "https://rdmtrack.com",
      "Referer": "https://rdmtrack.com/"
    },
    body: buildRdmForm(deviceId).toString()
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`RDM returned non-JSON HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) throw new Error(`RDM HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function normalize(rdm, requestedDeviceId) {
  const item = Array.isArray(rdm?.data)
    ? (rdm.data.find(x => String(x.deviceID) === String(requestedDeviceId)) || rdm.data[0])
    : null;

  if (!item) return { ok: false, error: "No live asset data returned by RDM", rdm };

  return {
    ok: true,
    source: "RDM",
    device_id: String(item.deviceID ?? requestedDeviceId),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    speed: Number(item.speed ?? 0),
    battery: Number(item.batteryLevel ?? 0),
    heading: Number(item.heading ?? 0),
    status: item.currentStatus ?? null,
    power: item.power ?? null,
    ignition: item.ignition ?? null,
    ac: item.ac ?? null,
    device_time: item.deviceTime ?? null,
    mileage: item.mileAge ?? null,
    distance_travelled: item.distanceTravelled ?? null,
    raw: item
  };
}

app.get("/", (req, res) => res.json({
  ok: true,
  service: "RDM GPS Backend",
  status: "online",
  endpoint: "/api/track?device_id=9064"
}));

app.get("/health", (req, res) => res.json({
  ok: true,
  rdm_api: RDM_API_URL,
  device_id: DEFAULT_DEVICE_ID
}));

app.get("/api/track", async (req, res) => {
  const deviceId = req.query.device_id || req.query.deviceID || DEFAULT_DEVICE_ID;
  try {
    const result = normalize(await fetchRdm(deviceId), deviceId);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    console.error("RDM API error:", error);
    res.status(502).json({ ok: false, source: "RDM", error: error.message });
  }
});

app.get("/api/track/:deviceId", async (req, res) => {
  const deviceId = req.params.deviceId;
  try {
    const result = normalize(await fetchRdm(deviceId), deviceId);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    console.error("RDM API error:", error);
    res.status(502).json({ ok: false, source: "RDM", error: error.message });
  }
});

app.listen(PORT, () => console.log(`RDM GPS backend listening on port ${PORT}`));
