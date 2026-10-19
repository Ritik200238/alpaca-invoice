/**
 * Generic polling service interface
 * Responsibility: manage arbitrary types of polling tasks
 *
 * Use cases:
 * - Invoice status polling
 * - Transaction confirmation polling
 * - Balance update polling
 * - Other scenarios requiring periodic checks
 */
export interface ValidationResult {
  /** Whether polling should stop and confirm */
  shouldStop: boolean;
  /** Reason description (used for logging and user prompts) */
  reason: string;
  /** Whether polling should continue (even if expectations are not met) */
  shouldContinue?: boolean;
}

export interface PollingConfig<TScanResult = any> {
  /** Polling interval (milliseconds) */
  pollInterval: number;
  /** Polling timeout duration (milliseconds) */
  pollTimeout: number;
  /** Polling task name (used for logging) */
  taskName?: string;
}

export interface PollingCallbacks<TScanResult> {
  /**
   * Execute the scan operation
   * @returns Scan result
   */
  scan: () => Promise<TScanResult>;

  /**
   * Validate whether the scan result meets expectations
   * @param result Scan result
   * @returns Validation result, including whether polling should stop
   */
  validate: (result: TScanResult) => ValidationResult;

  /**
   * Called when a result matching expectations is found
   * @param result Scan result
   */
  onSuccess: (result: TScanResult) => Promise<void>;

  /**
   * Called when polling times out
   */
  onTimeout: () => Promise<void>;

  /**
   * Called when the scan fails (optional, defaults to continuing polling)
   * @param error Error object
   */
  onError?: (error: Error) => void;
}

export interface IPollingService {
  /**
   * Start polling
   */
  start(): void;

  /**
   * Stop polling
   */
  stop(): void;

  /**
   * Check whether polling is currently running
   */
  isRunning(): boolean;

  /**
   * Get polling status
   */
  getStatus(): {
    isRunning: boolean;
    startTime: number | null;
    elapsedTime: number | null;
  };
}

