"use strict";

import fs from "fs";
import { utils } from "@ckb-lumos/base";
const { ckbHash } = utils;
import { initializeConfig } from "@ckb-lumos/config-manager";
import { addressToScript, sealTransaction, TransactionSkeleton } from "@ckb-lumos/helpers";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, getLiveCell, indexerReady, readFileToHexString, readFileToHexStringSync, sendTransaction, signTransaction, waitForTransactionConfirmation } from "../lib/index.js";
import { ckbytesToShannons, hexToArrayBuffer, hexToInt, intToHex } from "../lib/util.js";
import { describeTransaction, initializeLab } from "../lumos_template/lab.js";
import { exit } from "process";

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const PRIVATE_KEY_1 = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const ADDRESS_1 = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvc32wruaxqnk4hdj8yr4yp5u056dkhwtc94sy8q";

// This is the TX fee amount that will be paid in Shannons.
const TX_FEE = 100_000n;

async function deployCode(indexer) {
	console.log("DEPLOY CODE\n");

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton();

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Create cells with data from the specified files.
	let outputCapacityTmp = 0n;
	const data_files = ["../files/sudt", "../files/ickb_domain_logic", "../files/ickb_limit_order"];
	for (const data_file_1 of data_files) {
		const { hexString: hexString1, dataSize: dataSize1 } = await readFileToHexString(data_file_1);
		const outputCapacity1 = ckbytesToShannons(61n) + ckbytesToShannons(dataSize1);
		outputCapacityTmp += outputCapacity1;
		const output1 = {
			cellOutput: {
				capacity: intToHex(outputCapacity1),
				lock: addressToScript(ADDRESS_1),
				type: null
			},
			data: hexString1
		};
		transaction = transaction.update("outputs", (i) => i.push(output1));
	}

	// Add input capacity cells.
	const collectedCells = await collectCapacity(indexer, addressToScript(ADDRESS_1), outputCapacityTmp + ckbytesToShannons(61n) + TX_FEE);
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

	// Return the out points
	const myclean = (x) => x.replace("../files/", "").toUpperCase();

	const outPoints = [
		{
			name: myclean(data_files[0]),
			txHash: txid,
			index: "0x0"
		},
		{
			name: myclean(data_files[1]),
			txHash: txid,
			index: "0x1"
		},
		{
			name: myclean(data_files[2]),
			txHash: txid,
			index: "0x2"
		}
	];

	return outPoints;
}

function listHashes2Config() {
	let content = '';
	process.stdin.resume();
	process.stdin.on('data', function (buf) { content += buf.toString(); });
	process.stdin.on('end', function () {
		const CONFIG = JSON.parse(content);
		////Elaborate this data..............
	});


}


async function main() {
	if (process.stdin.isTTY) {
		throw new Error(['Error: no list-hashes data detected in input stream.',
			'Use in the following way:',
			'(cd ~/ckb && ckb list-hashes --format json) | (cd 0_populate_config && node.index.js)',
		].join('\n'));
	}

	// Initialize the Lumos configuration using ./config.json.
	initializeConfig(listHashes2Config());

	// Initialize an Indexer instance.
	const indexer = new Indexer(INDEXER_URL, NODE_URL);

	// Initialize our lab.
	await initializeLab(NODE_URL, indexer);
	await indexerReady(indexer);


	// Create a cell that contains the binaries.

	const scriptOutPoints = await deployCode(indexer);
	await indexerReady(indexer);

	console.log("Execution completed successfully!");

	// Output the scriptOutPoints data.

	console.log("Replace in config.json and lab.js in lumos_template the following values.\n");

	for (const scriptOutPoint of scriptOutPoints) {
		console.log(`At ${scriptOutPoint.name} replace with the followings:`);
		console.log(`"TX_HASH": "${scriptOutPoint.txHash}",`);
		console.log(`"INDEX": "${scriptOutPoint.index}",`);
		console.log();
	}
}
main();
