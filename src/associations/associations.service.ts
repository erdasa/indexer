import { Injectable, OnModuleInit } from '@nestjs/common';
import { IndexDocumentType } from '../index/model/index.model';
import { LoggerService } from '../logger/logger.service';
import { ConfigService } from '../config/config.service';
import { StorageService } from '../storage/storage.service';
import { Transaction } from '../transaction/interfaces/transaction.interface';

@Injectable()
export class AssociationsService {

  private transactionTypes: number[];

  constructor(
    readonly logger: LoggerService,
    readonly config: ConfigService,
    readonly storage: StorageService,
  ) {
    this.transactionTypes = [16, 17];
  }

  async index(index: IndexDocumentType): Promise<void> {
    const { transaction } = index;
    const { sender } = transaction;

    if (this.transactionTypes.indexOf(transaction.type) === -1){
      this.logger.debug(`association-service: Unknown transaction type`);
      return;
    }

    const associationIndexing = this.config.getAssociationIndexing();
    const senderRoles = await this.storage.getRolesFor(sender);
    const isSenderTrustNetwork = Object.keys(senderRoles).length > 0;

    if (associationIndexing === 'none') {
      this.logger.debug(`association-service: Association indexing set to "none"`);
      return;
    }

    if (associationIndexing === 'trust' && !isSenderTrustNetwork) {
      this.logger.debug(`association-service: Sender is not part of trust network`);
      return;
    }

    if (transaction.type === 16) {
      this.logger.debug(`association-service: Saving association`);
      return this.storage.saveAssociation(transaction);
    } else if (transaction.type === 17) {
      this.logger.debug(`association-service: Removing association`);
      return this.storage.removeAssociation(transaction);
    }
  }

  getAssociations(address: string): Promise<any> {
    return this.storage.getAssociations(address);
  }
}
