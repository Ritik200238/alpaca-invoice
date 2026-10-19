import { IPollingService, PollingConfig, PollingCallbacks, ValidationResult } from './IPollingService';

/**
 * 通用轮询服务实现
 * 职责：管理任意类型的轮询任务生命周期
 */
export class PollingService<TScanResult> implements IPollingService {
  private intervalId: NodeJS.Timeout | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private startTime: number | null = null;

  constructor(
    private config: PollingConfig<TScanResult>,
    private callbacks: PollingCallbacks<TScanResult>
  ) {}

  start(): void {
    if (this.intervalId) {
      console.warn(`[PollingService] ${this.config.taskName || 'Task'} is already running`);
      return;
    }

    this.startTime = Date.now();
    const taskName = this.config.taskName || 'Polling';
    
    console.log(`🔄 [PollingService] Starting ${taskName}...`);
    
    // 设置超时
    this.timeoutId = setTimeout(() => {
      console.warn(`⏰ [PollingService] ${taskName} timeout reached`);
      this.stop();
      this.callbacks.onTimeout();
    }, this.config.pollTimeout);

    // 立即执行一次
    this.executePoll();

    // 设置定时轮询
    this.intervalId = setInterval(() => {
      this.executePoll();
    }, this.config.pollInterval);
  }

  stop(): void {
    const taskName = this.config.taskName || 'Polling';
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`⏹️ [PollingService] Stopped ${taskName}`);
    }
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    this.startTime = null;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  getStatus(): {
    isRunning: boolean;
    startTime: number | null;
    elapsedTime: number | null;
  } {
    return {
      isRunning: this.isRunning(),
      startTime: this.startTime,
      elapsedTime: this.startTime ? Date.now() - this.startTime : null
    };
  }

  /**
   * 执行单次轮询
   */
  private async executePoll(): Promise<void> {
    // 检查超时
    if (this.startTime && Date.now() - this.startTime > this.config.pollTimeout) {
      this.stop();
      await this.callbacks.onTimeout();
      return;
    }

    try {
      // 执行扫描
      const scanResult = await this.callbacks.scan();
      
      // 验证结果
      const validation = this.callbacks.validate(scanResult);
      
      if (validation.shouldStop) {
        // 符合预期，停止轮询并确认
        this.stop();
        await this.callbacks.onSuccess(scanResult);
      } else if (validation.shouldContinue === false) {
        // 不符合预期且不应该继续轮询
        this.stop();
      }
      // 如果 shouldContinue 为 true 或 undefined，继续轮询
      
    } catch (error) {
      console.error(`[PollingService] ${this.config.taskName || 'Polling'} scan failed:`, error);
      
      // 调用错误回调（如果提供）
      if (this.callbacks.onError) {
        this.callbacks.onError(error as Error);
      }
      // 默认继续轮询，不中断
    }
  }
}

