-- Push Subscriptions Table
-- Run this SQL in phpMyAdmin to create the push_subscriptions table

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token` varchar(255) NOT NULL,
  `device_type` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_token_unique` (`token`),
  KEY `push_subscriptions_user_id_foreign` (`user_id`),
  CONSTRAINT `push_subscriptions_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
