# ConnectSphere — Real-Time Communication & Collaboration

A full-stack video meeting and collaboration prototype built with HTML, CSS, Vanilla JavaScript, Node.js, Express, Socket.IO, WebRTC, and MySQL.

## Features

- Register, sign in, sign out, hashed passwords, JWT-protected APIs
- Create meeting rooms with shareable room codes
- WebRTC audio/video peer connections and browser screen sharing
- Live Socket.IO chat persisted to MySQL
- Shared drawing whiteboard, hand raise, emoji reactions, quick polls
- Upload/download approved file types with a configurable size limit
- Room list, message history, meeting attendance records
- Responsive dashboard and meeting UI
- Basic security headers, rate limiting on authentication endpoints, parameterized SQL, file-type/size checks

## Requirements

- Node.js 20 or newer
- MySQL 8.x (or compatible MySQL server)
- A current Chrome, Edge, or Firefox browser

## Setup on Windows (PowerShell)

1. Install Node.js LTS and MySQL Server. During MySQL setup, remember your database username and password.
2. Open this project folder in VS Code.
3. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env`. Set `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and a strong random `JWT_SECRET` of at least 32 characters. Example secret generation in PowerShell:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

   Paste the output into `JWT_SECRET=`. Do not commit `.env` to Git.

5. Create the database schema. In a terminal where the MySQL client is available:

   ```powershell
   mysql -u root -p < database.sql
   ```

   If your shell does not support input redirection as expected, open MySQL Workbench, connect to your server, open `database.sql`, and execute it.

6. Create a restricted application database user (recommended). Run in MySQL as an administrator, replacing the password:

   ```sql
   CREATE USER 'connectsphere_user'@'localhost' IDENTIFIED BY 'Use-A-Strong-Unique-Password';
   GRANT SELECT, INSERT, UPDATE, DELETE ON connectsphere.* TO 'connectsphere_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

   Set the same username/password in `.env`. If you used another database user in `.env`, skip this step.

7. Install dependencies and start the app:

   ```powershell
   npm install
   npm run check
   npm test
   npm start
   ```

8. Open **http://localhost:3000** in Chrome or Edge. Create an account, create a room, then copy the room code and open a second browser profile/device to test joining as another user.

## Environment settings

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port, default `3000` |
| `CLIENT_ORIGIN` | Allowed browser origin, default `http://localhost:3000` |
| `JWT_SECRET` | Strong secret, minimum 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime, default `8h` |
| `DB_HOST`, `DB_PORT` | MySQL connection settings |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL credentials/database |
| `MAX_UPLOAD_MB` | Upload size cap, default `10` |

## Test checklist

- `npm run check`: JavaScript syntax checks
- `npm test`: project structure, required controls, parameterized query and socket-auth smoke tests
- `GET http://localhost:3000/health`: should return `{"status":"ok","database":"connected"}` when MySQL is configured and running
- Register two accounts in separate browser profiles; create a room with one account and join using the code with the other
- Allow camera/microphone access, verify audio/video, screen share, chat, whiteboard, reactions, polls, and file upload/download

## Important limitations / production checklist

This is a functional prototype, not a production-certified conferencing service. WebRTC uses a public STUN server only; networks behind restrictive NAT/firewalls may require a TURN service (for example, coturn or a managed provider). Configure `iceServers` in `public/app.js` with your TURN credentials before deploying. Use HTTPS in production (camera and microphone access is restricted to secure contexts), set `CLIENT_ORIGIN` to your real origin, use a strong secret manager, back up MySQL, add account verification/password reset and room authorization policies, virus-scan uploaded files, and add retention/deletion controls. WebRTC media is encrypted in transit by the WebRTC protocol, but this implementation does not provide application-level end-to-end encryption guarantees or an independently audited security design. The UI's “Encrypted transport” indicator refers to secure transport expectations and must not be treated as a security certification.

## Troubleshooting

- **Database connection failed:** ensure MySQL is running, the schema was executed, and `.env` credentials are correct.
- **Startup blocked by JWT_SECRET:** set a random secret of 32+ characters in `.env`.
- **Camera/mic denied:** allow permissions in the browser and use `localhost` or HTTPS.
- **No remote video on another network:** configure a TURN server; STUN alone is not sufficient for every network.
- **Port in use:** change `PORT` in `.env`.
- **File upload rejected:** only PNG/JPEG/GIF/WebP, PDF, text/CSV, ZIP, DOCX, and XLSX are accepted by this prototype; the default limit is 10 MB.
