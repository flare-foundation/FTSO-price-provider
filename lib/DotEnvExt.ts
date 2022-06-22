import dotenv from "dotenv";

function dotenvInclude()
{
    const include = process.env.DOTENV_INCLUDE;

    if( include===null || include===undefined ) return;

    for(const inc of include.split( ';' ) )
    {
        console.log( `[dotenv include '${inc}']` )
        dotenv.config( { path: inc } );
    }
}

export function DotEnvExt()
{
    // initialize configuration
    if( process.env.DOTENV==="DEV" )
    {
        console.log( "[loading development env (.dev.env)]")
        dotenv.config( { path: ".dev.env" } );
    }
    else
    {
        dotenv.config();
    }

    dotenvInclude();
}
