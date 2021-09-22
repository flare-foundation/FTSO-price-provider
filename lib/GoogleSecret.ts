import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export async function fetchSecret(name: string) {
    try {
        const client = new SecretManagerServiceClient();
        const [version] = await client.accessSecretVersion({ name });

        const payload = version.payload?.data?.toString();

        if (!payload) {
            // throw new Error(`Failed to fetch secret "${name}"`);
            console.log(`      *** ERROR: failed to fetch secret "${name}"`)
            return "";
        }
        
        return payload
    }
    catch (error) {
        console.log(`      *** ERROR: failed to fetch secret "${name}"   ${error}`)
    }

    return undefined
}