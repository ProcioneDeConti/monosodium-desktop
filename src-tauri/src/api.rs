use reqwest::Method;

use crate::credentials;
use crate::models::{
    Comment, CreateCommentFields, CreateCommentRequest, CreateDmailFields, CreateDmailRequest,
    CreateForumPostFields, CreateForumPostRequest, CreatePostSetFields, CreatePostSetRequest,
    CreateTicketFields, CreateTicketRequest, Dmail, FavoriteRequest, FavoriteResponse, ForumPost,
    ForumTopic, Pool, PoolSuggestion, PostNote, PostSet, PostsResponse, RelatedTag,
    SetPostIdsRequest, TagSuggestion, UpdateCommentFields, UpdateCommentRequest, UpdateUserFields,
    UpdateUserRequest, UserProfile, UserSuggestion, VoteRequest, VoteResponse, WikiPage,
};
use crate::rate_limit::SiteRateLimiters;
use crate::site::Site;

pub struct AppState {
    pub http: reqwest::Client,
    pub limiters: SiteRateLimiters,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            // Bound the connection pool and the handshake: a stalled connect otherwise pins its
            // buffers (and the caller's rate-limit slot) indefinitely. Two API hosts, a handful of
            // in-flight calls at the 1 req/sec limit - a couple of idle keep-alive sockets per host
            // is plenty. No total-request timeout here: `download_post_file` reuses this client for
            // full media files that can legitimately take minutes; the JSON API calls in
            // `request()` set their own per-request `.timeout()` instead.
            http: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(15))
                .pool_max_idle_per_host(2)
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            limiters: SiteRateLimiters::new(),
        }
    }
}

/// e621 rejects requests with a generic/default User-Agent (403) - every request must
/// identify the app and, ideally, a way to reach whoever's running it. See https://e621.net/help/api
fn user_agent(site: Site, username: Option<&str>) -> String {
    let who = username
        .map(str::trim)
        .filter(|u| !u.is_empty())
        .unwrap_or("anonymous");
    format!(
        "MonosodiumDesktop/{} (by {} on {})",
        env!("CARGO_PKG_VERSION"),
        who,
        site.api_host()
    )
}

/// Builds a request against `site`'s API: waits for that site's rate-limit slot, sets the
/// required User-Agent and an explicit `Accept: application/json`, and attaches HTTP Basic Auth
/// (username + API key) if credentials are stored for this site. Never call `state.http`
/// directly from a command - always go through this so every request is rate-limited and
/// correctly identified.
///
/// **The explicit `Accept` header is load-bearing, not decorative** - found live: `create_dmail`
/// (`POST dmails.json`) actually succeeded server-side while this app reported a `406 Not
/// Acceptable` with an HTML "Unexpected Error" body, even for a case (messaging yourself) that
/// works fine on the real website. Every other endpoint here relies on the `.json` URL suffix
/// alone for Rails to resolve the response format, with no `Accept` header sent at all
/// (`reqwest`'s `.json()` only sets the *request* body's `Content-Type`, never a response-format
/// `Accept`); that apparently isn't reliable for every route. Declaring the desired format
/// explicitly is correct baseline REST client behavior regardless, so this is applied to every
/// request through here, not special-cased to dmails.
async fn request(
    state: &AppState,
    site: Site,
    method: Method,
    path: &str,
) -> Result<reqwest::RequestBuilder, String> {
    state.limiters.wait(site).await;
    let creds = credentials::load(site)?;
    let url = format!("{}/{}", site.base_url(), path);
    let mut builder = state
        .http
        .request(method, url)
        .timeout(std::time::Duration::from_secs(30))
        .header("User-Agent", user_agent(site, creds.as_ref().map(|c| c.username.as_str())))
        .header("Accept", "application/json");
    if let Some(c) = creds.filter(|c| !c.username.is_empty() && !c.api_key.is_empty()) {
        builder = builder.basic_auth(c.username, Some(c.api_key));
    }
    Ok(builder)
}

/// Turns a non-2xx response into a descriptive error, calling out the documented 503 (rate
/// limit exceeded) case specifically so the UI can explain what happened.
async fn ensure_success(response: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    if status.as_u16() == 503 {
        return Err("e621 rate limit exceeded (503) - please wait a moment and try again".into());
    }
    let body = response.text().await.unwrap_or_default();
    Err(format!("e621 API error {status}: {}", body.chars().take(300).collect::<String>()))
}

#[tauri::command]
pub async fn get_posts(
    state: tauri::State<'_, AppState>,
    site: Site,
    tags: Option<String>,
    limit: Option<i64>,
    page: Option<String>,
) -> Result<PostsResponse, String> {
    let mut query: Vec<(&str, String)> = vec![("limit", limit.unwrap_or(50).to_string())];
    if let Some(t) = tags {
        query.push(("tags", t));
    }
    if let Some(p) = page {
        query.push(("page", p));
    }
    let response = request(&state, site, Method::GET, "posts.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<PostsResponse>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn autocomplete_tags(
    state: tauri::State<'_, AppState>,
    site: Site,
    name: String,
) -> Result<Vec<TagSuggestion>, String> {
    let response = request(&state, site, Method::GET, "tags/autocomplete.json")
        .await?
        .query(&[("search[name_matches]", name)])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<TagSuggestion>>()
        .await
        .map_err(|e| e.to_string())
}

/// Username completion for `user:`/`fav:`/`approver:`/... metatags. `users.json` filters with
/// `search[name_matches]`, which `where_ilike`s the normalised name - `*` acts as a wildcard.
/// Public; no auth needed. Verified against e621ng's `User::SearchMethods`.
#[tauri::command]
pub async fn autocomplete_users(
    state: tauri::State<'_, AppState>,
    site: Site,
    prefix: String,
) -> Result<Vec<UserSuggestion>, String> {
    let response = request(&state, site, Method::GET, "users.json")
        .await?
        .query(&[("search[name_matches]", format!("{prefix}*")), ("limit", "10".to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<UserSuggestion>>()
        .await
        .map_err(|e| e.to_string())
}

/// Pool-name completion for the `pool:` metatag. `pools.json` filters with `search[name_matches]`
/// via `attribute_matches(..., convert_to_wildcard: true)`, so the raw prefix is enough (no `*`).
/// Public. Verified against e621ng's `Pool::SearchMethods`.
#[tauri::command]
pub async fn autocomplete_pools(
    state: tauri::State<'_, AppState>,
    site: Site,
    prefix: String,
) -> Result<Vec<PoolSuggestion>, String> {
    let response = request(&state, site, Method::GET, "pools.json")
        .await?
        .query(&[("search[name_matches]", prefix), ("limit", "10".to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<PoolSuggestion>>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_user(
    state: tauri::State<'_, AppState>,
    site: Site,
) -> Result<UserProfile, String> {
    let response = request(&state, site, Method::GET, "users/me.json")
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<UserProfile>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_user(
    state: tauri::State<'_, AppState>,
    site: Site,
    id: i64,
) -> Result<UserProfile, String> {
    let response = request(&state, site, Method::GET, &format!("users/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<UserProfile>()
        .await
        .map_err(|e| e.to_string())
}

/// Pushes a new blacklist to the signed-in account (Settings > blacklist "push to e621").
#[tauri::command]
pub async fn update_blacklist(
    state: tauri::State<'_, AppState>,
    site: Site,
    user_id: i64,
    blacklisted_tags: String,
) -> Result<(), String> {
    let body = UpdateUserRequest {
        user: UpdateUserFields { blacklisted_tags },
    };
    let response = request(&state, site, Method::PATCH, &format!("users/{user_id}.json"))
        .await?
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

/// `direction` is always the button's fixed intent (1 or -1); e621 toggles it off server-side
/// if the same direction is voted again, so the response's `our_score` is authoritative.
#[tauri::command]
pub async fn vote(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
    direction: i64,
) -> Result<VoteResponse, String> {
    let response = request(&state, site, Method::POST, &format!("posts/{post_id}/votes.json"))
        .await?
        .json(&VoteRequest { score: direction })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<VoteResponse>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn favorite(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
) -> Result<FavoriteResponse, String> {
    let response = request(&state, site, Method::POST, "favorites.json")
        .await?
        .json(&FavoriteRequest { post_id })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<FavoriteResponse>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unfavorite(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
) -> Result<FavoriteResponse, String> {
    let response = request(&state, site, Method::DELETE, &format!("favorites/{post_id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<FavoriteResponse>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_comments(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
) -> Result<Vec<Comment>, String> {
    let response = request(&state, site, Method::GET, "comments.json")
        .await?
        .query(&[("search[post_id]", post_id.to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<Comment>>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth (an unauthenticated request is rejected server-side, surfaced as a normal
/// API error - see the doc comment on `request()` for why this app doesn't gate the call itself).
#[tauri::command]
pub async fn create_comment(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
    body: String,
) -> Result<Comment, String> {
    let payload = CreateCommentRequest {
        comment: CreateCommentFields { post_id, body },
    };
    let response = request(&state, site, Method::POST, "comments.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Comment>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth; e621 rejects editing another user's comment server-side (this app only
/// shows the Edit control for comments whose `creator_id` matches the signed-in account - see
/// CommentsPanel.tsx - but doesn't re-derive that check here, same as every other write command).
#[tauri::command]
pub async fn update_comment(
    state: tauri::State<'_, AppState>,
    site: Site,
    comment_id: i64,
    body: String,
) -> Result<Comment, String> {
    let payload = UpdateCommentRequest {
        comment: UpdateCommentFields { body },
    };
    let response = request(&state, site, Method::PATCH, &format!("comments/{comment_id}.json"))
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Comment>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_comment(
    state: tauri::State<'_, AppState>,
    site: Site,
    comment_id: i64,
) -> Result<(), String> {
    let response = request(&state, site, Method::DELETE, &format!("comments/{comment_id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

/// Files a moderation report against a comment - see `CreateTicketRequest`'s doc comment for the
/// confidence caveat on this endpoint's exact field names.
#[tauri::command]
pub async fn report_comment(
    state: tauri::State<'_, AppState>,
    site: Site,
    comment_id: i64,
    reason: String,
) -> Result<(), String> {
    let payload = CreateTicketRequest {
        ticket: CreateTicketFields {
            disp_id: comment_id,
            qtype: "comment".to_string(),
            reason,
        },
    };
    let response = request(&state, site, Method::POST, "tickets.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

/// Files a moderation report against a post - same `tickets.json` endpoint and confidence
/// caveat as `report_comment`, just `qtype: "post"`.
#[tauri::command]
pub async fn report_post(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
    reason: String,
) -> Result<(), String> {
    let payload = CreateTicketRequest {
        ticket: CreateTicketFields {
            disp_id: post_id,
            qtype: "post".to_string(),
            reason,
        },
    };
    let response = request(&state, site, Method::POST, "tickets.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

/// Same request/response shape as post voting (`vote` above) - e621 shares one voting
/// controller across scorable types.
#[tauri::command]
pub async fn vote_comment(
    state: tauri::State<'_, AppState>,
    site: Site,
    comment_id: i64,
    direction: i64,
) -> Result<VoteResponse, String> {
    let response = request(&state, site, Method::POST, &format!("comments/{comment_id}/votes.json"))
        .await?
        .json(&VoteRequest { score: direction })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<VoteResponse>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth. `page` is a keyset cursor (`b<id>`), same convention as `get_posts`.
#[tauri::command]
pub async fn get_dmails(
    state: tauri::State<'_, AppState>,
    site: Site,
    page: Option<String>,
) -> Result<Vec<Dmail>, String> {
    let mut query: Vec<(&str, String)> = vec![("limit", "50".to_string())];
    if let Some(p) = page {
        query.push(("page", p));
    }
    let response = request(&state, site, Method::GET, "dmails.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<Dmail>>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth; e621 marks the dmail read as a side effect of this call if you're the owner.
#[tauri::command]
pub async fn get_dmail(state: tauri::State<'_, AppState>, site: Site, id: i64) -> Result<Dmail, String> {
    let response = request(&state, site, Method::GET, &format!("dmails/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Dmail>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth; posting anonymously is rejected server-side.
///
/// **Confirmed live, twice**: e621's `dmails#create` returns `406 Not Acceptable` (a generic
/// branded "Unexpected Error" HTML page) even when the dmail was actually created successfully -
/// reproduced with a self-sent message (which works fine on the real website) both before and
/// after adding an explicit `Accept: application/json` header, and an unauthenticated request to
/// the same endpoint correctly returns clean JSON (a 403 with a specific message), which rules
/// out a generic content-negotiation gap. Likely cause: a Rails create-then-redirect response for
/// *this* action specifically, landing on an HTML-only route our client can't get JSON from -
/// unconfirmed, since reproducing the authenticated success path requires real credentials this
/// session doesn't have. Since the create is confirmed to have actually happened, a 406 here is
/// treated as success rather than propagated as an error - there's no reliable way to fetch back
/// the created dmail's real fields (it may have gone to another user's inbox, not the sender's),
/// so a synthesized `Dmail` (echoing back what was sent, `id: 0` as a sentinel) is returned
/// instead. `id: 0` is never a real e621 dmail id, so it's a safe, recognizable placeholder if
/// this ever needs to be distinguished from a normal response later.
#[tauri::command]
pub async fn create_dmail(
    state: tauri::State<'_, AppState>,
    site: Site,
    to_name: String,
    title: String,
    body: String,
    respond_to_id: Option<i64>,
) -> Result<Dmail, String> {
    let payload = CreateDmailRequest {
        dmail: CreateDmailFields { title, body, to_name, respond_to_id },
    };
    let response = request(&state, site, Method::POST, "dmails.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status().as_u16() == 406 {
        return Ok(Dmail {
            id: 0,
            title: payload.dmail.title,
            body: payload.dmail.body,
            is_read: true,
            created_at: None,
            to_id: None,
            to_name: Some(payload.dmail.to_name),
            from_id: None,
            from_name: None,
        });
    }

    ensure_success(response)
        .await?
        .json::<Dmail>()
        .await
        .map_err(|e| e.to_string())
}

/// Soft-deletes one of your received dmails (`DELETE dmails/:id.json`). Requires Basic Auth and
/// you must be the owner (recipient). e621ng's `dmails#destroy` runs `update_column(:is_deleted,
/// true)` *before* it renders, and that render path has no JSON template - so, exactly like
/// `create_dmail`'s 406, a successful delete can come back non-2xx with an HTML/error body. Only
/// a clear auth/not-found failure (401/403/404) is surfaced as an error; anything else is taken
/// as done. The frontend refetches the inbox afterwards as the real source of truth.
#[tauri::command]
pub async fn delete_dmail(
    state: tauri::State<'_, AppState>,
    site: Site,
    id: i64,
) -> Result<(), String> {
    let response = request(&state, site, Method::DELETE, &format!("dmails/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    if matches!(status.as_u16(), 401 | 403 | 404) {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "e621 API error {status}: {}",
            body.chars().take(200).collect::<String>()
        ));
    }
    Ok(())
}

/// Public; no auth required to browse. `page` is a keyset cursor (`b<id>`), same convention as
/// `get_posts`/`get_dmails`.
#[tauri::command]
pub async fn get_forum_topics(
    state: tauri::State<'_, AppState>,
    site: Site,
    page: Option<String>,
) -> Result<Vec<ForumTopic>, String> {
    let mut query: Vec<(&str, String)> = vec![("limit", "50".to_string())];
    if let Some(p) = page {
        query.push(("page", p));
    }
    let response = request(&state, site, Method::GET, "forum_topics.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<ForumTopic>>()
        .await
        .map_err(|e| e.to_string())
}

/// Public; used to check is_locked/is_sticky before allowing a reply.
#[tauri::command]
pub async fn get_forum_topic(
    state: tauri::State<'_, AppState>,
    site: Site,
    id: i64,
) -> Result<ForumTopic, String> {
    let response = request(&state, site, Method::GET, &format!("forum_topics/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<ForumTopic>()
        .await
        .map_err(|e| e.to_string())
}

/// Public; no auth required to browse.
#[tauri::command]
pub async fn get_forum_posts(
    state: tauri::State<'_, AppState>,
    site: Site,
    topic_id: i64,
    page: Option<String>,
) -> Result<Vec<ForumPost>, String> {
    let mut query: Vec<(&str, String)> =
        vec![("search[topic_id]", topic_id.to_string()), ("limit", "50".to_string())];
    if let Some(p) = page {
        query.push(("page", p));
    }
    let response = request(&state, site, Method::GET, "forum_posts.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<ForumPost>>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth + an e621 member account; rejected on locked topics or for logged-out
/// requests (surfaced as a normal API error, same convention as every other write command here).
#[tauri::command]
pub async fn create_forum_post(
    state: tauri::State<'_, AppState>,
    site: Site,
    topic_id: i64,
    body: String,
) -> Result<ForumPost, String> {
    let payload = CreateForumPostRequest {
        forum_post: CreateForumPostFields { topic_id, body },
    };
    let response = request(&state, site, Method::POST, "forum_posts.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<ForumPost>()
        .await
        .map_err(|e| e.to_string())
}

/// Public; no auth required.
#[tauri::command]
pub async fn get_pool(state: tauri::State<'_, AppState>, site: Site, id: i64) -> Result<Pool, String> {
    let response = request(&state, site, Method::GET, &format!("pools/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Pool>()
        .await
        .map_err(|e| e.to_string())
}

/// Tags statistically related to `query` (e621's own `GET /related_tag.json`, `show` action,
/// which powers its search sidebar's "related tags"). Requires a signed-in member account
/// (`member_only` server-side). Current e621ng serialises `RelatedTagQuery` as a bare array of
/// `{ "name", "category_id" }`; `parse_related_tags` also tolerates older shapes.
#[tauri::command]
pub async fn get_related_tags(
    state: tauri::State<'_, AppState>,
    site: Site,
    query: String,
) -> Result<Vec<RelatedTag>, String> {
    let response = request(&state, site, Method::GET, "related_tag.json")
        .await?
        // e621ng's RelatedTagsController#show reads `params[:search][:query]`, not a bare `query`.
        .query(&[("search[query]", query.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let value: serde_json::Value = ensure_success(response)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(parse_related_tags(&value, &query))
}

/// Accepts `["dog", 0]` / `["dog", "0"]` pairs, `{ "name": "dog", "category_id": 0 }` (current
/// e621ng), `{ "name": "dog", "category": 0 }`, or `{ "tag": { "name", "category"/"category_id" } }`.
fn parse_related_pair(v: &serde_json::Value) -> Option<RelatedTag> {
    if let Some(arr) = v.as_array() {
        let name = arr.first()?.as_str()?.to_string();
        let category = arr
            .get(1)
            .and_then(|c| c.as_i64().or_else(|| c.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0);
        return Some(RelatedTag { name, category });
    }
    let obj = v.get("tag").unwrap_or(v);
    let name = obj.get("name")?.as_str()?.to_string();
    let category = obj
        .get("category_id")
        .or_else(|| obj.get("category"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    Some(RelatedTag { name, category })
}

fn parse_related_tags(value: &serde_json::Value, query: &str) -> Vec<RelatedTag> {
    // Current e621ng: a bare top-level array of { name, category_id }.
    if let Some(list) = value.as_array() {
        return list.iter().filter_map(parse_related_pair).collect();
    }
    // Some versions: { "related_tags": [ ... ] }.
    if let Some(list) = value.get("related_tags").and_then(|v| v.as_array()) {
        return list.iter().filter_map(parse_related_pair).collect();
    }
    // Oldest: keyed by the query string, value an array of [name, category] pairs.
    let lower = query.to_lowercase();
    for key in [query, lower.as_str()] {
        if let Some(list) = value.get(key).and_then(|v| v.as_array()) {
            return list.iter().filter_map(parse_related_pair).collect();
        }
    }
    // Last resort: the first top-level array value that parses to at least one tag.
    if let Some(obj) = value.as_object() {
        for v in obj.values() {
            if let Some(list) = v.as_array() {
                let parsed: Vec<RelatedTag> = list.iter().filter_map(parse_related_pair).collect();
                if !parsed.is_empty() {
                    return parsed;
                }
            }
        }
    }
    Vec::new()
}

/// Lists post sets. Pass `creator_id` (e.g. the signed-in account's id from `users/me.json`) to
/// get just that user's sets. Public sets of other users are visible without it; a user's private
/// sets require Basic Auth as that user.
#[tauri::command]
pub async fn get_post_sets(
    state: tauri::State<'_, AppState>,
    site: Site,
    creator_id: Option<i64>,
    name: Option<String>,
) -> Result<Vec<PostSet>, String> {
    let mut query: Vec<(&str, String)> = vec![("limit", "100".to_string())];
    if let Some(id) = creator_id {
        query.push(("search[creator_id]", id.to_string()));
    }
    if let Some(n) = name {
        query.push(("search[name]", n));
    }
    let response = request(&state, site, Method::GET, "post_sets.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<PostSet>>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_post_set(
    state: tauri::State<'_, AppState>,
    site: Site,
    id: i64,
) -> Result<PostSet, String> {
    let response = request(&state, site, Method::GET, &format!("post_sets/{id}.json"))
        .await?
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<PostSet>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth. `shortname` must be 3-50 chars, lowercase letters/numbers/underscores
/// (e621ng enforces this server-side; the frontend also derives/validates it).
#[tauri::command]
pub async fn create_post_set(
    state: tauri::State<'_, AppState>,
    site: Site,
    name: String,
    shortname: String,
    description: String,
    is_public: bool,
) -> Result<PostSet, String> {
    let payload = CreatePostSetRequest {
        post_set: CreatePostSetFields { name, shortname, description, is_public },
    };
    let response = request(&state, site, Method::POST, "post_sets.json")
        .await?
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<PostSet>()
        .await
        .map_err(|e| e.to_string())
}

/// Requires Basic Auth as the set's owner (or a maintainer). e621ng's `add_posts` action reads a
/// top-level `post_ids` array (`params.extract!(:post_ids).permit(post_ids: []).require(:post_ids)`)
/// and rejects an empty one, so an empty list is a no-op here.
#[tauri::command]
pub async fn add_posts_to_set(
    state: tauri::State<'_, AppState>,
    site: Site,
    set_id: i64,
    post_ids: Vec<i64>,
) -> Result<(), String> {
    if post_ids.is_empty() {
        return Ok(());
    }
    let response = request(&state, site, Method::POST, &format!("post_sets/{set_id}/add_posts.json"))
        .await?
        .json(&SetPostIdsRequest { post_ids })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_posts_from_set(
    state: tauri::State<'_, AppState>,
    site: Site,
    set_id: i64,
    post_ids: Vec<i64>,
) -> Result<(), String> {
    if post_ids.is_empty() {
        return Ok(());
    }
    let response = request(
        &state,
        site,
        Method::POST,
        &format!("post_sets/{set_id}/remove_posts.json"),
    )
    .await?
    .json(&SetPostIdsRequest { post_ids })
    .send()
    .await
    .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}

/// Public; no auth required. View-only - see `PostNote`'s doc comment.
#[tauri::command]
pub async fn get_post_notes(
    state: tauri::State<'_, AppState>,
    site: Site,
    post_id: i64,
) -> Result<Vec<PostNote>, String> {
    let response = request(&state, site, Method::GET, "notes.json")
        .await?
        .query(&[("search[post_id]", post_id.to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<Vec<PostNote>>()
        .await
        .map_err(|e| e.to_string())
}

/// Public; no auth required. Returns `None` if no wiki page has that exact title (a broken/
/// nonexistent `[[wiki]]` link target), rather than an error.
#[tauri::command]
pub async fn get_wiki_page(
    state: tauri::State<'_, AppState>,
    site: Site,
    title: String,
) -> Result<Option<WikiPage>, String> {
    let response = request(&state, site, Method::GET, "wiki_pages.json")
        .await?
        .query(&[("search[title]", title), ("limit", "1".to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mut pages = ensure_success(response)
        .await?
        .json::<Vec<WikiPage>>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(if pages.is_empty() { None } else { Some(pages.remove(0)) })
}

/// e621's "popular" ranking for a given day/week/month (the site's own
/// `/explore/posts/popular` page). Public; no auth. Returns the same shape as `get_posts`,
/// already ranked - there's no cursor pagination here, the ranked set for a period is fixed and
/// bounded. `date` is any `YYYY-MM-DD` within the target period; `scale` is `day`/`week`/`month`.
#[tauri::command]
pub async fn get_popular_posts(
    state: tauri::State<'_, AppState>,
    site: Site,
    date: Option<String>,
    scale: Option<String>,
) -> Result<PostsResponse, String> {
    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(d) = date {
        query.push(("date", d));
    }
    if let Some(s) = scale {
        query.push(("scale", s));
    }
    let response = request(&state, site, Method::GET, "popular.json")
        .await?
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response)
        .await?
        .json::<PostsResponse>()
        .await
        .map_err(|e| e.to_string())
}

/// Lightweight reachability check for the active site - same rate-limited/UA'd path as every
/// other call, just against a cheap endpoint.
#[tauri::command]
pub async fn health_check(state: tauri::State<'_, AppState>, site: Site) -> Result<(), String> {
    let response = request(&state, site, Method::GET, "posts.json")
        .await?
        .query(&[("limit", "1")])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    ensure_success(response).await?;
    Ok(())
}
