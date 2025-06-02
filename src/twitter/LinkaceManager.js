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
    this.apiClient = null; // Initialize apiClient here
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
      await this.apiClient.get('/api/v2/lists');
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
   * Checks if a URL already exists in Linkace.
   * @param {string} url - The URL to check.
   * @returns {Promise<boolean>} - True if the URL exists, false otherwise.
   */
  async urlExists(url) {
    if (!this.isInitialized || !this.apiClient) {
      Logger.error('LinkaceManager is not initialized. Call initialize() first.');
      throw new Error('LinkaceManager is not initialized.');
    }
    try {
      // Linkace API uses a query parameter `query` for searching, which can include URLs.
      // We'll check if searching for the exact URL returns any results.
      const response = await this.apiClient.get('/api/v2/search/links', {
        params: { query: url }, // Search for the URL, limit to 1 result for efficiency
      });
      // If data array is not empty and the first item's URL matches, it exists.
      // Linkace search might return partial matches, so ensure exact match.
      return response.data && response.data.data && response.data.data.length > 0 && response.data.data.some(link => link.url === url);
    } catch (error) {
      let errorMessage = `Error checking if URL exists (${url}): `;
       if (error.response) {
        errorMessage += `Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMessage += 'No response received from server.';
      } else {
        errorMessage += error.message;
      }
      Logger.error(errorMessage);
      // To be safe, assume it might exist or rethrow to handle upstream
      return false; // Or throw error; for now, we'll assume it doesn't exist to allow save attempt
    }
  }

  /**
   * Saves a batch of tweets to Linkace using the bulk operation.
   * @param {Array} tweets - List of tweet objects.
   * @param {string} twitterHandle - The Twitter handle of the user whose tweets are being saved.
   */
  async saveTweets(tweets, twitterHandle) {
    if (!this.isInitialized || !this.apiClient) {
      Logger.error('LinkaceManager is not initialized. Call initialize() first.');
      throw new Error('LinkaceManager is not initialized.');
    }
    if (!tweets || tweets.length === 0) {
      Logger.info('No tweets to save to Linkace.');
      return;
    }

    Logger.info(`Processing ${tweets.length} tweets for bulk save to Linkace for @${twitterHandle}...`);

    const linksToCreate = [];
    let skippedForMissingData = 0;
    let skippedAsExisting = 0;

    for (const tweet of tweets) {
      if (!tweet.permanentUrl || !tweet.text || !tweet.username) {
        Logger.warn(`Skipping tweet due to missing data: ${JSON.stringify(tweet)}`);
        skippedForMissingData++;
        continue;
      }

      const exists = await this.urlExists(tweet.permanentUrl);
      if (exists) {
        Logger.info(`Tweet URL ${tweet.permanentUrl} already exists in Linkace. Skipping.`);
        skippedAsExisting++;
        continue;
      }

      const shortDescription = tweet.text.length > 50 ? `${tweet.text.substring(0, 47)}...` : tweet.text;
      const title = `${tweet.username}: ${shortDescription}`;

      linksToCreate.push({
        url: tweet.permanentUrl,
        title: title,
        description: tweet.text,
        tags: [`source_twitter`, `username_${twitterHandle}`, `inject_scraper`],
        visibility: 2, // Defines the visibility: 1 - public, 2 - internal, 3 - private
        lists: [parseInt(this.linkaceListId, 10)]
      });
    }

    if (linksToCreate.length === 0) {
      Logger.info(`No new tweets to save to Linkace for @${twitterHandle}. Missing data: ${skippedForMissingData}, Already existed: ${skippedAsExisting}.`);
      return;
    }

    Logger.info(`Attempting to bulk save ${linksToCreate.length} new tweets to Linkace for @${twitterHandle}...`);

    const bulkPayload = {
      models: linksToCreate,
    };

    let successfulSaves = 0;
    let failedSaves = 0;

    try {
      const response = await this.apiClient.post('/api/v2/bulk/links', bulkPayload);
      if (response.status === 201) {
        successfulSaves = linksToCreate.length; // All links in the batch were successful
        Logger.debug(`Bulk save successful (201): ${successfulSaves} tweets for @${twitterHandle}.`);
      } else {
        // Unexpected status code
        failedSaves = linksToCreate.length;
        Logger.warn(`Bulk save for @${twitterHandle} failed with unexpected status: ${response.status}. Response: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      failedSaves = linksToCreate.length; // Assume all failed if the request itself errors out
      let errorMessage = `Error during bulk save for @${twitterHandle}: `;
      if (error.response) {
        errorMessage += `Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMessage += 'No response received from server.';
      } else {
        errorMessage += error.message;
      }
      Logger.error(errorMessage);
    }

    Logger.info(`Linkace bulk save summary for @${twitterHandle}:`);
    Logger.info(`  Successfully created: ${successfulSaves}`);
    Logger.info(`  Failed to create: ${failedSaves}`);
    Logger.info(`  Skipped (missing data): ${skippedForMissingData}`);
    Logger.info(`  Skipped (already existed): ${skippedAsExisting}`);

    if (failedSaves > 0) {
        Logger.warn(`${failedSaves} tweets could not be saved to Linkace during bulk operation. Check logs for details.`);
    }
    if (successfulSaves > 0) {
        Logger.success(`✅ Successfully bulk saved ${successfulSaves} new tweets to Linkace.`);
    }
  }

  /**
   * Closes any connections or performs cleanup if necessary.
   * For this manager, there isn't much to do as Axios handles connections.
   */
  async close() {
    Logger.info('LinkaceManager closed (no active connections to manage).');
    this.isInitialized = false; // Reset initialization state
    this.apiClient = null; // Clear the apiClient
  }
}

export default LinkaceManager;
