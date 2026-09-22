-- ============================================================================
-- AR LUXURY ATELIER — MySQL 8.0 Relational Database Schema
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `ar_luxury_store`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ar_luxury_store`;

-- 1. Products Table
CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(64) PRIMARY KEY,
  `section` VARCHAR(50) NOT NULL DEFAULT 'airpods',
  `category` VARCHAR(100) NOT NULL DEFAULT 'AirPods & Audio',
  `gender` VARCHAR(20) DEFAULT 'unisex',
  `title` VARCHAR(500) NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `original_price` DECIMAL(10, 2) DEFAULT 0.00,
  `ali_price` DECIMAL(10, 2) DEFAULT 0.00,
  `rating` DECIMAL(3, 1) DEFAULT 5.0,
  `reviews` INT DEFAULT 1,
  `badge` VARCHAR(100) DEFAULT 'New Arrival',
  `badge_type` VARCHAR(50) DEFAULT 'bestseller',
  `image` VARCHAR(1000) NOT NULL,
  `description` TEXT,
  `sizes_json` JSON NULL,
  `keywords_json` JSON NULL,
  `in_stock` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` VARCHAR(50) UNIQUE NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `customer_email` VARCHAR(255) DEFAULT '',
  `customer_address` TEXT NOT NULL,
  `customer_city` VARCHAR(100) DEFAULT 'Karachi',
  `customer_area` VARCHAR(100) DEFAULT '',
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 250.00,
  `total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(50) DEFAULT 'COD',
  `status` ENUM('Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Order Items Table
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` VARCHAR(50) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `size` VARCHAR(100) DEFAULT 'Standard',
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `quantity` INT NOT NULL DEFAULT 1,
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `image` VARCHAR(1000) DEFAULT '',
  INDEX `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Store Settings Table
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(100) PRIMARY KEY,
  `setting_value` JSON NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
