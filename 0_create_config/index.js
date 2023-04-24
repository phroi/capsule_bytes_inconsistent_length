"use strict";

import fs from "fs";
import { intToHex } from "../lib/util.js";

// CKB Node and CKB Indexer Node JSON RPC URLs.
const NODE_URL = "http://127.0.0.1:8114/";
const INDEXER_URL = "http://127.0.0.1:8114/";

async function readStdinAsync() {
	return new Promise((resolve, reject) => {
		let content = '';
		process.stdin.on('data', (buf) => { content += buf.toString(); });
		process.stdin.on('end', () => { resolve(content) });
		process.stdin.on('error', (err) => reject(err));
		process.stdin.resume();
	});
}

async function main() {
	if (process.stdin.isTTY) {
		throw new Error(['Error: no list-hashes data detected in input stream.',
			'The correct use is the following:',
			'(cd ~/ckb && ckb list-hashes --format json) | (cd 0_deploy_scripts && node index.js)\n',
		].join('\n'));
	}

	const listHashes = JSON.parse(await readStdinAsync());

	const config = {
		"PREFIX": "ckt",
		"SCRIPTS": {
			"SECP256K1_BLAKE160": {
				"CODE_HASH": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
				"HASH_TYPE": "type",
				"TX_HASH": "0x0000000000000000000000000000000000000000000000000000000000000000",
				"INDEX": "0x0",
				"DEP_TYPE": "depGroup",
				"SHORT_ID": 0
			},
			"SECP256K1_BLAKE160_MULTISIG": {
				"CODE_HASH": "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
				"HASH_TYPE": "type",
				"TX_HASH": "0x0000000000000000000000000000000000000000000000000000000000000000",
				"INDEX": "0x1",
				"DEP_TYPE": "depGroup",
				"SHORT_ID": 1
			},
			"DAO": {
				"CODE_HASH": "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
				"HASH_TYPE": "type",
				"TX_HASH": "0x0000000000000000000000000000000000000000000000000000000000000000",
				"INDEX": "0x2",
				"DEP_TYPE": "code"
			}
		}
	};

	const secp256k1_blake160 = config.SCRIPTS.SECP256K1_BLAKE160;
	const secp256k1_blake160_multisig = config.SCRIPTS.SECP256K1_BLAKE160_MULTISIG;
	const dao = config.SCRIPTS.DAO;
	const system_cells = listHashes.ckb_dev.system_cells;
	const dep_groups = listHashes.ckb_dev.dep_groups;

	let obj = dep_groups.find((o) => o.included_cells.toString() === [
		"Bundled(specs/cells/secp256k1_data)",
		"Bundled(specs/cells/secp256k1_blake160_sighash_all)"
	].toString());
	secp256k1_blake160.TX_HASH = obj.tx_hash;
	secp256k1_blake160.INDEX = intToHex(obj.index);

	obj = dep_groups.find((o) => o.included_cells.toString() === [
		"Bundled(specs/cells/secp256k1_data)",
		"Bundled(specs/cells/secp256k1_blake160_multisig_all)"
	].toString());
	secp256k1_blake160_multisig.TX_HASH = obj.tx_hash;
	secp256k1_blake160_multisig.INDEX = intToHex(obj.index);

	obj = system_cells.find((o) => o.path === "Bundled(specs/cells/dao)");
	dao.TX_HASH = obj.tx_hash;
	dao.INDEX = intToHex(obj.index);

	console.log("Config.json initialized to:")
	console.log(config)

	fs.writeFileSync("../config.json", JSON.stringify(config, null, 2))

	console.log("Execution completed successfully!");
}
main();
