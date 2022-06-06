use crate::error::BubblegumError;
use anchor_lang::prelude::*;

pub const GUMMYROLL_TREE_AUTHORITY_SIZE: usize = 296;
pub const APPEND_ALLOWLIST_SIZE: usize = 5;
#[account]
pub struct GummyrollTreeAuthority {
    /// Pubkey of merkle roll that this manages
    pub tree_id: Pubkey,
    /// Always able to transfer owner, delegate, modify append_allowlist
    pub owner: Pubkey,
    /// Always able to transfer delegate, modify append_allowlist
    pub delegate: Pubkey,
    /// Able to append up to corresponding # of uses via bubblegum
    pub append_allowlist: [AppendAllowlistEntry; APPEND_ALLOWLIST_SIZE],
}

impl GummyrollTreeAuthority {
    pub fn increment_allowlist(&mut self, allowlist_pubkey: &Pubkey, amount: u64) -> Result<()> {
        match self
            .append_allowlist
            .iter()
            .position(|&entry| entry.pubkey == *allowlist_pubkey)
        {
            Some(idx) => match self.append_allowlist[idx].num_appends.checked_add(amount) {
                Some(new_num_appends) => {
                    self.append_allowlist[idx].num_appends = new_num_appends;
                    Ok(())
                }
                None => {
                    err!(BubblegumError::AppendAllowlistIncrementOverflow)
                }
            },
            None => {
                err!(BubblegumError::AppendAuthorityNotFound)
            }
        }
    }
    pub fn decrement_allowlist(&mut self, allowlist_pubkey: &Pubkey, amount: u64) -> Result<()> {
        match self
            .append_allowlist
            .iter()
            .position(|&entry| entry.pubkey == *allowlist_pubkey)
        {
            Some(idx) => match self.append_allowlist[idx].num_appends.checked_sub(amount) {
                Some(new_num_appends) => {
                    self.append_allowlist[idx].num_appends = new_num_appends;
                    Ok(())
                }
                None => {
                    err!(BubblegumError::AppendAllowlistIncrementUnderflow)
                }
            },
            None => {
                err!(BubblegumError::AppendAuthorityNotFound)
            }
        }
    }
}
#[repr(C)]
#[derive(AnchorDeserialize, AnchorSerialize, Default, Debug, Copy, Clone)]
pub struct AppendAllowlistEntry {
    pub pubkey: Pubkey,
    pub num_appends: u64,
}
