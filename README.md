# Degen Scraper

Pipeline for generating AI character files and training datasets by scraping public figures' online presence across Twitter and blogs.

> ⚠️ **IMPORTANT**: Create a new Twitter account for this tool. DO NOT use your main account as it may trigger Twitter's automation detection and result in account restrictions.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the `.env.example` into a `.env` file:
   ```properties
   # (Required) Twitter Authentication
   TWITTER_USERNAME=     # your twitter username
   TWITTER_PASSWORD=     # your twitter password

   # (Optional) Blog Configuration
   BLOG_URLS_FILE=      # path to file containing blog URLs

   # (Optional) Scraping Configuration
   MAX_TWEETS=          # max tweets to scrape
   MAX_RETRIES=         # max retries for scraping
   RETRY_DELAY=         # delay between retries
   MIN_DELAY=           # minimum delay between requests
   MAX_DELAY=           # maximum delay between requests
   
   LINKACE_HOST=        # Linkace host
   LINKACE_API_KEY=     # Linkace api key
   LINKACE_LIST=        # Linkace list_id to store links
   ```

## Usage

### Twitter Collection
```bash
npm run twitter -- username
```
Example: `npm run twitter -- pmarca`

#### Linkace storage

* `src/twitter/LinkaceManager.js` similar to `src/twitter/DatabaseManager.js`, but saving each tweet as a linkace link instead of a database item
* linkace api, link creation: https://api-docs.linkace.org/#tag/Links/operation/post-api-v2-links

* Linkace link:
** url: tweet url
** title: tweet username + shorten description of content
** description: tweet content
** tags: #source_twitter #username_TWITTER_HANDLE #inject_scraper
** lists: [env.LINKACE_LIST]


### Blog Collection
```bash
npm run blog
```

### Generate Character
```bash
npm run character -- username
```
Example: `npm run character -- pmarca`

### Finetune
```bash
npm run finetune
```

### Finetune (with test)
```bash
npm run finetune:test
```

### Generate Virtuals Character Card
https://whitepaper.virtuals.io/developer-documents/agent-contribution/contribute-to-cognitive-core#character-card-and-goal-samples

Run this after Twitter Collection step 
```bash
npm run generate-virtuals -- username date 
```

Example: `npm run generate-virtuals -- pmarca 2024-11-29`
Example without date: `npm run generate-virtuals -- pmarca`

The generated character file will be in the `pipeline/[username]/[date]/character/character.json` directory.
The generated tweet dataset file will be in `pipeline/[username]/[date]/raw/tweets.json`.
