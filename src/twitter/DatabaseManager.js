// src/utils/DatabaseManager.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import Logger from './Logger.js';

class DatabaseManager {
  static instance = null;

  /**
   * Returns the singleton instance of DatabaseManager.
   * @returns {DatabaseManager}
   */
  static getInstance() {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  constructor(databasePath = 'tweets.db') {
    this.databasePath = databasePath;
    this.db = null;
  }

  /**
   * Initializes the database and creates necessary tables.
   */
  async initialize() {
    if (this.db) {
      Logger.info('Database is already initialized.');
      return;
    }

    Logger.info('Initializing database...');
    this.db = await open({
      filename: this.databasePath,
      driver: sqlite3.Database,
    });

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        username TEXT,
        text TEXT,
        timestamp INTEGER,
        likes INTEGER,
        retweets INTEGER,
        replies INTEGER,
        url TEXT
      );
    `;

    await this.db.exec(createTableQuery);
    Logger.success('✅ Database initialized and table ready.');
  }

  /**
   * Saves a batch of tweets to the database.
   * @param {Array} tweets - List of tweet objects.
   */
  async saveTweets(tweets) {
    if (!this.db) {
      throw new Error('Database is not initialized.');
    }

    const insertQuery = `
      INSERT OR IGNORE INTO tweets (id, username, text, timestamp, likes, retweets, replies, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;

    const stmt = await this.db.prepare(insertQuery);
    try {
      for (const tweet of tweets) {
        await stmt.run(
          tweet.id,
          tweet.username,
          tweet.text,
          tweet.timestamp,
          tweet.likes || 0,
          tweet.retweetCount || 0,
          tweet.replies || 0,
          tweet.permanentUrl || null
        );
      }
      Logger.success(`✅ Saved ${tweets.length} tweets to the database.`);
    } catch (error) {
      Logger.error(`❌ Error saving tweets to database: ${error.message}`);
    } finally {
      await stmt.finalize();
    }
  }

  /**
   * Closes the database connection.
   */
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      Logger.info('Database connection closed.');
    }
  }
}

export default DatabaseManager;
