const express = require("express");
const cors = require("cors");
const https = require("https");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

const RDM_API_URL =
  process.env.RDM_API_URL ||
  "https://api.rdmtrack.com/Assets/getAllAssetsLiveData";

const DEFAULT_DEVICE_ID =
  process.env.RDM_DEVICE_ID || "9064";

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

/*
  RDM server certificate chain Render/Node.js me verify nahi ho rahi.
  Isliye sirf RDM request ke liye TLS certificate verification
  disable ki gayi hai.
*/
function fetchRdm(deviceId) {
  return new Promise((resolve, reject) => {
    const body = buildRdmForm(deviceId).toString();

    const url = new URL(RDM_API_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "POST",

      rejectUnauthorized: false,

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",

        "Accept":
          "application/json, text/javascript, */*; q=0.01",

        "Origin":
          "https://rdmtrack.com",

        "Referer":
          "https://rdmtrack.com/",

        "Content-Length":
          Buffer.byteLength(body)
      }
    };

    const request = https.request(options, (response) => {
      let text = "";

      response.on("data", (chunk) => {
        text += chunk;
      });

      response.on("end", () => {
        let data;

        try {
          data = JSON.parse(text);
        } catch (error) {
          return reject(
            new Error(
              `RDM returned non-JSON HTTP ${response.statusCode}: ${text.slice(
                0,
                300
              )}`
            )
          );
        }

        if (
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          return reject(
            new Error(
              `RDM HTTP ${response.statusCode}: ${JSON.stringify(data)}`
            )
          );
        }

        resolve(data);
      });
    });

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(30000, () => {
      request.destroy(
        new Error("RDM request timed out after 30 seconds")
      );
    });

    request.write(body);
    request.end();
  });
}

function normalize(rdm, requestedDeviceId) {
  const item = Array.isArray(rdm?.data)
    ? (
        rdm.data.find(
          (x) =>
            String(x.deviceID) ===
            String(requestedDeviceId)
        ) || rdm.data[0]
      )
    : null;

  if (!item) {
    return {
      ok: false,
      error: "No live asset data returned by RDM",
      rdm
    };
  }

  return {
    ok: true,
    source: "RDM",

    device_id: String(
      item.deviceID ?? requestedDeviceId
    ),

    latitude: Number(item.latitude),
    longitude: Number(item.longitude),

    speed: Number(item.speed ?? 0),

    battery: Number(
      item.batteryLevel ?? 0
    ),

    heading: Number(
      item.heading ?? 0
    ),

    status:
      item.currentStatus ?? null,

    power:
      item.power ?? null,

    ignition:
      item.ignition ?? null,

    ac:
      item.ac ?? null,

    device_time:
      item.deviceTime ?? null,

    mileage:
      item.mileAge ?? null,

    distance_travelled:
      item.distanceTravelled ?? null,

    raw: item
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "RDM GPS Backend",
    status: "online",
    endpoint:
      "/api/track?device_id=9064"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    rdm_api: RDM_API_URL,
    device_id: DEFAULT_DEVICE_ID
  });
});

app.get("/api/track", async (req, res) => {
  const deviceId =
    req.query.device_id ||
    req.query.deviceID ||
    DEFAULT_DEVICE_ID;

  try {
    const rdmData =
      await fetchRdm(deviceId);

    const result =
      normalize(rdmData, deviceId);

    res
      .status(result.ok ? 200 : 502)
      .json(result);

  } catch (error) {
    console.error(
      "RDM API error:",
      error
    );

    res.status(502).json({
      ok: false,
      source: "RDM",
      error: error.message
    });
  }
});

app.get(
  "/api/track/:deviceId",
  async (req, res) => {
    const deviceId =
      req.params.deviceId;

    try {
      const rdmData =
        await fetchRdm(deviceId);

      const result =
        normalize(rdmData, deviceId);

      res
        .status(result.ok ? 200 : 502)
        .json(result);

    } catch (error) {
      console.error(
        "RDM API error:",
        error
      );

      res.status(502).json({
        ok: false,
        source: "RDM",
        error: error.message
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `RDM GPS backend listening on port ${PORT}`
  );
});
