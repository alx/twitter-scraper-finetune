import Logger from './Logger.js';
import DataOrganizer from './DataOrganizer.js';
import DatabaseManager from './DatabaseManager.js';
import LinkaceManager from './LinkaceManager.js';

class TwitterPipeline {
  constructor(username, scraper) {
    this.username = username;
    this.scraper = scraper;
    this.dataOrganizer = new DataOrganizer('pipeline', username);
    this.databaseManager = DatabaseManager.getInstance(); // Singleton instance
    this.linkaceManager = LinkaceManager.getInstance(); // Singleton instance
  }

  async verifyScraperSession() {
    Logger.info(`Verifying scraper session for @${this.username}...`);
    if (await this.scraper.isLoggedIn()) {
      Logger.success('✅ Scraper session is valid.');
    } else {
      throw new Error('Scraper session expired or invalid.');
    }
  }

  async collectTweets() {
    Logger.info(`Starting tweet collection for @${this.username}...`);
    const tweets = new Map();

    try {
      const profile = await this.scraper.getProfile(this.username);
      Logger.info(`Found ${profile.tweetsCount} tweets for @${this.username}.`);

      const searchResults = this.scraper.searchTweets(
        `from:${this.username}`,
        100  // Scrape 100 tweets
      );

      for await (const tweet of searchResults) {
        tweets.set(tweet.id, tweet);
        if (tweets.size % 100 === 0) {
          Logger.info(`Collected ${tweets.size} tweets for @${this.username}.`);
        }
      }
    } catch (error) {
      Logger.error(`Error collecting tweets for @${this.username}: ${error.message}`);
    }

    Logger.success(`Collected ${tweets.size} tweets for @${this.username}.`);
    return Array.from(tweets.values());
  }

  async processAndSaveTweets(tweets) {
    if (tweets.length === 0) {
      Logger.warn(`No tweets found for @${this.username}.`);
      return;
    }

    // Save to JSON, text, and analytics
    Logger.info(`Saving tweets for @${this.username} to files...`);
    await this.dataOrganizer.saveTweets(tweets);

    // Save to SQLite database
    Logger.info(`Saving tweets for @${this.username} to database...`);
    await this.databaseManager.saveTweets(tweets);

    // Save to linkace instance
    Logger.info(`Saving tweets for @${this.username} to linkace...`);
    await this.linkaceManager.saveTweets(tweets, this.username);
  }

  async run() {
    Logger.info(`Running pipeline for @${this.username}...`);

    try {
      await this.verifyScraperSession();
      const tweets = await this.collectTweets();
      await this.processAndSaveTweets(tweets);

      Logger.success(`Pipeline completed for @${this.username}.`);
    } catch (error) {
      Logger.error(`Pipeline failed for @${this.username}: ${error.message}`);
    }
  }
}

export default TwitterPipeline;
