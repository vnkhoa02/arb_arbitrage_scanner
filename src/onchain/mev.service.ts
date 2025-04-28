import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Injectable, Logger } from '@nestjs/common';
import { signer } from './config';
import { ISimpleArbitrageParams } from './types';
import { sendNotify } from './utils/notify';

@Injectable()
export class MevService {
  private readonly logger = new Logger(MevService.name);
  private params: ISimpleArbitrageParams;

  async submitArbitrage(
    txRequest: TransactionRequest,
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    try {
      this.params = params;
      const [self] = await Promise.allSettled([this.selfSubmit(txRequest)]);

      const results = { self };

      // Otherwise, return the first fulfilled result among the rest
      for (const key of ['self']) {
        const result = results[key as keyof typeof results];
        if (result.status === 'fulfilled') return result.value;
      }

      // If none fulfilled
      this.logger.warn('submitArbitrage: No submissions succeeded.');
      return undefined;
    } catch (error) {
      this.logger.error('Error in submitArbitrage', error);
      return undefined;
    }
  }

  async selfSubmit(txRequest: TransactionRequest): Promise<string> {
    if (!txRequest) return;
    try {
      // Sign & Send transaction
      const signedTx = await signer.signTransaction(txRequest);
      this.logger.debug(`Signed transaction: ${signedTx}`);
      const txResponse = await signer.sendTransaction(txRequest);
      this.logger.log(`Transaction sent: ${txResponse.hash}`);

      sendNotify({ ...this.params, tx: txResponse.hash });
      return txResponse.hash;
    } catch (e) {
      this.logger.error('Error in selfSubmit', e);
    }
  }
}
