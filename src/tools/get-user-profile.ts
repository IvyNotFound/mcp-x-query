/**
 * Tool: get_user_profile
 *
 * Retrieves complete profile information for a Twitter/X user.
 * Returns a UserProfileSchema object including followers, bio, website,
 * verification status, and the user's pinned tweet (if any).
 *
 * Input:
 *   username — Twitter/X handle, with or without leading "@"
 *
 * Implementation note:
 *   The x_search `allowed_x_handles` filter is set to the target username so
 *   that Grok focuses its search on that specific account's data.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { UserProfileSchema } from "../schemas/user.js";
import { sanitizeUsername } from "../lib/utils.js";

/** MCP input schema for the get_user_profile tool. */
export const GetUserProfileInput = z.object({
  username: z.string().describe("Twitter/X username (with or without @)"),
});

/**
 * Fetch a user's public profile from Twitter/X via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetUserProfileInput.
 * @returns       User profile object conforming to UserProfileSchema.
 */
export async function getUserProfile(
  client: GrokClient,
  input: z.infer<typeof GetUserProfileInput>
) {
  // Strip leading "@" so the username is always in bare form (e.g. "elonmusk").
  const username = sanitizeUsername(input.username);

  const prompt = `Retrieve the Twitter/X profile information for @${username}.
Return as a JSON object with: username, display_name, bio, location (if available),
website (if available), verified (blue checkmark or other verification), profile_image_url (if available),
banner_url (if available), followers_count, following_count, tweet_count, created_at (account creation date if known),
and pinned_tweet (if they have one pinned).`;

  // Restrict x_search to the target handle to improve result accuracy.
  return client.query(prompt, UserProfileSchema, "user_profile", {
    allowed_x_handles: [username],
  });
}
