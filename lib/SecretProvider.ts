import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
const Vault = require('hashi-vault-js');

export async function fetchSecret(name: string) {
    if (name.startsWith("gcp://") == true) {
        // gcp secret manager
        let secret_name = name.replace(/^(gcp:\/\/)/,"");
        return await fetchGCPSecret(secret_name)
    }
    if (name.startsWith("vault://") == true) {
        // vault
        let secret_name = name.replace(/^(vault:\/\/)/,"");
        let secret = await fetchVaultSecret(secret_name);
        console.log(secret);
        return secret;
    }
    return name

}

async function fetchGCPSecret(name: string) {
    try {
        const client = new SecretManagerServiceClient();
        const [version] = await client.accessSecretVersion({ name });

        const payload = version.payload?.data?.toString();

        if (!payload) {
            // throw new Error(`Failed to fetch secret "${name}"`);
            console.log(`      *** ERROR: failed to fetch secret "${name}" from gcp secret manager`)
            return "";
        }
        
        return payload
    }
    catch (error) {
        console.log(`      *** ERROR: failed to fetch secret "${name}" from gcp secret manager.   ${error}`)
    }

    return undefined
}

async function fetchVaultSecret(name: string) {
    try {
        let vaultUrl = 'http://localhost:8200/v1';
        let vaultNamespace = 'admin';
        let vaultToken: string = "";
        if (( process.env.VAULT_ROLE_ID===undefined || process.env.VAULT_SECRET_ID===undefined ) && (process.env.VAULT_TOKEN===undefined)) {
            throw "VAULT_TOKEN or (VAULT_ROLE_ID, VAULT_SECRET_ID) env vars should be defined for vault auth.";
        }
        if (process.env.VAULT_URL!==undefined) {
            vaultUrl = process.env.VAULT_URL;
        }
        if (process.env.VAULT_NAMESPACE!==undefined) {
            vaultNamespace = process.env.VAULT_NAMESPACE;
        }
        const vault = new Vault( {
            https: true,
            baseUrl: vaultUrl,
            timeout: 10000,
            proxy: false,
            namespace: vaultNamespace
        });
        if (process.env.VAULT_TOKEN!==undefined) {
            console.log("Vault token provided via env var.");
            vaultToken = process.env.VAULT_TOKEN;
        }
        if (process.env.VAULT_TOKEN===undefined) {
            console.log("Vault app role provided via env var.");
            let res = await vault.loginWithAppRole(process.env.VAULT_ROLE_ID, process.env.VAULT_SECRET_ID);
            vaultToken = res.client_token;
            console.log("Success login to vault using app role.");
        }
        const payload = await vault.readKVSecret(vaultToken, name)
        if ("accountPrivateKey" in payload.data) {
            return payload.data["accountPrivateKey"];
        }
        throw "This Vault secret should include <accountPrivateKey> key.";
    }
    catch (error) {
        console.log(`      *** ERROR: failed to use vault secret "${name}"   ${error}`)
    }
    return undefined
}