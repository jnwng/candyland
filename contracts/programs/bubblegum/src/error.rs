use anchor_lang::prelude::*;

#[error_code]
pub enum BubblegumError {
    #[msg("Could not find append authority in append allowlist")]
    AppendAuthorityNotFound,
    #[msg("Append allowlist index out of bounds")]
    AppendAllowlistIndexOutOfBounds,
    #[msg("Append allowlist has no more spots available")]
    AppendAllowlistFull,
    #[msg("Append allowlist overflow when incrementing num_appends")]
    AppendAllowlistIncrementOverflow,
    #[msg("Append allowlist underflow when decrementing num_appends")]
    AppendAllowlistIncrementUnderflow,
}
