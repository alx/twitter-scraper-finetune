// src/utils/DataOrganizer.js
import fs from 'fs/promises';
import { stat } from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import Logger from './Logger.js';

class DataOrganizer {
  constructor(baseDir, username) {
    this.username = username
    // Use epoch time for the directory name
    const epochTime = Math.floor(Date.now() / 1000);
    this.latestPath = path.join(baseDir, username.toLowerCase(), 'latest');
    this.baseDir = path.join(baseDir, username.toLowerCase(), epochTime.toString());
    this.createDirectories();
  }

  /**
   * Creates necessary directories for storing data.
   */
  async createDirectories() {

    const dirs = ['raw', 'processed', 'analytics', 'exports', 'meta'];
    for (const dir of dirs) {
      const fullPath = path.join(this.baseDir, dir);
      try {
        await fs.mkdir(fullPath, { recursive: true });
        Logger.info(`✅ Created directory: ${path.join(this.baseDir, dir)}`);
      } catch (error) {
        Logger.warn(`⚠️  Failed to create directory ${fullPath}: ${error.message}`);
      }
    }

    try {
      await fs.unlink(this.latestPath)
    } catch (error) {
      Logger.debug(`⚠️  Failed to unlink symlink ${this.latestPath}: ${error.message}`);
    }

    try {
      await fs.symlink(this.baseDir.split('/').pop(), this.latestPath);
      Logger.info(`✅ Created symlink: ${this.latestPath}`);
    } catch (error) {
      Logger.warn(`⚠️  Failed to create symlink ${this.latestPath}: ${error.message}`);
    }
  }

  /**
   * Returns the file paths for various data categories.
   */
  getPaths() {
    return {
      raw: {
        tweets: path.join(this.baseDir, 'raw', 'tweets.json'),
        urls: path.join(this.baseDir, 'raw', 'urls.txt'),
      },
      processed: {
        finetuning: path.join(this.baseDir, 'processed', 'finetuning.jsonl'),
      },
      analytics: {
        stats: path.join(this.baseDir, 'analytics', 'stats.json'),
      },
      exports: {
        summary: path.join(this.baseDir, 'exports', 'summary.md'),
        atomFeed: path.join(this.baseDir, 'exports', 'feed.atom'),
      },
      meta: {
        nextToken: path.join(this.baseDir, 'meta', 'next_token.txt'),
      },
    };
  }

  /**
   * Retrieves the last next_token for pagination.
   * @returns {Promise<string|null>} nextToken - The last next_token or null if not found.
   */
  async getLastNextToken() {
    try {
      const data = await fs.readFile(this.getPaths().meta.nextToken, 'utf-8');
      const trimmed = data.trim();
      Logger.debug(`Retrieved last next_token: ${trimmed}`);
      return trimmed || null;
    } catch (error) {
      Logger.warn(`⚠️  No next_token found. Starting fresh.`);
      return null;
    }
  }

  /**
   * Saves the latest next_token for pagination.
   * @param {string} nextToken - The next_token to save.
   * @returns {Promise<void>}
   */
  async saveNextToken(nextToken) {
    try {
      await fs.writeFile(this.getPaths().meta.nextToken, nextToken, 'utf-8');
      Logger.debug(`✅ Saved next_token: ${nextToken}`);
    } catch (error) {
      Logger.warn(`⚠️  Failed to save next_token: ${error.message}`);
    }
  }

  /**
   * Saves collected tweets and related data.
   * @param {object[]} tweets - Array of tweet objects.
   * @returns {object} analytics - Generated analytics from tweets.
   */
  async saveTweets(tweets) {
    const paths = this.getPaths();

    try {
      // Save raw tweets
      await fs.writeFile(
        paths.raw.tweets,
        JSON.stringify(tweets, null, 2),
        'utf-8'
      );
      Logger.success(`✅ Saved tweets to ${paths.raw.tweets}`);

      // Save tweet URLs
      const urls = tweets.map((t) => t.permanentUrl);
      await fs.writeFile(paths.raw.urls, urls.join('\n'), 'utf-8');
      Logger.success(`✅ Saved tweet URLs to ${paths.raw.urls}`);

      // Generate and save analytics
      const analytics = this.generateAnalytics(tweets);
      await fs.writeFile(
        paths.analytics.stats,
        JSON.stringify(analytics, null, 2),
        'utf-8'
      );
      Logger.success(`✅ Saved analytics to ${paths.analytics.stats}`);

      // Generate and save fine-tuning data
      const finetuningData = this.generateFinetuningData(tweets);
      Logger.info(
        `ℹ️  Generating fine-tuning data with ${finetuningData.length} entries`
      );

      if (finetuningData.length > 0) {
        await fs.writeFile(
          paths.processed.finetuning,
          finetuningData.map((d) => JSON.stringify(d)).join('\n'),
          'utf-8'
        );
        Logger.success(
          `✅ Saved fine-tuning data to ${paths.processed.finetuning}`
        );
      } else {
        Logger.warn('⚠️  No fine-tuning data to save.');
      }

      // Generate and save summary
      const summary = this.generateSummary(tweets, analytics);
      await fs.writeFile(paths.exports.summary, summary, 'utf-8');
      Logger.success(`✅ Saved summary to ${paths.exports.summary}`);

      // Generate and save atom feed
      const atomFeed = this.generateAtomFeed(tweets);
      await fs.writeFile(paths.exports.atomFeed, atomFeed, 'utf-8');
      Logger.success(`✅ Saved atom feed to ${paths.exports.atomFeed}`);

      return analytics;
    } catch (error) {
      Logger.error(`❌ Error saving data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generates analytics from tweets.
   * @param {object[]} tweets - Array of tweet objects.
   * @returns {object} analytics - Generated analytics data.
   */
  generateAnalytics(tweets) {
    if (tweets.length === 0) {
      Logger.warn('⚠️  No tweets to analyze.');
      return {
        totalTweets: 0,
        directTweets: 0,
        replies: 0,
        retweets: 0,
        engagement: {
          totalLikes: 0,
          totalRetweetCount: 0,
          totalReplies: 0,
          averageLikes: '0.00',
          topTweets: [],
        },
        timeRange: {
          start: 'N/A',
          end: 'N/A',
        },
        contentTypes: {
          withImages: 0,
          withVideos: 0,
          withLinks: 0,
          textOnly: 0,
        },
      };
    }

    const validTweets = tweets.filter((t) => t.timestamp !== null);
    const invalidTweets = tweets.filter((t) => t.timestamp === null);

    if (invalidTweets.length > 0) {
      Logger.warn(
        `⚠️  Found ${invalidTweets.length} tweets with invalid or missing dates. They will be excluded from analytics.`
      );
    }

    const validDates = validTweets
      .map((t) => t.timestamp)
      .sort((a, b) => a - b);

    const tweetsForEngagement = tweets.filter((t) => !t.isRetweet);

    return {
      totalTweets: tweets.length,
      directTweets: tweets.filter((t) => !t.isReply && !t.isRetweet).length,
      replies: tweets.filter((t) => t.isReply).length,
      retweets: tweets.filter((t) => t.isRetweet).length,
      engagement: {
        totalLikes: tweetsForEngagement.reduce(
          (sum, t) => sum + (t.likes || 0),
          0
        ),
        totalRetweetCount: tweetsForEngagement.reduce(
          (sum, t) => sum + (t.retweetCount || 0),
          0
        ),
        totalReplies: tweetsForEngagement.reduce(
          (sum, t) => sum + (t.replies || 0),
          0
        ),
        averageLikes: (
          tweetsForEngagement.reduce((sum, t) => sum + (t.likes || 0), 0) /
          tweetsForEngagement.length
        ).toFixed(2),
        topTweets: tweetsForEngagement
          .sort((a, b) => (b.likes || 0) - (a.likes || 0))
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            text: t.text.slice(0, 100),
            likes: t.likes,
            retweetCount: t.retweetCount,
            url: t.permanentUrl,
          })),
      },
      timeRange: {
        start: validDates.length
          ? format(new Date(validDates[0]), 'yyyy-MM-dd')
          : 'N/A',
        end: validDates.length
          ? format(new Date(validDates[validDates.length - 1]), 'yyyy-MM-dd')
          : 'N/A',
      },
      contentTypes: {
        withImages: tweets.filter((t) => t.photos?.length > 0).length,
        withVideos: tweets.filter((t) => t.videos?.length > 0).length,
        withLinks: tweets.filter((t) => t.urls?.length > 0).length,
        textOnly: tweets.filter(
          (t) => !t.photos?.length && !t.videos?.length && !t.urls?.length
        ).length,
      },
    };
  }

  /**
   * Generates fine-tuning data from tweets.
   * @param {object[]} tweets - Array of tweet objects.
   * @returns {object[]} fineTuningData - Array of fine-tuning data objects.
   */
  generateFinetuningData(tweets) {
    return tweets
      .filter(
        (tweet) => !tweet.isRetweet && tweet.text && tweet.timestamp !== null
      )
      .map((tweet) => {
        let cleanText = tweet.text
          .replace(/(?:https?:\/\/|www\.)[^\s]+/g, '') // Remove URLs
          .replace(/#[^\s#]+/g, '') // Remove Hashtags
          .replace(/\s+/g, ' ')
          .trim();

        if (!cleanText) return null;

        return {
          text: cleanText,
        };
      })
      .filter((entry) => {
        if (!entry) return false;
        return typeof entry.text === 'string' && entry.text.length > 0;
      });
  }

  /**
   * Generates a summary of the collected data.
   * @param {object[]} tweets - Array of tweet objects.
   * @param {object} analytics - Generated analytics data.
   * @returns {string} summary - Markdown formatted summary.
   */
  generateSummary(tweets, analytics) {
    return `# Twitter Data Collection Summary

## Overview
- **Collection Date:** ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
- **Total Tweets:** ${analytics.totalTweets}
- **Date Range:** ${analytics.timeRange.start} to ${analytics.timeRange.end}

## Tweet Distribution
- **Direct Tweets:** ${analytics.directTweets}
- **Replies:** ${analytics.replies}
- **Retweets (retweeted tweets):** ${analytics.retweets}

## Content Types
- **With Images:** ${analytics.contentTypes.withImages}
- **With Videos:** ${analytics.contentTypes.withVideos}
- **With Links:** ${analytics.contentTypes.withLinks}
- **Text Only:** ${analytics.contentTypes.textOnly}

## Engagement Statistics (Original Tweets and Replies)
- **Total Likes:** ${analytics.engagement.totalLikes.toLocaleString()}
- **Total Retweet Count:** ${analytics.engagement.totalRetweetCount.toLocaleString()}
- **Total Replies:** ${analytics.engagement.totalReplies.toLocaleString()}
- **Average Likes per Tweet:** ${analytics.engagement.averageLikes}

## Top Tweets
${analytics.engagement.topTweets
  .map((t) => `- [${t.likes} likes] ${t.text}...\n  • ${t.url}`)
  .join('\n\n')}

## Storage Details
Raw data, analytics, and exports can be found in:
**${this.baseDir}**
`;
  }

  /**
   * Generates an atom feed of the collected data.
   * @param {object[]} tweets - Array of tweet objects.
   * @returns {string} atomFeed - Atom formatted feed.
   */
  generateAtomFeed(tweets) {

    const epochToAtomFeedDate = epoch => {
      // Convert epoch to milliseconds
      const date = new Date(epoch * 1000);

      // Convert date to ISO format
      const isoDate = date.toISOString();

      // Atom feeds typically use the format: YYYY-MM-DDTHH:MM:SSZ
      // The toISOString() method returns a similar format with milliseconds and a 'Z' at the end.
      // If you need to remove milliseconds, you can do so like this:
      const atomFeedDate = isoDate.replace('Z', '+00:00').replace(/\.\d+/, '');

      return atomFeedDate;
    }

    const feed = {
      entries: tweets.map((tweet) => {
        return `
        <entry>
          <title>${tweet.text.replace(/^(.{50}).*/g, "$1...")}</title>
          <link>${tweet.permanentUrl}</link>
          <id>${tweet.id}</id>
          <published>${epochToAtomFeedDate(tweet.timestamp)}</published>
          <content type="html">${tweet.text}</content>
        </entry>
        `;
      }),
    };

    const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>${this.username} atom feed</title>
      <link>${this.baseDir}</link>
      <updated>${new Date().toISOString()}</updated>
      ${feed.entries.join('\n')}
    </feed>`;

    return atomFeed;
  }

}

export default DataOrganizer;
