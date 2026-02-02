-- Initialize Waku Store database
CREATE DATABASE IF NOT EXISTS waku;

-- Connect to the waku database
\c waku

-- Create messages table for Waku Store protocol
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    contentTopic TEXT NOT NULL,
    payload BYTEA NOT NULL,
    pubsubTopic TEXT NOT NULL,
    version INTEGER DEFAULT 0,
    senderTimestamp BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_timestamp (timestamp),
    INDEX idx_contentTopic (contentTopic),
    INDEX idx_pubsubTopic (pubsubTopic)
);

-- Create index for efficient message queries
CREATE INDEX IF NOT EXISTS idx_messages_timestamp_content 
ON messages(timestamp, contentTopic);

CREATE INDEX IF NOT EXISTS idx_messages_pubsub_timestamp 
ON messages(pubsubTopic, timestamp);
