import { CHAIN_ID } from '../config';

const swapper = '0x0CF9Dcf86Ec3A20BF54E852E99823f2978552ED1'; // My Wallet

export function getQuotePayload(
  tokenIn: string,
  tokenOut: string,
  amount: string,
) {
  return {
    amount,
    gasStrategies: [
      {
        limitInflationFactor: 1.15,
        displayLimitInflationFactor: 1,
        priceInflationFactor: 1.5,
        percentileThresholdFor1559Fee: 75,
        thresholdToInflateLastBlockBaseFee: 0,
        baseFeeMultiplier: 1.05,
        baseFeeHistoryWindow: 100,
        minPriorityFeeGwei: 2,
        maxPriorityFeeGwei: 9,
      },
    ],
    swapper,
    tokenIn,
    tokenInChainId: CHAIN_ID,
    tokenOut,
    tokenOutChainId: CHAIN_ID,
    type: 'EXACT_INPUT',
    urgency: 'normal',
    protocols: ['V3'],
    autoSlippage: 'DEFAULT',
  };
}

export function getQuoteHeader() {
  return {
    accept: '*/*',
    'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    origin: 'https://app.uniswap.org',
    pragma: 'no-cache',
    priority: 'u=1, i',
    referer: 'https://app.uniswap.org/',
    'sec-ch-ua':
      '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'x-api-key': 'JoyCGj29tT4pymvhaGciK4r1aIPvqW6W53xT1fwo',
    'x-app-version': '',
    'x-request-source': 'uniswap-web',
    'x-universal-router-version': '2.0',
    Cookie:
      '__cf_bm=BczThh_hQDEl4GmNrJXqKY6LjoDhve1RALPFJbEcfao-1745484158-1.0.1.1-IzVUuZU2Dwo2TPYzAzYSGDxrBlZqh41O1w.jhCVN48oT5AUCDWusBPX6ExnHeeAefl6NizehgMtJp6o.bmCgE.t570l8l_WAcGZ6W1S9fDs',
  };
}
