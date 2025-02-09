import { ModuleRef } from '@nestjs/core';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { StorageInterface } from './interfaces/storage.interface';
import { StorageTypeEnum } from '../config/enums/storage.type.enum';
import storageServices from './types';
import PascalCase from 'pascal-case';
import { Transaction } from '../transaction/interfaces/transaction.interface';
import { LoggerService } from '../logger/logger.service';
import { MethodObject, VerificationMethod } from '../identity/verification-method/model/verification-method.model';
import { Role, RawRole } from '../trust-network/interfaces/trust-network.interface';
import { RedisGraphService } from './redis-graph/redis-graph.service';

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private storage: StorageInterface;
  private graphEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly redisGraph: RedisGraphService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    if (this.config.getStorageType() === StorageTypeEnum.Redis) {
      const name = PascalCase(`${StorageTypeEnum.Redis}_storage_service`);
      this.storage = this.moduleRef.get(storageServices[name]);
    } else {
      const name = PascalCase(`${StorageTypeEnum.LevelDB}_storage_service`);
      this.storage = this.moduleRef.get(storageServices[name]);
    }

    this.graphEnabled = this.config.isAssociationGraphEnabled();
  }

  async onModuleDestroy() {}

  getAnchor(hash: string): Promise<any> {
    return this.storage.getObject(`lto:anchor:${hash.toLowerCase()}`);
  }

  saveAnchor(hash: string, transaction: object) {
    return this.storage.addObject(`lto:anchor:${hash.toLowerCase()}`, transaction);
  }

  getPublicKey(address: string) {
    return this.storage.getValue(`lto:pubkey:${address}`);
  }

  savePublicKey(address: string, publicKey: string) {
    return this.storage.setValue(`lto:pubkey:${address}`, publicKey);
  }

  async getVerificationMethods(address: string): Promise<VerificationMethod[]> {
    const result: VerificationMethod[] = [];
    const methods = await this.storage.getObject(`lto:verification:${address}`);

    for (const key in methods) {
      const data: MethodObject = methods[key];

      if (!data.revokedAt) {
        const method = new VerificationMethod(data.relationships, data.sender, data.recipient, data.createdAt);

        result.push(method);
      }
    }

    return result;
  }

  async saveVerificationMethod(address: string, verificationMethod: VerificationMethod): Promise<void> {
    const data = await this.storage.getObject(`lto:verification:${address}`);

    const newData = verificationMethod.json();

    data[newData.recipient] = newData;

    return this.storage.setObject(`lto:verification:${address}`, data);
  }

  async getRolesFor(address: string): Promise<RawRole | {}> {
    return this.storage.getObject(`lto:roles:${address}`);
  }

  async saveRoleAssociation(recipient: string, sender: string, data: Role): Promise<void> {
    const roles = await this.storage.getObject(`lto:roles:${recipient}`);

    roles[data.role] = { sender, type: data.type };

    return this.storage.setObject(`lto:roles:${recipient}`, roles);
  }

  async removeRoleAssociation(recipient: string, data: Role): Promise<void> {
    const roles = await this.storage.getObject(`lto:roles:${recipient}`);

    delete roles[data.role];

    return this.storage.setObject(`lto:roles:${recipient}`, roles);
  }

  async saveAssociation(sender: string, recipient: string): Promise<void> {
    if (this.graphEnabled) {
      return await this.redisGraph.saveAssociation(sender, recipient);
    }

    await this.storage.sadd(`lto:assoc:${sender}:childs`, recipient);
    await this.storage.sadd(`lto:assoc:${recipient}:parents`, sender);

    this.logger.debug(`storage-service: Add assoc for ${sender} child ${recipient}`);
  }

  async removeAssociation(sender: string, recipient: string): Promise<void> {
    if (this.graphEnabled) {
      return await this.redisGraph.removeAssociation(sender, recipient);
    }

    await this.storage.srem(`lto:assoc:${sender}:childs`, recipient);
    await this.storage.srem(`lto:assoc:${recipient}:parents`, sender);

    await this.recurRemoveAssociation(recipient);
    this.logger.debug(`storage-service: removed assoc for ${sender} child ${recipient}`);
  }

  async recurRemoveAssociation(address: string) {
    const childAssocs = await this.storage.getArray(`lto:assoc:${address}:childs`);

    for (const child of childAssocs) {
      await this.storage.srem(`lto:assoc:${address}:childs`, child);
      await this.storage.srem(`lto:assoc:${child}:parents`, address);
      await this.recurRemoveAssociation(child);
      this.logger.debug(`storage-service: Remove assoc for ${address} child ${child}`);
    }
  }

  async getAssociations(address: string): Promise<any> {
    if (this.graphEnabled) {
      return await this.redisGraph.getAssociations(address);
    }

    const children = await this.storage.getArray(`lto:assoc:${address}:childs`);
    const parents = await this.storage.getArray(`lto:assoc:${address}:parents`);

    return {
      children,
      parents,
    };
  }

  async incrTxStats(type: string, day: number): Promise<void> {
    return this.storage.incrValue(`lto:stats:transactions:${type}:${day}`);
  }

  async incrOperationStats(): Promise<void> {
    return this.storage.incrValue(`lto:stats:operations`);
  }

  async getOperationStats(): Promise<string> {
    return this.storage.getValue(`lto:stats:operations`);
  }

  async getTxStats(type: string, from: number, to: number): Promise<{ period: string; count: number }[]> {
    const length = to - from + 1;
    const keys = Array.from({ length }, (v, i) => `lto:stats:transactions:${type}:${from + i}`);
    const values = await this.storage.getMultipleValues(keys);

    const periods = Array.from({ length }, (v, i) => new Date((from + i) * 86400000));
    return periods.map((period: Date, index: number) => ({
      period: this.formatPeriod(period),
      count: Number(values[index]),
    }));
  }

  async setTxFeeBurned(value: string): Promise<void> {
    return this.storage.setValue('lto:stats:supply:txfeeburned', value);
  }

  async getTxFeeBurned(): Promise<number> {
    const value = await this.storage.getValue('lto:stats:supply:txfeeburned').catch(() => '0');
    return Number(value);
  }

  async setFeeBurnFeatureHeight(value: string): Promise<void> {
    return this.storage.setValue('lto:stats:supply:feeburnheight', value);
  }

  async getFeeBurnFeatureHeight(): Promise<number | Error> {
    const value = await this.storage.getValue('lto:stats:supply:feeburnheight');
    return Number(value);
  }

  private formatPeriod(date: Date): string {
    const year = String(date.getUTCFullYear());
    const month = ('0' + (date.getUTCMonth() + 1)).substr(-2);
    const day = ('0' + date.getUTCDate()).substr(-2);

    return `${year}-${month}-${day} 00:00:00`;
  }

  countTx(type: string, address: string): Promise<number> {
    return this.storage.countTx(type, address);
  }

  indexTx(type: string, address: string, transactionId: string, timestamp: number): Promise<void> {
    return this.storage.indexTx(type, address, transactionId, timestamp);
  }

  getTx(type: string, address: string, limit: number, offset: number): Promise<string[]> {
    return this.storage.getTx(type, address, limit, offset);
  }

  async getProcessingHeight(): Promise<number | null> {
    let height;
    try {
      height = await this.storage.getValue(`lto:processing-height`);
    } catch (e) {}
    return height ? Number(height) : null;
  }

  saveProcessingHeight(height: string | number): Promise<void> {
    return this.storage.setValue(`lto:processing-height`, String(height));
  }

  clearProcessHeight(): Promise<void> {
    return this.storage.delValue(`lto:processing-height`);
  }
}
