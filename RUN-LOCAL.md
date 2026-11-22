# Running Planwalk on your computer

Needs **Node.js 22+** (https://nodejs.org).

## A. Quick demo (1 minute, no database)

```bash
npm run demo
```
Open **http://localhost:5173** → "Walk the demo".

## B. Full app (accounts, projects, share links)

Needs PostgreSQL 16. Easiest with Docker:

```bash
docker run -d --name planwalk-db -p 5432:5432 -e POSTGRES_USER=planwalk -e POSTGRES_PASSWORD=planwalk_dev -e POSTGRES_DB=planwalk postgres:16
```

Then:

```bash
npm install
npm run build -w @planwalk/engine
npm run dev
```
Open **http://localhost:5173**. Sign up at /signup. Emails (verification, invites) are printed in the terminal.
