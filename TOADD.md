<!-- Customizable:

How to be called
Likings
How the AI should be

Memory:
Allow AI to save memory snapshots (sentences) that will always be sent to AI at first message as context, and be able to be fuzzy searched. And user could manage them in a page.Also -->

add an Agent spawner system, allow AI to spawn seperate agents to do stuff, and have options, such as 'wait-until-completion' to wait for that agent, etc.. Agents should be e.g side or important stuff/research where you need a summary or something specific, to not blow the token count unnecessary.

<!-- add about screen with logo, github repo, copyright, etc -->

create logo

add agent support to work at background

add on input marking, e.g @FILE to be able to tag files, and allow the AI to easily understand what to do.

add BASH/SHELL commands support with confirmations and auto-approve mode

if tool input is {} do not show input, only output

add logo to web favicon

add a delay tool to have a delay between calls and requests

also tools:
web_fetch - fetch a specific URL
fc_search - search with firecrawl (togglable, api needed)
fc_crawl - crawl with firecrawl (togglable, api needed)


firecrawl interact system:
1
Install

npm install firecrawl

2
Scrape + Interact (Prompt)

import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: "fc-YOUR-API-KEY" });

// 1. Scrape the page
const scrape = await firecrawl.scrapeUrl("https://example.com");
const scrapeId = scrape.metadata.scrapeId;

// 2. Interact with a prompt
const result = await firecrawl.interact(scrapeId, {
  prompt: "Click the login button and fill in the email field with test@example.com",
});
console.log("Output:", result.output);
console.log("Live view:", result.liveViewUrl);

// 3. Chain another interaction (session persists)
const result2 = await firecrawl.interact(scrapeId, {
  prompt: "Submit the form and tell me what happens",
});
console.log("Output:", result2.output);

// 4. Stop when done
await firecrawl.stopInteraction(scrapeId);

3
Execute Code (Playwright)

import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: "fc-YOUR-API-KEY" });

const scrape = await firecrawl.scrapeUrl("https://example.com");
const scrapeId = scrape.metadata.scrapeId;

// Run Playwright code — `page` is available globally
const result = await firecrawl.interact(scrapeId, {
  code: `
    await page.click('#login-button');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'secret');
    await page.click('#submit');
    await page.waitForNavigation();
    return await page.title();
  `,
  language: "node",
});
console.log("Result:", result.result);

await firecrawl.stopInteraction(scrapeId);

4
Profiles

import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: "fc-YOUR-API-KEY" });

// Scrape with a profile to persist browser state
const scrape = await firecrawl.scrapeUrl("https://example.com", {
  profile: { name: "my-profile", saveChanges: true },
});
const scrapeId = scrape.metadata.scrapeId;

// Log in via interact
await firecrawl.interact(scrapeId, {
  prompt: "Log in with test@example.com / password123",
});

// Stop — state is saved to profile
await firecrawl.stopInteraction(scrapeId);

// Later: reopen with same profile (cookies preserved)
const scrape2 = await firecrawl.scrapeUrl("https://example.com", {
  profile: { name: "my-profile", saveChanges: false },
});
// Already logged in!


ALL FILECRAWL SHOULD BE CONMBINED AS 'FIRECRAWL' IN THE TOOLS SECTION, TOGGLABLE WITH API KEY NEEDED.