use crate::state::{EncodeMethod, GumballCreatorAdapter, NUM_CREATORS};
use anchor_lang::{
    prelude::*,
    solana_program::{msg, program_error::ProgramError},
};
use bubblegum::state::metaplex_adapter::Collection;
use bubblegum::state::metaplex_adapter::MetadataArgs;
use bubblegum::state::metaplex_adapter::TokenProgramVersion;
use bubblegum::state::metaplex_adapter::Uses;
use bytemuck::PodCastError;
use std::any::type_name;
use std::mem::size_of;

pub fn error_msg<T>(data_len: usize) -> impl Fn(PodCastError) -> ProgramError {
    move |_: PodCastError| -> ProgramError {
        msg!(
            "Failed to load {}. Size is {}, expected {}",
            type_name::<T>(),
            data_len,
            size_of::<T>(),
        );
        ProgramError::InvalidAccountData
    }
}

pub fn get_metadata_args(
    url_base: [u8; 64],
    name_base: [u8; 32],
    symbol: [u8; 8],
    seller_fee_basis_points: u16,
    is_mutable: bool,
    collection: Pubkey,
    uses: Option<Uses>,
    creators: [GumballCreatorAdapter; NUM_CREATORS],
    index: usize,
    config_line: Vec<u8>,
    encode_method: EncodeMethod,
) -> MetadataArgs {
    let zero = 0 as char;
    let name_base = std::str::from_utf8(&name_base).unwrap().trim_matches(zero);
    let symbol = std::str::from_utf8(&symbol).unwrap().trim_matches(zero);
    let uri_base = std::str::from_utf8(&url_base).unwrap().trim_matches(zero);
    let system_program_id = anchor_lang::system_program::ID;
    let config = match encode_method {
        EncodeMethod::Base58Encode => bs58::encode(config_line).into_string(),
        _ => std::str::from_utf8(&config_line).unwrap().to_string(),
    };
    msg!("Config Line: {}", config);

    let mut creators_vec = vec![];
    for creator in creators.iter() {
        if creator.is_valid() {
            creators_vec.push(creator.adapt());
        }
    }
    MetadataArgs {
        name: name_base.to_owned() + " #" + &index.to_string(),
        symbol: symbol.to_string(),
        uri: uri_base.to_owned() + "/" + &config,
        seller_fee_basis_points,
        primary_sale_happened: true,
        is_mutable,
        edition_nonce: None,
        token_standard: None,
        collection: if collection == system_program_id {
            // Treat the SystemProgram as a the null case
            None
        } else {
            Some(Collection {
                verified: true,
                key: collection,
            })
        },
        uses,
        token_program_version: TokenProgramVersion::Token2022,
        creators: creators_vec,
    }
}
