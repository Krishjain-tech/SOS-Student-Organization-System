# Core API contracts

All routes are below `/api/v1`. Responses wrap results in `{data: ...}`; failures use `{error:{code,message,fields?}}`. Record field names use snake_case; money uses integer paise. Headers for mutations: `X-CSRF-Token` from `GET /auth/csrf`, and optionally `Idempotency-Key`. Cookies must be sent. CSRF remains required for login and password reset. Foreign origins are rejected; local development uses Vite's same-origin API proxy.

| Method/path | Access | Body / response |
| --- | --- | --- |
| GET /health | Any | `{status,database,currency}` |
| GET /auth/csrf | Any | `{csrfToken}` |
| POST /auth/login | Any + CSRF | `{email,password,requestedPortal:admin\|volunteer}` → current user plus refreshed csrfToken |
| GET /auth/me | Signed in | `{id,email,name,phone,active,roles}` |
| POST /auth/logout | Any + CSRF | Clears this browser session for both workspaces |
| PATCH /auth/profile | Own account | `{name,phone}` |
| POST /auth/change-password | Own account | `{currentPassword,newPassword}`; invalidates sessions; new password min12 chars |
| POST /users/:id/reset | Admin | `{}` → `{setup_link,expires_at,delivery}`; manual delivery only |
| POST /auth/reset/consume | Any + CSRF | `{token,newPassword}`; hashed single-use token expires in60 minutes |
| GET /members | Admin | Array; optional `q` and `status` filters |
| POST /members | Admin | `{name,email,phone?,student_number?,notes?,user_id?}` |
| GET /members/:id | Admin | Record fields and `{record,terms,payments}` |
| PATCH /members/:id | Admin | Partial create fields and optional boolean `archived` |
| POST /members/:id/renew | Admin | `{starts_on?,ends_on?,dues_paise?}`; ISO calendar dates; creates unpaid history term |
| POST /members/:id/dues | Admin | `{term_id?,method,reference?}`; term determines amount; activates dates and posts income atomically |
| GET /users or /volunteers | Admin | Array of users with roles, active, open_tasks |
| POST /users or /volunteers | Admin | `{name,email,phone?,password,roles?}`; defaults volunteer |
| PATCH /users/:id | Admin | `{name?,phone?,active?,roles?}`; final active admin protected |
| GET /events | Both | Admin all; volunteer published or own assigned; enriched assignment/availability info |
| POST /events | Admin | `{title,type?,description?,start_at,end_at,location,capacity,member_price_paise?,nonmember_price_paise?,budget_paise?,volunteer_requirement?,status?}` |
| PATCH /events/:id | Admin | Partial event fields; cancellation flags unresolved ticket refunds, preserves revenue |
| GET /events/:id | Both | Event + availability, assignments, tasks; admin also tickets and financial summary |
| POST /events/:id/availability-request | Admin | `{deadline_at?}` |
| POST /events/:id/availability | Volunteer | `{response:AVAILABLE\|UNAVAILABLE,note?}`; always current user |
| POST /events/:id/assignments | Admin | `{user_id,role_label?,can_check_in?}`; response includes warning when absent/unavailable |
| DELETE /events/:id/assignments/:userId | Admin | Remove assignment; history audit preserved |
| POST /events/:id/tickets | Admin | `{member_id?,buyer_name,buyer_email?,method,reference?}`; price derived from date-effective paid membership; capacity reserved conditionally |
| POST /events/:id/check-in | Admin or assigned volunteer with explicit permission | `{code}` → minimal attendee name/code/status; reused/wrong-event/cancelled denied |
| GET /tasks | Both | Own tasks for volunteers; optional `event_id,assignee_id,status` |
| POST /tasks | Admin | `{title,instructions?,assignee_id,event_id?,due_at?,budget_paise?,status?}` |
| PATCH /tasks/:id | Both | Admin partial task fields; volunteer only `{status}` with ASSIGNED→IN_PROGRESS→COMPLETED |
| GET /settings | Both | Admin full organization configuration; volunteer only name/timezone |
| PATCH /settings | Admin | `{organization_name?,timezone?,membership_year_end?,dues_paise?}`; audited |

Event types: `EVENT/FUNDRAISER`; event status: `DRAFT/PUBLISHED/CANCELLED`. Membership status: `ACTIVE/EXPIRING/UNPAID/EXPIRED/NONE/ARCHIVED`, calculated from dates and payment state. Expiring means eligible now with year-end within30 days. Settlement method: `cash/upi/card/bank/other`; local demo settlements are explicitly `mock`.

Idempotency keys for renewal, dues and ticket sales are scoped to current actor and action. Path/body consistency is checked; key reuse with changed input returns409. SQLite transactions/uniqueness also guard repeat settlements independently of request keys. Auth failures remain generic401; five failures for an IP/email pair lock it for15 minutes. Sessions use maintained express-session + connect-session-knex5 with better-sqlite3; the same persistent SQLite database stores data and sessions. Cookies are HttpOnly/SameSite=Lax, Secure under production HTTPS. Idle expiry30 minutes; absolute expiry8 hours. Roles/activity/session version are loaded from the database on every request.
