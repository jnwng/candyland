import { Keypair, PublicKey } from "@solana/web3.js";
import { Connection, Context, Logs } from "@solana/web3.js";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "../bubblegum/src/generated";
import { PROGRAM_ID as GUMMYROLL_PROGRAM_ID } from "../gummyroll/index";
import * as anchor from "@project-serum/anchor";
import { Bubblegum } from "../../target/types/bubblegum";
import { Gummyroll } from "../../target/types/gummyroll";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { loadProgram, handleLogs, ParserState } from "./indexer/utils";
import { bootstrap, hash, NFTDatabaseConnection } from "./db";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";

const localhostUrl = "http://127.0.0.1:8899";
let Bubblegum: anchor.Program<Bubblegum>;
let Gummyroll: anchor.Program<Gummyroll>;

async function runSnapshot() {
  // TODO
}

async function validateTreeAndUpdateSnapshot(
  nftDb: NFTDatabaseConnection,
  depth: number,
  treeId: string
) {
  let tree = new Map<number, [number, string]>();
  let maxSeq = 0;
  for (const row of await nftDb.getTree(treeId)) {
    tree.set(row.node_idx, [row.seq, row.hash]);
    maxSeq = Math.max(row.seq, maxSeq);
  }
  let i = 1;
  while (i < 1 << depth) {
    if (!tree.has(i)) {
      // Just trust, bro
      i = 1 << (Math.floor(Math.log2(i)) + 1);
      continue;
    }
    let expected = tree.get(i)[1];
    let left, right;
    if (tree.has(2 * i)) {
      left = bs58.decode(tree.get(2 * i)[1]);
    } else {
      left = nftDb.emptyNode(depth - Math.floor(Math.log2(2 * i)));
    }
    if (tree.has(2 * i + 1)) {
      right = bs58.decode(tree.get(2 * i + 1)[1]);
    } else {
      right = nftDb.emptyNode(depth - Math.floor(Math.log2(2 * i)));
    }
    let actual = bs58.encode(hash(left, right));
    if (expected !== actual) {
      console.log(
        `Node mismatch ${i}, expected: ${expected}, actual: ${actual}, left: ${bs58.encode(
          left
        )}, right: ${bs58.encode(right)}`
      );
      return false;
    }
    ++i;
  }
  await runSnapshot();
  return true;
  //   nftDb.updateSnapshot
}

function chunks(array, size) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size)
  );
}

async function plugGapsFromSlot(
  connection: Connection,
  nftDb: NFTDatabaseConnection,
  parserState: ParserState,
  treeKey: PublicKey,
  slot: number,
  startSeq: number,
  endSeq: number
) {
  const blockData = await connection.getBlock(slot, {
    commitment: "confirmed",
  });
  for (const tx of blockData.transactions) {
    if (
      tx.transaction.message
        .programIds()
        .every((pk) => !pk.equals(parserState.Bubblegum.programId))
    ) {
      continue;
    }
    if (tx.transaction.message.accountKeys.every((pk) => !pk.equals(treeKey))) {
      continue;
    }
    if (tx.meta.err) {
      continue;
    }
    await handleLogs(
      nftDb,
      {
        err: null,
        logs: tx.meta.logMessages,
        signature: tx.transaction.signatures[0],
      },
      { slot: slot },
      parserState,
      startSeq,
      endSeq
    );
  }
}

async function plugGaps(
  connection: Connection,
  nftDb: NFTDatabaseConnection,
  parserState: ParserState,
  treeId: string,
  startSlot: number,
  endSlot: number,
  startSeq: number,
  endSeq: number
) {
  const treeKey = new PublicKey(treeId);
  for (let slot = startSlot; slot <= endSlot; ++slot) {
    await plugGapsFromSlot(
      connection,
      nftDb,
      parserState,
      treeKey,
      slot,
      startSeq,
      endSeq
    );
  }
}

async function fetchAndPlugGaps(
  connection: Connection,
  nftDb: NFTDatabaseConnection,
  minSeq: number,
  treeId: string,
  parserState: ParserState
) {
  let missingData = await nftDb.getMissingData(minSeq, treeId);
  let backfillJobs = [];
  for (const { prevSeq, currSeq, prevSlot, currSlot } of missingData) {
    backfillJobs.push(
      plugGaps(
        connection,
        nftDb,
        parserState,
        treeId,
        prevSlot,
        currSlot,
        prevSeq,
        currSeq
      )
    );
  }
  if (backfillJobs.length > 0) {
    await Promise.all(backfillJobs);
  }
}

async function main() {
  const endpoint = localhostUrl;
  const connection = new Connection(endpoint, "confirmed");
  const payer = Keypair.generate();
  const provider = new anchor.Provider(connection, new NodeWallet(payer), {
    commitment: "confirmed",
  });
  let nftDb = await bootstrap(false);
  Gummyroll = loadProgram(
    provider,
    GUMMYROLL_PROGRAM_ID,
    "target/idl/gummyroll.json"
  ) as anchor.Program<Gummyroll>;
  Bubblegum = loadProgram(
    provider,
    BUBBLEGUM_PROGRAM_ID,
    "target/idl/bubblegum.json"
  ) as anchor.Program<Bubblegum>;
  while (true) {
    for (const [treeId, depth] of await nftDb.getTrees()) {
      try {
        await fetchAndPlugGaps(connection, nftDb, 0, treeId, {
          Gummyroll,
          Bubblegum,
        });
        console.log(
          `Off-chain tree ${treeId} is consistent: ${await validateTreeAndUpdateSnapshot(
            nftDb,
            depth,
            treeId
          )}`
        );
      } catch {
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main();
