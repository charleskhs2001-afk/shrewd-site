# Running Shrewd on Google Cloud Run (London)

Bing Shopping only shows UK results to UK internet addresses, and Render has no UK
region, so the site runs on Google Cloud Run in London (europe-west2).

## 1. Create the service
1. Go to https://console.cloud.google.com and sign in. Create a project (e.g. "shrewd") and add a billing card when asked. Small sites stay inside the free allowance.
2. Open https://console.cloud.google.com/run and click **Deploy container** > **Service**.
3. Choose **Continuously deploy from a repository (source or function)**, click **Set up with Cloud Build**, connect GitHub, pick `charleskhs2001-afk/shrewd-site`, branch `^main$`, build type **Dockerfile**. Save.
4. Region: **europe-west2 (London)**.
5. Authentication: **Allow public access** (unauthenticated invocations).
6. Billing: **Request-based**. Minimum instances: **0**.
7. Open **Containers, Volumes, Networking, Security** > **Variables & secrets** and add:

| Name | Value |
|---|---|
| PUBLIC_URL | https://shrewd.sparkwash.co.uk |
| SESSION_SECRET | copy from Render (keeps existing paid users unlocked) |
| TRUST_PROXY | 1 |
| DEV_FAKE_PAYMENTS | 0 |
| CACHE_HOURS | 1 |
| STRIPE_SECRET_KEY | copy from Render |
| ADSENSE_CLIENT, ADSENSE_SLOT_TOP, ADSENSE_SLOT_RESULTS, ADSENSE_SLOT_FOOTER, ADS_TXT | copy from Render, if set |

8. Click **Create**. When it finishes, open the `...run.app` address shown and add `/api/check-source` to it. `productsRead` above 0 means search works.

## 2. Point your domain at it
1. In Cloud Run, open **Manage custom domains** > **Add mapping**, pick the service and enter `shrewd.sparkwash.co.uk`.
2. Google shows a DNS record (usually a CNAME to `ghs.googlehosted.com`). At whoever manages sparkwash.co.uk, replace the existing `shrewd` record pointing at Render with it.
3. HTTPS appears automatically, usually within an hour.
4. Once the domain works on Cloud Run, suspend the Render service.
