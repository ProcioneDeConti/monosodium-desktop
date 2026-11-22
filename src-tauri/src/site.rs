use serde::{Deserialize, Serialize};

/// e621 and the AI-art boorus floofgens (floofgens.net) and blep (blep.art) all run the e621ng
/// software and expose the same relative JSON API paths - only the host and each site's separate
/// account/login differ. (They replaced e6AI, which shut down permanently in Nov 2026.)
///
/// Note blep.art still serves the legacy (pre-v2) posts JSON shape; models.rs's `AnyPost` shim
/// parses both, so nothing site-specific is needed for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Site {
    E621,
    Floofgens,
    Blep,
}

impl Site {
    /// Stable id - matches the serde name and the frontend's `Site` string.
    pub fn key(&self) -> &'static str {
        match self {
            Site::E621 => "e621",
            Site::Floofgens => "floofgens",
            Site::Blep => "blep",
        }
    }

    pub fn api_host(&self) -> &'static str {
        match self {
            Site::E621 => "e621.net",
            Site::Floofgens => "floofgens.net",
            Site::Blep => "blep.art",
        }
    }

    /// The CDN host for post files (`/data/<md5[0..2]>/<md5[2..4]>/<md5>.<ext>`).
    pub fn static_host(&self) -> &'static str {
        match self {
            Site::E621 => "static1.e621.net",
            Site::Floofgens => "static1.floofgens.net",
            Site::Blep => "cdn.blep.art",
        }
    }

    pub fn base_url(&self) -> &'static str {
        match self {
            Site::E621 => "https://e621.net",
            Site::Floofgens => "https://floofgens.net",
            Site::Blep => "https://blep.art",
        }
    }

    fn index(&self) -> usize {
        match self {
            Site::E621 => 0,
            Site::Floofgens => 1,
            Site::Blep => 2,
        }
    }

    /// Index into a `[T; 3]` in E621, Floofgens, Blep order.
    pub fn slot<T>(self, per_site: &[T; 3]) -> &T {
        &per_site[self.index()]
    }
}
