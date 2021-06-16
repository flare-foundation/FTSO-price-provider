# Path to config json. By default it seeks file named config.json in the root folder
CONFIG_PATH=${1:-./config.json}

# Compile typescript
yarn tsc

# Run DataProvider
node dist/DataProvider.js -c $CONFIG_PATH
