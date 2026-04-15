# Deploy msfg-docs to production

msfg-docs runs on the shared EC2 instance that already hosts the dashboard
backend and `msfg-calc`. It is exposed at `https://dashboard.msfgco.com/docs/*`
through CloudFront → nginx → Node (port 3001).

## Architecture

```
Browser
  │  (Authorization: Bearer <Cognito JWT>)
  ▼
CloudFront (E3QTH6K640MMKK)
  │  behavior: /docs/* → EC2 origin
  ▼
EC2 nginx :80
  │  location /docs/ { proxy_pass http://127.0.0.1:3001; }
  ▼
PM2 → node server.js   (PORT=3001, BASE_PATH=/docs)
```

Key points:

- msfg-docs listens on **port 3001** (msfg-calc owns 3000, dashboard backend
  owns 8080).
- `BASE_PATH=/docs` tells Express to mount pages at `/docs` and the API at
  `/docs/api`. The nginx rule **keeps** the `/docs` prefix (no trailing slash
  on `proxy_pass`) so `res.locals.basePath` in the rendered EJS matches the
  browser-visible URL.
- All auth is Cognito. Tokens flow through the `Authorization` header or the
  `auth_token` cookie set by `login-callback.html`. See `lib/auth/cognito.js`.

## One-time EC2 setup

### 1. Clone / sync the repo

```bash
ssh -i ~/.ssh/msfg-mortgage-key.pem ubuntu@52.203.186.217
cd /home/ubuntu
git clone https://github.com/vonzink/msfg-docs.git
cd msfg-docs
npm ci --omit=dev
```

### 2. Create `.env`

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```
NODE_ENV=production
PORT=3001
BASE_PATH=/docs

COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX

# Email (if used) — match the dashboard backend's values
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
```

### 3. Add the nginx rule

Append to `/etc/nginx/sites-available/default` (or whichever server block
fronts port 80):

```nginx
location /docs/ {
  proxy_pass         http://127.0.0.1:3001;   # no trailing slash — preserve prefix
  proxy_http_version 1.1;
  proxy_set_header   Host              $host;
  proxy_set_header   X-Real-IP         $remote_addr;
  proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
  proxy_set_header   X-Forwarded-Proto $scheme;
  proxy_set_header   Authorization     $http_authorization;
  proxy_read_timeout 60s;
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

### 4. Start under PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 logs msfg-docs --lines 40
```

### 5. Add the CloudFront behavior

In the CloudFront console for distribution `E3QTH6K640MMKK`:

1. **Behaviors → Create behavior**
   - Path pattern: `/docs/*`
   - Origin: the same EC2 origin used by `/calc/*`
   - Viewer protocol policy: Redirect HTTP to HTTPS
   - Allowed methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
   - Cache policy: `CachingDisabled` (pages are authenticated and dynamic)
   - Origin request policy: `AllViewer` (or any policy that forwards
     `Authorization`, `Cookie`, and all query strings)
   - Function associations (viewer request): attach the existing
     `msfg-rewrite-login` function so bare `/docs` redirects to `/docs/`.

2. Save. The new behavior propagates in ~1–2 minutes.

## Subsequent deploys

```bash
ssh -i ~/.ssh/msfg-mortgage-key.pem ubuntu@52.203.186.217
cd /home/ubuntu/msfg-docs
git pull
npm ci --omit=dev
pm2 restart msfg-docs
pm2 logs msfg-docs --lines 40
```

## Smoke test

From your laptop, after logging in at `https://dashboard.msfgco.com/login`
and grabbing the `auth_token` cookie value:

```bash
export TOKEN=...     # paste the auth_token cookie

# Public health endpoint — no auth required
curl -s https://dashboard.msfgco.com/docs/api/health

# Authenticated page (expect 200)
curl -sI -H "Authorization: Bearer $TOKEN" https://dashboard.msfgco.com/docs/

# PDF generation — Form 4506-C
curl -s -o /tmp/4506c.pdf -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST https://dashboard.msfgco.com/docs/api/pdf/form-4506-c \
  -d '{"f4506TaxpayerName":"John Smith","f4506Ssn":"123-45-6789","f4506TaxYears":"2022, 2023"}'
file /tmp/4506c.pdf   # → PDF document, version 1.6

# Unauthenticated should 401
curl -sI https://dashboard.msfgco.com/docs/api/pdf/form-4506-c \
  -H "Content-Type: application/json" -X POST -d '{}'
```

See [`scripts/smoke-test.sh`](scripts/smoke-test.sh) for a scripted version.
