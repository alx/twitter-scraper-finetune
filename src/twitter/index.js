// index.js
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs/promises';
import TwitterPipeline from './TwitterPipeline.js';
import Logger from './Logger.js';

process.on('unhandledRejection', (error) => {
  Logger.error(`❌ Unhandled promise rejection: ${error.message}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error(`❌ Uncaught exception: ${error.message}`);
  process.exit(1);
});

async function scrapeUsernamesFromFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const usernames = data.split('\n').map((name) => name.trim()).filter((name) => name);
    if (usernames.length === 0) {
      throw new Error('No usernames found in the file.');
    }
    return usernames;
  } catch (error) {
    Logger.error(`Failed to read usernames from file: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const filePath = 'usernames.txt'; // Path to your usernames file
  const usernames = await scrapeUsernamesFromFile(filePath);

  for (const username of usernames) {
    const pipeline = new TwitterPipeline(username);

    try {
      await pipeline.run();
    } catch (error) {
      Logger.error(`Failed to scrape tweets for ${username}: ${error.message}`);
    }
  }

  Logger.success('✅ Completed scraping for all users.');
}

main().catch((error) => {
  Logger.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
