#!/bin/bash
USER=ubuntu

# data-provider-2
#SERVER=34.107.95.240
# data-provider-4
SERVER=34.141.58.90

BRANCH=master

WORKDIR="flare-price-provider"


RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color
REDBOLD="${RED}$(tput bold)"
GREENBOLD="${GREEN}$(tput bold)"
GREEN="${GREEN}"
NCNORMAL="${NC}$(tput sgr0)"

echo -e "${GREENBOLD}[1/3] Setup server $SERVER${NC}"
# Enable docker to run witout sudo (on server)
#ssh -n $USER@$SERVER "sudo apt install -y docker-compose"
#ssh -n $USER@$SERVER "sudo groupadd docker; sudo usermod -aG docker $USER; newgrp docker"

# Create install folder if they do not exist (on server)
ssh -n $USER@$SERVER "mkdir -p $WORKDIR"

# Copy files to server
echo -e "${GREENBOLD}[2/3] Copying files on server $SERVER${NC}"
echo -e "   docker-compose.yml"
scp scripts/docker-compose.yml $USER@$SERVER:$WORKDIR || { echo 'scp failed' ; exit 1; }
echo -e "   .deploy.env"
scp .deploy.env $USER@$SERVER:$WORKDIR || { echo 'scp failed' ; exit 1; }

# Run yarn in $WORKDIR 
echo -e "${GREENBOLD}[3/3] Installation done - starting docker${NC}"
echo -e "   docker pull and restart"
ssh -n $USER@$SERVER "cd $WORKDIR; docker-compose pull; docker-compose restart"
echo -e "   docker up"
ssh -n $USER@$SERVER "cd $WORKDIR; docker-compose up -d"

# Restart the app as a service.
echo -e "${GREENBOLD}Done.${NC}"
