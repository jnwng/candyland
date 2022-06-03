use anchor_lang::prelude::*;

#[error_code]
pub enum BubblegumError {
    #[msg("Could not find append authority in append allowlist")]
    AppendAuthorityNotFound,
    #[msg("Append allowlist index out of bounds")]
    AppendAllowlistIndexOutOfBounds,
}
