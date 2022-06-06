import * as anchor from "@project-serum/anchor";
import { keccak_256 } from "js-sha3";
import { BN, Provider, Program, AccountClient } from "@project-serum/anchor";
import { Bubblegum } from "../target/types/bubblegum";
import { PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  Connection as web3Connection,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { assert } from "chai";

import { buildTree, Tree } from "./merkle-tree";
import {
  decodeMerkleRoll,
  getMerkleRollAccountSize,
  assertOnChainMerkleRollProperties,
} from "../sdk/gummyroll";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token
} from "@solana/spl-token";
import { execute, logTx } from "./utils";
import { assertConfirmedTransaction } from "@metaplex-foundation/amman";

// @ts-ignore
let Bubblegum;
// @ts-ignore
let GummyrollProgramId;

function createExampleMetadata(name: String, symbol: String, uri: String) {
  return {
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    primarySaleHappened: false,
    isMutable: false,
    editionNonce: null,
    tokenStandard: null,
    tokenProgramVersion: {
      original: {},
    },
    collection: null,
    uses: null,
    creators: [],
  };
}

async function getNonceAccount(bubblegum: Program<Bubblegum>): Promise<PublicKey> {
  let [nonce] = await PublicKey.findProgramAddress(
    [Buffer.from("bubblegum")],
    bubblegum.programId
  );
  return nonce;
}

async function getTreeAuthority(bubblegum: Program<Bubblegum>, merkleSlab: PublicKey): Promise<PublicKey> {
  let [authority] = await PublicKey.findProgramAddress(
    [merkleSlab.toBuffer()],
    bubblegum.programId
  );
  return authority;
}

type Version = {
  v0: Object,
}

async function createMintIx(bubblegum: Program<Bubblegum>,
  metadata: any,
  version: Version,
  payer: Keypair,
  owner: PublicKey,
  delegate: PublicKey,
  merkleSlab: PublicKey,
  mintAuthority: Keypair,
): Promise<TransactionInstruction> {
  return bubblegum.instruction.mint(version, metadata, {
    accounts: {
      mintAuthority: mintAuthority.publicKey,
      authority: await getTreeAuthority(bubblegum, merkleSlab),
      nonce: await getNonceAccount(bubblegum),
      gummyrollProgram: GummyrollProgramId,
      owner,
      delegate,
      merkleSlab,
    },
    signers: [payer, mintAuthority],
  });
}

function createRemoveAppendAuthorityIx(
  bubblegum: Program<Bubblegum>,
  appendAuthority: Keypair,
  authorityToRemove: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return bubblegum.instruction.removeAppendAuthority(
    {
      accounts: {
        appendAuthority: appendAuthority.publicKey,
        authorityToRemove,
        authority,
      },
      signers: [appendAuthority]
    })
}

function createAddAppendAuthorityIx(
  bubblegum: Program<Bubblegum>,
  numAppends: BN,
  treeDelegate: Keypair,
  newAppendAuthority: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return bubblegum.instruction.addAppendAuthority(
    numAppends,
    {
      accounts: {
        treeDelegate: treeDelegate.publicKey,
        newAppendAuthority,
        authority,
      },
      signers: [treeDelegate]
    }
  );
}

describe("bubblegum", () => {
  // Configure the client to use the local cluster.
  let offChainTree: Tree;
  let treeAuthority: PublicKey;
  let merkleRollKeypair: Keypair;
  let nonceAccount: PublicKey;

  const MAX_SIZE = 64;
  const MAX_DEPTH = 20;

  let payer = Keypair.generate();
  let destination = Keypair.generate();
  let delegateKey = Keypair.generate();
  let connection = new web3Connection("http://localhost:8899", {
    commitment: "confirmed",
  });
  let wallet = new NodeWallet(payer);
  anchor.setProvider(
    new Provider(connection, wallet, {
      commitment: connection.commitment,
      skipPreflight: true,
    })
  );
  Bubblegum = anchor.workspace.Bubblegum as Program<Bubblegum>;
  GummyrollProgramId = anchor.workspace.Gummyroll.programId;

  async function createTreeOnChain(
    payer: Keypair,
    destination: Keypair,
    delegate: Keypair
  ): Promise<[Keypair, Tree, PublicKey, PublicKey]> {
    const merkleRollKeypair = Keypair.generate();

    await Bubblegum.provider.connection.confirmTransaction(
      await Bubblegum.provider.connection.requestAirdrop(payer.publicKey, 2e9),
      "confirmed"
    );
    await Bubblegum.provider.connection.confirmTransaction(
      await Bubblegum.provider.connection.requestAirdrop(
        destination.publicKey,
        2e9
      ),
      "confirmed"
    );
    await Bubblegum.provider.connection.confirmTransaction(
      await Bubblegum.provider.connection.requestAirdrop(
        delegate.publicKey,
        2e9
      ),
      "confirmed"
    );
    const requiredSpace = getMerkleRollAccountSize(MAX_DEPTH, MAX_SIZE);
    const leaves = Array(2 ** MAX_DEPTH).fill(Buffer.alloc(32));
    const tree = buildTree(leaves);

    const allocAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: merkleRollKeypair.publicKey,
      lamports:
        await Bubblegum.provider.connection.getMinimumBalanceForRentExemption(
          requiredSpace
        ),
      space: requiredSpace,
      programId: GummyrollProgramId,
    });

    const authority = await getTreeAuthority(Bubblegum, merkleRollKeypair.publicKey);

    const initGummyrollIx = Bubblegum.instruction.createTree(
      MAX_DEPTH,
      MAX_SIZE,
      {
        accounts: {
          treeCreator: payer.publicKey,
          authority: authority,
          gummyrollProgram: GummyrollProgramId,
          merkleSlab: merkleRollKeypair.publicKey,
          systemProgram: SystemProgram.programId
        },
        signers: [payer],
      }
    );

    let tx = new Transaction()
      .add(allocAccountIx)
      .add(initGummyrollIx);

    const nonce = await getNonceAccount(Bubblegum);
    try {
      const nonceAccount = await Bubblegum.provider.connection.getAccountInfo(
        nonce
      );
      if (nonceAccount.data.length === 0 || nonceAccount.lamports === 0) {
        throw new Error("Nonce account not yet initialized");
      }
    } catch {
      // Only initialize the nonce if it does not exist
      const initNonceIx = Bubblegum.instruction.initializeNonce({
        accounts: {
          nonce: nonce,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [payer],
      });
      tx = tx.add(initNonceIx);
    }

    await Bubblegum.provider.send(tx, [payer, merkleRollKeypair], {
      commitment: "confirmed",
    });

    await assertOnChainMerkleRollProperties(Bubblegum.provider.connection, MAX_DEPTH, MAX_SIZE, authority, new PublicKey(tree.root), merkleRollKeypair.publicKey);

    const treeAuthorityAccount = await Bubblegum.account.gummyrollTreeAuthority.fetch(authority);
    assert(
      (treeAuthorityAccount.treeId as PublicKey).toString() === merkleRollKeypair.publicKey.toString(),
      "Authority initialized treeId incorrectly"
    );
    assert(
      (treeAuthorityAccount.owner as PublicKey).toString() === payer.publicKey.toString(),
      "Authority initialized owner incorrectly"
    );
    assert(
      (treeAuthorityAccount.delegate as PublicKey).toString() === payer.publicKey.toString(),
      "Authority initialized delegate incorrectly"
    );
    assert(
      (treeAuthorityAccount.appendAllowlist[0].pubkey as PublicKey).toString() === payer.publicKey.toString(),
      "Authority initialized appendAllowlist incorrectly"
    );
    assert(
      (treeAuthorityAccount.appendAllowlist[0].numAppends as BN).toNumber() === 1 << MAX_DEPTH,
      "Authority initialized appendAllowlist incorrectly"
    );

    return [merkleRollKeypair, tree, authority, nonce];
  }

  describe("Testing bubblegum", () => {
    beforeEach(async () => {
      let [
        computedMerkleRoll,
        computedOffChainTree,
        computedTreeAuthority,
        computedNonce,
      ] = await createTreeOnChain(payer, destination, delegateKey);
      merkleRollKeypair = computedMerkleRoll;
      offChainTree = computedOffChainTree;
      treeAuthority = computedTreeAuthority;
      nonceAccount = computedNonce;
    });
    it("Mint to tree", async () => {
      const metadata = createExampleMetadata("test", "test", "www.solana.com");
      let version = { v0: {} };
      const mintIx = await createMintIx(Bubblegum, metadata, version, payer, payer.publicKey, payer.publicKey, merkleRollKeypair.publicKey, payer);
      console.log(" - Minting to tree");
      await execute(Bubblegum.provider, [mintIx], [payer], false);

      const leafHash = Buffer.from(keccak_256.digest(mintIx.data.slice(9)));
      const creatorHash = Buffer.from(keccak_256.digest([]));
      let merkleRollAccount =
        await Bubblegum.provider.connection.getAccountInfo(
          merkleRollKeypair.publicKey
        );
      let merkleRoll = decodeMerkleRoll(merkleRollAccount.data);
      let onChainRoot =
        merkleRoll.roll.changeLogs[merkleRoll.roll.activeIndex].root.toBuffer();

      console.log(" - Transferring Ownership");
      const nonceInfo = await (Bubblegum.provider.connection as web3Connection).getAccountInfo(nonceAccount);
      const leafNonce = (new BN(nonceInfo.data.slice(8, 24), "le")).sub(new BN(1));
      let transferIx = await Bubblegum.instruction.transfer(
        version,
        onChainRoot,
        leafHash,
        creatorHash,
        leafNonce,
        0,
        {
          accounts: {
            authority: treeAuthority,
            owner: payer.publicKey,
            delegate: payer.publicKey,
            newOwner: destination.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
          },
          signers: [payer],
        }
      );
      await execute(Bubblegum.provider, [transferIx], [payer], true);

      merkleRollAccount = await Bubblegum.provider.connection.getAccountInfo(
        merkleRollKeypair.publicKey
      );
      merkleRoll = decodeMerkleRoll(merkleRollAccount.data);
      onChainRoot =
        merkleRoll.roll.changeLogs[merkleRoll.roll.activeIndex].root.toBuffer();

      console.log(" - Delegating Ownership");
      let delegateTx = await Bubblegum.rpc.delegate(
        version,
        onChainRoot,
        leafHash,
        creatorHash,
        leafNonce,
        0,
        {
          accounts: {
            authority: treeAuthority,
            owner: destination.publicKey,
            previousDelegate: destination.publicKey,
            newDelegate: delegateKey.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
          },
          signers: [destination],
        }
      );

      merkleRollAccount = await Bubblegum.provider.connection.getAccountInfo(
        merkleRollKeypair.publicKey
      );
      merkleRoll = decodeMerkleRoll(merkleRollAccount.data);
      onChainRoot =
        merkleRoll.roll.changeLogs[merkleRoll.roll.activeIndex].root.toBuffer();

      console.log(" - Transferring Ownership (through delegate)");
      let delTransferIx = await Bubblegum.instruction.transfer(
        version,
        onChainRoot,
        leafHash,
        creatorHash,
        leafNonce,
        0,
        {
          accounts: {
            authority: treeAuthority,
            owner: destination.publicKey,
            delegate: delegateKey.publicKey,
            newOwner: payer.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
          },
          signers: [delegateKey],
        }
      );
      delTransferIx.keys[2].isSigner = true;
      await execute(Bubblegum.provider, [delTransferIx], [delegateKey], true)

      merkleRollAccount = await Bubblegum.provider.connection.getAccountInfo(
        merkleRollKeypair.publicKey
      );
      merkleRoll = decodeMerkleRoll(merkleRollAccount.data);
      onChainRoot =
        merkleRoll.roll.changeLogs[merkleRoll.roll.activeIndex].root.toBuffer();

      let [voucher] = await PublicKey.findProgramAddress(
        [merkleRollKeypair.publicKey.toBuffer(), leafNonce.toBuffer("le", 16)],
        Bubblegum.programId
      );

      console.log(" - Redeeming Leaf", voucher.toBase58());
      let redeemIx = await Bubblegum.instruction.redeem(
        version,
        onChainRoot,
        leafHash,
        creatorHash,
        leafNonce,
        0,
        {
          accounts: {
            authority: treeAuthority,
            owner: payer.publicKey,
            delegate: payer.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
            voucher: voucher,
            systemProgram: SystemProgram.programId,
          },
          signers: [payer],
        }
      );
      let redeemTx = await Bubblegum.provider.send(
        new Transaction().add(redeemIx),
        [payer],
        {
          commitment: "confirmed",
        }
      );
      console.log(" - Cancelling redeem (reinserting to tree)");
      let cancelRedeemIx = await Bubblegum.instruction.cancelRedeem(
        onChainRoot,
        {
          accounts: {
            authority: treeAuthority,
            owner: payer.publicKey,
            delegate: payer.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
            voucher: voucher,
          },
          signers: [payer],
        }
      );
      let cancelRedeemTx = await Bubblegum.provider.send(
        new Transaction().add(cancelRedeemIx),
        [payer],
        {
          commitment: "confirmed",
        }
      );

      console.log(" - Decompressing leaf");
      redeemIx = await Bubblegum.instruction.redeem(
        version,
        onChainRoot,
        leafHash,
        creatorHash,
        leafNonce,
        0,
        {
          accounts: {
            authority: treeAuthority,
            owner: payer.publicKey,
            delegate: payer.publicKey,
            gummyrollProgram: GummyrollProgramId,
            merkleSlab: merkleRollKeypair.publicKey,
            voucher: voucher,
            systemProgram: SystemProgram.programId,
          },
          signers: [payer],
        }
      );
      redeemTx = await Bubblegum.provider.send(
        new Transaction().add(redeemIx),
        [payer],
        {
          commitment: "confirmed",
        }
      );

      let voucherData = await Bubblegum.account.voucher.fetch(voucher);

      let tokenMint = Keypair.generate();
      let [mintAuthority] = await PublicKey.findProgramAddress(
        [tokenMint.publicKey.toBuffer()],
        Bubblegum.programId
      );

      const getMetadata = async (
        mint: anchor.web3.PublicKey
      ): Promise<anchor.web3.PublicKey> => {
        return (
          await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("metadata"), PROGRAM_ID.toBuffer(), mint.toBuffer()],
            PROGRAM_ID
          )
        )[0];
      };

      const getMasterEdition = async (
        mint: anchor.web3.PublicKey
      ): Promise<anchor.web3.PublicKey> => {
        return (
          await anchor.web3.PublicKey.findProgramAddress(
            [
              Buffer.from("metadata"),
              PROGRAM_ID.toBuffer(),
              mint.toBuffer(),
              Buffer.from("edition"),
            ],
            PROGRAM_ID
          )
        )[0];
      };

      let decompressIx = await Bubblegum.instruction.decompress(metadata, {
        accounts: {
          voucher: voucher,
          owner: payer.publicKey,
          tokenAccount: await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenMint.publicKey,
            payer.publicKey
          ),
          mint: tokenMint.publicKey,
          mintAuthority: mintAuthority,
          metadata: await getMetadata(tokenMint.publicKey),
          masterEdition: await getMasterEdition(tokenMint.publicKey),
          systemProgram: SystemProgram.programId,
          sysvarRent: SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        },
        signers: [payer],
      });

      decompressIx.keys[3].isSigner = true;
      let decompressTx = await Bubblegum.provider.send(
        new Transaction().add(decompressIx),
        [payer, tokenMint],
        {
          commitment: "confirmed",
        }
      );
    });
    it("Test that allowlist prevents mints", async () => {
      const removeAppendAuthorityIx = createRemoveAppendAuthorityIx(
        Bubblegum,
        payer,
        payer.publicKey,
        treeAuthority,
      );
      await execute(Bubblegum.provider, [removeAppendAuthorityIx], [payer], true);

      const metadata = createExampleMetadata("racecar", "test", "www.solana.com")
      let version = { v0: {} };
      const mintIx = await createMintIx(
        Bubblegum,
        metadata,
        version,
        payer,
        payer.publicKey,
        payer.publicKey,
        merkleRollKeypair.publicKey,
        payer,
      );
      try {
        await execute(Bubblegum.provider, [, mintIx], [payer], true, true);
        assert(false, "This transaction should have failed since the payer is no longer append authority");
      } catch (e) {
        assert(true, "Successfully prevented payer from minting");
      }
    });
    it("Concurrently append into tree", async () => {
      // Create 5 random keys, set them as append publickeys
      const ALLOWLIST_SIZE = 5;
      const authIxs = [];
      const appendIxs = [];
      const keypairs = [];
      const removeInitialAppendAuthorityIx = createRemoveAppendAuthorityIx(
        Bubblegum,
        payer,
        payer.publicKey,
        treeAuthority
      );
      await execute(Bubblegum.provider, [removeInitialAppendAuthorityIx], [payer]);

      for (let i = 0; i < ALLOWLIST_SIZE; i++) {
        const keypair = Keypair.generate();
        const setAppendAuthorityIx = createAddAppendAuthorityIx(
          Bubblegum,
          new BN(1),
          payer,
          keypair.publicKey,
          treeAuthority,
        );
        const metadata = createExampleMetadata(`${i}`, `${i}`, "www.solana.com");
        const version = { v0: {} }
        const mintIx = await createMintIx(
          Bubblegum,
          metadata,
          version,
          payer,
          payer.publicKey,
          payer.publicKey,
          merkleRollKeypair.publicKey,
          keypair,
        );
        keypairs.push(keypair);
        authIxs.push(setAppendAuthorityIx);
        appendIxs.push(mintIx);
      }

      // All appends should succeed
      const allIxs = [].concat(authIxs, appendIxs);
      const allKeypairs = [payer].concat(keypairs);
      await execute(Bubblegum.provider, allIxs, allKeypairs, true, true);

      const treeAuthorityAccount = await Bubblegum.account.gummyrollTreeAuthority.fetch(treeAuthority);
      console.log(treeAuthorityAccount);
      for (let i = 0; i < ALLOWLIST_SIZE; i++) {
        console.log(treeAuthorityAccount.appendAllowlist[i].numAppends);
        assert(
          (new BN(0)).eq(treeAuthorityAccount.appendAllowlist[i].numAppends),
          'Append allowlist was not decremented properly'
        );
      }
    });
  });
});
