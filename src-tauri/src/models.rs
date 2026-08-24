use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostsResponse {
    #[serde(default)]
    pub posts: Vec<Post>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Post {
    pub id: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub file: PostFile,
    pub preview: PostPreview,
    pub sample: PostSample,
    #[serde(default)]
    pub score: PostScore,
    #[serde(default)]
    pub tags: PostTags,
    #[serde(default)]
    pub locked_tags: Vec<String>,
    #[serde(default = "default_rating")]
    pub rating: String,
    #[serde(default)]
    pub fav_count: i64,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub pools: Vec<i64>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub comment_count: i64,
    #[serde(default)]
    pub is_favorited: bool,
    #[serde(default)]
    pub has_notes: bool,
    pub duration: Option<f64>,
    #[serde(default)]
    pub flags: PostFlags,
    /// The authenticated user's own vote: 1 up, -1 down, 0 none. Always 0 when not signed in.
    #[serde(default)]
    pub vote_by: i64,
    pub uploader_id: Option<i64>,
    pub approver_id: Option<i64>,
}

fn default_rating() -> String {
    "e".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostFile {
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default = "default_ext")]
    pub ext: String,
    #[serde(default)]
    pub size: i64,
    pub md5: Option<String>,
    pub url: Option<String>,
}

fn default_ext() -> String {
    "jpg".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostPreview {
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostSample {
    #[serde(default)]
    pub has: bool,
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostScore {
    #[serde(default)]
    pub up: i64,
    #[serde(default)]
    pub down: i64,
    #[serde(default)]
    pub total: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostTags {
    #[serde(default)]
    pub general: Vec<String>,
    #[serde(default)]
    pub species: Vec<String>,
    #[serde(default)]
    pub character: Vec<String>,
    #[serde(default)]
    pub copyright: Vec<String>,
    #[serde(default)]
    pub artist: Vec<String>,
    #[serde(default)]
    pub invalid: Vec<String>,
    #[serde(default)]
    pub lore: Vec<String>,
    #[serde(default)]
    pub meta: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostFlags {
    #[serde(default)]
    pub pending: bool,
    #[serde(default)]
    pub flagged: bool,
    #[serde(default)]
    pub note_locked: bool,
    #[serde(default)]
    pub status_locked: bool,
    #[serde(default)]
    pub rating_locked: bool,
    #[serde(default)]
    pub deleted: bool,
}

/// Subset of https://e621.net/users/<id>.json - blacklisted_tags/has_mail/unread_dmail_count/
/// forum_notification_dot are only present when the authenticated requester is viewing their
/// own profile (e.g. via users/me.json). Everything else is public on any profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    pub level: Option<i64>,
    pub created_at: Option<String>,
    pub blacklisted_tags: Option<String>,
    #[serde(default)]
    pub has_mail: bool,
    #[serde(default)]
    pub unread_dmail_count: i64,
    #[serde(default)]
    pub forum_notification_dot: bool,
    pub avatar_id: Option<i64>,
    pub favorite_count: Option<i64>,
    pub wiki_page_version_count: Option<i64>,
    pub artist_version_count: Option<i64>,
    pub pool_version_count: Option<i64>,
    pub forum_post_count: Option<i64>,
    pub comment_count: Option<i64>,
    pub flag_count: Option<i64>,
    pub positive_feedback_count: Option<i64>,
    pub neutral_feedback_count: Option<i64>,
    pub negative_feedback_count: Option<i64>,
    pub upload_slots: Option<i64>,
    pub profile_about: Option<String>,
    pub profile_artinfo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserRequest {
    pub user: UpdateUserFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserFields {
    pub blacklisted_tags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteRequest {
    pub score: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VoteResponse {
    #[serde(default)]
    pub score: i64,
    #[serde(default)]
    pub up: i64,
    #[serde(default)]
    pub down: i64,
    #[serde(default)]
    pub our_score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteRequest {
    pub post_id: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FavoriteResponse {
    #[serde(default)]
    pub post_id: i64,
    #[serde(default)]
    pub favorite_count: i64,
}

/// A single result from e621's live tag-autocomplete endpoint. `name` is always the
/// canonical tag - when the search prefix matched via an alias, e621 already resolves it
/// and reports the alias that matched in `antecedent_name`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagSuggestion {
    pub name: String,
    #[serde(default)]
    pub post_count: i64,
    #[serde(default)]
    pub category: i64,
    pub antecedent_name: Option<String>,
}
