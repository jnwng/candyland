import { Provider } from "@project-serum/anchor";
import { TransactionInstruction, Transaction, Signer } from "@solana/web3.js";

/// Confirms and logs transaction
export async function logTx(provider: Provider, txId: string, verbose: boolean = true) {
  await provider.connection.confirmTransaction(txId, "confirmed");
  if (verbose) {
    console.log(
      (await provider.connection.getConfirmedTransaction(txId, "confirmed")).meta
        .logMessages
    );
  }
};

/// Confirms, logs, and throws if transaction has an error
export async function execute(
  provider: Provider,
  instructions: TransactionInstruction[],
  signers: Signer[],
  skipPreflight: boolean = false,
  verbose: boolean = false,
): Promise<String> {
  let tx = new Transaction();
  instructions.map((ix) => { tx = tx.add(ix) });
  const txid = await provider.connection.sendTransaction(tx, signers, {
    skipPreflight,
  });
  await provider.connection.confirmTransaction(txid, "confirmed");
  const confirmedTx = await provider.connection.getConfirmedTransaction(txid, "confirmed");
  if (verbose || confirmedTx.meta.err) {
    console.log(
      confirmedTx.meta
        .logMessages
    );
  }
  if (confirmedTx.meta.err) {
    throw new Error(confirmedTx.meta.err.toString());
  }
  return txid;
}
export function num32ToBuffer(num: number) {
  const isU32 = (num >= 0 && num < Math.pow(2,32));
  const isI32 = (num >= -1*Math.pow(2, 31) && num < Math.pow(2,31))
  if (!isU32 || !isI32) {
    throw new Error("Attempted to convert non 32 bit integer to byte array")
  }
  var byte1 = 0xff & num;
  var byte2 = 0xff & (num >> 8);
  var byte3 = 0xff & (num >> 16);
  var byte4 = 0xff & (num >> 24);
  return Buffer.from([byte1, byte2, byte3, byte4])
}

