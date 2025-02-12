import { Injectable } from '@nestjs/common';
import { ConfigLoaderService } from './config-loader.service';
import { StorageTypeEnum } from './enums/storage.type.enum';
import { RawRole } from '../trust-network/interfaces/trust-network.interface';

@Injectable()
export class ConfigService {
  constructor(private readonly config: ConfigLoaderService) {}

  getEnv(): string {
    return this.config.get('env');
  }

  getPort(): string {
    return this.config.get('port');
  }

  getNodeUrl(): string {
    return this.config.get('node.url');
  }

  getNodeApiKey(): string {
    return this.config.get('node.api_key');
  }

  getStartingBlock(): number | string {
    return this.config.get('starting_block');
  }

  getRestartSync(): boolean {
    return this.config.get('restart_sync');
  }

  getAuthToken(): string {
    return this.config.get('auth.token');
  }

  getAnchorFee(): number {
    return Number(this.config.get('fees.anchor'));
  }

  getSponsorFee(): number {
    return Number(this.config.get('fees.sponsor'));
  }

  getRedisClient(): string | string[] {
    return this.getRedisUrl() || this.getRedisCluster().split(';');
  }

  getRedisUrl(): string {
    return this.config.get('redis.url');
  }

  getRedisCluster(): string {
    return this.config.get('redis.cluster');
  }

  getRedisGraph(): { host: string; port: string } {
    return {
      host: this.config.get('redis_graph.host'),
      port: this.config.get('redis_graph.port'),
    };
  }

  getLevelDbName(): string {
    return this.config.get('leveldb.name');
  }

  getMonitorInterval(): number {
    return Number(this.config.get('monitor.interval'));
  }

  getLoggerLevel(): string {
    return this.config.get('log.level');
  }

  getStorageType(): StorageTypeEnum {
    return this.config.get('storage.type');
  }

  isIdentityIndexingEnabled(): boolean {
    return !!this.config.get('identity.indexing');
  }

  isTransactionIndexingEnabled(): boolean {
    return !!this.config.get('transaction.indexing');
  }

  isStatsEnabled(token: 'operations' | 'transactions' | 'supply'): boolean {
    return !!this.config.get(`stats.${token}`);
  }

  getRoles(): RawRole {
    return this.config.get('trust_network.roles');
  }

  isTrustNetworkIndexingEnabled(): boolean {
    return !!this.config.get('trust_network.indexing');
  }

  getAssociationIndexing(): 'none' | 'trust' | 'all' {
    return this.config.get('association.indexing');
  }

  getAnchorIndexing(): 'none' | 'trust' | 'all' {
    return this.config.get('anchor.indexing');
  }

  isAssociationGraphEnabled(): boolean {
    return !!this.config.get('association.use_graph');
  }

  // @todo: add support for more chains (only eip155 for now)
  isEip155IndexingEnabled(): boolean {
    return !!this.config.get('cross_chain.eip155.indexing');
  }
}
