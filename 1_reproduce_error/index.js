"use strict";

import fs from "fs";
import { utils } from "@ckb-lumos/base";
const { ckbHash } = utils;
import { initializeConfig } from "@ckb-lumos/config-manager";
import { addressToScript, sealTransaction, TransactionSkeleton } from "@ckb-lumos/helpers";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation } from "../lib/index.js";
import { ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex } from "../lib/util.js";
import { describeTransaction, initializeLab } from "./lab.js";
const CONFIG = JSON.parse(fs.readFileSync("../config.json"));

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the always success RISC-V binary.
// const DATA_FILE_1 = "../files/always_success";
const DATA_FILE_1 = "../files/len_error_script";
const DATA_FILE_HASH_1 = ckbHash(hexToArrayBuffer(readFileToHexStringSync(DATA_FILE_1).hexString)); // Blake2b hash of the always success binary.
const DATA_FILE_HASH_TYPE_1 = "data1";
const IS_DATA_FILE_TYPE_1 = false;


// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function deployCode(indexer) {
	console.log("DEPLOY CODE\n");

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create a cell with data from the specified file.
	const { hexString: hexString1, dataSize: dataSize1 } = await readFileToHexString(DATA_FILE_1);
	const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
	const output1 = {
		cellOutput: {
			capacity: intToHex(outputCapacity1),
			lock: addressToScript(ADDRESS_1),
			type: null
		},
		data: hexString1
	};
	transaction = transaction.update("outputs", (i) => i.push(output1));

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacity1 + ckbytesToShannons(61n) + TX_FEE);
	transaction = transaction.update("inputs", (i) => i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);
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

	// Return the out point for the always success binary so it can be used in the next transaction.
	const outPoint =
	{
		txHash: txid,
		index: "0x0"
	};

	return outPoint;
}

async function createCells(indexer, scriptOutPoint) {
	console.log("CREATE CELLS\n");

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = { depType: "code", outPoint: scriptOutPoint };
	transaction = transaction.update("cellDeps", (cellDeps) => cellDeps.push(cellDep));

	// Create a cell using the always success lock.
	const outputCapacity1 = ckbytesToShannons(94n);
	let lockScript1 =
	{
		codeHash: DATA_FILE_HASH_1,
		hashType: "data1",
		args: "0x"
	};
	let typeScript1 = null;
	if (IS_DATA_FILE_TYPE_1) {
		lockScript1 = addressToScript(ADDRESS_1);
		typeScript1 =
		{
			codeHash: DATA_FILE_HASH_1,
			hashType: DATA_FILE_HASH_TYPE_1,
			args: "0x"
		};
	}

	const output1 = { cellOutput: { capacity: intToHex(outputCapacity1), lock: lockScript1, type: typeScript1 }, data: "0x" };
	transaction = transaction.update("outputs", (i) => i.push(output1));

	// Add input capacity cells.
	const capacityRequired = outputCapacity1 + ckbytesToShannons(61n) + TX_FEE;
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), capacityRequired);
	transaction = transaction.update("inputs", (i) => i.concat(collectedCells.inputCells));

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);
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

async function consumeCells(indexer, scriptOutPoint, cellOutPoints) {
	console.log("CONSUME CELLS\n");

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);
	const cellDep = { depType: "code", outPoint: scriptOutPoint };
	transaction = transaction.update("cellDeps", (cellDeps) => cellDeps.push(cellDep));

	// Add the always success cells to the transaction.
	for (const outPoint of cellOutPoints) {
		const input = await getLiveCell(NODE_URL, outPoint);
		transaction = transaction.update("inputs", (i) => i.push(input));
	}

	// Determine the capacity of all input cells.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c) => a + hexToInt(c.cellOutput.capacity), 0n);
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
	const signedTx = IS_DATA_FILE_TYPE_1 ? signTransaction(transaction, PRIVATE_KEY_1) : sealTransaction(transaction, []);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(NODE_URL, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(NODE_URL, txid);
	console.log("\n");
}

async function main() {
	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(CONFIG);

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);

	// Create a cell that contains the always success binary.
	const scriptOutPoint = await deployCode(indexer);
	await indexerReady(indexer);

	// Create a cell that uses the always success binary as a lock script.
	const alwaysSuccessCellOutPoint = await createCells(indexer, scriptOutPoint);
	await indexerReady(indexer);

	// Consume the cell using the always success lock script.
	await consumeCells(indexer, scriptOutPoint, alwaysSuccessCellOutPoint);
	await indexerReady(indexer);

	console.log("Execution completed successfully!");
}
main();
