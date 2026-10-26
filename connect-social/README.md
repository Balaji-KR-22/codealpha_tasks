# Connect Social

**Your people. Your moments. Your space.** A responsive mini social platform built with HTML, CSS, JavaScript, Node.js, Express and MySQL.

## Features
- Registration, login and logout; passwords hashed with bcrypt and sessions stored in MySQL
- User profile with uploaded display picture, display name and bio
- Upload photo posts and video reels from your computer
- Home feed and separate reels feed
- Like/unlike posts, follow/unfollow users, comment, share a link and save posts
- Search people by username/display name; profile post grid and follower/following/post counts
- MySQL persistence for users, posts, likes, comments, follows, shares and saved posts
- Responsive desktop/mobile UI with custom Connect Social logo

## Requirements
- Node.js 18+
- MySQL Server (8.x recommended)
- VS Code and MySQL Workbench recommended

## Run on Windows

### 1. Create the database
Open MySQL Workbench, connect to your local MySQL Server, open `schema.sql`, and execute it. This creates `connect_social_db` and the application tables.

### 2. Configure environment
In the VS Code terminal, with the terminal in this project folder, run:

```powershell
Copy-Item .env.example .env
```

Open `.env` and enter your actual MySQL password and a random session secret:

```env
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=connect_social_db
SESSION_SECRET=paste_a_long_random_secret_here
```

Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env` or share its values. `.env.example` should contain placeholders only.

### 3. Install and start

```powershell
npm install
npm start
```

Expected output:

```text
MySQL connected.
Connect Social is running at http://localhost:3001
```

Open **http://localhost:3001** in your browser. Keep the terminal running.

## Quick test
1. Create an account with a username, display name, email and password (minimum 8 characters).
2. Use **My profile** to upload a profile picture and add a bio.
3. Click **Create** to upload a photo or video. Choose Reel for a video reel.
4. To test follow/like/comment behavior between users, register a second test account in a separate browser profile.
5. Inspect saved data in MySQL Workbench.

No demo accounts are preloaded; register your own accounts.

## Database tables
`users`, `posts`, `likes`, `comments`, `follows`, `shares`, `saved_posts`. The MySQL session store creates its own session table when the server first starts.

## Main API routes
- `GET /api/health`, `GET /api/me`
- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`
- `GET /api/posts?type=post|reel`; `POST /api/posts` (multipart `media`, `caption`, `postType`)
- `POST /api/posts/:id/like`, `GET/POST /api/posts/:id/comments`
- `POST /api/posts/:id/share`, `POST /api/posts/:id/save`
- `POST /api/follow/:id`, `GET /api/users/:username`
- `PUT /api/profile`, `POST /api/profile/avatar`
- `GET /api/search/users?q=...`, `GET /api/suggestions`

## Notes
This is an internship/demo prototype, not production-ready. Uploaded media is stored locally in `uploads/`; production deployments should use object storage/CDN. Uploads are limited to 50 MB and common image/video MIME types. Notifications, direct messages, stories, privacy controls, email verification, password recovery, content moderation and production-grade rate limiting/CSRF controls are not implemented. The share feature records share events and creates a link; it is not direct messaging. Use content you own or have permission to upload.
