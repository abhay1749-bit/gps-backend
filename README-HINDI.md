# GPS Backend — ₹0 शुरुआती Setup

यह backend GPS app से location receive करके Supabase database में save करता है।

## 1. Supabase
Supabase में नया project बनाएं और `supabase.sql` को SQL Editor में चलाएं।

फिर Project Settings/API से:
- Project URL
- service_role key

लेना होगा।

## 2. GitHub
इन files को एक GitHub repository में upload करें।

## 3. Render
Render में New Web Service → GitHub repository चुनें।
Build: `npm install`
Start: `npm start`

Environment Variables:
`SUPABASE_URL` = आपका Supabase Project URL
`SUPABASE_SERVICE_ROLE_KEY` = आपका service_role key

Deploy के बाद URL मिलेगा, उदाहरण:
`https://gps-backend-free.onrender.com`

## 4. Test
Browser में:
`https://YOUR-URL/health`

फिर API:
POST `https://YOUR-URL/api/location`

JSON:
{
  "device_id": "truck-001",
  "latitude": 24.95,
  "longitude": 84.03,
  "accuracy": 10,
  "speed": 20,
  "heading": 90,
  "battery": 80
}

महत्वपूर्ण: service_role key को APK में कभी hard-code न करें।
