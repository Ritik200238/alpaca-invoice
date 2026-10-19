/** * Storage error enum */
export enum StorageError {
  WRITE_FAILED = 'WRITE_FAILED',   // Disk full or storage permission denied
  READ_FAILED = 'READ_FAILED',     // Data corrupted or index does not exist
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED' // Storage quota exceeded
}

/**
 * Generic storage service interface
 * Supports storing arbitrary types of data, differentiated by tableName
 */
export interface IStorageService {
  /**
   * Add data to a specified table (single or batch)
   * @param tableName Table name (used to differentiate data tables, e.g., 'invoices', 'settings', etc.)
   * @param keyOrList Single key or list of data items (containing key and data)
   * @param data Data object to store (used in single mode)
   */
  addData<T>(tableName: string, key: string, data: T): Promise<void>;
  addData<T>(tableName: string, dataList: Array<{ key: string; data: T }>): Promise<void>;

  /**
   * Get data by key
   * @param tableName Table name
   * @param key Unique identifier key for the data
   * @returns Data object, or undefined if it does not exist
   */
  getData<T>(tableName: string, key: string): Promise<T | undefined>;

  /**
   * Get all data from a specified table
   * @param tableName Table name
   * @returns Array of data objects
   */
  getAllData<T>(tableName: string): Promise<T[]>;

  /**
   * Update partial data
   * @param tableName Table name
   * @param key Unique identifier key for the data
   * @param updates Partial data to update (Partial<T>)
   */
  updateData<T>(tableName: string, key: string, updates: Partial<T>): Promise<void>;

  /**
   * Full reset of table data (e.g., after syncing on-chain data)
   * @param tableName Table name
   * @param dataList List of data to reset, each item must contain a unique identifier field (key/id/invoiceHash, etc.)
   */
  resetAllData<T extends { [key: string]: any }>(tableName: string, dataList: T[]): Promise<void>;

  /**
   * Delete specified data (single or batch)
   * @param tableName Table name
   * @param keyOrKeys Single key or array of keys
   */
  deleteData(tableName: string, key: string): Promise<void>;
  deleteData(tableName: string, keys: string[]): Promise<void>;
}
