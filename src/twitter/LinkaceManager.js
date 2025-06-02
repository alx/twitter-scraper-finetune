// src/twitter/LinkaceManager.js
import axios from 'axios';
import Logger from './Logger.js';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

class LinkaceManager {
  static instance = null;

  /**
   * Returns the singleton instance of LinkaceManager.
   * @returns {LinkaceManager}
   */
  static getInstance() {
    if (!LinkaceManager.instance) {
      LinkaceManager.instance = new LinkaceManager();
    }
    return LinkaceManager.instance;
  }

  constructor() {
    this.linkaceHost = process.env.LINKACE_HOST;
    this.linkaceApiKey = process.env.LINKACE_API_KEY;
    this.linkaceListId = process.env.LINKACE_LIST;
    this.isInitialized = false;
  }

  /**
   * Initializes the LinkaceManager, checking for necessary environment variables.
   */
  async initialize() {
    if (this.isInitialized) {
      Logger.info('LinkaceManager is already initialized.');
      return;
    }

    Logger.info('Initializing LinkaceManager...');

    if (!this.linkaceHost) {
      Logger.error('LINKACE_HOST environment variable is not set.');
      throw new Error('LINKACE_HOST environment variable is not set.');
    }
    if (!this.linkaceApiKey) {
      Logger.error('LINKACE_API_KEY environment variable is not set.');
      throw new Error('LINKACE_API_KEY environment variable is not set.');
    }
    if (!this.linkaceListId) {
      Logger.warn('LINKACE_LIST environment variable is not set. Links will not be added to a list.');
      // Allow proceeding without a list ID, but log a warning.
    }

    // Validate the list ID is a number if provided
    if (this.linkaceListId && isNaN(parseInt(this.linkaceListId, 10))) {
        Logger.error('LINKACE_LIST environment variable must be a valid number (list_id).');
        throw new Error('LINKACE_LIST environment variable must be a valid number (list_id).');
    }


    this.apiClient = axios.create({
      baseURL: this.linkaceHost,
      headers: {
        'Authorization': `Bearer ${this.linkaceApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Test connection by trying to fetch lists (or any other simple read operation)
    try {
      // A simple GET request to test authentication and host validity.
      // Fetching lists is a common, lightweight operation.
      await this.apiClient.get('/api/v2/lists?limit=1');
      Logger.success('✅ LinkaceManager initialized and connection tested successfully.');
      this.isInitialized = true;
    } catch (error) {
      let errorMessage = 'Failed to initialize LinkaceManager. ';
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        errorMessage += `Server responded with status ${error.response.status}: ${JSON.stringify(error.response.data)}. `;
        errorMessage += `Please check your LINKACE_HOST and LINKACE_API_KEY. Ensure the host includes the schema (http/https).`;
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage += 'No response received from Linkace host. Check LINKACE_HOST and network connectivity.';
      } else {
        // Something happened in setting up the request that triggered an Error
        errorMessage += `Error: ${error.message}`;
      }
      Logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Saves a batch of tweets to Linkace.
   * @param {Array} tweets - List of tweet objects.
   * @param {string} twitterHandle - The Twitter handle of the user whose tweets are being saved.
   */
  async saveTweets(tweets, twitterHandle) {
    if (!this.isInitialized) {
      Logger.error('LinkaceManager is not initialized. Call initialize() first.');
      throw new Error('LinkaceManager is not initialized.');
    }
    if (!tweets || tweets.length === 0) {
      Logger.info('No tweets to save to Linkace.');
      return;
    }

    Logger.info(`Attempting to save ${tweets.length} tweets to Linkace for @${twitterHandle}...`);
    let successfulSaves = 0;
    let failedSaves = 0;

    for (const tweet of tweets) {
      if (!tweet.permanentUrl || !tweet.text || !tweet.username) {
        Logger.warn(`Skipping tweet due to missing data: ${JSON.stringify(tweet)}`);
        failedSaves++;
        continue;
      }

      // Construct title: username + shorten description of content
      const shortDescription = tweet.text.length > 50 ? `${tweet.text.substring(0, 47)}...` : tweet.text;
      const title = `${tweet.username}: ${shortDescription}`;

      const payload = {
        url: tweet.permanentUrl,
        title: title,
        description: tweet.text,
        tags: [`source_twitter`, `username_${twitterHandle}`, `inject_scraper`],
        visibility: 2, // Defines the visibility: 1 - public, 2 - internal, 3 - private
      };

      if (this.linkaceListId) {
        payload.lists = [parseInt(this.linkaceListId, 10)];
      }

      try {
        const response = await this.apiClient.post('/api/v2/links', payload);
        if (response.status === 201 || response.status === 200) { // 201 Created, 200 OK if it might update
          Logger.debug(`Successfully saved tweet ${tweet.id} to Linkace: ${tweet.permanentUrl}`);
          successfulSaves++;
        } else {
          Logger.warn(`Failed to save tweet ${tweet.id} to Linkace. Status: ${response.status}, Response: ${JSON.stringify(response.data)}`);
          failedSaves++;
        }
      } catch (error) {
        failedSaves++;
        let errorMessage = `Error saving tweet ${tweet.id} (${tweet.permanentUrl}) to Linkace: `;
        if (error.response) {
          errorMessage += `Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
        } else if (error.request) {
          errorMessage += 'No response received from server.';
        } else {
          errorMessage += error.message;
        }
        Logger.error(errorMessage);
        // Optionally, decide if one error should stop the whole batch
        // For now, we'll continue trying to save other tweets
      }
    }

    Logger.info(`Linkace save summary for @${twitterHandle}: ${successfulSaves} successful, ${failedSaves} failed.`);
    if (failedSaves > 0) {
        Logger.warn(`${failedSaves} tweets could not be saved to Linkace. Check logs for details.`);
    }
    if (successfulSaves > 0) {
        Logger.success(`✅ Successfully saved ${successfulSaves} tweets to Linkace.`);
    }
  }

  /**
   * Closes any connections or performs cleanup if necessary.
   * For this manager, there isn't much to do as Axios handles connections.
   */
  async close() {
    Logger.info('LinkaceManager closed (no active connections to manage).');
    this.isInitialized = false; // Reset initialization state
  }
}

export default LinkaceManager;
