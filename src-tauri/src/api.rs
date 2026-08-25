use reqwest::Method;

use crate::credentials;
use crate::models::{
    Comment, CreateCommentFields, CreateCommentRequest, CreateDmailFields, CreateDmailRequest,
    CreateTicketFields, CreateTicketRequest, Dmail, FavoriteRequest, FavoriteResponse,
    PostsResponse, TagSuggestion, UpdateCommentFields, UpdateCommentRequest, UpdateUserFields,
    UpdateUserRequest, UserProfile, VoteRequest, VoteResponse,
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
            http: reqwest::Client::new(),
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
/// required User-Agent, and attaches HTTP Basic Auth (username + API key) if credentials are
/// stored for this site. Never call `state.http` directly from a command - always go through
/// this so every request is rate-limited and correctly identified.
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
        .header("User-Agent", user_agent(site, creds.as_ref().map(|c| c.username.as_str())));
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
    ensure_success(response)
        .await?
        .json::<Dmail>()
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
