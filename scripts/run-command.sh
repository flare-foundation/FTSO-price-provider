# Command you want to call: Wrap, Unwrap, ClaimRewards, SetFee
COMMAND=${1}

if [[ "$COMMAND" == "Wrap" ]]
then
    node dist/methods/Wrap.js -a ${2}
elif [[ "$COMMAND" == "Unwrap" ]]
then
    node dist/methods/Unwrap.js -a ${2}
elif [[ "$COMMAND" == "ClaimRewards" ]]
then
    node dist/methods/ClaimRewards.js -r ${2}
elif [[ "$COMMAND" == "SetFee" ]]
then
    node dist/methods/SetFee.js -f ${2}
else
  echo "Error. First argument of the call must be one of: Wrap, Unwrap, ClaimRewards or SetFee"
fi

