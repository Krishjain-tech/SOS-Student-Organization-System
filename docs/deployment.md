# Single-server deployment

Run one Node 24 server on a persistent VM or container host. Build the frontend/backend with `npm run build`; the Express production server serves the built Vite assets and `/api` on one origin. Unknown `/api` paths return JSON 404. Do not put writable SQLite storage on an ephemeral serverless filesystem.

Use a persistent local volume for the database, WAL/SHM, sessions (same database), and receipt directory. Enable HTTPS through a trusted reverse proxy. Set `NODE_ENV=production`, `DEMO_MODE=false`, a cryptographically random `SESSION_SECRET` of at least 32 characters, the exact HTTPS `APP_ORIGIN`, `DATABASE_PATH`, `UPLOAD_DIR`, and `PORT`. Restrict backend port exposure to the proxy and configure the trusted proxy hop count to match the deployment. Secure session cookies require HTTPS.

Never seed the documented local credentials into a shared or public deployment. Provision unique admin credentials on the server; keep `.env` private. There is no cloud API key requirement. Deployments are operated manually; this build does not buy a service or publish the privileged demo.

SQLite WAL allows concurrent readers with a single writer. The app uses bounded busy timeouts and transactional/conditional writes. Deploy a single application instance using one local volume; do not mount one database over an unreliable network filesystem or scale independent servers against it. For multi-server scale, plan an explicit database migration in a later phase.

Use `npm run db:backup` for an online SQLite backup paired with receipt copies. Stop mutations while taking a consistent database-and-evidence backup; restore both together. Do not simply copy the live main database while ignoring WAL. Store backups off-host with access controls, encryption, and a tested restore procedure. Session rows are sensitive; expire or clear restored sessions before reopening a restored deployment.

The simplest supported setup is same-origin. If hosting the frontend separately later, explicitly implement an exact CORS allowlist, credentials, frontend API origin configuration, HTTPS cookie domain/SameSite policy, and strict cross-origin CSRF/origin rules. Wildcard credentialed CORS is not supported by this phase's defaults.

Manual cash, UPI, card, and bank records are authorized bookkeeping records, not payment-provider verification or actual transfers. Mock settlements and email deliveries are clearly simulated. Real mail, online checkout, provider webhooks, OCR, and student-facing routes are deferred.
