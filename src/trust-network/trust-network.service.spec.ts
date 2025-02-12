import { Test, TestingModule } from '@nestjs/testing';
import { TrustNetworkModuleConfig } from './trust-network.module';
import { TrustNetworkService } from './trust-network.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '../config/config.service';
import { NodeService } from '../node/node.service';
import { RoleData } from './interfaces/trust-network.interface';
import { LoggerService } from '../logger/logger.service';
import { Transaction } from '../transaction/interfaces/transaction.interface';

describe('TrustNetworkService', () => {
  let module: TestingModule;

  let nodeService: NodeService;
  let configService: ConfigService;
  let loggerService: LoggerService;
  let storageService: StorageService;
  let trustNetworkService: TrustNetworkService;

  let transaction: Transaction;

  function spy() {
    const storage = {
      saveRoleAssociation: jest.spyOn(storageService, 'saveRoleAssociation').mockImplementation(async () => {}),
      removeRoleAssociation: jest.spyOn(storageService, 'removeRoleAssociation').mockImplementation(async () => {}),
      getRolesFor: jest.spyOn(storageService, 'getRolesFor').mockImplementation(async (address: string) => {
        if (address === '3Mv7ajrPLKewkBNqfxwRZoRwW6fziehp7dQ') return {};

        return {
          authority: { sender: 'mock-sender', type: 100 },
        };
      }),
    };

    const node = {
      sponsor: jest.spyOn(nodeService, 'sponsor').mockImplementation(async () => {}),
      cancelSponsor: jest.spyOn(nodeService, 'cancelSponsor').mockImplementation(async () => {}),
      getNodeWallet: jest.spyOn(nodeService, 'getNodeWallet').mockImplementation(async () => 'node-address'),
      getSponsorsOf: jest.spyOn(nodeService, 'getSponsorsOf').mockImplementation(async () => []),
    };

    const config = {
      getRoles: jest.spyOn(configService, 'getRoles').mockImplementation(() => {
        return {
          root: {
            description: 'The root',
            issues: [{ type: 100, role: 'authority' }],
          },
          authority: {
            description: 'The authority',
            issues: [
              { type: 100, role: 'university' },
              { type: 101, role: 'sub_authority' },
            ],
            authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
          },
          sub_authority: {
            description: 'The sub authority',
            issues: [{ type: 100, role: 'university' }],
          },
          university: {
            description: 'The university',
            authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
          },
        };
      }),
    };

    const logger = {
      debug: jest.spyOn(loggerService, 'debug').mockImplementation(() => {}),
      error: jest.spyOn(loggerService, 'error').mockImplementation(() => {}),
    };

    return { storage, node, config, logger };
  }

  beforeEach(async () => {
    module = await Test.createTestingModule(TrustNetworkModuleConfig).compile();

    nodeService = module.get<NodeService>(NodeService);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
    storageService = module.get<StorageService>(StorageService);
    trustNetworkService = module.get<TrustNetworkService>(TrustNetworkService);

    // @ts-ignore
    transaction = {
      id: 'fake_transaction',
      type: 16,
      sender: '3JuijVBB7NCwCz2Ae5HhCDsqCXzeBLRTyeL',
      party: '3Mv7ajrPLKewkBNqfxwRZoRwW6fziehp7dQ',
      associationType: 101,
    };

    await module.init();
  });

  afterEach(async () => {
    await module.close();
  });

  describe('index', () => {
    describe('save associations', () => {
      test('should save a role association', async () => {
        const spies = spy();

        const expectedRole = { type: 101, role: 'sub_authority' };

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(1);
        expect(spies.storage.removeRoleAssociation).toHaveBeenCalledTimes(0);
        expect(spies.storage.saveRoleAssociation).toHaveBeenNthCalledWith(
          1,
          transaction.party,
          transaction.sender,
          expectedRole,
        );

        expect(spies.node.sponsor).toHaveBeenCalledTimes(0);

        expect(spies.logger.debug).toHaveBeenCalledTimes(1);
        expect(spies.logger.debug).toHaveBeenNthCalledWith(1, 'trust-network: saving role association');
      });

      test('should save multiple role associations of same type when configured', async () => {
        const spies = spy();
        const expectedRoles = [
          { type: 101, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ];

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: expectedRoles,
            },
          };
        });

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(2);
        expect(spies.storage.saveRoleAssociation).toHaveBeenNthCalledWith(
          1,
          transaction.party,
          transaction.sender,
          expectedRoles[0],
        );
        expect(spies.storage.saveRoleAssociation).toHaveBeenNthCalledWith(
          2,
          transaction.party,
          transaction.sender,
          expectedRoles[1],
        );
      });

      test('should send a sponsor transaction to the node if the party will be given a sponsored role', async () => {
        const spies = spy();

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: [{ type: 101, role: 'university' }],
            },
            university: {
              description: 'University',
              sponsored: true,
            },
          };
        });

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.node.sponsor).toHaveBeenCalledTimes(1);
        expect(spies.node.sponsor).toHaveBeenNthCalledWith(1, transaction.party);

        expect(spies.logger.debug).toHaveBeenCalledTimes(2);
        expect(spies.logger.debug).toHaveBeenNthCalledWith(1, 'trust-network: saving role association');
        expect(spies.logger.debug).toHaveBeenNthCalledWith(
          2,
          'trust-network: party is being given a sponsored role, sending a transaction to the node',
        );
      });

      test('should not send a sponsor transaction if the sponsor is the node', async () => {
        const spies = spy();

        spies.node.getSponsorsOf = jest
          .spyOn(nodeService, 'getSponsorsOf')
          .mockImplementation(async () => ['node-address']);

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: [{ type: 101, role: 'university' }],
            },
            university: {
              description: 'University',
              sponsored: true,
            },
          };
        });

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.node.sponsor).toHaveBeenCalledTimes(0);
      });

      test('should send a sponsor transaction if the sponsor is not the node', async () => {
        const spies = spy();

        spies.node.getSponsorsOf = jest
          .spyOn(nodeService, 'getSponsorsOf')
          .mockImplementation(async () => ['some-other-address']);

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: [{ type: 101, role: 'university' }],
            },
            university: {
              description: 'University',
              sponsored: true,
            },
          };
        });

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.node.sponsor).toHaveBeenCalledTimes(1);
      });

      test('should log error if something fails', async () => {
        const spies = spy();

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: [{ type: 101, role: 'university' }],
            },
            university: {
              description: 'University',
              sponsored: true,
            },
          };
        });

        spies.node.sponsor = jest.spyOn(nodeService, 'sponsor').mockRejectedValue(new Error('Something wrong'));

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.logger.error).toHaveBeenCalledTimes(1);
        expect(spies.logger.error).toHaveBeenNthCalledWith(
          1,
          'trust-network: error saving a role association: "Error: Something wrong"',
        );
      });
    });

    describe('remove associations', () => {
      test('should remove a role association', async () => {
        const spies = spy();

        // @ts-ignore
        transaction.type = 17;

        const expectedRole = { type: 101, role: 'sub_authority' };

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(0);
        expect(spies.storage.removeRoleAssociation).toHaveBeenCalledTimes(1);
        expect(spies.storage.removeRoleAssociation).toHaveBeenNthCalledWith(1, transaction.party, expectedRole);

        expect(spies.node.cancelSponsor).toHaveBeenCalledTimes(1);
        expect(spies.node.cancelSponsor).toHaveBeenNthCalledWith(1, transaction.party);

        expect(spies.logger.debug).toHaveBeenCalledTimes(2);
        expect(spies.logger.debug).toHaveBeenNthCalledWith(1, 'trust-network: removing role association');
        expect(spies.logger.debug).toHaveBeenNthCalledWith(
          2,
          'trust-network: party has no more sponsored roles, sending a transaction to the node',
        );
      });

      test('should remove multiple role associations of same type when configured', async () => {
        const spies = spy();
        const expectedRoles = [
          { type: 101, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ];

        // @ts-ignore
        transaction.type = 17;

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: expectedRoles,
            },
          };
        });

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.storage.removeRoleAssociation).toHaveBeenCalledTimes(2);
        expect(spies.storage.removeRoleAssociation).toHaveBeenNthCalledWith(1, transaction.party, expectedRoles[0]);
        expect(spies.storage.removeRoleAssociation).toHaveBeenNthCalledWith(2, transaction.party, expectedRoles[1]);
      });

      test('should not send a remove sponsor transaction to the node if there are still sponsored roles left', async () => {
        const spies = spy();

        spies.config.getRoles = jest.spyOn(configService, 'getRoles').mockImplementation(() => {
          return {
            authority: {
              description: 'The authority',
              issues: [{ type: 101, role: 'university' }],
            },
            university: {
              description: 'University',
              sponsored: true,
            },
          };
        });

        spies.storage.getRolesFor = jest
          .spyOn(storageService, 'getRolesFor')
          .mockImplementation(async (address: string) => {
            if (address === '3Mv7ajrPLKewkBNqfxwRZoRwW6fziehp7dQ') {
              return {
                university: { sender: 'mock-sender', type: 101 },
              };
            }

            return {
              authority: { sender: 'mock-sender', type: 100 },
            };
          });

        // @ts-ignore
        transaction.type = 17;

        await trustNetworkService.index({
          transaction,
          blockHeight: 1,
          position: 0,
        });

        expect(spies.node.cancelSponsor).toHaveBeenCalledTimes(0);
      });
    });

    test('should skip indexing if there is no party', async () => {
      const spies = spy();

      // @ts-ignore
      delete transaction.party;

      await trustNetworkService.index({
        transaction,
        blockHeight: 1,
        position: 0,
      });

      expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(0);
    });

    test('should skip indexing if there is no association type', async () => {
      const spies = spy();

      // @ts-ignore
      delete transaction.associationType;

      await trustNetworkService.index({
        transaction,
        blockHeight: 1,
        position: 0,
      });

      expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(0);
    });

    test('should skip indexing if transaction type is unknown', async () => {
      const spies = spy();

      // @ts-ignore
      transaction.type = 1;

      await trustNetworkService.index({
        transaction,
        blockHeight: 1,
        position: 0,
      });

      expect(spies.storage.saveRoleAssociation).toHaveBeenCalledTimes(0);
    });
  });

  describe('getRolesFor()', () => {
    test('should resolve the roles for an address', async () => {
      const spies = spy();

      const result = await trustNetworkService.getRolesFor('mock-party');

      const expected: RoleData = {
        roles: ['authority'],
        issues_roles: [
          { type: 100, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ],
        issues_authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
      };

      expect(spies.config.getRoles).toHaveBeenCalledTimes(1);

      expect(spies.storage.getRolesFor).toHaveBeenCalledTimes(1);
      expect(spies.storage.getRolesFor).toHaveBeenNthCalledWith(1, 'mock-party');

      expect(result).toStrictEqual(expected);
    });

    test('should return root roles if address is in node wallet', async () => {
      const spies = spy();

      spies.storage.getRolesFor = jest.spyOn(storageService, 'getRolesFor').mockImplementation(async () => {
        return { authority: { sender: 'mock-sender', type: 100 } };
      });

      const result = await trustNetworkService.getRolesFor('node-address');
      const expected: RoleData = {
        roles: ['root', 'authority'],
        issues_roles: [
          { type: 100, role: 'authority' },
          { type: 100, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ],
        issues_authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
      };

      expect(spies.storage.getRolesFor).toHaveBeenCalledTimes(1);

      expect(result).toStrictEqual(expected);
    });

    test('should not return the same role twice', async () => {
      const spies = spy();

      spies.storage.getRolesFor = jest.spyOn(storageService, 'getRolesFor').mockImplementation(async () => {
        return {
          authority: { sender: 'mock-sender', type: 100 },
          sub_authority: { sender: 'mock-sender', type: 101 },
        };
      });

      const result = await trustNetworkService.getRolesFor('mock-party');
      const expected: RoleData = {
        roles: ['authority', 'sub_authority'],
        issues_roles: [
          { type: 100, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ],
        issues_authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
      };

      expect(result).toStrictEqual(expected);
    });

    test('should not return the same authorization twice', async () => {
      const spies = spy();

      spies.storage.getRolesFor = jest.spyOn(storageService, 'getRolesFor').mockImplementation(async () => {
        return {
          authority: { sender: 'mock-sender', type: 100 },
          university: { sender: 'mock-sender', type: 100 },
        };
      });

      const result = await trustNetworkService.getRolesFor('mock-party');
      const expected: RoleData = {
        roles: ['authority', 'university'],
        issues_roles: [
          { type: 100, role: 'university' },
          { type: 101, role: 'sub_authority' },
        ],
        issues_authorization: ['https://www.w3.org/2018/credentials/examples/v1'],
      };

      expect(result).toStrictEqual(expected);
    });

    test('should not error if address has no roles', async () => {
      const spies = spy();

      spies.storage.getRolesFor = jest.spyOn(storageService, 'getRolesFor').mockImplementation(async () => {
        return {};
      });

      const result = await trustNetworkService.getRolesFor('mock-party');

      const expected: RoleData = {
        roles: [],
        issues_roles: [],
        issues_authorization: [],
      };

      expect(result).toStrictEqual(expected);
    });
  });
});
