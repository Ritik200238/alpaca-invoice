import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageService } from '../StorageServiceImpl';
import { StorageError } from '../IStorageService';
import { createServiceError } from '@/lib/service-errors';

const StorageServiceError = createServiceError<StorageError>('StorageService');

// 模拟 IndexedDB
const mockIndexedDB = () => {
  const stores = new Map<string, Map<any, any>>();
  let currentVersion = 1;

  const createStore = (name: string) => {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    return stores.get(name)!;
  };

  const mockDB = {
    version: currentVersion,
    objectStoreNames: {
      length: 0,
      contains: (name: string) => stores.has(name),
      item: (index: number) => {
        const names = Array.from(stores.keys());
        return names[index] || null;
      }
    },
    close: () => {},
    transaction: (storeNames: string[], mode: 'readonly' | 'readwrite') => {
      const stores_map = new Map();
      storeNames.forEach(name => {
        const store = createStore(name);
        stores_map.set(name, {
          get: (key: any) => {
            const request: any = {
              result: undefined,
              onsuccess: null as any,
              onerror: null as any,
            };
            Promise.resolve().then(() => {
              request.result = store.get(key) || undefined;
              if (request.onsuccess) {
                request.onsuccess({ target: request } as any);
              }
            });
            return request;
          },
          put: (value: any) => {
            const request: any = {
              result: undefined,
              onsuccess: null as any,
              onerror: null as any,
            };
            Promise.resolve().then(() => {
              const key = value.key;
              store.set(key, value);
              request.result = key;
              if (request.onsuccess) {
                request.onsuccess({ target: request } as any);
              }
            });
            return request;
          },
          delete: (key: any) => {
            const request: any = {
              result: undefined,
              onsuccess: null as any,
              onerror: null as any,
            };
            Promise.resolve().then(() => {
              store.delete(key);
              request.result = undefined;
              if (request.onsuccess) {
                request.onsuccess({ target: request } as any);
              }
            });
            return request;
          },
          getAll: () => {
            const request: any = {
              result: undefined,
              onsuccess: null as any,
              onerror: null as any,
            };
            Promise.resolve().then(() => {
              request.result = Array.from(store.values());
              if (request.onsuccess) {
                request.onsuccess({ target: request } as any);
              }
            });
            return request;
          },
          clear: () => {
            const request: any = {
              result: undefined,
              onsuccess: null as any,
              onerror: null as any,
            };
            Promise.resolve().then(() => {
              store.clear();
              request.result = undefined;
              if (request.onsuccess) {
                request.onsuccess({ target: request } as any);
              }
            });
            return request;
          },
        });
      });

      return {
        objectStore: (name: string) => stores_map.get(name),
      };
    },
  };

  const open = (name: string, version?: number) => {
    const request: any = {
      result: mockDB,
      version: version || currentVersion,
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
    };

    // 模拟升级逻辑
    Promise.resolve().then(() => {
      if (version && version > currentVersion) {
        currentVersion = version;
        mockDB.version = version;
        if (request.onupgradeneeded) {
          const event = {
            target: { result: mockDB },
            oldVersion: currentVersion - 1,
            newVersion: version,
          };
          request.onupgradeneeded(event as any);
        }
      }
      if (request.onsuccess) {
        request.onsuccess({ target: request } as any);
      }
    });

    return request;
  };

  // 模拟 createObjectStore
  (mockDB as any).createObjectStore = (name: string, options: any) => {
    createStore(name);
    return {
      add: (value: any) => {
        const store = createStore(name);
        store.set(value.key, value);
        return { onsuccess: null, onerror: null };
      },
      put: (value: any) => {
        const store = createStore(name);
        store.set(value.key, value);
        return { onsuccess: null, onerror: null };
      },
    };
  };

  return { open, stores, getVersion: () => currentVersion, setVersion: (v: number) => { currentVersion = v; mockDB.version = v; } };
};

// 设置全局 window 和 indexedDB
const setupIndexedDB = () => {
  const mock = mockIndexedDB();
  (global as any).window = {
    indexedDB: {
      open: mock.open,
    },
  };
  (global as any).indexedDB = {
    open: mock.open,
  };
  return mock;
};

const cleanupIndexedDB = () => {
  delete (global as any).window;
  delete (global as any).indexedDB;
};

describe('StorageService', () => {
  let service: StorageService;
  let mockStores: ReturnType<typeof mockIndexedDB>['stores'];

  beforeEach(() => {
    const mock = setupIndexedDB();
    mockStores = mock.stores;
    service = new StorageService();
  });

  afterEach(() => {
    cleanupIndexedDB();
  });

  describe('addData', () => {
    it('应该成功保存数据到指定表', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-1';
      const data = { name: 'Test', value: 123 };

      // Act
      await service.addData(tableName, key, data);

      // Assert
      const store = mockStores.get(tableName);
      expect(store).toBeDefined();
      const saved = store?.get(key);
      expect(saved).toBeDefined();
      expect(saved?.key).toBe(key);
      expect(saved?.data).toEqual(data);
      expect(saved?.timestamp).toBeDefined();
    });

    it('应该支持保存包含 Date 的数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-2';
      const date = new Date('2024-01-01');
      const data = { name: 'Test', date };

      // Act
      await service.addData(tableName, key, data);
      const retrieved = await service.getData(tableName, key);

      // Assert
      expect(retrieved).toBeDefined();
      expect((retrieved as any).date).toBeInstanceOf(Date);
      expect((retrieved as any).date.getTime()).toBe(date.getTime());
    });

    it('应该支持保存包含 bigint 的数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-3';
      const data = { name: 'Test', amount: BigInt('999999999999999') };

      // Act
      await service.addData(tableName, key, data);
      const retrieved = await service.getData(tableName, key);

      // Assert
      expect(retrieved).toBeDefined();
      expect((retrieved as any).amount).toBe(BigInt('999999999999999'));
    });

    it('应该能够覆盖已存在的数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-4';
      const data1 = { name: 'Old' };
      const data2 = { name: 'New' };

      // Act
      await service.addData(tableName, key, data1);
      await service.addData(tableName, key, data2);

      // Assert
      const retrieved = await service.getData(tableName, key);
      expect((retrieved as any).name).toBe('New');
    });

    it('应该支持批量添加数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const dataList = [
        { key: 'batch-key-1', data: { id: '1', name: 'Item 1' } },
        { key: 'batch-key-2', data: { id: '2', name: 'Item 2' } },
        { key: 'batch-key-3', data: { id: '3', name: 'Item 3' } },
      ];

      // Act
      await service.addData(tableName, dataList);

      // Assert
      const item1 = await service.getData(tableName, 'batch-key-1');
      const item2 = await service.getData(tableName, 'batch-key-2');
      const item3 = await service.getData(tableName, 'batch-key-3');
      
      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect(item3).toBeDefined();
      expect((item1 as any).name).toBe('Item 1');
      expect((item2 as any).name).toBe('Item 2');
      expect((item3 as any).name).toBe('Item 3');
    });

    it('应该支持批量添加包含 BigInt 和 Date 的数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-12-31');
      const dataList = [
        { key: 'batch-bigint-1', data: { id: '1', amount: BigInt('1000000'), date: date1 } },
        { key: 'batch-bigint-2', data: { id: '2', amount: BigInt('2000000'), date: date2 } },
      ];

      // Act
      await service.addData(tableName, dataList);

      // Assert
      const item1 = await service.getData(tableName, 'batch-bigint-1');
      const item2 = await service.getData(tableName, 'batch-bigint-2');
      
      expect((item1 as any).amount).toBe(BigInt('1000000'));
      expect((item1 as any).date).toBeInstanceOf(Date);
      expect((item1 as any).date.getTime()).toBe(date1.getTime());
      
      expect((item2 as any).amount).toBe(BigInt('2000000'));
      expect((item2 as any).date).toBeInstanceOf(Date);
      expect((item2 as any).date.getTime()).toBe(date2.getTime());
    });
  });

  describe('getData', () => {
    it('应该成功读取已保存的数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-5';
      const data = { name: 'Test', value: 456 };
      await service.addData(tableName, key, data);

      // Act
      const result = await service.getData(tableName, key);

      // Assert
      expect(result).toBeDefined();
      expect(result).toEqual(data);
    });

    it('应该返回 undefined 当数据不存在时', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'nonexistent-key';

      // Act
      const result = await service.getData(tableName, key);

      // Assert
      expect(result).toBeUndefined();
    });

    it('应该正确反序列化复杂数据结构', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-6';
      const data = {
        id: '123',
        amount: BigInt('1000000'),
        dates: [new Date('2024-01-01'), new Date('2024-12-31')],
        nested: {
          value: BigInt('500000'),
          date: new Date('2024-06-15'),
        },
      };
      await service.addData(tableName, key, data);

      // Act
      const result = await service.getData(tableName, key);

      // Assert
      expect(result).toBeDefined();
      expect((result as any).amount).toBe(BigInt('1000000'));
      expect((result as any).dates[0]).toBeInstanceOf(Date);
      expect((result as any).dates[1]).toBeInstanceOf(Date);
      expect((result as any).nested.value).toBe(BigInt('500000'));
      expect((result as any).nested.date).toBeInstanceOf(Date);
    });
  });

  describe('getAllData', () => {
    it('应该返回指定表的所有数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const data1 = { id: '1', name: 'Item 1' };
      const data2 = { id: '2', name: 'Item 2' };
      const data3 = { id: '3', name: 'Item 3' };

      await service.addData(tableName, 'key1', data1);
      await service.addData(tableName, 'key2', data2);
      await service.addData(tableName, 'key3', data3);

      // Act
      const results = await service.getAllData(tableName);

      // Assert
      expect(results).toHaveLength(3);
      expect(results.map((r: any) => r.id)).toContain('1');
      expect(results.map((r: any) => r.id)).toContain('2');
      expect(results.map((r: any) => r.id)).toContain('3');
    });

    it('应该返回空数组当表为空时', async () => {
      // Arrange
      const tableName = 'empty_table';

      // Act
      const results = await service.getAllData(tableName);

      // Assert
      expect(results).toEqual([]);
    });

    it('应该正确反序列化所有数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const data = { id: '1', amount: BigInt('1000'), date: new Date('2024-01-01') };
      await service.addData(tableName, 'key1', data);

      // Act
      const results = await service.getAllData(tableName);

      // Assert
      expect(results).toHaveLength(1);
      expect((results[0] as any).amount).toBe(BigInt('1000'));
      expect((results[0] as any).date).toBeInstanceOf(Date);
    });
  });

  describe('updateData', () => {
    it('应该成功更新部分数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-7';
      const originalData = { id: '1', name: 'Original', value: 100 };
      await service.addData(tableName, key, originalData);

      // Act
      await service.updateData(tableName, key, { name: 'Updated', value: 200 });

      // Assert
      const result = await service.getData(tableName, key);
      expect((result as any).id).toBe('1');
      expect((result as any).name).toBe('Updated');
      expect((result as any).value).toBe(200);
    });

    it('应该在数据不存在时抛出错误', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'nonexistent-key';

      // Act & Assert
      await expect(
        service.updateData(tableName, key, { name: 'Updated' })
      ).rejects.toThrow();
    });

    it('应该保留未更新的字段', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-8';
      const originalData = { id: '1', name: 'Original', value: 100, extra: 'preserved' };
      await service.addData(tableName, key, originalData);

      // Act
      await service.updateData(tableName, key, { name: 'Updated' });

      // Assert
      const result = await service.getData(tableName, key);
      expect((result as any).id).toBe('1');
      expect((result as any).name).toBe('Updated');
      expect((result as any).value).toBe(100);
      expect((result as any).extra).toBe('preserved');
    });
  });

  describe('resetAllData', () => {
    it('应该清空表并重置为新的数据列表', async () => {
      // Arrange
      const tableName = 'test_table';
      const oldData = { id: 'old-1', name: 'Old Item' };
      await service.addData(tableName, 'old-key', oldData);

      const newDataList = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
      ];

      // Act
      await service.resetAllData(tableName, newDataList);

      // Assert
      const results = await service.getAllData(tableName);
      expect(results).toHaveLength(3);
      expect(results.map((r: any) => r.id)).toEqual(['1', '2', '3']);
      expect(await service.getData(tableName, 'old-key')).toBeUndefined();
    });

    it('应该支持空数据列表', async () => {
      // Arrange
      const tableName = 'test_table';
      await service.addData(tableName, 'key1', { id: '1' });

      // Act
      await service.resetAllData(tableName, []);

      // Assert
      const results = await service.getAllData(tableName);
      expect(results).toHaveLength(0);
    });

    it('应该从数据中提取 key（优先使用 id）', async () => {
      // Arrange
      const tableName = 'test_table';
      const dataList = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];

      // Act
      await service.resetAllData(tableName, dataList);

      // Assert
      const item1 = await service.getData(tableName, '1');
      const item2 = await service.getData(tableName, '2');
      expect(item1).toBeDefined();
      expect(item2).toBeDefined();
      expect((item1 as any).name).toBe('Item 1');
      expect((item2 as any).name).toBe('Item 2');
    });
  });

  describe('deleteData', () => {
    it('应该成功删除指定数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'test-key-9';
      const data = { id: '1', name: 'Test' };
      await service.addData(tableName, key, data);

      // Act
      await service.deleteData(tableName, key);

      // Assert
      const result = await service.getData(tableName, key);
      expect(result).toBeUndefined();
    });

    it('应该能够删除不存在的键而不报错', async () => {
      // Arrange
      const tableName = 'test_table';
      const key = 'nonexistent-key';

      // Act & Assert
      await expect(service.deleteData(tableName, key)).resolves.not.toThrow();
    });

    it('应该支持批量删除数据', async () => {
      // Arrange
      const tableName = 'test_table';
      const keys = ['batch-delete-1', 'batch-delete-2', 'batch-delete-3'];
      const dataList = [
        { key: keys[0], data: { id: '1', name: 'Item 1' } },
        { key: keys[1], data: { id: '2', name: 'Item 2' } },
        { key: keys[2], data: { id: '3', name: 'Item 3' } },
      ];
      await service.addData(tableName, dataList);

      // Act
      await service.deleteData(tableName, keys);

      // Assert
      const result1 = await service.getData(tableName, keys[0]);
      const result2 = await service.getData(tableName, keys[1]);
      const result3 = await service.getData(tableName, keys[2]);
      
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
      expect(result3).toBeUndefined();
    });

    it('应该支持批量删除部分数据', async () => {
      // Arrange
      const tableName = 'test_table';
      await service.addData(tableName, 'keep-1', { id: '1', name: 'Keep 1' });
      await service.addData(tableName, 'delete-1', { id: '2', name: 'Delete 1' });
      await service.addData(tableName, 'keep-2', { id: '3', name: 'Keep 2' });
      await service.addData(tableName, 'delete-2', { id: '4', name: 'Delete 2' });

      // Act
      await service.deleteData(tableName, ['delete-1', 'delete-2']);

      // Assert
      const keep1 = await service.getData(tableName, 'keep-1');
      const keep2 = await service.getData(tableName, 'keep-2');
      const delete1 = await service.getData(tableName, 'delete-1');
      const delete2 = await service.getData(tableName, 'delete-2');
      
      expect(keep1).toBeDefined();
      expect(keep2).toBeDefined();
      expect(delete1).toBeUndefined();
      expect(delete2).toBeUndefined();
    });
  });

  describe('多表支持', () => {
    it('应该支持多个不同的表', async () => {
      // Arrange
      const table1 = 'invoices';
      const table2 = 'settings';
      const data1 = { id: '1', type: 'invoice' };
      const data2 = { id: '1', type: 'setting' };

      // Act
      await service.addData(table1, 'key1', data1);
      await service.addData(table2, 'key1', data2);

      // Assert
      const result1 = await service.getData(table1, 'key1');
      const result2 = await service.getData(table2, 'key1');
      expect((result1 as any).type).toBe('invoice');
      expect((result2 as any).type).toBe('setting');
    });

    it('应该在不同表中使用相同的 key', async () => {
      // Arrange
      const table1 = 'table1';
      const table2 = 'table2';
      const key = 'same-key';
      const data1 = { value: 'data1' };
      const data2 = { value: 'data2' };

      // Act
      await service.addData(table1, key, data1);
      await service.addData(table2, key, data2);

      // Assert
      const result1 = await service.getData(table1, key);
      const result2 = await service.getData(table2, key);
      expect((result1 as any).value).toBe('data1');
      expect((result2 as any).value).toBe('data2');
    });
  });

  describe('错误处理', () => {
    it('应该在服务器端环境中抛出错误', async () => {
      // Arrange
      cleanupIndexedDB();
      const serverService = new StorageService();

      // Act & Assert
      await expect(
        serverService.addData('test_table', 'key', { data: 'test' })
      ).rejects.toThrow('IndexedDB is not available in server-side environment');
    });
  });

  describe('集成测试', () => {
    it('应该完成完整的数据生命周期', async () => {
      const tableName = 'lifecycle_table';
      const key = 'lifecycle-key';
      
      // 1. 创建数据
      const data = { id: '1', name: 'Test', amount: BigInt('1000'), date: new Date('2024-01-01') };
      await service.addData(tableName, key, data);

      // 2. 读取数据
      const saved = await service.getData(tableName, key);
      expect(saved).toBeDefined();

      // 3. 更新数据
      await service.updateData(tableName, key, { name: 'Updated' });

      // 4. 验证更新
      const updated = await service.getData(tableName, key);
      expect((updated as any).name).toBe('Updated');
      expect((updated as any).amount).toBe(BigInt('1000'));

      // 5. 获取所有数据
      const all = await service.getAllData(tableName);
      expect(all.length).toBeGreaterThan(0);

      // 6. 删除数据
      await service.deleteData(tableName, key);
      const deleted = await service.getData(tableName, key);
      expect(deleted).toBeUndefined();
    });
  });
});
