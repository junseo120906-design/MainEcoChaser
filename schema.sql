-- EcoChaser D1 Database Schema
-- Cloudflare D1 데이터베이스 스키마 정의

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL UNIQUE,
    pw TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    region TEXT,
    tier TEXT DEFAULT 'bronze',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 게임 점수 테이블
CREATE TABLE IF NOT EXISTS game_scores (
    game_id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    region_id TEXT,
    region_name TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 게임별 쓰레기 종류별 통계 테이블
CREATE TABLE IF NOT EXISTS game_waste_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    player_name TEXT NOT NULL,
    region_id TEXT,
    region_name TEXT,
    waste_type TEXT NOT NULL,
    correct_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game_scores(game_id) ON DELETE CASCADE
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(user_name);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
CREATE INDEX IF NOT EXISTS idx_game_scores_player ON game_scores(player_name);
CREATE INDEX IF NOT EXISTS idx_game_scores_region ON game_scores(region_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON game_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_timestamp ON game_scores(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_waste_stats_game ON game_waste_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_waste_stats_region ON game_waste_stats(region_id);
CREATE INDEX IF NOT EXISTS idx_waste_stats_type ON game_waste_stats(waste_type);
