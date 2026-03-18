<?php
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=chat_app', 'root', '');
    echo "DB OK\n";
    $stmt = $pdo->query('SHOW TABLES');
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables: " . implode(', ', $tables) . "\n";
    echo "Has sessions: " . (in_array('sessions', $tables) ? 'YES' : 'NO') . "\n";
} catch(Exception $e) {
    echo "DB Error: " . $e->getMessage() . "\n";
}
