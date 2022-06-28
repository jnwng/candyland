/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet'
import * as web3 from '@solana/web3.js'
import * as beetSolana from '@metaplex-foundation/beet-solana'
import { EncodeMethod, encodeMethodBeet } from '../types/EncodeMethod'

/**
 * @category Instructions
 * @category UpdateHeaderMetadata
 * @category generated
 */
export type UpdateHeaderMetadataInstructionArgs = {
  urlBase: beet.COption<number[] /* size: 64 */>
  nameBase: beet.COption<number[] /* size: 32 */>
  symbol: beet.COption<number[] /* size: 8 */>
  encodeMethod: beet.COption<EncodeMethod>
  sellerFeeBasisPoints: beet.COption<number>
  isMutable: beet.COption<boolean>
  retainAuthority: beet.COption<boolean>
  price: beet.COption<beet.bignum>
  goLiveDate: beet.COption<beet.bignum>
  botWallet: beet.COption<web3.PublicKey>
  authority: beet.COption<web3.PublicKey>
  maxMintSize: beet.COption<beet.bignum>
}
/**
 * @category Instructions
 * @category UpdateHeaderMetadata
 * @category generated
 */
export const updateHeaderMetadataStruct = new beet.FixableBeetArgsStruct<
  UpdateHeaderMetadataInstructionArgs & {
    instructionDiscriminator: number[] /* size: 8 */
  }
>(
  [
    ['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)],
    ['urlBase', beet.coption(beet.uniformFixedSizeArray(beet.u8, 64))],
    ['nameBase', beet.coption(beet.uniformFixedSizeArray(beet.u8, 32))],
    ['symbol', beet.coption(beet.uniformFixedSizeArray(beet.u8, 8))],
    ['encodeMethod', beet.coption(encodeMethodBeet)],
    ['sellerFeeBasisPoints', beet.coption(beet.u16)],
    ['isMutable', beet.coption(beet.bool)],
    ['retainAuthority', beet.coption(beet.bool)],
    ['price', beet.coption(beet.u64)],
    ['goLiveDate', beet.coption(beet.i64)],
    ['botWallet', beet.coption(beetSolana.publicKey)],
    ['authority', beet.coption(beetSolana.publicKey)],
    ['maxMintSize', beet.coption(beet.u64)],
  ],
  'UpdateHeaderMetadataInstructionArgs'
)
/**
 * Accounts required by the _updateHeaderMetadata_ instruction
 *
 * @property [_writable_] gumballMachine
 * @property [**signer**] authority
 * @category Instructions
 * @category UpdateHeaderMetadata
 * @category generated
 */
export type UpdateHeaderMetadataInstructionAccounts = {
  gumballMachine: web3.PublicKey
  authority: web3.PublicKey
}

export const updateHeaderMetadataInstructionDiscriminator = [
  103, 76, 66, 120, 245, 72, 217, 123,
]

/**
 * Creates a _UpdateHeaderMetadata_ instruction.
 *
 * @param accounts that will be accessed while the instruction is processed
 * @param args to provide as instruction data to the program
 *
 * @category Instructions
 * @category UpdateHeaderMetadata
 * @category generated
 */
export function createUpdateHeaderMetadataInstruction(
  accounts: UpdateHeaderMetadataInstructionAccounts,
  args: UpdateHeaderMetadataInstructionArgs
) {
  const { gumballMachine, authority } = accounts

  const [data] = updateHeaderMetadataStruct.serialize({
    instructionDiscriminator: updateHeaderMetadataInstructionDiscriminator,
    ...args,
  })
  const keys: web3.AccountMeta[] = [
    {
      pubkey: gumballMachine,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: authority,
      isWritable: false,
      isSigner: true,
    },
  ]

  const ix = new web3.TransactionInstruction({
    programId: new web3.PublicKey(
      'GBALLoMcmimUutWvtNdFFGH5oguS7ghUUV6toQPppuTW'
    ),
    keys,
    data,
  })
  return ix
}
