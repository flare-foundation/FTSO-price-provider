#!/bin/bash
USER=ubuntu

# 4
SERVER=34.141.58.90
# 2
#SERVER=34.107.95.240

BRANCH=master

WORKDIR="heartbeat-daemon"


RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color
REDBOLD="${RED}$(tput bold)"
GREENBOLD="${GREEN}$(tput bold)"
GREEN="${GREEN}"
NCNORMAL="${NC}$(tput sgr0)"

echo -e "${GREENBOLD}[1/3] Setup server $SERVER${NC}"
# Enable docker to run witout sudo (on server)
ssh -n $USER@$SERVER "sudo apt install -y docker-compose"
ssh -n $USER@$SERVER "sudo groupadd docker; sudo usermod -aG docker $USER; newgrp docker"

# Create install folder if they do not exist (on server)
ssh -n $USER@$SERVER "mkdir -p $WORKDIR"

# Copy files to server
echo -e "${GREENBOLD}[2/3] Copying files on server $SERVER${NC}"
scp scripts/docker-compose.yml $USER@$SERVER:$WORKDIR || { echo 'scp failed' ; exit 1; }

# Run yarn in $WORKDIR 
echo -e "${GREENBOLD}[3/3] Installation done - starting docker${NC}"
ssh -n $USER@$SERVER "cd $WORKDIR; docker-compose up"

# Restart the app as a service.
echo -e "${GREENBOLD}Done.${NC}"
