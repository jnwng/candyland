use anchor_lang::{prelude::*, solana_program::keccak};
use gummyroll::state::node::Node;

pub struct RawLeafSchema {
    pub owner: Pubkey,
    pub delegate: Pubkey, // Defaults to owner
    pub nonce: u128,
    pub data: Vec<u8>,
}

impl RawLeafSchema {
    pub fn new(owner: Pubkey, delegate: Pubkey, nonce: u128, data: Vec<u8>) -> Self {
        Self {
            owner,
            delegate,
            nonce,
            data,
        }
    }

    pub fn to_node(&self) -> Node {
        let data_hash = keccak::hashv(&[self.data.as_slice()]);
        msg!("Data Hash: {}", Pubkey::new(data_hash.as_ref()));
        let hashed_leaf = keccak::hashv(&[
            self.owner.as_ref(),
            self.delegate.as_ref(),
            self.nonce.to_le_bytes().as_ref(),
            data_hash.as_ref(),
        ])
        .to_bytes();
        Node::new(hashed_leaf)
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, Default, Debug)]
pub struct LeafSchema {
    pub owner: Pubkey,
    pub delegate: Pubkey, // Defaults to owner
    pub nonce: u128,
    pub data_hash: [u8; 32],
}

impl LeafSchema {
    pub fn new(owner: Pubkey, delegate: Pubkey, nonce: u128, data_hash: [u8; 32]) -> Self {
        Self {
            owner,
            delegate,
            nonce,
            data_hash,
        }
    }

    pub fn to_node(&self) -> Node {
        let hashed_leaf = keccak::hashv(&[
            self.owner.as_ref(),
            self.delegate.as_ref(),
            self.nonce.to_le_bytes().as_ref(),
            self.data_hash.as_ref(),
        ])
        .to_bytes();
        Node::new(hashed_leaf)
    }
}