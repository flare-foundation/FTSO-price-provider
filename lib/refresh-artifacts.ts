
import glob from 'glob';
import { relativeContractABIPathForContractName } from './utils';
const ARTIFACTS_ROOT = "../flare-smart-contracts/artifacts"
const REQUIRED_CONTRACTS = ["Ftso", "FtsoManager", "PriceSubmitter", "VoterWhitelister", "FtsoRegistry"];

const fse = require('fs-extra');
const rimraf = require("rimraf");


async function refreshArtifacts() {
    rimraf.sync("artifacts/contracts");
    for (let name of REQUIRED_CONTRACTS) {
        let abiPath = await relativeContractABIPathForContractName(name, ARTIFACTS_ROOT);
        fse.copySync(`${ARTIFACTS_ROOT}/${abiPath}`, `artifacts/${abiPath}`);
    }
}

refreshArtifacts();

process.on('unhandledRejection', error => {
    // Will print "unhandledRejection err is not defined"
    console.log('unhandledRejection', error);
});
