/**
 * User Profile Schema (Zod)
 *
 * Describes the shape returned by the get_user_profile MCP tool.
 * Includes all publicly visible profile fields plus the pinned tweet (if any).
 *
 * The pinned_tweet field reuses TweetSchema — it will be the full tweet object
 * including media, metrics, and quoted tweet if the user has pinned one.
 */

import { z } from "zod";
import { TweetSchema } from "./tweet.js";

export const UserProfileSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  bio: z.string().nullish(),              // Grok returns null when bio is absent
  location: z.string().nullish(),
  website: z.string().nullish(),          // The profile's link field (may be a t.co URL)
  // Grok sometimes returns "true"/"false" strings — coerce to boolean.
  verified: z.coerce.boolean(),           // True for any verification badge (blue, gold, grey)
  profile_image_url: z.string().nullish(),
  banner_url: z.string().nullish(),       // Header/cover image URL
  followers_count: z.number(),
  following_count: z.number().nullish(),  // Grok returns null when unavailable
  tweet_count: z.number().nullish(),      // Grok returns null when unavailable
  created_at: z.string().nullish(),       // ISO 8601 account creation date
  pinned_tweet: TweetSchema.nullish(),    // The tweet currently pinned to the profile
});
