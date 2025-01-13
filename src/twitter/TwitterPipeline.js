import path from 'path';
import Logger from './Logger.js';
import DataOrganizer from './DataOrganizer.js';
import TweetFilter from './TweetFilter.js';

class TwitterPipeline {
  /**
   * Constructor for TwitterPipeline.
   * @param {string} username - Twitter username to scrape.
   * @param {object} scraper - Shared scraper instance.
   */
  constructor(username, scraper) {
    this.username = username;
    this.scraper = scraper; // Use the shared scraper instance
    this.dataOrganizer = new DataOrganizer('pipeline', username);
    this.paths = this.dataOrganizer.getPaths();
    this.tweetFilter = new TweetFilter();

    this.config = {
      twitter: {
        maxTweets: parseInt(process.env.MAX_TWEETS, 10) || 50000,
      },
    };

    this.stats = {
      startTime: Date.now(),
      totalTweets: 0,
    };
  }

  /**
   * Verifies the scraper session before scraping.
   * @throws {Error} If the scraper session is not authenticated.
   */
  async verifyScraperSession() {
    Logger.info(`Verifying scraper session for @${this.username}...`);
    if (await this.scraper.isLoggedIn()) {
      Logger.success('✅ Scraper session is valid.');
    } else {
      throw new Error('Scraper session expired or invalid.');
    }
  }

  /**
   * Collects tweets for the given username.
   * @returns {Promise<object[]>} - Array of tweet objects.
   */
  async collectTweets() {
    Logger.info(`Starting tweet collection for @${this.username}...`);
    const tweets = new Map();

    try {
      const profile = await this.scraper.getProfile(this.username);
      Logger.info(`Found ${profile.tweetsCount} tweets for @${this.username}.`);

      const searchResults = this.scraper.searchTweets(
        `from:${this.username}`,
        this.config.twitter.maxTweets
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

  /**
   * Processes and saves collected tweets.
   * @param {object[]} tweets - Array of tweet objects.
   */
  async processAndSaveTweets(tweets) {
    if (tweets.length === 0) {
      Logger.warn(`No tweets found for @${this.username}.`);
      return;
    }

    Logger.info(`Saving tweets for @${this.username}...`);
    await this.dataOrganizer.saveTweets(tweets);
    Logger.success(`Tweets saved successfully for @${this.username}.`);
  }

  /**
   * Runs the pipeline for the current username.
   */
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
