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
  bio: z.string(),                        // Also called "description" in the Twitter API
  location: z.string().optional(),
  website: z.string().optional(),         // The profile's link field (may be a t.co URL)
  verified: z.boolean(),                  // True for any verification badge (blue, gold, grey)
  profile_image_url: z.string().optional(),
  banner_url: z.string().optional(),      // Header/cover image URL
  followers_count: z.number(),
  following_count: z.number(),
  tweet_count: z.number(),
  created_at: z.string().optional(),      // ISO 8601 account creation date
  pinned_tweet: TweetSchema.optional(),   // The tweet currently pinned to the profile
});
