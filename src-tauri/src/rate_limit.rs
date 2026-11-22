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

/// One limiter per site host - each e621ng site is an independent server with its own accounts, so
/// traffic to one must not throttle another. Arrays are in E621, Floofgens, Blep order.
pub struct SiteRateLimiters {
    reads: [DefaultDirectRateLimiter; 3],
    writes: [DefaultDirectRateLimiter; 3],
}

impl SiteRateLimiters {
    pub fn new() -> Self {
        Self {
            reads: std::array::from_fn(|_| RateLimiter::direct(quota())),
            writes: std::array::from_fn(|_| RateLimiter::direct(write_quota())),
        }
    }

    pub async fn wait(&self, site: Site) {
        site.slot(&self.reads).until_ready().await
    }

    /// Waits for a write slot (see [`write_quota`]) - call before [`Self::wait`] for any non-GET.
    pub async fn wait_write(&self, site: Site) {
        site.slot(&self.writes).until_ready().await
    }
}
