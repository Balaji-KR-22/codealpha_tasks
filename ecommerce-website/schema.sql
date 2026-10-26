CREATE DATABASE IF NOT EXISTS novacart_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE novacart_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  category VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  badge VARCHAR(40) DEFAULT NULL,
  stock INT NOT NULL DEFAULT 25,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('Placed','Processing','Shipped','Delivered','Cancelled') DEFAULT 'Placed',
  full_name VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL,
  rating TINYINT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO products (name,category,description,price,image_url,badge,stock) VALUES
('Studio Wireless Headphones','Audio','Immersive over-ear sound, soft memory-foam cushions and up to 35 hours of listening. Made for focused work and relaxed weekends.',3499.00,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85','BESTSELLER',30),
('Everyday Smart Watch','Wearables','A sleek everyday companion with activity tracking, notifications and a bright, easy-to-read display.',4299.00,'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85','NEW',24),
('Minimal Leather Backpack','Lifestyle','A clean, versatile backpack with a padded laptop sleeve, smart compartments and durable everyday materials.',2599.00,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85','POPULAR',18),
('Classic Running Sneakers','Fashion','Lightweight cushioning and a breathable knit upper for daily walks, gym sessions and weekend adventures.',3199.00,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',NULL,22),
('Portable Bluetooth Speaker','Audio','Bring your playlist anywhere with rich portable audio, simple controls and a compact travel-friendly shape.',1899.00,'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85','SALE',35),
('Ceramic Coffee Set','Home','A modern ceramic mug set designed for slow mornings, coffee breaks and thoughtful gifting.',999.00,'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85',NULL,40),
('Everyday Sunglasses','Fashion','Timeless frames with a lightweight fit, ready to add a little polish to your everyday look.',1499.00,'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85','TRENDING',15),
('Desk Essential Lamp','Home','A warm, minimalist desk lamp that makes late-night reading and focused work feel more comfortable.',1799.00,'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',NULL,20)
ON DUPLICATE KEY UPDATE name=VALUES(name);
