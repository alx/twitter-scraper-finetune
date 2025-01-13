import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import Logger from './Logger.js';

async function runQuery(query, params = []) {
  const databasePath = 'tweets.db'; // Path to the SQLite database

  try {
    // Open the database
    const db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    Logger.info('Connected to the database.');

    // Execute the query
    Logger.info(`Running query: ${query}`);
    const results = await db.all(query, params);

    if (results.length === 0) {
      Logger.warn('No results found.');
    } else {
      Logger.info('Query Results:');
      console.table(results);
    }

    // Close the database connection
    await db.close();
    Logger.info('Database connection closed.');
  } catch (error) {
    Logger.error(`Failed to query the database: ${error.message}`);
    process.exit(1);
  }
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    Logger.error('Please provide a query as an argument.');
    Logger.info('Example: node queryDatabase.js "SELECT * FROM tweets LIMIT 5;"');
    process.exit(1);
  }

  const query = args.join(' '); // Combine all arguments into a single query
  await runQuery(query);
}

main();
