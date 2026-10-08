use std::num::NonZeroU32;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};

use crate::site::Site;

/// e621's API rules (https://e621.net/help/api / e621 API help wiki) set a **hard** limit of 2
/// requests/second (503 if exceeded), and ask clients to make a best effort to stay at or below
/// 1 request/second sustained. A quota that replenishes 1 token/second but allows a burst of 2
/// satisfies both: sustained traffic settles to 1 req/s, while an occasional pair of calls (e.g.
/// vote immediately followed by favorite) doesn't have to serialize behind a full second each.
fn quota() -> Quota {
    Quota::per_second(NonZeroU32::new(1).unwrap()).allow_burst(NonZeroU32::new(2).unwrap())
}

/// e621ng also throttles *writes* per account: every non-GET request draws from a token bucket of
/// 60/minute (`User#api_burst_limit`; 90 privileged, 120 former staff) and over-drawing it returns
/// 429. The read quota above alone would allow exactly 60/min, so writes get their own, slightly
/// stricter quota (50/min, burst 5 - so at most 55 in any minute) to stay under e621's even across a long voting/favoriting run.
fn write_quota() -> Quota {
    Quota::per_minute(NonZeroU32::new(50).unwrap()).allow_burst(NonZeroU32::new(5).unwrap())
}

/// One limiter per site host - e621 and e6AI are independent servers/accounts, so traffic to one
/// must not throttle the other.
pub struct SiteRateLimiters {
    e621: DefaultDirectRateLimiter,
    e6ai: DefaultDirectRateLimiter,
    e621_writes: DefaultDirectRateLimiter,
    e6ai_writes: DefaultDirectRateLimiter,
}

impl SiteRateLimiters {
    pub fn new() -> Self {
        Self {
            e621: RateLimiter::direct(quota()),
            e6ai: RateLimiter::direct(quota()),
            e621_writes: RateLimiter::direct(write_quota()),
            e6ai_writes: RateLimiter::direct(write_quota()),
        }
    }

    pub async fn wait(&self, site: Site) {
        match site {
            Site::E621 => self.e621.until_ready().await,
            Site::E6ai => self.e6ai.until_ready().await,
        }
    }

    /// Waits for a write slot (see [`write_quota`]) - call before [`Self::wait`] for any non-GET.
    pub async fn wait_write(&self, site: Site) {
        match site {
            Site::E621 => self.e621_writes.until_ready().await,
            Site::E6ai => self.e6ai_writes.until_ready().await,
        }
    }
}
