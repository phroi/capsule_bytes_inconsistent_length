"use strict";

import fs from "fs";
import util from "util";
import {blockchain, utils, values} from "@ckb-lumos/base";
import {bytes} from "@ckb-lumos/codec"
import {CellCollector} from "@ckb-lumos/ckb-indexer";
import {RPC} from "@ckb-lumos/lumos";
const {computeScriptHash} = utils;
import {secp256k1Blake160} from "@ckb-lumos/common-scripts";
import {locateCellDep, sealTransaction} from "@ckb-lumos/helpers";
const {ScriptValue} = values;
import {Reader} from "ckb-js-toolkit";
import secp256k1 from "secp256k1";
import {ckbytesToShannons, formattedNumber, getRandomInt, hexToInt, intToHex, shannonsToCkbytes} from "./util.js";

export const DEFAULT_LOCK_HASH = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";
export const MULTISIG_LOCK_HASH = "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8";
export const SECP_SIGNATURE_PLACEHOLDER_DEFAULT = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export function addDefaultCellDeps(transaction)
{
	return transaction.update("cellDeps", (cellDeps)=>cellDeps.push(locateCellDep({codeHash: DEFAULT_LOCK_HASH, hashType: "type"})));
}

/**
 * Adds witness placeholders to the transaction for the default lock.
 * 
 * This function adds zero-filled placeholders for all cells using the default
 * lock and empty placeholders for all other cells. If a cell is not using
 * the default lock, the placeholder may need to be altered after this function
 * is run. This function can only be used on an empty witnesses structure.
 * 
 * @param {Object} transaction An instance of a Lumos `TransactionSkelton`.
 * 
 * @return {Object} An instance of the transaction skeleton with the placeholders added.
 */
export function addDefaultWitnessPlaceholders(transaction)
{
	if(transaction.witnesses.size !== 0)
		throw new Error("This function can only be used on an empty witnesses structure.");

	// Cycle through all inputs adding placeholders for unique locks, and empty witnesses in all other places.
	let uniqueLocks = new Set();
	for(const input of transaction.inputs)
	{
		let witness = "0x";

		const lockHash = computeScriptHash(input.cellOutput.lock);
		if(!uniqueLocks.has(lockHash))
		{
			uniqueLocks.add(lockHash);

			if(input.cellOutput.lock.hashType === "type" && input.cellOutput.lock.codeHash === DEFAULT_LOCK_HASH)
				witness = SECP_SIGNATURE_PLACEHOLDER_DEFAULT;
		}

		witness = bytes.hexify(blockchain.WitnessArgs.pack({lock: witness}));
		transaction = transaction.update("witnesses", (w)=>w.push(witness));
	}

	return transaction;
}

function checkTxFee(transaction)
{
	const tx = transaction.toJS();

	let capacityInputs = 0n;
	let capacityOutputs = 0n;

	for(let input of tx.inputs)
		capacityInputs += BigInt(input.cellOutput.capacity);	

	for(let output of tx.outputs)
		capacityOutputs += BigInt(output.cellOutput.capacity);

	if(capacityInputs - capacityOutputs > ckbytesToShannons(1))
		throw new Error(`Transaction fee too high: ${formattedNumber(shannonsToCkbytes(capacityInputs - capacityOutputs))} CKBytes. A normal transaction fee is < 1 CKByte.`);
}

/**
 * Collects Cells for use as capacity from the specified lock script.
 * 
 * This will search for Cells with at least capacityRequired. If there is insufficient capacity available an error will be thrown.
 * 
 * @example
 * const {inputCells, inputCapacity} = await collectCapacity(indexer, addressToScript("ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga"), ckbytesToShannons(100n));
 * 
 * @param {Object} indexer An instance of a running Lumos Indexer.
 * @param {Object} lockScript A script used to query the CellCollector to find Cells to use as capacity.
 * @param {BigInt} capacityRequired The number of CKBytes needed.
 * 
 * @returns {Object} An object with the inputCells[] found and the inputCapacity contained within the provided Cells.  
 */
export async function collectCapacity(indexer, lockScript, capacityRequired)
{
	const query = {lock: lockScript, type: "empty"};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells = [];
	let inputCapacity = 0n;

	for await (const cell of cellCollector.collect())
	{
		inputCells.push(cell);
		inputCapacity += hexToInt(cell.cellOutput.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Unable to collect enough cells to fulfill the capacity requirements.");

	return {inputCells, inputCapacity};
}

/**
 * Collects Cells for use as capacity from the specified lock script.
 * 
 * This will search for Cells with at least capacityRequired. If there is insufficient capacity available an error will be thrown.
 * 
 * @example
 * const {inputCells, inputCapacity} = await collectCapacity(indexer, addressToScript("ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqwgx292hnvmn68xf779vmzrshpmm6epn4c0cgwga"), ckbytesToShannons(100n));
 * 
 * @param {Object} indexer An instance of a running Lumos Indexer.
 * @param {Object} lockScript A lock script used to query the CellCollector to find Cells to use as capacity.
 * @param {Object} typeScript A type script used to query the CellCollector to find Cells to use as capacity.
 * @param {BigInt} capacityRequired The number of CKBytes needed.
 * 
 * @returns {Object} An object with the inputCells[] found and the inputCapacity contained within the provided Cells.  
 */
async function collectCapacityWithType(indexer, lockScript, typeScript, capacityRequired)
{
	const query = {lock: lockScript, type: typeScript};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells = [];
	let inputCapacity = 0n;

	for await (const cell of cellCollector.collect())
	{
		inputCells.push(cell);
		inputCapacity += hexToInt(cell.cellOutput.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Unable to collect enough cells to fulfill the capacity requirements.");

	return {inputCells, inputCapacity};
}

export function describeTransaction(transaction, options)
{
	const defaults =
	{
		showCellDeps: true,
		showInputs: true,
		showInputCapacity: true,
		showInputData: false,
		showInputLock: true,
		showInputType: true,
		showInputOutPoint: true,
		showOutputs: true,
		showOutputCapacity: true,
		showOutputData: false,
		showOutputLock: true,
		showOutputType: true,
		showWitnesses: true,
		showTxFee: true
	};

	options = {...defaults, ...options};

	let obj =
	{
		deps: [],
		inputs: [],
		outputs: [],
		witnesses: []
	};

	for(const dep of transaction.cellDeps)
	{
		let cell =
		{
			depType: dep.depType,
			outPoint: dep.outPoint.txHash + "-" + dep.outPoint.index
		};
		obj.deps.push(cell);
	}

	for(const input of transaction.inputs)
	{
		let cell =
		{
			capacity: formattedNumber(hexToInt(input.cellOutput.capacity)) + " Shannons",
			capacityCkbytes: formattedNumber((Number(hexToInt(input.cellOutput.capacity)) / 100_000_000), 4) + " CKBytes",
			lock: new ScriptValue(input.cellOutput.lock).hash(),
			type: (!!input.cellOutput.type) ? new ScriptValue(input.cellOutput.type).hash() : null,
			outPoint: input.outPoint.txHash + "-" + input.outPoint.index,
			data: input.data
		};
		obj.inputs.push(cell);
	}

	for(const output of transaction.outputs)
	{
		let cell =
		{
			capacity: formattedNumber(hexToInt(output.cellOutput.capacity)) + " Shannons",
			capacityCkbytes: formattedNumber((Number(hexToInt(output.cellOutput.capacity)) / 100_000_000), 4) + " CKBytes",
			lock: new ScriptValue(output.cellOutput.lock).hash(),
			type: (!!output.cellOutput.type) ? new ScriptValue(output.cellOutput.type).hash() : null,
			data: output.data
		};
		obj.outputs.push(cell);
	}

	obj.witnesses = transaction.witnesses;

	if(options.showCellDeps)
	{
		console.log("Cell Deps:");
		for(const dep of obj.deps)
		{
			console.log("  - depType: " + dep.depType);
			console.log("    outPoint: " + dep.outPoint);
		}
	}

	if(options.showInputs)
	{
		console.log("Inputs:");
		for(const input of obj.inputs)
		{
			if(options.showInputCapacity)
				console.log("  - capacity: " + input.capacity + ` (${input.capacityCkbytes})`);
			if(options.showInputLock)
				console.log("    lock: " + input.lock);
			if(options.showInputType)
				console.log("    type: " + input.type);
			if(options.showInputOutPoint)
				console.log("    outPoint: " + input.outPoint);
			if(options.showInputData)
			{
				const data = (input.data.length > 66) ? input.data.substr(0, 33) + "..." + input.data.substr(input.data.length - 30) : input.data;
				const dataBytes = (data.length > 2) ? (input.data.length-2)/2 : 0;
				console.log(`    data: ${data} (${formattedNumber(dataBytes)} Bytes)`);
			}
		}
	}

	if(options.showOutputs)
	{
		console.log("Outputs:");
		for(const output of obj.outputs)
		{
			if(options.showOutputCapacity)
				console.log("  - capacity: " + output.capacity + ` (${output.capacityCkbytes})`);
			if(options.showOutputLock)
				console.log("    lock: " + output.lock);
			if(options.showOutputType)
				console.log("    type: " + output.type);
			if(options.showOutputData)
			{
				const data = (output.data.length > 66) ? output.data.substr(0, 33) + "..." + output.data.substr(output.data.length - 30) : output.data;
				const dataBytes = (data.length > 2) ? (output.data.length-2)/2 : 0;
				console.log(`    data: ${data} (${formattedNumber(dataBytes)} Bytes)`);
			}
		}
	}

	if(options.showWitnesses)
	{
		console.log("Witnesses:");
		for(const witness of obj.witnesses)
		{
			console.log("  - " + witness);
		}
	}

	if(options.showTxFee)
	{
		const inputCapacity = transaction.inputs.reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
		const outputCapacity = transaction.outputs.reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), 0n);
	
		console.log(`TX Fee: ${formattedNumber(inputCapacity - outputCapacity)} Shannons`)
	}

	console.log();
}

export async function getLiveCell(NODE_URL, outPoint, returnData = false)
{
	const rpc = new RPC(NODE_URL);
	const res = await rpc.getLiveCell({txHash: outPoint.txHash, index: outPoint.index}, returnData);

	if(res.status === "dead")
		throw new Error(`Dead cell found at out point: ${outPoint.txHash}-${outPoint.index}`);

	if(res.status !== "live")
		throw new Error(`Live cell not found at out point: ${outPoint.txHash}-${outPoint.index}`);

	const cell =
	{
		cellOutput:
		{
			capacity: res.cell.output.capacity,
			lock: {codeHash: res.cell.output.lock.codeHash, hashType: res.cell.output.lock.hashType, args: res.cell.output.lock.args},
			type: (!res.cell.output.type) ? undefined : {codeHash: res.cell.output.type.codeHash, hashType: res.cell.output.type.hashType, args: res.cell.output.type.args}
		},
		outPoint:
		{
			txHash: outPoint.txHash,
			index: outPoint.index
		},
		data: (returnData) ? res.cell.data.content : "0x"
	}

	return cell;
}

export async function indexerReady(indexer, updateProgress=((_indexerTip, _rpcTip)=>{}), options)
{
	const defaults = {blockDifference: 0, timeoutMs: 300_000, recheckMs: 250};
	options = {...defaults, ...options};

	return new Promise(async (resolve, reject) =>
	{
		let timedOut = false;
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(indexer.uri);

		let indexerFailureCount = 0;
		let rpcFailureCount = 0;

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			const indexerTipObj = await indexer.tip();
			if(!indexerTipObj)
			{
				if(++indexerFailureCount >= 5)
					return reject(Error("Indexer gave an unexpected response."));

				await new Promise((resolve)=>setTimeout(resolve, 200));
				continue;
			}
			
			const rpcResponse = await rpc.getTipBlockNumber();
			if(!rpcResponse)
			{
				if(++rpcFailureCount >= 5)
					return reject(Error("RPC gave an unexpected response."));

				await new Promise((resolve)=>setTimeout(resolve, 200));
				continue;
			}
	
			const indexerTip = BigInt(indexerTipObj.blockNumber);
			const rpcTip = BigInt(rpcResponse);

			if(indexerTip >= (rpcTip - BigInt(options.blockDifference)))
			{
				if(timeoutTimer)
					clearTimeout(timeoutTimer);

				break;
			}

			updateProgress(indexerTip, rpcTip);

			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

async function readFile(filename)
{	
	const readFile = util.promisify(fs.readFile);

	return await readFile(filename);
}

function readFileSync(filename)
{	
	return fs.readFileSync(filename);
}

export async function readFileToHexString(filename)
{
	const data = await readFile(filename);
	const dataSize = data.length;
	const hexString = "0x" + data.toString("hex");

	return {hexString, dataSize};
}

export function readFileToHexStringSync(filename)
{
	const data = readFileSync(filename);
	const dataSize = data.length;
	const hexString = "0x" + data.toString("hex");

	return {hexString, dataSize};
}

export async function sendTransaction(NODE_URL, signedTx)
{
	const rpc = new RPC(NODE_URL);

	let result;
	try
	{
		result = await rpc.sendTransaction(signedTx);
	}
	catch(error)
	{
		const regex = /^(\w+): ([\w\s]+) (\{.*\})$/;
		const matches = error.message.match(regex);

		if(!!matches && matches.length > 0)
		{
			const category = matches[1];
			const type = matches[2];
			const json = JSON.parse(matches[3]);

			console.log();
			console.error(`Error: ${category}`);
			console.error(`Type: ${type}`);
			console.error(`Code: ${json.code}`);
			console.error(`Message: ${json.message}`);
			console.error(`Data: ${json.data}`);
			console.log();

			throw new Error("RPC Returned Error!");
		}
		else
			throw error;
	}
	
	return result;
}

/**
 * Creates a signature for the provided message with the provided private key using the Secp256k1 algorithm. 
 * 
 * @param {String} PRIVATE_KEY A 256-bit Secp256k1 private key represented as a hex string.
 * @param {String} message A message to sign represented as a hex string.
 * 
 * @return {String} A 65 byte Secp256k1 signature represented as a hex string.
 */
export function signMessage(PRIVATE_KEY, message)
{
	const messageArray = new Uint8Array(new Reader(message).toArrayBuffer());
	const pkArray = new Uint8Array(new Reader(PRIVATE_KEY).toArrayBuffer());
	const {signature, recid} = secp256k1.ecdsaSign(messageArray, pkArray);
	const array = new Uint8Array(65);
	array.set(signature, 0);
	array.set([recid], 64);

	return new Reader(array.buffer).serializeJson();
}

/**
 * Sign a transaction that uses the default lock and requires a single signature.
 * 
 * @param {Object} transaction An instance of a Lumos transaction skeleton.
 * @param {String} PRIVATE_KEY A 256-bit Secp256k1 private key represented as a hex string.
 * 
 * @return {Object} An instance of a Lumos transaction that has been sealed.
 */
export function signTransaction(transaction, PRIVATE_KEY)
{
	transaction = secp256k1Blake160.prepareSigningEntries(transaction);
	const signingEntries = transaction.get("signingEntries").toArray();
	const signature = signMessage(PRIVATE_KEY, signingEntries[0].message);
	const tx = sealTransaction(transaction, [signature]);

	return tx;
}

export async function waitForConfirmation(NODE_URL, txid, updateProgress=((_status)=>{}), options)
{
	const defaults = {timeoutMs: 300_000, recheckMs: 250, throwOnNotFound: true};
	options = {...defaults, ...options};

	return new Promise(async (resolve, reject) =>
	{
		let timedOut = false;
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(NODE_URL);

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			const transaction = await rpc.getTransaction(txid);

			if(!!transaction)
			{
				const status = transaction.txStatus.status;

				updateProgress(status);

				if(status === "committed")
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}
			}
			else if(transaction === null)
			{
				if(options.throwOnNotFound)
					return reject(Error("Transaction was not found."));
				else
					updateProgress("not_found");
			}
			
			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

/*
async function waitForNextBlock(NODE_URL, blocks=1n, updateProgress=((_startTip, _tip)=>{}), options)
{
	const defaults = {timeoutMs: 300_000, recheckMs: 500};
	options = {...defaults, ...options};

	return new Promise(async (resolve, reject) =>
	{
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;
		const rpc = new RPC(NODE_URL);
		
		blocks = BigInt(blocks);
		let timedOut = false;
		let startTip = 0n;

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			let tip = await rpc.getTipBlockNumber();

			if(!!tip)
			{
				tip = BigInt(tip);

				if(startTip === 0n)
					startTip = tip;

				updateProgress(startTip, tip);

				if(tip >= startTip + blocks)
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}
			}
			else
				return reject(Error("RPC gave an unexpected response."));

			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}
*/

export async function waitForTransactionConfirmation(NODE_URL, txid)
{
	process.stdout.write("Waiting for transaction to confirm.");
	await waitForConfirmation(NODE_URL, txid, (_status)=>process.stdout.write("."), {recheckMs: 1_000});
}

export default {
	addDefaultCellDeps,
	addDefaultWitnessPlaceholders,
	checkTxFee,
	collectCapacity,
	collectCapacityWithType,
	DEFAULT_LOCK_HASH,
	describeTransaction,
	getLiveCell,
	indexerReady,
	MULTISIG_LOCK_HASH,
	readFile,
	readFileSync,
	readFileToHexString,
	readFileToHexStringSync,
	SECP_SIGNATURE_PLACEHOLDER_DEFAULT,
	sendTransaction,
	signMessage,
	signTransaction,
	waitForConfirmation,
	waitForTransactionConfirmation,
	// waitForNextBlock
};
