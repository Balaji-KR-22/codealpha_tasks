# NovaCart — E-commerce Internship Project

A responsive demo store built with HTML, CSS, vanilla JavaScript, Node.js, Express and MySQL. Includes product listing/search/filter, product detail modal, shopping cart, registration/login/logout, stock-checked order processing, order history and feedback with a 1–5 star rating.

## Requirements
- Node.js 18 or newer (LTS recommended)
- MySQL Server 8.x and MySQL Workbench (Workbench is optional)
- Visual Studio Code

## 1. Extract and open the project
1. Extract `novacart-ecommerce-internship.zip` to a folder such as `C:\Projects\ecommerce-internship`.
2. Open VS Code → **File → Open Folder** → select the extracted folder.
3. Open VS Code's terminal (**Terminal → New Terminal**).

## 2. Create the database
1. Start the MySQL Server service.
2. Open MySQL Workbench and connect to your local server.
3. Choose **File → Open SQL Script**, select `schema.sql` from this project, then click the lightning bolt (Execute).
4. The script creates `novacart_db`, its tables and eight demo products.

If you use the terminal instead, run the following from a terminal where the MySQL command is available:

```bash
mysql -u root -p < schema.sql
```

Enter your MySQL password when prompted. Do not type the password into the command or commit it to source control.

## 3. Configure the app
In the VS Code terminal, from the project folder:

```bash
npm install
```

Copy `.env.example` to a new file named `.env`. In VS Code, edit `.env` and set the database details to match your MySQL installation:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=novacart_db
SESSION_SECRET=replace_this_with_a_long_random_secret
```

Replace `DB_PASSWORD` with your MySQL password. Replace `SESSION_SECRET` with a long random string. Keep `.env` private; it is excluded by `.gitignore`.

## 4. Run the project
In the VS Code terminal:

```bash
npm start
```

You should see a message similar to `NovaCart is running at http://localhost:3000`. Open **http://localhost:3000** in Chrome or Edge. Keep the terminal open while using the site. Press `Ctrl+C` to stop the server.

Optional development mode with auto-restart:

```bash
npm run dev
```

## 5. Try the features
1. Browse products, use the search box and category filters.
2. Click a product image/card for details, or use `+` for quick add.
3. Open **Bag** to update quantities or remove items. The cart is saved in this browser using localStorage.
4. Select **Account → Create account**, register with an email and a password of at least eight characters, then log in/log out.
5. Add items and proceed to checkout while logged in. Enter delivery details and place a demo order. No payment is collected.
6. In Account, choose **My orders** to view order history.
7. Submit a star rating and message in the feedback section.
8. Check database rows in MySQL Workbench:

```sql
USE novacart_db;
SELECT * FROM products;
SELECT id, name, email, created_at FROM users;
SELECT * FROM orders;
SELECT * FROM order_items;
SELECT * FROM feedback;
```

## Troubleshooting
- **`ECONNREFUSED` / database connection failed:** make sure MySQL Server is running and `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env` are correct.
- **`Unknown database 'novacart_db'`:** execute `schema.sql` in MySQL Workbench.
- **`Access denied for user`:** check the MySQL username/password. These are MySQL credentials, not your Windows login.
- **`npm is not recognized`:** install Node.js LTS from https://nodejs.org, restart VS Code, and run `node -v` and `npm -v`.
- **Port 3000 already in use:** change `PORT=3001` in `.env`, restart, and visit `http://localhost:3001`.
- **Product images not appearing:** the demo uses remote Unsplash image URLs, so internet access is needed for images. The store itself is served locally.
- **Blank product grid:** check the VS Code terminal and visit `http://localhost:3000/api/health` to verify the database connection.

## Project structure

```text
ecommerce-internship/
├── public/
│   ├── index.html       # Storefront, cart, account, checkout and feedback UI
│   ├── styles.css       # Responsive styling
│   └── app.js           # Frontend behavior and API calls
├── .env.example         # Environment variable template
├── .gitignore
├── package.json
├── schema.sql           # Database, tables and sample products
├── server.js            # Express API, sessions, auth and order processing
└── README.md
```

## Notes for an internship demonstration
- Passwords are hashed with bcryptjs; they are not stored as plain text.
- SQL queries use placeholders for user input.
- The server recalculates totals from database prices and checks stock in a transaction before placing orders.
- This is a learning/demo project. Before public deployment, configure a persistent session store, HTTPS, CSRF protections/rate limiting, stronger production secrets, input/security headers, backups, and a real payment provider. Do not collect real payment details in this demo.
