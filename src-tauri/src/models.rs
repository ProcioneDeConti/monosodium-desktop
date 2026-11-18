use serde::{Deserialize, Serialize};

/// Serializes to the frontend as `{ posts: [...] }` regardless of wire format. Deserializes from
/// either e621 response shape: the legacy `{"posts": [...]}` envelope, or the bare array e621
/// switched `posts.json` / `favorites.json` to in Nov 2026 (see `ModernPost`).
#[derive(Debug, Clone, Serialize)]
pub struct PostsResponse {
    pub posts: Vec<Post>,
}

impl<'de> Deserialize<'de> for PostsResponse {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let list = match serde_json::Value::deserialize(deserializer)? {
            serde_json::Value::Array(items) => items,
            serde_json::Value::Object(mut map) => match map.remove("posts") {
                Some(serde_json::Value::Array(items)) => items,
                None | Some(serde_json::Value::Null) => Vec::new(),
                Some(_) => return Err(D::Error::custom("`posts` is not an array")),
            },
            _ => return Err(D::Error::custom("expected a post list (array or {\"posts\": [...]})")),
        };
        let posts = list
            .into_iter()
            .map(|v| AnyPost::deserialize(v).map(|p| p.0).map_err(D::Error::custom))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PostsResponse { posts })
    }
}

/// A post in either wire format: modern posts carry a `files` object, legacy ones a `file`
/// object. Dispatches on that key (rather than `#[serde(untagged)]`) so a field-level mismatch
/// still produces a specific error instead of "did not match any variant".
struct AnyPost(Post);

impl<'de> Deserialize<'de> for AnyPost {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let value = serde_json::Value::deserialize(deserializer)?;
        let id = value.get("id").and_then(|v| v.as_i64()).unwrap_or_default();
        let post = if value.get("files").is_some() {
            serde_json::from_value::<ModernPost>(value).map(Post::from)
        } else {
            serde_json::from_value::<Post>(value)
        };
        post.map(AnyPost).map_err(|e| D::Error::custom(format!("post #{id}: {e}")))
    }
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
    #[serde(default)]
    pub relationships: PostRelationships,
    /// The authenticated user's own vote: 1 up, -1 down, 0 none. Always 0 when not signed in.
    #[serde(default, alias = "vote")] // legacy blueprint field name
    pub vote_by: i64,
    pub uploader_id: Option<i64>,
    pub approver_id: Option<i64>,
}

fn default_rating() -> String {
    "e".to_string()
}

/// Deserialize a JSON string field that e621 sometimes sends as an explicit `null` (e.g.
/// `post_versions.json`'s `reason`) - `#[serde(default)]` alone only covers a *missing* key, not a
/// present-but-null one, so a null there is a hard deserialization error without this.
fn null_to_empty_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
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
    /// Video posts only: downscaled mp4 encodes ("480p", "720p", ...). Absent on images.
    #[serde(default)]
    pub alternates: Option<PostAlternates>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostAlternates {
    #[serde(default)]
    pub samples: std::collections::HashMap<String, VideoSample>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VideoSample {
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub size: i64,
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
    /// e621 tag category 2 (people credited besides the artist, e.g. commissioners/VAs).
    #[serde(default)]
    pub contributor: Vec<String>,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostRelationships {
    pub parent_id: Option<i64>,
    #[serde(default)]
    pub has_children: bool,
    #[serde(default)]
    pub has_active_children: bool,
    #[serde(default)]
    pub children: Vec<i64>,
}

/// e621's post serialization as of Nov 2026: media regrouped under `files` (meta / original /
/// preview / sample / video), counters under `stats`, booleans under `has`, and `tags` a flat
/// list unless requested with `mode=extended` (api::POST_MODE). Wire-only - converted into the legacy-shaped `Post` (which is
/// what the frontend receives) by `From<ModernPost>`.
#[derive(Debug, Deserialize)]
struct ModernPost {
    id: i64,
    created_at: Option<String>,
    updated_at: Option<String>,
    files: ModernFiles,
    #[serde(default)]
    stats: ModernStats,
    #[serde(default)]
    flags: PostFlags,
    #[serde(default)]
    has: ModernHas,
    #[serde(default)]
    relationships: ModernRelationships,
    #[serde(default, deserialize_with = "null_to_default")]
    pools: Vec<i64>,
    #[serde(default = "default_rating")]
    rating: String,
    #[serde(default, deserialize_with = "null_to_default")]
    locked_tags: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    sources: Vec<String>,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    description: String,
    #[serde(default)]
    tags: ModernTags,
    uploader_id: Option<i64>,
    approver_id: Option<i64>,
}

fn null_to_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Default, Deserialize)]
struct ModernFiles {
    #[serde(default)]
    meta: ModernFileMeta,
    #[serde(default)]
    original: ModernMedia,
    #[serde(default)]
    preview: ModernMedia,
    #[serde(default)]
    sample: ModernMedia,
    #[serde(default)]
    video: Option<ModernVideo>,
}

#[derive(Debug, Default, Deserialize)]
struct ModernFileMeta {
    md5: Option<String>,
    ext: Option<String>,
    #[serde(default)]
    size: i64,
    duration: Option<f64>,
    #[serde(default)]
    has_sample: bool,
}

/// `original` carries `url`; `preview`/`sample` carry `jpg` + `webp` instead.
#[derive(Debug, Default, Deserialize)]
struct ModernMedia {
    #[serde(default)]
    width: i64,
    #[serde(default)]
    height: i64,
    url: Option<String>,
    jpg: Option<String>,
    webp: Option<String>,
}

impl ModernMedia {
    /// jpg first: it's what the legacy `url` field always pointed at.
    fn best_url(&self) -> Option<String> {
        self.url.clone().or_else(|| self.jpg.clone()).or_else(|| self.webp.clone())
    }
}

#[derive(Debug, Default, Deserialize)]
struct ModernVideo {
    #[serde(default)]
    samples: std::collections::HashMap<String, VideoSample>,
}

#[derive(Debug, Default, Deserialize)]
struct ModernStats {
    #[serde(default)]
    score: PostScore,
    #[serde(default)]
    fav_count: i64,
    #[serde(default)]
    is_favorited: bool,
    #[serde(default)]
    vote: i64,
    #[serde(default)]
    comment_count: i64,
}

#[derive(Debug, Default, Deserialize)]
struct ModernHas {
    #[serde(default)]
    children: bool,
    #[serde(default)]
    active_children: bool,
    #[serde(default)]
    notes: bool,
    #[serde(default)]
    sample: bool,
}

#[derive(Debug, Default, Deserialize)]
struct ModernRelationships {
    parent_id: Option<i64>,
    #[serde(default, deserialize_with = "null_to_default")]
    children: Vec<i64>,
}

/// Flat list in the current format; still accepts the old per-category object in case e621
/// returns it on some endpoint.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ModernTags {
    Flat(Vec<String>),
    Grouped(PostTags),
}

impl Default for ModernTags {
    fn default() -> Self {
        ModernTags::Flat(Vec::new())
    }
}

impl From<ModernPost> for Post {
    fn from(p: ModernPost) -> Self {
        let ModernFiles { meta, original, preview, sample, video } = p.files;
        let tags = match p.tags {
            // Endpoint ignored `mode=extended` - no categories, so everything lands in `general` (neutral chip
            // style) so search, blacklist matching and tag menus keep working.
            ModernTags::Flat(all) => PostTags { general: all, ..Default::default() },
            ModernTags::Grouped(t) => t,
        };
        // v2's `sample_url_pair` falls back to the *original* file when there's no sample (legacy
        // sent null). Keep null: every `sample.url ?? preview.url` thumbnail fallback in the
        // frontend would otherwise pull the full original (or a .webm into an <img>).
        let has_sample = meta.has_sample || p.has.sample;
        Post {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            file: PostFile {
                width: original.width,
                height: original.height,
                ext: meta.ext.unwrap_or_else(default_ext),
                size: meta.size,
                md5: meta.md5,
                url: original.best_url(),
            },
            preview: PostPreview { width: preview.width, height: preview.height, url: preview.best_url() },
            sample: PostSample {
                has: has_sample,
                width: sample.width,
                height: sample.height,
                url: if has_sample { sample.best_url() } else { None },
                alternates: video
                    .filter(|v| !v.samples.is_empty())
                    .map(|v| PostAlternates { samples: v.samples }),
            },
            score: p.stats.score,
            tags,
            locked_tags: p.locked_tags,
            rating: p.rating,
            fav_count: p.stats.fav_count,
            sources: p.sources,
            pools: p.pools,
            description: p.description,
            comment_count: p.stats.comment_count,
            is_favorited: p.stats.is_favorited,
            has_notes: p.has.notes,
            duration: meta.duration,
            flags: p.flags,
            relationships: PostRelationships {
                parent_id: p.relationships.parent_id,
                has_children: p.has.children,
                has_active_children: p.has.active_children,
                children: p.relationships.children,
            },
            vote_by: p.stats.vote,
            uploader_id: p.uploader_id,
            approver_id: p.approver_id,
        }
    }
}

#[cfg(test)]
mod post_wire_tests {
    use super::*;

    const MODERN: &str = r#"[{"id":1,"created_at":null,"updated_at":null,"files":{"meta":{"md5":"ab","ext":"webm","size":10,"duration":5.5,"has_sample":true},"original":{"width":1280,"height":720,"url":"https://x/o.webm"},"preview":{"width":256,"height":144,"jpg":"https://x/p.jpg","webp":"https://x/p.webp"},"sample":{"width":850,"height":478,"jpg":"https://x/s.jpg","webp":"https://x/s.webp"},"video":{"has":true,"samples":{"480p":{"fps":24.0,"size":5,"codec":"avc1","width":854,"height":480,"url":"https://x/480.mp4"}}}},"uploader_id":7,"approver_id":null,"stats":{"score":{"up":3,"down":-1,"total":2},"fav_count":4,"is_favorited":true,"vote":1,"comment_count":2},"flags":{"pending":true,"deleted":false},"has":{"children":true,"active_children":false,"notes":true,"sample":true},"relationships":{"parent_id":9,"children":[2]},"pools":[],"rating":"s","locked_tags":[],"sources":["https://src"],"description":"d","tags":["a","b"]}]"#;

    #[test]
    fn parses_modern_bare_array() {
        let r: PostsResponse = serde_json::from_str(MODERN).unwrap();
        let p = &r.posts[0];
        assert_eq!(p.file.url.as_deref(), Some("https://x/o.webm"));
        assert_eq!((p.file.width, p.file.ext.as_str(), p.duration), (1280, "webm", Some(5.5)));
        assert_eq!(p.preview.url.as_deref(), Some("https://x/p.jpg"));
        assert!(p.sample.has);
        assert_eq!(p.sample.alternates.as_ref().unwrap().samples["480p"].width, 854);
        assert_eq!((p.score.total, p.fav_count, p.vote_by, p.comment_count), (2, 4, 1, 2));
        assert!(p.is_favorited && p.has_notes && p.relationships.has_children);
        assert_eq!(p.relationships.parent_id, Some(9));
        assert_eq!(p.tags.general, vec!["a", "b"]);
    }

    #[test]
    fn no_sample_keeps_sample_url_null() {
        // v2 fills sample.jpg with the original file when there's no sample; legacy sent null.
        let json = MODERN.replace(r#""has_sample":true"#, r#""has_sample":false"#).replace(r#""sample":true"#, r#""sample":false"#);
        let r: PostsResponse = serde_json::from_str(&json).unwrap();
        assert!(!r.posts[0].sample.has);
        assert_eq!(r.posts[0].sample.url, None);
    }

    #[test]
    fn vote_aliases() {
        let json = r#"{"posts":[{"id":5,"created_at":null,"updated_at":null,"file":{},"preview":{},"sample":{},"vote":-1,"duration":null,"uploader_id":null,"approver_id":null}]}"#;
        assert_eq!(serde_json::from_str::<PostsResponse>(json).unwrap().posts[0].vote_by, -1);
    }

    #[test]
    fn artist_null_notes() {
        let a: Artist = serde_json::from_str(r#"{"id":1,"name":"x","group_name":"","notes":null,"urls":[]}"#).unwrap();
        assert_eq!(a.notes, "");
    }

    #[test]
    fn parses_modern_extended_tags() {
        let json = MODERN.replace(
            r#""tags":["a","b"]"#,
            r#""tags":{"general":["a"],"artist":["x"],"contributor":["c"],"copyright":[],"character":[],"species":["s"],"invalid":[],"meta":[],"lore":[]}"#,
        );
        let r: PostsResponse = serde_json::from_str(&json).unwrap();
        let t = &r.posts[0].tags;
        assert_eq!((t.artist.as_slice(), t.contributor.as_slice(), t.species.as_slice()), (&["x".to_string()][..], &["c".to_string()][..], &["s".to_string()][..]));
        assert_eq!(t.general, vec!["a"]);
    }

    #[test]
    fn parses_legacy_envelope() {
        let json = r#"{"posts":[{"id":5,"created_at":null,"updated_at":null,"file":{"width":1,"height":2,"ext":"png","size":3,"md5":"m","url":"u"},"preview":{"width":1,"height":1,"url":"p"},"sample":{"has":false,"width":1,"height":2,"url":"s"},"tags":{"artist":["x"]},"duration":null,"uploader_id":null,"approver_id":null}]}"#;
        let r: PostsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(r.posts[0].tags.artist, vec!["x"]);
        assert_eq!(r.posts[0].file.ext, "png");
    }

    #[test]
    fn empty_results() {
        assert!(serde_json::from_str::<PostsResponse>("[]").unwrap().posts.is_empty());
        assert!(serde_json::from_str::<PostsResponse>(r#"{"posts":[]}"#).unwrap().posts.is_empty());
    }
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
    // Upload-standing fields (e621ng's newer `method_attributes`). `upload_karma` drives the
    // 0-10 "upload level" the frontend computes (models/user.ts).
    pub level_string: Option<String>,
    pub base_upload_limit: Option<i64>,
    pub upload_karma: Option<i64>,
    #[serde(default)]
    pub upload_karma_free: bool,
    pub post_upload_count: Option<i64>,
    pub post_update_count: Option<i64>,
    pub note_update_count: Option<i64>,
    #[serde(default)]
    pub is_banned: bool,
    #[serde(default)]
    pub can_approve_posts: bool,
    #[serde(default)]
    pub can_upload_free: bool,
    #[serde(default)]
    pub is_verified: bool,
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

/// https://e621.net/comments.json?search[post_id]=<id> - `is_hidden` comments are moderator-only
/// and filtered out client-side (see queries/useCommentsQuery.ts), matching the reference
/// Android app's `PostActionsRepository.fetchComments`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: i64,
    #[serde(default)]
    pub post_id: i64,
    pub creator_id: Option<i64>,
    pub creator_name: Option<String>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub score: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub is_hidden: bool,
    /// The authenticated user's own vote on this comment: 1 up, -1 down, 0 none/not signed in.
    /// Patched locally from a vote mutation's response too - see queries/useCommentMutations.ts.
    #[serde(default, alias = "vote")] // CommentBlueprint emits `vote`
    pub vote_by: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommentRequest {
    pub comment: CreateCommentFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommentFields {
    pub post_id: i64,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCommentRequest {
    pub comment: UpdateCommentFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCommentFields {
    pub body: String,
}

/// https://e621.net/tickets.json - e621ng's moderation-report system, shared across every
/// reportable type (`qtype`: "comment", "user", "forum", "blip", "wiki", "pool", "set", ...).
/// Field names follow the same `{ticket: {...}}` wrapping convention as every other write
/// endpoint here (compare `CreateCommentRequest`/`UpdateUserRequest`) - not independently
/// verified against a live report submission, unlike the rest of this file's request shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTicketRequest {
    pub ticket: CreateTicketFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTicketFields {
    pub disp_id: i64,
    pub qtype: String,
    pub reason: String,
}

/// https://e621.net/dmails.json - a private message. `folder` isn't modeled: this app only ever
/// reads the inbox, matching the reference Android app's `MessagesRepository`, which never passes
/// a non-default `folder` either.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dmail {
    pub id: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub is_read: bool,
    pub created_at: Option<String>,
    pub to_id: Option<i64>,
    pub to_name: Option<String>,
    pub from_id: Option<i64>,
    pub from_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDmailRequest {
    pub dmail: CreateDmailFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDmailFields {
    pub title: String,
    pub body: String,
    pub to_name: String,
    /// Omitted entirely for a fresh (non-reply) message rather than sent as an explicit `null` -
    /// e621ng's controller may not treat those the same for an association lookup like this.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub respond_to_id: Option<i64>,
}

/// https://e621.net/forum_topics.json - browsing is public, no auth required.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForumTopic {
    pub id: i64,
    #[serde(default)]
    pub title: String,
    pub category_id: Option<i64>,
    #[serde(default)]
    pub response_count: i64,
    #[serde(default)]
    pub is_sticky: bool,
    #[serde(default)]
    pub is_locked: bool,
    pub creator_id: Option<i64>,
    pub creator_name: Option<String>,
    pub updated_at: Option<String>,
}

/// https://e621.net/forum_posts.json?search[topic_id]=<id> - one reply within a topic (the
/// topic's own opening post is just the first of these, same as e621's own site). Browsing is
/// public; posting (`create_forum_post`) requires Basic Auth + an e621 member account and is
/// rejected server-side on locked topics or logged-out requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForumPost {
    pub id: i64,
    #[serde(default)]
    pub topic_id: i64,
    #[serde(default)]
    pub body: String,
    pub creator_id: Option<i64>,
    pub creator_name: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateForumPostRequest {
    pub forum_post: CreateForumPostFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateForumPostFields {
    pub topic_id: i64,
    pub body: String,
}

/// https://e621.net/pools/<id>.json - `post_ids` is authoritative for a pool's actual sequence
/// (a `pool:<id>` tag search's own result order isn't a documented guarantee), so the frontend
/// re-sorts whatever posts.json returns to match it - see queries/usePoolQuery.ts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pool {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub creator_id: Option<i64>,
    #[serde(default)]
    pub is_active: bool,
    pub category: Option<String>,
    #[serde(default)]
    pub post_ids: Vec<i64>,
    #[serde(default)]
    pub post_count: i64,
}

/// https://e621.net/post_sets.json - a user-curated collection of posts (like a pool, but
/// personal/collaborative and unordered for display purposes here). `post_ids` is present on both
/// the list and the detail response; the frontend fetches the actual posts by `id:` search and
/// re-sorts to match, same as pools (queries/usePostSets.ts).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSet {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub shortname: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_public: bool,
    #[serde(default)]
    pub post_count: i64,
    #[serde(default)]
    pub post_ids: Vec<i64>,
    pub creator_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostSetRequest {
    pub post_set: CreatePostSetFields,
}

/// https://e621.net/artists.json - an artist's canonical name, aliases, off-site links, and the
/// staff notes. Public. DNP ("do not post") status is a separate record - see `DnpEntry`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    pub id: i64,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub name: String,
    #[serde(default)]
    pub other_names: Vec<String>,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub group_name: String,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub is_locked: bool,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub notes: String,
    pub created_at: Option<String>,
    pub linked_user_id: Option<i64>,
    #[serde(default)]
    pub urls: Vec<ArtistUrl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtistUrl {
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub url: String,
    #[serde(default)]
    pub is_active: bool,
}

/// https://e621.net/avoid_postings.json - a "do not post" record. `details` is the public reason
/// (often empty).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnpEntry {
    pub id: i64,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub details: String,
    #[serde(default)]
    pub is_active: bool,
}

/// A user name suggestion for `user:`/`fav:`/... metatag completion (`users.json` index; the
/// full user object is returned, we keep only these two fields).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSuggestion {
    pub id: i64,
    #[serde(default)]
    pub name: String,
}

/// A pool suggestion for `pool:` metatag completion (`pools.json` index).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolSuggestion {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub post_count: i64,
}

/// One entry from `related_tag.json` after `api::parse_related_tags` normalises whichever shape
/// this e621ng version returned (see that function). `category` is the numeric e621 tag category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedTag {
    pub name: String,
    pub category: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostSetFields {
    pub name: String,
    pub shortname: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub description: String,
    pub is_public: bool,
}

/// Body for `POST post_sets/:id/add_posts.json` / `remove_posts.json`. Verified against e621ng
/// source: `PostSetsController#add_remove_posts_params` is
/// `params.extract!(:post_ids).permit(post_ids: []).require(:post_ids)`, i.e. a top-level
/// `post_ids` array (not nested under `post_set`, and not the web form's `post_ids_string`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPostIdsRequest {
    pub post_ids: Vec<i64>,
}

/// https://e621.net/notes.json?search[post_id]=<id> - a translation/annotation box overlaid on
/// a post's image. `x`/`y`/`width`/`height` are pixel coordinates against the post's *original*
/// full-size image (`Post.file.width`/`height`), regardless of which resolution is actually being
/// displayed - see `ZoomableImage.tsx` for how the frontend scales them to whatever's rendered.
/// **Confidence caveat**: field names follow the general Danbooru-family note schema this API is
/// derived from, not independently verified against a live e621 response - worth confirming on
/// first real use, same caveat as `CreateTicketRequest`. View-only: creating/editing notes isn't
/// implemented here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostNote {
    pub id: i64,
    #[serde(default)]
    pub post_id: i64,
    #[serde(default)]
    pub x: i64,
    #[serde(default)]
    pub y: i64,
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub body: String,
    #[serde(default = "default_true")]
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn default_true() -> bool {
    true
}

/// https://e621.net/wiki_pages.json?search[title]=<title> - looked up by exact title (tags and
/// `[[wiki]]` link targets both use underscore-separated titles as their canonical identifier),
/// public/no auth required.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPage {
    pub id: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    pub updated_at: Option<String>,
}

/// One entry from `post_versions.json` - a single tag/metadata edit to a post. `added_tags` /
/// `removed_tags` are space-separated. Public.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostVersion {
    pub id: i64,
    #[serde(default)]
    pub version: i64,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub added_tags: Vec<String>,
    #[serde(default)]
    pub removed_tags: Vec<String>,
    #[serde(default)]
    pub rating: String,
    #[serde(default)]
    pub rating_changed: bool,
    #[serde(default)]
    pub parent_changed: bool,
    #[serde(default)]
    pub source_changed: bool,
    #[serde(default)]
    pub description_changed: bool,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub reason: String,
    pub updater_id: Option<i64>,
    #[serde(default, deserialize_with = "null_to_empty_string")]
    pub updater_name: String,
}

/// One entry from `tags.json`. `related_tags` is a space-separated `name count name count …`
/// string that the frontend splits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub post_count: i64,
    #[serde(default)]
    pub category: i64,
    #[serde(default)]
    pub related_tags: String,
}

/// This tag's implication / alias relationships, assembled from `tag_implications.json` and
/// `tag_aliases.json` (see `api::get_tag_relations`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TagRelations {
    /// Tags this tag implies (searching this tag also matches these).
    pub implies: Vec<String>,
    /// Tags that imply this one.
    pub implied_by: Vec<String>,
    /// Old names that redirect here.
    pub aliases: Vec<String>,
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

/// One row of `tag_implications.json` - only the two ends are used.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagImplication {
    pub antecedent_name: String,
    pub consequent_name: String,
}
