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

    pub fn base_url(&self) -> &'static str {
        match self {
            Site::E621 => "https://e621.net",
            Site::E6ai => "https://e6ai.net",
        }
    }
}
