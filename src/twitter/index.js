// index.js
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs/promises';
import TwitterPipeline from './TwitterPipeline.js';
import Logger from './Logger.js';
import DatabaseManager from './DatabaseManager.js';
import LinkaceManager from './LinkaceManager.js';
import { Scraper } from 'agent-twitter-client';

process.on('unhandledRejection', (error) => {
  Logger.error(`❌ Unhandled promise rejection: ${error.message}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error(`❌ Uncaught exception: ${error.message}`);
  process.exit(1);
});

/**
 * Reads usernames from a file.
 * @param {string} filePath - Path to the file containing usernames.
 * @returns {Promise<string[]>} - List of usernames.
 */
async function scrapeUsernamesFromFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const usernames = data.split('\n').map((name) => name.trim()).filter(Boolean);
    if (usernames.length === 0) {
      throw new Error('No usernames found in the file.');
    }
    return usernames;
  } catch (error) {
    Logger.error(`Failed to read usernames from file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Initializes and authenticates a shared scraper.
 * @returns {Promise<Scraper>} - Authenticated scraper instance.
 */
async function initializeScraper() {
  const scraper = new Scraper();
  Logger.info('Initializing shared scraper...');
  try {
    if (await scraper.isLoggedIn()) {
      Logger.success('✅ Scraper is already authenticated.');
      return scraper;
    }

    Logger.info('Logging in to Twitter...');
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;

    if (!username || !password || !email) {
      throw new Error('Missing Twitter credentials. Please set TWITTER_USERNAME, TWITTER_PASSWORD, and TWITTER_EMAIL in the .env file.');
    }

    await scraper.login(username, password, email);
    if (!(await scraper.isLoggedIn())) {
      throw new Error('Login verification failed.');
    }

    Logger.success('✅ Successfully authenticated with Twitter.');
    return scraper;
  } catch (error) {
    Logger.error(`Failed to initialize scraper: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function to scrape tweets for multiple users.
 */
async function main() {
  const filePath = 'usernames.txt'; // Path to your usernames file
  const usernames = await scrapeUsernamesFromFile(filePath);

  const scraper = await initializeScraper();

  // Initialize the database manager (singleton)
  const databaseManager = DatabaseManager.getInstance();
  await databaseManager.initialize();

  // Initialize the linkace manager (singleton)
  const linkaceManager = LinkaceManager.getInstance();
  await linkaceManager.initialize();

  try {
    for (const username of usernames) {
      const pipeline = new TwitterPipeline(username, scraper);

      try {
        await pipeline.run();
      } catch (error) {
        Logger.error(`Failed to scrape tweets for @${username}: ${error.message}`);
      }
    }

    Logger.success('✅ Completed scraping for all users.');
  } catch (error) {
    Logger.error(`Unexpected error during execution: ${error.message}`);
  } finally {
    // Close the database connection
    await databaseManager.close();
    // Close the linkace connection
    await linkaceManager.close();
  }
}

main().catch((error) => {
  Logger.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
