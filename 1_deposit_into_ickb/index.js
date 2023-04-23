"use strict";

import fs from "fs";
import { utils } from "@ckb-lumos/base";
const { ckbHash } = utils;
import { initializeConfig } from "@ckb-lumos/config-manager";
import { addressToScript, sealTransaction, TransactionSkeleton } from "@ckb-lumos/helpers";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation } from "../lib/index.js";
import { ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex, intToU64LeHexBytes } from "../lib/util.js";
import { describeTransaction, initializeLab } from "../lumos_template/lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));
const DAO = CONFIG.SCRIPTS.DAO;
const ICKB_DOMAIN_LOGIC = CONFIG.SCRIPTS.ICKB_DOMAIN_LOGIC;

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function depositPhaseOne(indexer) {
	console.log("DEPOSIT PHASE ONE\n");

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell deps.
	transaction = addDefaultCellDeps(transaction);
	for (const s of [DAO, ICKB_DOMAIN_LOGIC]) {
		const cellDep = { depType: s.DEP_TYPE, outPoint: { txHash: s.TX_HASH, index: s.INDEX }, };
		transaction = transaction.update("cellDeps", (cellDeps) => cellDeps.push(cellDep));
	}

	// Create three deposits of 1234 CKB + occupied capacity.
	const deposit = {
		cellOutput: {
			capacity: intToHex(ckbytesToShannons(1234n + 82n)),
			lock: {
				codeHash: ICKB_DOMAIN_LOGIC.CODE_HASH,
				hashType: ICKB_DOMAIN_LOGIC.HASH_TYPE,
				args: "0x"
			},
			type: {
				codeHash: DAO.CODE_HASH,
				hashType: DAO.HASH_TYPE,
				args: "0x"
			}
		},
		data: intToU64LeHexBytes(0n)
	};

	for (const _ of Array(3).keys()) {
		transaction = transaction.update("outputs", (i) => i.push(deposit));
	}

	// Create a receipt cell for three deposits of 1234 CKB + occupied capacity.
	const receipt = {
		cellOutput: {
			capacity: intToHex(ckbytesToShannons(102n)),
			lock: addressToScript(ADDRESS_1),
			type: {
				codeHash: ICKB_DOMAIN_LOGIC.CODE_HASH,
				hashType: ICKB_DOMAIN_LOGIC.HASH_TYPE,
				args: "0x"
			}
		},
		// Three deposits of 1234 CKB + occupied capacity.
		data: intToU64LeHexBytes(3n * 2n ^ (6n * 8n) + 1234n)
	};
	transaction = transaction.update("outputs", (i) => i.push(receipt));

	// Add input capacity cells.
	let inputCapacity = transaction.inputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);
	const capacityRequired = inputCapacity + ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i) => i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	inputCapacity = transaction.inputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const changeCapacity = intToHex(inputCapacity - outputCapacity - TX_FEE);
	let change = { cellOutput: { capacity: changeCapacity, lock: addressToScript(ADDRESS_1), type: null }, data: "0x" };
	transaction = transaction.update("outputs", (i) => i.push(change));

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Sign the transaction.
	const signedTx = signTransaction(transaction, PRIVATE_KEY_1);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");

	// Return the out points for the cells locked with the always success lock so it can be used in the next transaction.
	const outPoints =
		[
			{ txHash: txid, index: "0x0" },
		];

	return outPoints;
}

async function main() {
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a cell that uses the always success binary as a lock script.
	const cellOutPoint = await depositPhaseOne(indexer);
	await indexerReady(indexer);

	// Consume the cell using the always success lock script.
	// await depositPhaseTwo(indexer, scriptOutPoint, cellOutPoint);
	// await indexerReady(indexer);

	console.log("Execution completed successfully!");
}
main();
