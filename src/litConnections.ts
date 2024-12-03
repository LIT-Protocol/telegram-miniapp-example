import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_NETWORK, LIT_ABILITY, AUTH_METHOD_SCOPE } from "@lit-protocol/constants";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import {
  LitPKPResource,
  LitActionResource,
} from "@lit-protocol/auth-helpers";
import Hash from "typestub-ipfs-only-hash";
import * as ethers from "ethers";

import { litActionCode } from "./litAction";

const LIT_NET = LIT_NETWORK.DatilTest;

export const connectToLitNodes = async () => {
  const litNodeClient = new LitNodeClient({
    litNetwork: LIT_NET,
    debug: false,
  });
  await litNodeClient.connect();
  return litNodeClient;
};

async function setupLitContracts(provider: any) {
  await provider.send("eth_requestAccounts", []);
  const ethersProvider = new ethers.providers.Web3Provider(provider);
  const signer = ethersProvider.getSigner();

  const litContracts = new LitContracts({
    signer,
    network: LIT_NET,
  });
  await litContracts.connect();

  return { litContracts, signer };
}

export const mintNewPkp = async (provider: any) => {
  const { litContracts } = await setupLitContracts(provider);
  const hash = await Hash.of(litActionCode);
  const pkp = (await litContracts.pkpNftContractUtils.write.mint()).pkp;

  await litContracts.addPermittedAction({
    authMethodScopes: [AUTH_METHOD_SCOPE.SignAnything],
    pkpTokenId: pkp.tokenId,
    ipfsId: hash,
  });

  return pkp;
};

export const getSessionSignatures = async (
  litNodeClient: LitNodeClient,
  pkp: any,
  provider: any,
  telegramUser: string
) => {
  const { litContracts, signer } = await setupLitContracts(provider);

  const capacityTokenId = (
    await litContracts.mintCapacityCreditsNFT({
      requestsPerKilosecond: 10,
      daysUntilUTCMidnightExpiration: 1,
    })
  ).capacityTokenIdStr;

  const { capacityDelegationAuthSig } =
    await litNodeClient.createCapacityDelegationAuthSig({
      dAppOwnerWallet: signer,
      capacityTokenId,
      delegateeAddresses: [pkp.ethAddress],
      uses: "1",
    });

  const sessionSignatures = await litNodeClient.getPkpSessionSigs({
    pkpPublicKey: pkp.publicKey,
    capabilityAuthSigs: [capacityDelegationAuthSig],
    litActionCode: Buffer.from(litActionCode).toString("base64"),
    jsParams: {
      telegramUserData: telegramUser,
      telegramBotSecret: import.meta.env.VITE_TELEGRAM_BOT_SECRET,
      pkpTokenId: pkp.tokenId,
    },
    resourceAbilityRequests: [
      {
        resource: new LitPKPResource("*"),
        ability: LIT_ABILITY.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LIT_ABILITY.LitActionExecution,
      },
    ],
    expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
  });
  console.log(
    `✅ Got PKP Session Sigs: ${JSON.stringify(sessionSignatures, null, 2)}`
  );
  return sessionSignatures;
};
