import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export async function fetchSecret(name: string)
{
    // console.log( `      * fetchSecret '${name}'`)

    try {

        const client = new SecretManagerServiceClient();
        const [version] = await client.accessSecretVersion({name});

        const payload = version.payload?.data?.toString();

        if( !payload )
        {
            // throw new Error(`Failed to fetch secret "${name}"`);
            console.log( `      *** ERROR: failed to fetch secret "${name}"` )

            return "";
        }

        // console.log( `secret is "${payload}"` )

        return payload
    }
    catch( error ) {
        console.log( `      *** ERROR: failed to fetch secret "${name}"   ${error}` )
    }

    return undefined
}