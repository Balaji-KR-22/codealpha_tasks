# TaskFlow Pro

A polished full-stack team project management tool with authentication, collaborative project boards, task cards, assignments, comments, activity history, notifications, and real-time updates.

## Features
- Register and sign in with hashed passwords and JWT sessions
- Create projects with descriptions and color accents
- Project membership and invite registered teammates by email
- Kanban workflow: To do → In progress → In review → Done
- Task descriptions, assignees, priority, due dates, edit and delete
- Task discussion threads and project activity history
- In-app notifications for assignment, comments, and invitations
- Socket.IO live updates for connected project members
- Dashboard statistics, search, priority filters, responsive interface
- MySQL relational schema with foreign keys and indexes

## Requirements
- Node.js 18 or newer
- MySQL 8.x (MySQL Workbench is fine)
- A terminal such as VS Code PowerShell

## Setup on Windows

1. Open the `taskflow-pro` folder in VS Code.
2. In MySQL Workbench, connect to your local MySQL server, open `db/schema.sql`, and execute the entire script using the lightning-bolt button. It creates the `taskflow_pro` database and required tables.
3. Copy `.env.example` to a new file named `.env` in the project root.
4. Edit `.env` and set your actual MySQL password. Replace `JWT_SECRET` with a long random secret. Keep `.env` private; do not upload it to GitHub.
5. Open the VS Code terminal in this folder and run:

   ```powershell
   npm install
   npm start
   ```

6. Open **http://localhost:3002** in your browser.
7. Create an account. Create a project, add tasks, and optionally register a second account to test inviting teammates and real-time collaboration.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Web server port | `3002` |
| `DB_HOST` | MySQL server host | `localhost` |
| `DB_PORT` | MySQL server port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | empty |
| `DB_NAME` | Database name | `taskflow_pro` |
| `JWT_SECRET` | JWT signing secret | Set your own |

## Useful checks

- Browser/API health check: `http://localhost:3002/api/health`
- If it reports database disconnected, check that MySQL is running, the schema was executed, and `.env` values are correct.
- If `npm` is not recognized, install Node.js LTS and restart VS Code.
- If port 3002 is already in use, change `PORT=3003` in `.env` and restart.
- If you change `.env`, stop the server with `Ctrl+C` and start it again.

## Important security notes

This is a local-development/hackathon starter, not a production security audit. Before public deployment, use HTTPS, set a strong secret, configure a restrictive CORS origin, add rate limiting and password-reset flows, and review authorization and logging. Never commit `.env` or real credentials.
