use serde::{Deserialize, Serialize};

/// e621 and its sister site e6AI (e6ai.net, AI-generated content) run the same e621ng
/// software fork and expose the same relative JSON API paths - only the host and each
/// site's separate account/login differ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Site {
    E621,
    E6ai,
}

impl Site {
    pub fn api_host(&self) -> &'static str {
        match self {
            Site::E621 => "e621.net",
            Site::E6ai => "e6ai.net",
        }
    }

    /// The CDN host for post files (`/data/<md5[0..2]>/<md5[2..4]>/<md5>.<ext>`).
    pub fn static_host(&self) -> &'static str {
        match self {
            Site::E621 => "static1.e621.net",
            Site::E6ai => "static1.e6ai.net",
        }
    }

    pub fn base_url(&self) -> &'static str {
        match self {
            Site::E621 => "https://e621.net",
            Site::E6ai => "https://e6ai.net",
        }
    }
}
