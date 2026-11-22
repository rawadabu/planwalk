# Running Planwalk on your computer

Needs **Node.js 22+** (https://nodejs.org) and Git.

```bash
git clone https://github.com/rawadabu/planwalk.git
cd planwalk
npm install
```

Already cloned? Get the latest instead:

```bash
git pull
npm install
```

## A. Quick demo (no database)

```bash
npm run demo
```

Builds the site and opens it on **http://localhost:5173** → "Walk the demo".
Everything in the walkthrough works, including Design mode (try-out only: saving needs the full app).

## B. Full app (accounts, projects, saved designs, comments)

Needs PostgreSQL 16. Easiest with Docker (once):

```bash
docker run -d --name planwalk-db -p 5432:5432 -e POSTGRES_USER=planwalk -e POSTGRES_PASSWORD=planwalk_dev -e POSTGRES_DB=planwalk postgres:16
```

Then:

```bash
npm run build -w @planwalk/engine
npm run dev
```

Open **http://localhost:5173**. Sign up at /signup. Emails (verification, invites) are printed in the terminal.
The demo house is public; to save designs, create a project and open one of its houses as a team member.

## Tests

```bash
npm test
```
