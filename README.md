# Bid Bond Frontend

This frontend uploads a PDF and business information to the backend's single-call
`POST /api/autofill` endpoint. The returned PDF can be previewed and downloaded;
the field report shows filled, missing, and review-needed values. Both `/` and
`/template-intake` use this flow.

The result screen separates verified, approval, edit, missing, and manual fields.
Values that overflow a PDF field can be shortened with a source-supported edit
and retried during finalization. The backend checks placement and verification
again before returning the final PDF. The five-stage run trace is available for
diagnosis. PDF preview boxes use outlines without colored fills, and partial
results remain downloadable when final approval is not required.

## Local setup

Start the backend from `../bid-bond-backend` using its README. Its database and
`OPENROUTER_API_KEY` must be configured for a full autofill request. Set
`ALLOWED_ORIGINS` in the backend environment to include the exact URL shown by
the frontend dev server, including its port (for example,
`http://localhost:8080`).

Then start the frontend:

```sh
cd bid-bond-frontend
npm install
cp .env.example .env
npm run dev
```

`VITE_API_BASE_URL` is the backend origin, without `/api` (for example,
`http://localhost:8000`). The frontend sends multipart fields named `file` and
`raw_text` to `${VITE_API_BASE_URL}/api/autofill`. PDF uploads are limited to
20 MiB and one to three pages; source text is limited to 100,000 characters.

## Deployment

Set `VITE_API_BASE_URL` to the deployed backend's HTTPS origin **before building**
the frontend. Vite embeds `VITE_*` values in the client bundle, so rebuilding is
required when that URL changes. Set the backend's `ALLOWED_ORIGINS` to include
the deployed frontend's exact HTTPS origin. Do not put database credentials or
`OPENROUTER_API_KEY` in frontend environment variables.

After deploying both apps, upload a sample PDF and source text, confirm the
filled PDF previews and downloads, and check the field report and warnings.

## Checks

```sh
npx tsc --noEmit
npm run build
node --test tests/*.test.mjs
```
