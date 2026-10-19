import { IStorageService, StorageError } from './IStorageService';
import { createServiceError } from '@/lib/service-errors';

const StorageServiceError = createServiceError<StorageError>('StorageService');

const DB_NAME = 'zk_invoice_db';
const DB_VERSION = 4;  // Wave 3: Invoice schema + taxTag, jctRegistration, totalAmount, currencyFlag, taxGroups, tNumber

/**
 * Serialize data (handles bigint and Date)
 */
function serializeData<T>(data: T): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'bigint') {
    return { __type: 'BigInt', value: data.toString() };
  }

  if (data instanceof Date) {
    return { __type: 'Date', value: data.getTime() };
  }

  if (Array.isArray(data)) {
    return data.map(item => serializeData(item));
  }

  if (typeof data === 'object') {
    const serialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeData(value);
    }
    return serialized;
  }

  return data;
}

/**
 * Deserialize data (handles bigint and Date)
 */
function deserializeData<T>(data: any): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Check if it is a special type marker
  if (typeof data === 'object' && data.__type) {
    if (data.__type === 'BigInt') {
      return BigInt(data.value) as any;
    }
    if (data.__type === 'Date') {
      return new Date(data.value) as any;
    }
  }

  if (Array.isArray(data)) {
    return data.map(item => deserializeData(item)) as any;
  }

  if (typeof data === 'object') {
    const deserialized: any = {};
    for (const [key, value] of Object.entries(data)) {
      deserialized[key] = deserializeData(value);
    }
    return deserialized;
  }

  return data;
}

/**
 * Generic storage service implementation class
 * Uses IndexedDB to store arbitrary types of data
 */
export class StorageService implements IStorageService {
  private db: IDBDatabase | null = null;
  private tableNames = new Set<string>(); // Track created tables

  /**
   * Initialize database connection
   */
  private async getDB(): Promise<IDBDatabase> {
    // If connection already exists, check if it's valid (not closed)
    if (this.db) {
      try {
        // Try to access objectStoreNames to check if the connection is valid
        // If the connection is closed, access will throw an exception
        this.db.objectStoreNames.length;
        return this.db;
      } catch (error) {
        // Connection is closed, reset to null and reopen
        console.warn('⚠️ [StorageService.getDB] Database connection is closed, reopening...');
        this.db = null;
      }
    }

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('IndexedDB is not available in server-side environment'));
        return;
      }

      // First get the current database version, then open
      const versionRequest = indexedDB.open(DB_NAME);
      versionRequest.onsuccess = () => {
        const currentVersion = versionRequest.result.version;
        versionRequest.result.close();

        // Use the larger value between current version and DB_VERSION
        const targetVersion = Math.max(currentVersion, DB_VERSION);
        const request = indexedDB.open(DB_NAME, targetVersion);

        request.onerror = () => {
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              'Failed to open IndexedDB'
            )
          );
        };

        request.onsuccess = () => {
          this.db = request.result;
          // Close connection gracefully when another instance triggers a version upgrade
          this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
          };
          // Record existing tables
          for (let i = 0; i < this.db.objectStoreNames.length; i++) {
            this.tableNames.add(this.db.objectStoreNames[i]);
          }
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          // During upgrade, record all existing tables
          for (let i = 0; i < db.objectStoreNames.length; i++) {
            this.tableNames.add(db.objectStoreNames[i]);
          }
        };
      };

      versionRequest.onerror = () => {
        reject(
          new StorageServiceError(
            StorageError.READ_FAILED,
            'Failed to get database version'
          )
        );
      };
    });
  }

  /**
   * Ensure table exists (create if it doesn't)
   * Note: IndexedDB can only create tables during onupgradeneeded
   * Dynamic version upgrade is used here to implement dynamic table creation
   * If the table already exists but the keyPath is incorrect, back up data, delete and recreate the table, then restore data
   */
  private async ensureTable(tableName: string): Promise<void> {
    // First get the database connection and check if the table truly exists
    const db = await this.getDB();
    const tableExists = db.objectStoreNames.contains(tableName);

    // If the table already exists and is in tableNames, return directly (no upgrade needed)
    if (tableExists && this.tableNames.has(tableName)) {
      return;
    }

    // If the table exists but is not in tableNames, try reading data to verify the table is usable
    // If the table is usable, just add it to tableNames without needing an upgrade
    if (tableExists && !this.tableNames.has(tableName)) {
      try {
        // Try reading a record to verify the table is usable (keyPath is correct)
        const testTransaction = db.transaction([tableName], 'readonly');
        const testStore = testTransaction.objectStore(tableName);
        const testRequest = testStore.getAll();

        await new Promise<void>((resolve, reject) => {
          testRequest.onsuccess = () => {
            // Table is usable, just add it to tableNames
            this.tableNames.add(tableName);
            resolve();
          };
          testRequest.onerror = () => {
            // Table is not usable (keyPath may be incorrect), need to upgrade
            reject(testRequest.error);
          };
        });

        // If successful, table is usable, return directly
        return;
      } catch (error) {
        // Table is not usable, need to back up data and recreate
        console.warn(`⚠️ [StorageService.ensureTable] Table ${tableName} exists but may have incorrect keyPath. Will backup data and recreate...`);
      }
    }

    // If a new table needs to be created or recreated, first back up data
    let backupData: any[] = [];
    if (tableExists) {
      try {
        // Try to read all data as a backup
        const backupTransaction = db.transaction([tableName], 'readonly');
        const backupStore = backupTransaction.objectStore(tableName);
        const backupRequest = backupStore.getAll();

        backupData = await new Promise<any[]>((resolve, reject) => {
          backupRequest.onsuccess = () => {
            resolve(backupRequest.result || []);
          };
          backupRequest.onerror = () => {
            // If reading fails, the table indeed has issues, backup as empty array
            console.warn(`⚠️ [StorageService.ensureTable] Failed to backup data from ${tableName}, will create empty table`);
            resolve([]);
          };
        });

        if (backupData.length > 0) {
          console.log(`📦 [StorageService.ensureTable] Backed up ${backupData.length} records from ${tableName}`);
        }
      } catch (error) {
        console.warn(`⚠️ [StorageService.ensureTable] Failed to backup data from ${tableName}:`, error);
        backupData = [];
      }
    }

    // Table does not exist or needs to be recreated, trigger upgrade
    return new Promise((resolve, reject) => {
      // Close current connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      // Get current version and upgrade
      const versionRequest = indexedDB.open(DB_NAME);
      versionRequest.onsuccess = () => {
        const currentVersion = versionRequest.result.version;
        versionRequest.result.close();

        // Reopen and upgrade
        const upgradeRequest = indexedDB.open(DB_NAME, currentVersion + 1);

        upgradeRequest.onerror = () => {
          reject(
            new StorageServiceError(
              StorageError.WRITE_FAILED,
              `Failed to ${tableExists ? 'upgrade' : 'create'} table: ${tableName}`
            )
          );
        };

        upgradeRequest.onsuccess = () => {
          this.db = upgradeRequest.result;
          // Close connection gracefully when another instance triggers a version upgrade
          this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
          };
          this.tableNames.add(tableName);

          // If there is backup data, restore it
          if (backupData.length > 0) {
            const restoreTransaction = this.db.transaction([tableName], 'readwrite');
            const restoreStore = restoreTransaction.objectStore(tableName);

            let restoredCount = 0;
            let failedCount = 0;

            for (const record of backupData) {
              try {
                // Ensure the record has a 'key' field (since the new keyPath is 'key')
                if (record && typeof record === 'object') {
                  // If the record doesn't have a 'key' field, try to infer from other fields
                  if (!record.key) {
                    // Try to infer from the id field (for invoice data)
                    if (record.data && record.data.id) {
                      record.key = record.data.id;
                    } else if (record.id) {
                      record.key = record.id;
                    } else {
                      console.warn('⚠️ [StorageService.ensureTable] Record missing key field, skipping:', record);
                      failedCount++;
                      continue;
                    }
                  }

                  restoreStore.put(record);
                  restoredCount++;
                }
              } catch (error) {
                console.warn('⚠️ [StorageService.ensureTable] Failed to restore record:', error);
                failedCount++;
              }
            }

            restoreTransaction.oncomplete = () => {
              if (restoredCount > 0) {
                console.log(`✅ [StorageService.ensureTable] Restored ${restoredCount} records to ${tableName}`);
              }
              if (failedCount > 0) {
                console.warn(`⚠️ [StorageService.ensureTable] Failed to restore ${failedCount} records`);
              }
              resolve();
            };

            restoreTransaction.onerror = () => {
              console.error('❌ [StorageService.ensureTable] Failed to restore data:', restoreTransaction.error);
              resolve(); // Even if restore fails, continue (table has been created)
            };
          } else {
            resolve();
          }
        };

        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDB = (event.target as IDBOpenDBRequest).result;

          // If the table already exists, delete it (since keyPath cannot be modified)
          if (upgradeDB.objectStoreNames.contains(tableName)) {
            console.warn(`⚠️ [StorageService.ensureTable] Deleting and recreating table ${tableName}...`);
            upgradeDB.deleteObjectStore(tableName);
          }

          // Recreate table with correct keyPath
          upgradeDB.createObjectStore(tableName, { keyPath: 'key' });
          console.log(`✅ [StorageService.ensureTable] Created table ${tableName} with keyPath: 'key'`);

          // Record all tables
          for (let i = 0; i < upgradeDB.objectStoreNames.length; i++) {
            this.tableNames.add(upgradeDB.objectStoreNames[i]);
          }
        };
      };

      versionRequest.onerror = () => {
        reject(
          new StorageServiceError(
            StorageError.READ_FAILED,
            'Failed to get database version'
          )
        );
      };
    });
  }

  /**
   * Add data to specified table (supports single or batch)
   */
  async addData<T>(
    tableName: string,
    keyOrList: string | Array<{ key: string; data: T }>,
    data?: T
  ): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // Determine if it's batch mode or single mode
      const isBatch = Array.isArray(keyOrList);
      const items: Array<{ key: string; data: T }> = isBatch
        ? keyOrList
        : [{ key: keyOrList, data: data! }];

      // Batch operation: use Promise.all for parallel execution
      const promises = items.map((item) => {
        return new Promise<void>((resolve, reject) => {
          // Serialize data
          const serialized = serializeData(item.data);

          const request = store.put({
            key: item.key,
            data: serialized,
            timestamp: Date.now()
          });

          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              new StorageServiceError(
                StorageError.WRITE_FAILED,
                `Failed to save data to ${tableName}: ${item.key}`
              )
            );
        });
      });

      await Promise.all(promises);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to add data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get data by key
   */
  async getData<T>(tableName: string, key: string): Promise<T | undefined> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            // Deserialize data
            const deserialized = deserializeData<T>(result.data);
            resolve(deserialized);
          } else {
            resolve(undefined);
          }
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              `Failed to read data from ${tableName}: ${key}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.READ_FAILED,
        `Failed to get data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get all data from a specified table
   */
  async getAllData<T>(tableName: string): Promise<T[]> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readonly');
      const store = transaction.objectStore(tableName);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];
          // Deserialize all data
          const deserialized = results.map((result: any) =>
            deserializeData<T>(result.data)
          );
          resolve(deserialized);
        };

        request.onerror = () =>
          reject(
            new StorageServiceError(
              StorageError.READ_FAILED,
              `Failed to read all data from ${tableName}`
            )
          );
      });
    } catch (error) {
      throw new StorageServiceError(
        StorageError.READ_FAILED,
        `Failed to get all data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Update partial data
   */
  async updateData<T>(tableName: string, key: string, updates: Partial<T>): Promise<void> {
    try {
      const existing = await this.getData<T>(tableName, key);
      if (!existing) {
        throw new Error(`Data not found: ${key} in table ${tableName}`);
      }

      // Merge updates
      const updated = { ...existing, ...updates };
      await this.addData(tableName, key, updated);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to update data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Full reset of table data
   * @param tableName Table name
   * @param dataList Data list; each data item must contain a unique identifier field (key/id/invoiceHash, etc.)
   */
  async resetAllData<T extends { [key: string]: any }>(tableName: string, dataList: T[]): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // Clear the table first
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(new Error('Failed to clear table'));
      });

      // Then batch add new data
      // Extract key from data: prefer key, then id, then invoiceHash, finally use index
      for (const data of dataList) {
        const key = data.key || data.id || data.invoiceHash || String(dataList.indexOf(data));
        await this.addData(tableName, key, data);
      }
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to reset all data: ${(error as Error).message}`
      );
    }
  }

  /**
   * Delete specified data (supports single or batch)
   */
  async deleteData(tableName: string, keyOrKeys: string | string[]): Promise<void> {
    try {
      await this.ensureTable(tableName);
      const db = await this.getDB();
      const transaction = db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);

      // Determine if it's batch mode or single mode
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

      // Batch operation: use Promise.all for parallel execution
      const promises = keys.map((key) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(key);

          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              new StorageServiceError(
                StorageError.WRITE_FAILED,
                `Failed to delete data from ${tableName}: ${key}`
              )
            );
        });
      });

      await Promise.all(promises);
    } catch (error) {
      throw new StorageServiceError(
        StorageError.WRITE_FAILED,
        `Failed to delete data: ${(error as Error).message}`
      );
    }
  }
}
